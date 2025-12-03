import os
import secrets
import httpx
import jwt # PyJWT
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .database import get_db, Settings

router = APIRouter()

APP_USER = os.getenv("APP_USER", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin")
# Dodajemy odczyt zmiennej globalnej również tutaj, aby API mogło ją zwrócić
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"

COOKIE_NAME = "localspeed_session"

class LoginData(BaseModel):
    username: str
    password: str

# --- Helpers ---

def get_oidc_settings(db: Session):
    settings = db.query(Settings).filter(Settings.id == 1).first()
    if not settings or not settings.oidc_enabled:
        return None
    return settings

# --- Endpointy standardowe ---

@router.get("/api/auth/status")
async def auth_status(db: Session = Depends(get_db)):
    """
    Publiczny endpoint informujący frontend o stanie autoryzacji.
    Zwraca: czy OIDC jest włączone ORAZ czy logowanie w ogóle jest włączone.
    """
    s = db.query(Settings).filter(Settings.id == 1).first()
    return {
        "oidc_enabled": s.oidc_enabled if s else False,
        "auth_enabled": AUTH_ENABLED
    }

@router.post("/api/login")
async def login(data: LoginData, response: Response):
    if not AUTH_ENABLED:
        return {"message": "Login not required"}

    if data.username == APP_USER and data.password == APP_PASSWORD:
        content = {"message": "Zalogowano pomyślnie"}
        response = JSONResponse(content=content)
        response.set_cookie(
            key=COOKIE_NAME, 
            value="authorized", 
            max_age=604800, 
            httponly=True, 
            samesite="lax"
        )
        return response
    else:
        raise HTTPException(status_code=401, detail="Błędny login lub hasło")

@router.post("/api/logout")
async def logout(request: Request, response: Response):
    content = {"message": "Wylogowano pomyślnie"}
    response = JSONResponse(content=content)
    response.delete_cookie(key=COOKIE_NAME)
    request.session.clear()
    return response

# --- OIDC Logic (Manual implementation using httpx & PyJWT) ---

@router.get("/api/auth/oidc/login")
async def oidc_login(request: Request, db: Session = Depends(get_db)):
    """1. Przekierowanie do dostawcy tożsamości."""
    if not AUTH_ENABLED:
        return RedirectResponse("/")

    settings = get_oidc_settings(db)
    if not settings:
        raise HTTPException(status_code=400, detail="OIDC disabled or not configured")

    discovery_url = settings.oidc_discovery_url.strip()
    if not discovery_url:
        raise HTTPException(status_code=400, detail="Discovery URL missing")

    try:
        # Pobieramy konfigurację OIDC (.well-known)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(discovery_url)
            resp.raise_for_status()
            config = resp.json()
    except Exception as e:
        print(f"Discovery Error: {e}")
        return RedirectResponse("/login.html?error=oidc_discovery_failed")

    auth_endpoint = config.get("authorization_endpoint")
    if not auth_endpoint:
        return RedirectResponse("/login.html?error=oidc_config_invalid")

    # Generujemy bezpieczny stan i nonce
    state = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)
    
    # Zapisujemy w sesji (cookie session middleware)
    request.session["oidc_state"] = state
    request.session["oidc_nonce"] = nonce
    request.session["oidc_config"] = config # Cache config for callback

    redirect_uri = str(request.url_for('oidc_callback'))
    
    # Fix na wypadek reverse proxy (http vs https)
    if "https://" in discovery_url and redirect_uri.startswith("http://"):
        redirect_uri = redirect_uri.replace("http://", "https://", 1)

    # Budujemy URL przekierowania
    from urllib.parse import urlencode
    params = {
        "client_id": settings.oidc_client_id,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": redirect_uri,
        "state": state,
        "nonce": nonce
    }
    
    url = f"{auth_endpoint}?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/api/auth/oidc/callback")
async def oidc_callback(request: Request, code: str = None, state: str = None, error: str = None, db: Session = Depends(get_db)):
    """2. Powrót z kodem, wymiana na token i weryfikacja."""
    if not AUTH_ENABLED:
        return RedirectResponse("/")

    if error:
        return RedirectResponse(f"/login.html?error=oidc_provider_error&desc={error}")
    
    if not code or not state:
        return RedirectResponse("/login.html?error=oidc_missing_params")

    # Weryfikacja stanu (CSRF protection)
    saved_state = request.session.get("oidc_state")
    if not saved_state or state != saved_state:
        return RedirectResponse("/login.html?error=oidc_invalid_state")

    settings = get_oidc_settings(db)
    if not settings:
        return RedirectResponse("/login.html?error=oidc_disabled")

    # Odtwarzamy konfigurację z sesji lub pobieramy ponownie
    config = request.session.get("oidc_config")
    if not config:
        # Fallback: fetch again (uproszczone, normalnie byśmy pobrali z URL z bazy)
        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.oidc_discovery_url)
            config = resp.json()

    token_endpoint = config.get("token_endpoint")
    jwks_uri = config.get("jwks_uri")

    redirect_uri = str(request.url_for('oidc_callback'))
    if "https://" in settings.oidc_discovery_url and redirect_uri.startswith("http://"):
        redirect_uri = redirect_uri.replace("http://", "https://", 1)

    # Wymiana CODE na TOKEN
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(token_endpoint, data=payload)
            token_resp.raise_for_status()
            token_data = token_resp.json()
            
        id_token = token_data.get("id_token")
        if not id_token:
             return RedirectResponse("/login.html?error=oidc_no_id_token")

        # WERYFIKACJA TOKENU JWT (PyJWT + PyJWKClient)
        jwks_client = PyJWKClient(jwks_uri)
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)

        # Dekodujemy i weryfikujemy podpis
        data = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.oidc_client_id,
            # opcjonalnie issuer=config.get("issuer")
        )
        
        # Weryfikacja nonce
        saved_nonce = request.session.get("oidc_nonce")
        if data.get("nonce") and saved_nonce and data.get("nonce") != saved_nonce:
             return RedirectResponse("/login.html?error=oidc_invalid_nonce")

        # SUKCES - Logujemy
        response = RedirectResponse(url="/?login=success")
        response.set_cookie(
            key=COOKIE_NAME, 
            value="authorized", 
            max_age=604800, 
            httponly=True, 
            samesite="lax"
        )
        # Czyścimy sesję OIDC
        request.session.clear()
        
        return response

    except Exception as e:
        print(f"OIDC Verification Error: {e}")
        return RedirectResponse(f"/login.html?error=oidc_verification_failed")