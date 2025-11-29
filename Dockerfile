FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tworzymy katalog na pliki statyczne
RUN mkdir -p /app/static

# GENIUSZ W PROSTOCIE:
# Generujemy prawdziwe pliki losowe (szum) podczas budowania obrazu.
# Dzięki temu serwer tylko "podaje plik" z dysku, nie obciążając CPU generowaniem.
# Tworzymy pliki 10MB, 20MB, 50MB
RUN dd if=/dev/urandom of=/app/static/10MB.bin bs=1M count=10 status=none
RUN dd if=/dev/urandom of=/app/static/20MB.bin bs=1M count=20 status=none
RUN dd if=/dev/urandom of=/app/static/50MB.bin bs=1M count=50 status=none

# Kopiujemy kod aplikacji
COPY ./app /app

# Uruchamiamy serwer
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]