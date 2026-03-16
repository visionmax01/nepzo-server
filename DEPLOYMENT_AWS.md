# NepZo Backend - AWS Deployment Guide

Step-by-step guide to deploy the NepZo backend to an AWS EC2 instance with domain **api.nepzo.rentoranepal.com**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [AWS EC2 Instance Setup](#2-aws-ec2-instance-setup)
3. [Domain DNS Configuration](#3-domain-dns-configuration)
4. [Connect to Your Server](#4-connect-to-your-server)
5. [Install Dependencies](#5-install-dependencies)
6. [Deploy Application (Docker)](#6-deploy-application-docker)
7. [Configure Nginx Reverse Proxy](#7-configure-nginx-reverse-proxy)
8. [Setup SSL (HTTPS)](#8-setup-ssl-https)
9. [Environment Variables](#9-environment-variables)
10. [Post-Deployment Checklist](#10-post-deployment-checklist)
11. [Maintenance & Updates](#11-maintenance--updates)

---

## 1. Prerequisites

- [ ] AWS account
- [ ] Domain `nepzo.rentoranepal.com` with DNS access (to add `api` subdomain)
- [ ] SSH key pair for EC2 access
- [ ] MongoDB Atlas account (recommended) OR plan to run MongoDB on the same instance
- [ ] AWS S3 bucket for media backup (optional)

---

## 2. AWS EC2 Instance Setup

### Step 2.1: Launch EC2 Instance

1. Log in to [AWS Console](https://console.aws.amazon.com/) → **EC2** → **Launch Instance**
2. **Name:** `nepzo-backend`
3. **AMI:** Ubuntu Server 22.04 LTS
4. **Instance type:** `t3.small` (2 vCPU, 2 GB RAM) — minimum for MongoDB + Node + Redis + MinIO
5. **Key pair:** Create new or select existing (download `.pem` file — keep it secure!)
6. **Network settings:**
   - Create/select a security group
   - **Inbound rules:**
     | Type   | Port | Source    | Description        |
     |--------|------|-----------|--------------------|
     | SSH    | 22   | Your IP   | SSH access         |
     | HTTP   | 80   | 0.0.0.0/0 | Nginx / Certbot    |
     | HTTPS  | 443  | 0.0.0.0/0 | HTTPS traffic      |
     | Custom | 4000 | 127.0.0.1| Internal (optional) |
7. **Storage:** 30 GB gp3 (minimum)
8. Click **Launch instance**

### Step 2.2: Allocate Elastic IP (Recommended)

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address**
2. **Associate** it with your `nepzo-backend` instance
3. Note the **Public IP** — you'll use it for DNS

---

## 3. Domain DNS Configuration

1. Go to your domain registrar (where you manage `rentoranepal.com`)
2. Add an **A record:**
   - **Name/Host:** `api` (or `api.nepzo` if subdomain is `nepzo.rentoranepal.com`)
   - **Type:** A
   - **Value:** Your EC2 Elastic IP
   - **TTL:** 300 (or default)

3. **Result:** `api.nepzo.rentoranepal.com` → points to your EC2 IP

4. Wait 5–30 minutes for DNS propagation. Verify:
   ```bash
   nslookup api.nepzo.rentoranepal.com
   ```

---

## 4. Connect to Your Server

```bash
# Replace with your key path and Elastic IP
ssh -i "your-key.pem" ubuntu@YOUR_ELASTIC_IP
```

---

## 5. Install Dependencies

Run these commands on your EC2 instance:

### 5.1: Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 5.2: Install Docker & Docker Compose

```bash
# Install Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER
# Log out and back in, or run: newgrp docker
```

### 5.3: Install Nginx

```bash
sudo apt install -y nginx
```

### 5.4: Install Certbot (for SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## 6. Deploy Application (Docker)

### Step 6.1: Clone or Upload Your Code

**Option A: Git (recommended)**

```bash
cd /home/ubuntu
git clone https://github.com/YOUR_ORG/YOUR_REPO.git nepzo
cd nepzo/server
```

**Option B: SCP from your machine**

```bash
# From your local machine (PowerShell)
scp -i "your-key.pem" -r "d:\App Development-production\server" ubuntu@YOUR_ELASTIC_IP:/home/ubuntu/nepzo/
```

Then on the server:

```bash
cd /home/ubuntu/nepzo/server
```

### Step 6.2: Create Production `.env`

```bash
nano .env
```

Use this template (replace placeholders):

```env
########################################
# Core application settings
########################################
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=*
LOG_LEVEL=info

########################################
# Database (MongoDB)
########################################
# Option 1: MongoDB on same host (Docker)
MONGODB_URI=mongodb://mongo:27017/nepzo

# Option 2: MongoDB Atlas (recommended for production)
# MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/nepzo?retryWrites=true&w=majority

########################################
# Encryption (generate new key for production!)
########################################
ENCRYPTION_KEY=YOUR_32_BYTE_HEX_KEY_HERE

########################################
# Authentication
########################################
JWT_SECRET=YOUR_STRONG_JWT_SECRET_HERE
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=840891196284-kijebscungi0j644gvvlr5eemritt10l.apps.googleusercontent.com
GOOGLE_ANDROID_CLIENT_ID=840891196284-44imhgf3jjqsp0v8sq716vaam5jp7h69.apps.googleusercontent.com

########################################
# MinIO (media storage)
########################################
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=CHANGE_THIS_STRONG_PASSWORD

########################################
# AWS S3 (media backup - optional)
########################################
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
S3_BUCKET=your-s3-bucket

########################################
# Cache (Redis)
########################################
CACHE_ENABLED=true
CACHE_HOST=redis
CACHE_PORT=6379

########################################
# Push Notifications (Expo)
########################################
EXPO_ACCESS_TOKEN=your-expo-access-token
```

**Important:** Generate new secrets for production:

```bash
# Generate ENCRYPTION_KEY (32 bytes hex)
openssl rand -hex 32

# Generate JWT_SECRET
openssl rand -hex 48
```

### Step 6.3: Update `docker-compose.yml` for Production

Ensure `docker-compose.yml` uses the correct port. Your existing file should work. If the API port differs, set `PORT=4000` in `.env`.

### Step 6.4: Build and Run

```bash
cd /home/ubuntu/nepzo/server

# Build and start all services
docker compose up -d --build

# Check status
docker compose ps
docker compose logs -f api
```

Verify the API responds:

```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","service":"NepZo Backend"}
```

---

## 7. Configure Nginx Reverse Proxy

Nginx will:
- Terminate SSL (HTTPS)
- Proxy HTTP/WebSocket to your Node app
- Serve `api.nepzo.rentoranepal.com`

### Step 7.1: Create Nginx Config

```bash
sudo nano /etc/nginx/sites-available/nepzo-api
```

Paste (replace `api.nepzo.rentoranepal.com` if your domain differs):

```nginx
# HTTP - redirect to HTTPS (after SSL is set up)
server {
    listen 80;
    server_name api.nepzo.rentoranepal.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### Step 7.2: Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/nepzo-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Test (before SSL):

```bash
curl http://api.nepzo.rentoranepal.com/api/health
```

---

## 8. Setup SSL (HTTPS)

### Step 8.1: Obtain Certificate

```bash
sudo certbot --nginx -d api.nepzo.rentoranepal.com
```

- Enter email for renewal notices
- Agree to terms
- Choose whether to redirect HTTP → HTTPS (recommended: Yes)

### Step 8.2: Update Nginx for WebSockets (Socket.io)

Certbot will modify your config. Ensure WebSocket support remains. Edit:

```bash
sudo nano /etc/nginx/sites-available/nepzo-api
```

Your final config should look like:

```nginx
server {
    listen 80;
    server_name api.nepzo.rentoranepal.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name api.nepzo.rentoranepal.com;

    ssl_certificate /etc/letsencrypt/live/api.nepzo.rentoranepal.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nepzo.rentoranepal.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8.3: Auto-Renewal (Certbot)

```bash
sudo certbot renew --dry-run
```

Certbot adds a cron job automatically. Certificates renew every 90 days.

---

## 9. Environment Variables

### Update Mobile App

In your mobile app, set the API and Socket URLs:

**`mobile/.env`:**
```
EXPO_PUBLIC_NEPZO_API_URL=https://api.nepzo.rentoranepal.com/api
EXPO_PUBLIC_NEPZO_SOCKET_URL=https://api.nepzo.rentoranepal.com
```

**`mobile/app.json`** (in `expo.extra`):
```json
"NEPZO_API_URL": "https://api.nepzo.rentoranepal.com/api",
"NEPZO_SOCKET_URL": "https://api.nepzo.rentoranepal.com"
```

> **Note:** Socket.io connects to the root domain; the API uses `/api`. Both share the same backend.

Rebuild the app after changing these values.

### CORS

If your app runs on a different origin, set `CLIENT_ORIGIN` in server `.env`:

```env
CLIENT_ORIGIN=https://your-app-domain.com,exp://*
```

For Expo/React Native, `*` or `exp://*` is often used during development.

---

## 10. Post-Deployment Checklist

- [ ] `https://api.nepzo.rentoranepal.com/api/health` returns `{"status":"ok"}`
- [ ] Mobile app can reach the API
- [ ] Google Sign-In works (ensure OAuth redirect URIs include your domain if needed)
- [ ] Socket.io/WebSocket connects (chat, presence, etc.)
- [ ] File uploads work (MinIO)
- [ ] MongoDB has data persistence (Docker volume `mongo_data`)
- [ ] Redis and MinIO are running: `docker compose ps`

---

## 11. Maintenance & Updates

### View Logs

```bash
cd /home/ubuntu/nepzo/server
docker compose logs -f api
docker compose logs -f mongo
```

### Restart Services

```bash
docker compose restart api
# or
docker compose down && docker compose up -d --build
```

### Deploy New Code

```bash
cd /home/ubuntu/nepzo/server
git pull   # if using Git
docker compose up -d --build
```

### Backup MongoDB

```bash
docker compose exec mongo mongodump --out /data/backup
# Copy from container: docker cp <container>:/data/backup ./backup
```

### Backup MinIO Data

```bash
# MinIO data is in Docker volume: mongo_data, minio_data
docker run --rm -v nepzo_minio_data:/data -v $(pwd):/backup alpine tar czf /backup/minio-backup.tar.gz /data
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check `docker compose ps` — API container running? Check `docker compose logs api` |
| Connection refused | Ensure security group allows 80, 443; Nginx is running: `sudo systemctl status nginx` |
| WebSocket fails | Verify `Upgrade` and `Connection` headers in Nginx config |
| MongoDB connection error | Check `MONGODB_URI`; ensure `mongo` hostname in Docker network |
| SSL certificate error | Run `sudo certbot renew --force-renewal` |

---

## Quick Reference

| Item | Value |
|------|-------|
| API URL | `https://api.nepzo.rentoranepal.com` |
| Health Check | `GET /api/health` |
| API Port (internal) | 4000 |
| MongoDB Port | 27017 |
| MinIO Console | `http://YOUR_IP:9001` (restrict in production!) |
| Redis Port | 6379 |

---

**Domain:** `api.nepzo.rentoranepal.com`  
**Stack:** Node.js, Express, MongoDB, Redis, MinIO, Socket.io, Nginx, Let's Encrypt
