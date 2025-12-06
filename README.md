# LocalSpeed PRO ![version](https://img.shields.io/badge/v0.1-purple)


A lightweight, self-hosted network performance testing tool designed for Docker. Built with a Python FastAPI backend and a vanilla JavaScript frontend using Web Workers to ensure accurate high-speed measurements for LAN and WAN environments.

### Features:
* Measures Ping, Download, and Upload speeds with support for Single and Multi-threaded connections.
* Real-time visualization with gauges and charts; includes customizable Dark/Light themes.
* Full measurement history with sorting, pagination, and CSV export.
* Native authentication system plus **OpenID Connect (OIDC)** support for SSO integration.
* Automated backups to Google Drive and manual SQL dump/restore capabilities.

### Screenshots:
**Dashboard**

<img width="1204" height="1130" alt="dashboard" src="https://github.com/user-attachments/assets/d5060973-e491-49c9-a0c5-787c0fd99d09" />

**OIDC Settings**

<img width="1206" height="470" alt="oidc" src="https://github.com/user-attachments/assets/4e75f735-7561-4e0c-9f79-bb0a2b274746" />

**Backup Settings**

<img width="1197" height="909" alt="backup" src="https://github.com/user-attachments/assets/67ba92ef-0b98-450f-973e-2010d198efe2" />

**Login page**

<img width="488" height="553" alt="login" src="https://github.com/user-attachments/assets/59de21d2-3d78-43af-98d3-b436b8bfd8e7" /> 

**Personalization**

<img width="389" height="232" alt="personalization" src="https://github.com/user-attachments/assets/f0264238-8c2c-438a-b315-c47190efb896" />

### Docker Compose
```
services:
  localspeedpro:
    image: popers/localspeedpro:latest
    container_name: localspeedpro_app
    restart: unless-stopped
    ports:
      - ${APP_PORT:-8002}:80
    environment:
      - TZ=Europe/Amsterdam
      - APP_USER=${APP_USER}
      - APP_PASSWORD=${APP_PASSWORD}
      - AUTH_ENABLED=${AUTH_ENABLED:-true}
      - DB_TYPE=mysql
      - DB_HOST=db
      - DB_PORT=3306
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - ls_network
  db:
    image: mariadb:10.11
    container_name: localspeedpro_db
    restart: unless-stopped
    command: --transaction-isolation=READ-COMMITTED --binlog-format=ROW
      --innodb-use-native-aio=0
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=${DB_NAME}
      - MYSQL_USER=${DB_USER}
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - TZ=Europe/Amsterdam
    volumes:
      - db_data:/var/lib/mysql
    networks:
      - ls_network
    healthcheck:
      test:
        - CMD-SHELL
        - mysqladmin ping -h localhost -u root -p${DB_ROOT_PASSWORD} || exit 1
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s
volumes:
  db_data: null
networks:
  ls_network:
    driver: bridge

```
### .env
```
APP_PORT=8003
APP_USER=admin
APP_PASSWORD=admin
AUTH_ENABLED=true
DB_NAME=localspeedpro
DB_USER=ls_user
DB_PASSWORD=dbpassword
DB_ROOT_PASSWORD=dbrootpassword
```
