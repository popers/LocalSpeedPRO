FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tworzymy katalogi na pliki statyczne i kod modularny
RUN mkdir -p /app/static /app/js /app/css /app/py

# Generujemy pliki testowe (szum)
RUN dd if=/dev/urandom of=/app/static/10MB.bin bs=1M count=10 status=none
RUN dd if=/dev/urandom of=/app/static/20MB.bin bs=1M count=20 status=none
RUN dd if=/dev/urandom of=/app/static/50MB.bin bs=1M count=50 status=none

# Kopiujemy kod aplikacji
COPY ./app /app

# --- FIX: Ustawiamy PYTHONPATH ---
# To mówi Pythonowi, że głównym katalogiem dla importów jest /app
ENV PYTHONPATH=/app

# Uruchamiamy serwer
CMD ["uvicorn", "py.main:app", "--host", "0.0.0.0", "--port", "80"]