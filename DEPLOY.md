# IELTSWORDS Deployment Guide

This guide describes a conservative production deployment for the IELTSWORDS app.

The recommended shape is:

- Nginx serves `frontend/dist`
- Nginx proxies `/api`, `/health`, `/docs` to FastAPI
- FastAPI runs under `systemd`
- SQLite is backed up with the SQLite online backup command
- The project root `.env` is the single source of runtime configuration

## 1. Prepare The Server

Install system dependencies:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm nginx sqlite3
```

Create an app directory:

```bash
sudo mkdir -p /opt/ieltswords
sudo chown "$USER":"$USER" /opt/ieltswords
```

Copy the project to `/opt/ieltswords`.

## 2. Create The Unified `.env`

Create the project environment file:

```bash
cd /opt/ieltswords
cp .env.example .env
```

Generate a strong `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Generate a strong `FERNET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Edit `/opt/ieltswords/.env` and update at least these values:

- `ENVIRONMENT=production`
- `SERVER_HOST=127.0.0.1`
- `SERVER_RELOAD=false`
- `SECRET_KEY=<generated-secret>`
- `FERNET_KEY=<generated-fernet-key>`
- `CORS_ORIGINS=https://example.com`
- `VITE_API_BASE_URL=https://example.com`

Keep these values stable unless you intentionally move files:

- `DATABASE_URL`
- `SOURCE_DATABASE_URL`

Optional AI defaults:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `AI_REQUEST_TIMEOUT_SECONDS`

## 3. Backend Environment

Create a Python virtual environment:

```bash
cd /opt/ieltswords
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

Initialize the app database if needed:

```bash
cd /opt/ieltswords
.venv/bin/python backend/scripts/init_db.py
```

## 4. Frontend Build

Build:

```bash
cd /opt/ieltswords/frontend
npm install
npm run build
```

`VITE_API_BASE_URL` will be read from the project root `.env`.

## 5. systemd Backend Service

Install the service template:

```bash
sudo cp /opt/ieltswords/deploy/systemd/ieltswords-backend.service.example /etc/systemd/system/ieltswords-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now ieltswords-backend
sudo systemctl status ieltswords-backend
```

View logs:

```bash
journalctl -u ieltswords-backend -f
```

## 6. Nginx

Install the Nginx template:

```bash
sudo cp /opt/ieltswords/deploy/nginx/ieltswords.conf.example /etc/nginx/sites-available/ieltswords
sudo ln -s /etc/nginx/sites-available/ieltswords /etc/nginx/sites-enabled/ieltswords
```

Edit `/etc/nginx/sites-available/ieltswords` and replace:

- `example.com`
- `/opt/ieltswords`

Then test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Add HTTPS with your preferred certificate tool, for example Certbot.

## 7. Backup

Run a manual SQLite backup:

```bash
cd /opt/ieltswords
bash deploy/scripts/backup_sqlite.sh
```

Example daily cron:

```cron
15 3 * * * cd /opt/ieltswords && bash deploy/scripts/backup_sqlite.sh >> /var/log/ieltswords-backup.log 2>&1
```

Test restore at least once before public launch.

## 8. Predeploy Check

Before release:

```bash
cd /opt/ieltswords
bash deploy/scripts/predeploy_check.sh
```

It checks frontend lint/build, Python syntax, required files, and common deployment mistakes.

## 9. Launch Checklist

- `/opt/ieltswords/.env` exists and is readable by the app user
- `.env` has strong `SECRET_KEY` and `FERNET_KEY`
- `.env` uses production `CORS_ORIGINS`
- `.env` points `VITE_API_BASE_URL` to the public backend URL
- `npm run build` passes
- `deploy/scripts/predeploy_check.sh` passes
- SQLite backup works
- Nginx serves the frontend
- `/health` returns healthy through the public domain
- Login, learning, image viewing, review, quiz, mistake book, and check-in flows are tested
