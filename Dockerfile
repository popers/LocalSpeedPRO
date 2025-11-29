FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tworzymy katalogi na pliki statyczne i kod modularny
RUN mkdir -p /app/static /app/js /app/css /app/py

# GENIUSZ W PROSTOCIE:
# Generujemy prawdziwe pliki losowe (szum) podczas budowania obrazu.
# Dzięki temu serwer tylko "podaje plik" z dysku, nie obciążając CPU generowaniem.
# Tworzymy pliki 10MB, 20MB, 50MB
RUN dd if=/dev/urandom of=/app/static/10MB.bin bs=1M count=10 status=none
RUN dd if=/dev/urandom of=/app/static/20MB.bin bs=1M count=20 status=none
RUN dd if=/dev/urandom of=/app/static/50MB.bin bs=1M count=50 status=none

# Kopiujemy kod aplikacji (nowa modularna struktura: pliki .html, /js, /css, /py)
# Kopiujemy całą zawartość głównego katalogu 'app'
COPY ./app /app

# Uruchamiamy serwer
# Zmieniamy odwołanie z 'main:app' na 'py.main:app'
CMD ["uvicorn", "py.main:app", "--host", "0.0.0.0", "--port", "80"]