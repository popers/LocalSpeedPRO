import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter()

# Pobieranie danych z env (z domyślnymi wartościami dla bezpieczeństwa podczas dev)
APP_USER = os.getenv("APP_USER", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin")

# Prosta nazwa ciasteczka sesyjnego
COOKIE_NAME = "localspeed_session"

# Model danych logowania
class LoginData(BaseModel):
    username: str
    password: str

def check_auth(request: Request):
    """Sprawdza, czy użytkownik ma poprawne ciasteczko sesyjne."""
    token = request.cookies.get(COOKIE_NAME)
    # W prostej wersji tokenem jest po prostu zahashowana wartość hasła lub stały ciąg,
    # jeśli sesja jest aktywna. Tutaj dla uproszczenia sprawdzamy obecność flagi "authorized".
    # W produkcji warto użyć JWT.
    if token != "authorized":
         raise HTTPException(status_code=401, detail="Unauthorized")
    return True

@router.post("/api/login")
async def login(data: LoginData, response: Response):
    """Weryfikuje login i hasło, ustawia ciasteczko."""
    if data.username == APP_USER and data.password == APP_PASSWORD:
        content = {"message": "Zalogowano pomyślnie"}
        response = JSONResponse(content=content)
        # Ustawiamy ciasteczko na 7 dni
        response.set_cookie(
            key=COOKIE_NAME, 
            value="authorized", 
            max_age=604800, 
            httponly=True, 
            samesite="lax"
        )
        return response
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Błędny login lub hasło"
        )

@router.post("/api/logout")
async def logout(response: Response):
    """Wylogowuje użytkownika usuwając ciasteczko."""
    content = {"message": "Wylogowano pomyślnie"}
    response = JSONResponse(content=content)
    response.delete_cookie(key=COOKIE_NAME)
    return response