FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności systemowych (potrzebne np. dla mysqlclient/pymysql jeśli wystąpią problemy z kompilacją)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Instalacja zależności Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tworzymy katalogi na pliki statyczne i kod modularny
RUN mkdir -p /app/static /app/js /app/css /app/py

# Generujemy pliki testowe zgodne z oczekiwaniami main.py
# main.py szuka: 10MB, 100MB, 500MB.
# Generujemy 10MB i 100MB w obrazie. 500MB zostawiamy do wygenerowania przez aplikację,
# aby nie "puchnął" obraz Dockera zbyt mocno.
RUN dd if=/dev/zero of=/app/static/10MB.bin bs=1M count=10 status=none
RUN dd if=/dev/zero of=/app/static/100MB.bin bs=1M count=100 status=none

# Kopiujemy kod aplikacji
COPY ./app /app

# Ustawiamy PYTHONPATH
ENV PYTHONPATH=/app

# Uruchamiamy serwer
CMD ["uvicorn", "py.main:app", "--host", "0.0.0.0", "--port", "80"]