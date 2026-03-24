# TURN Server Setup Guide (Coturn)

This guide explains how to set up a TURN server for WebRTC voice/video calls. TURN relays media when direct peer-to-peer connection fails (symmetric NAT, strict firewalls, etc.).

---

## Overview

| Component | Purpose |
|-----------|---------|
| **STUN** | Helps peers discover their public IP (already using Google STUN) |
| **TURN** | Relays media when STUN fails — required for reliable calls on restrictive networks |

Your app fetches ICE servers from `GET /api/config/webrtc`. When TURN env vars are set, the server adds the TURN server to the response.

---

## Option A: Coturn on Same EC2 (Recommended)

Deploy coturn on the same Ubuntu server as your API (`api.nepzo.rentoranepal.com`).

### 1. Open AWS Security Group Ports

In **EC2 → Security Groups → Your instance's group**, add inbound rules:

| Type | Port | Source | Description |
|------|------|--------|-------------|
| Custom UDP | 3478 | 0.0.0.0/0 | TURN |
| Custom TCP | 3478 | 0.0.0.0/0 | TURN |
| Custom UDP | 49152-65535 | 0.0.0.0/0 | TURN relay ports |
| Custom TCP | 5349 | 0.0.0.0/0 | TURNS (optional, for TLS) |

### 2. Install Coturn

SSH into your EC2 instance, then:

```bash
# Coturn may not be in default Ubuntu 22.04 repos; use PPA
sudo add-apt-repository ppa:ubuntuhandbook1/coturn
sudo apt update
sudo apt install -y coturn
```

If PPA fails, try:

```bash
sudo apt install -y coturn
# (may work on some Ubuntu versions)
```

### 3. Enable and Configure Coturn

```bash
# Enable coturn to start on boot
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Create/edit config (coturn reads turnserver.conf)
sudo nano /etc/turnserver.conf
```

**Minimal config** (replace with your values):

```conf
# Realm = your domain (used for TURN auth)
realm=api.nepzo.rentoranepal.com

# Listen on default TURN ports
listening-port=3478
tls-listening-port=5349

# External IP: CRITICAL for EC2
# Format: external-ip=PUBLIC_IP/PRIVATE_IP
# Get them: curl -s ifconfig.me (public), hostname -I | awk '{print $1}' (private)
external-ip=YOUR_ELASTIC_IP/YOUR_PRIVATE_IP

# Static credentials (username:password)
# Use a strong password! Generate: openssl rand -hex 16
user=nepzo_turn:YOUR_STRONG_PASSWORD

# Relay port range (required for media relay)
min-port=49152
max-port=65535

# Disable TLS if you don't have certs (UDP on 3478 will work)
# no-tls
# no-cli

# Logging (optional)
log-file=/var/log/turnserver.log
verbose
```

**Get your IPs:**

```bash
# Public (Elastic IP)
curl -s ifconfig.me

# Private (e.g. 172.31.x.x)
hostname -I | awk '{print $1}'
```

Example `external-ip` line:
```conf
external-ip=54.123.45.67/172.31.10.20
```

### 4. Start Coturn

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
sudo systemctl status coturn
```

### 5. Configure Server `.env`

Add to your server `.env`:

```env
TURN_URL=turn:api.nepzo.rentoranepal.com:3478
TURN_USERNAME=nepzo_turn
TURN_CREDENTIAL=YOUR_STRONG_PASSWORD
```

Use the same username and password you set in `turnserver.conf`.

### 6. Restart Your API

```bash
# If using Docker
cd /home/ubuntu/nepzo/server
docker compose restart api

# If using PM2
pm2 restart nepzo-api
```

---

## Option B: TURNS (TLS) for Extra Security

If you want encrypted TURN (recommended for production):

1. You already have Let's Encrypt certs for `api.nepzo.rentoranepal.com` (from Certbot).
2. Add to `turnserver.conf`:

```conf
cert=/etc/letsencrypt/live/api.nepzo.rentoranepal.com/fullchain.pem
pkey=/etc/letsencrypt/live/api.nepzo.rentoranepal.com/privkey.pem
```

3. In `.env` use TURNS URL:

```env
TURN_URL=turns:api.nepzo.rentoranepal.com:5349
```

4. Ensure port 5349 is open in AWS Security Group.

---

## Option C: Third-Party TURN (No Self-Hosting)

If you prefer not to run coturn yourself:

| Service | Notes |
|---------|-------|
| [Twilio TURN](https://www.twilio.com/stun-turn) | Free tier, easy setup |
| [Xirsys](https://xirsys.com/) | WebRTC-focused |
| [Metered.ca](https://www.metered.ca/tools/openrelay/) | Free TURN for testing |

You get a URL, username, and credential. Put them in your server `.env`:

```env
TURN_URL=turn:global.turn.twilio.com:3478?transport=udp
TURN_USERNAME=your_twilio_username
TURN_CREDENTIAL=your_twilio_credential
```

---

## Option D: Coturn via Docker Compose (Recommended for EC2)

Coturn runs as a Docker service alongside the API using `network_mode: host` and [`scripts/turnserver-entrypoint.sh`](scripts/turnserver-entrypoint.sh).

### 1. Open AWS Security Group Ports

- **UDP 3478** — TURN/STUN
- **TCP 3478** — TURN over TCP (required for [`?transport=tcp`](src/controllers/configController.js) fallback; many mobile networks block UDP)
- **UDP 49152–65535** — relay ports (without this, signaling works but **no media** across NATs)

### 2. Configure `.env`

Add to your server `.env` (see `.env.example`). **Use your Elastic IP in `TURN_URL`** if your API domain is Cloudflare-proxied or does not point UDP to this instance — HTTPS reverse proxy does **not** relay TURN.

```env
TURN_URL=turn:YOUR_ELASTIC_IP:3478
TURN_USERNAME=nepzo_turn
TURN_CREDENTIAL=your_strong_password_here
TURN_REALM=your.domain.com
TURN_EXTERNAL_IP=YOUR_ELASTIC_IP
TURN_PRIVATE_IP=YOUR_EC2_PRIVATE_IP
```

On EC2: `curl -s http://169.254.169.254/latest/meta-data/public-ipv4` and `local-ipv4`. `TURN_USERNAME` / `TURN_CREDENTIAL` must match what the entrypoint passes to `--user=`.

Generate a strong password: `openssl rand -hex 16`

### 3. Start Services

```bash
cd /home/ubuntu/nepzo/server
docker compose up -d --build
```

Coturn starts with the API. `TURN_EXTERNAL_IP` / `TURN_PRIVATE_IP` set `--external-ip` so relay candidates advertise your **public** address (required on EC2).

### 4. Verify

```bash
docker compose logs coturn
```

**Note:** `network_mode: host` requires Linux (e.g. EC2). On Docker Desktop for Mac/Windows, Coturn will not work — use Option A (host install) or Option C (third-party) for local dev.

---

## Verify It Works

1. **Check coturn is running:**
   ```bash
   sudo systemctl status coturn
   ```

2. **Test from browser:** Use [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
   - Add your TURN server (URL, username, credential)
   - Click "Gather candidates"
   - You should see `relay` type candidates if TURN is working

3. **Test from your app:** Make a call between two devices on different networks (e.g. Wi‑Fi vs mobile data). If it connects, TURN is being used when needed.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Address already in use` / `Cannot bind ... 127.0.0.1:3478` | Only one process may use 3478 with `network_mode: host`. Stop the **other** coturn: `sudo ss -lptnu 'sport = :3478'` or `sudo lsof -i :3478`. If Ubuntu’s **systemd** coturn is installed: `sudo systemctl stop coturn && sudo systemctl disable coturn`. Then `docker compose up -d coturn`. |
| No relay candidates | Check `external-ip` is correct (public/private). Restart coturn. |
| Connection timeout | Open **UDP+TCP 3478** and **UDP 49152-65535** in the security group; set `TURN_EXTERNAL_IP` / `TURN_PRIVATE_IP`. |
| Auth failed | Ensure `TURN_USERNAME` and `TURN_CREDENTIAL` in `.env` match `user=` in turnserver.conf. |
| Coturn won't start | `docker compose logs coturn`. For native install: `sudo turnserver -c /etc/turnserver.conf` to see errors. |

---

## Quick Reference

| Env Variable | Example |
|--------------|---------|
| `TURN_URL` | `turn:YOUR_ELASTIC_IP:3478` or `turn:dns-only-hostname:3478` |
| `TURN_USERNAME` | `nepzo_turn` |
| `TURN_CREDENTIAL` | (strong password) |
| `TURN_REALM` | Your domain (realm string) |
| `TURN_EXTERNAL_IP` | EC2 Elastic / public IP (Docker Compose) |
| `TURN_PRIVATE_IP` | EC2 private IP (e.g. `172.31.x.x`) |

Your `configController.js` serves these to the mobile app via `GET /api/config/webrtc`. The app uses them automatically when establishing WebRTC connections.
