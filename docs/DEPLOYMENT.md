# Collaborative Cloud IDE - Deployment Guide

This guide covers deployment across multiple environments: Render (Control Plane), Vercel (Frontend), and Linux VPS with Docker Compose (Full Sandbox Execution Plane).

---

## 1. Architectural Readiness & Hosting Matrix

| Deployment Tier | Frontend Hosting | Backend API Hosting | Runtime Execution Method |
| :--- | :--- | :--- | :--- |
| **Tier 1: Render + Vercel** | Vercel (Static Vite build) | Render Web Service (Node.js) | Native Process Runner (`child_process` sandbox fallback) |
| **Tier 2: Dedicated VPS** | Nginx Reverse Proxy | Docker Container | Hardened Docker Sandbox (`/var/run/docker.sock` daemon) |

> **IMPORTANT PLATFORM LIMITATION**:
> Render Web Services run within isolated container environments that **do not expose the host Docker daemon socket** (`/var/run/docker.sock`).
> On Render, the Collaborative Cloud IDE automatically uses its **Native Process Runner fallback** (`projectRunner.service.js` and `reactProjectService.js`) to install, build, and run applications.
> If your organization requires hard Docker container boundaries for multi-tenant untrusted code compilation, deploy the backend to a **Linux VPS with Docker Compose** as described in Section 4.

---

## 2. Frontend Deployment on Vercel

1. Import the repository into Vercel and set the **Root Directory** to `frontend`.
2. Configure Build & Development Settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
3. Environment Variables:
   - `VITE_API_URL`: Your backend API base URL (e.g. `https://collaborative-cloud-ide-backend.onrender.com/api`)
   - `VITE_SOCKET_URL`: Your backend base URL (e.g. `https://collaborative-cloud-ide-backend.onrender.com`)

> **CRITICAL**: Never append `:5173` to production backend URLs. The frontend communicates with the backend over HTTPS (port 443), and the backend reverse proxies application preview traffic internally.

---

## 3. Backend Deployment on Render

1. Create a new **Web Service** connected to your repository.
2. Configure settings:
   - **Root Directory**: `backend`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: `18.x` or `20.x`
3. Environment Variables:
   - `PORT`: `5000` (or leave default assigned by Render)
   - `NODE_ENV`: `production`
   - `MONGO_URI`: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/collaborative-cloud-ide?retryWrites=true&w=majority`
   - `JWT_SECRET`: High-entropy random string (e.g. generated via `openssl rand -hex 32`)
   - `CLIENT_URL`: Your Vercel frontend URL (e.g. `https://collaborative-cloud-ide.vercel.app`)
4. Health Check Path:
   - Set Health Check Path to `/api/health`.

---

## 4. Full Production VPS Deployment (Docker Compose)

For multi-tenant deployments requiring Docker container isolation:

### Pre-requisites
* Ubuntu 22.04+ LTS VPS (min 2 vCPU, 4GB RAM)
* Docker Engine 24+ & Docker Compose v2+
* Domain with DNS A records pointing to the VPS IP

### Step 1: Clone and Configure
```bash
git clone https://github.com/MohammedAseelM/Collaborative-cloud-ide.git
cd Collaborative-cloud-ide
cp .env.example .env
```

Generate secure secrets and update `.env`:
```ini
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb://mongodb:27017/collaborative-cloud-ide
JWT_SECRET=your_generated_random_secret_hex_string
CLIENT_URL=https://yourdomain.com
PUBLIC_HOST=yourdomain.com
```

### Step 2: Launch Stack
```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8080/api/health
```

### Step 3: Nginx & SSL Setup
Configure Nginx on the host to route incoming HTTPS traffic:
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Obtain free SSL certificate via Let's Encrypt:
```bash
sudo certbot --nginx -d yourdomain.com
```

---

## 5. MongoDB Atlas Setup
1. Create a cluster on MongoDB Atlas (M0 Free Tier or higher).
2. Create a Database User with read/write access.
3. In Network Access, add `0.0.0.0/0` (for Render/Vercel dynamic IPs) or your VPS static IP.
4. Obtain connection string and paste into `MONGO_URI`.
