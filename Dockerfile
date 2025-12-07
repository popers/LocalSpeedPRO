FROM python:3.11-slim

WORKDIR /app

# Instalacja zależności systemowych
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    # Dodano iputils-ping, aby mieć pewność, że komenda ping działa w kontenerze
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Instalacja zależności Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Tworzymy katalogi
RUN mkdir -p /app/static /app/js /app/css /app/py

# ZMIANA: Usunięto generowanie plików testowych za pomocą 'dd'.
# Pliki są teraz generowane w locie w RAM przez FastAPI.
# RUN dd if=/dev/zero of=/app/static/10MB.bin bs=1M count=10 status=none
# RUN dd if=/dev/zero of=/app/static/100MB.bin bs=1M count=100 status=none

COPY ./app /app

ENV PYTHONPATH=/app

CMD ["uvicorn", "py.main:app", "--host", "0.0.0.0", "--port", "80"]