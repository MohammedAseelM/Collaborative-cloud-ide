# Docker Setup & Containerization Guide

This document describes how to orchestrate, build, and run the Collaborative Cloud IDE using Docker and Docker Compose.

---

## 1. Container Configuration

### Backend Dockerfile (`backend/Dockerfile`)
The backend container runs on Node.js alpine. It installs the Docker CLI tool dynamically so that the backend can issue container spawning commands:
```dockerfile
FROM node:18-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "src/server.js"]
```

### Frontend Dockerfile (`frontend/Dockerfile`)
The frontend uses a multi-stage build:
* **Stage 1 (Build)**: Compiles the React distribution package using Vite.
* **Stage 2 (Serve)**: Copies compiled static assets into an Nginx Alpine container.
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Reverse Proxy (`frontend/nginx.conf`)
Routes queries on port `80`:
* `/` -> Serves static React index files.
* `/api/*` -> Proxied to backend Node container on `http://backend:5000`.
* `/socket.io/*` -> Upgrades HTTP requests to WebSockets and proxies them to the backend server.

---

## 2. Docker Compose Orchestration

The root `docker-compose.yml` orchestrates three primary container nodes:
1. **`mongodb`**: Runs MongoDB, binding data to volume `db_data` for persistence.
2. **`backend`**: Runs the Express API. It mounts `/var/run/docker.sock:/var/run/docker.sock` to delegate Docker CLI requests from inside the container to the host machine's Docker daemon.
3. **`frontend`**: Hosts the Nginx proxy, routing all inbound web traffic.

---

## 3. Running with Docker Compose

### Prerequisites
* Ensure Docker Desktop is installed and running.
* Verify port `80` (HTTP), `5000` (API), and `27017` (MongoDB) are not bound by other processes.

### Startup Command
Spin up the entire stack in detached mode:
```bash
docker-compose up --build -d
```

### Verification
* Open `http://localhost` in your browser. The Nginx reverse proxy will display the React login/dashboard interface.
* Verify the containers status:
  ```bash
  docker-compose ps
  ```
* View running logs:
  ```bash
  docker-compose logs -f
  ```
