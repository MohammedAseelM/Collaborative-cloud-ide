# Production deployment on a Linux VPS

This deployment uses one Linux VPS with Docker Engine, Docker Compose, Nginx,
and Certbot. The frontend container serves the built React application and
proxies `/api` and `/socket.io` to the backend. MongoDB and the backend are
not published to the internet.

## Readiness assessment

The repository is suitable for a Docker-based VPS deployment:

- `frontend/Dockerfile` builds and serves the Vite bundle with Nginx.
- `backend/Dockerfile` runs the Express and Socket.IO server and includes the
  Docker CLI.
- `docker-compose.yml` persists MongoDB data, project workspaces, and runtime
  scratch space.
- `/api/health` is available for container health checks.
- Socket.IO and the React project lifecycle routes are already wired.

This application must run on a VPS or VM with Docker Engine because code
execution and terminals require `/var/run/docker.sock`. Render-style managed
Node services do not provide that Docker daemon access.

## 1. Prepare DNS and the VPS

1. Create an Ubuntu 22.04+ VPS with at least 2 vCPUs, 4 GB RAM, and enough
   disk for user workspaces and Docker images.
2. Point `mycloudide.com` and `www.mycloudide.com` DNS A records to the VPS
   public IP.
3. Allow TCP ports 22, 80, and 443 in the VPS/cloud firewall.
4. Install Docker Engine, the Docker Compose plugin, Nginx, and Certbot.

## 2. Configure the application

```bash
git clone <your-repository-url> collaborative-cloud-ide
cd collaborative-cloud-ide
cp .env.example .env
openssl rand -hex 32
```

Replace every placeholder in `.env`. The MongoDB password in `MONGO_URI` must
be URL-encoded if it contains characters such as `@`, `:`, `/`, or `#`.
`CLIENT_URL` and `PUBLIC_HOST` must use the final HTTPS domain.

The Docker socket mount gives the backend effective control over the host
Docker daemon. Keep the VPS dedicated to this application, restrict SSH
access, and do not expose port 5000 or 27017.

## 3. Start and verify the stack

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8080/api/health
```

The health response should report `"success": true` and
`"database": "connected"`. If a container fails, inspect:

```bash
docker compose logs --tail=200 backend
docker compose logs --tail=200 mongodb
```

## 4. Configure host Nginx and HTTPS

Copy `deploy/nginx.conf` to `/etc/nginx/sites-available/mycloudide`, replace
the example domain if necessary, then enable it:

```bash
sudo ln -s /etc/nginx/sites-available/mycloudide /etc/nginx/sites-enabled/mycloudide
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d mycloudide.com -d www.mycloudide.com
```

Certbot updates the Nginx configuration and installs automatic certificate
renewal. Confirm renewal without changing the live certificate:

```bash
sudo certbot renew --dry-run
```

The HTTPS proxy forwards WebSocket upgrade headers and keeps long-lived
Socket.IO connections open.

## 5. Production verification

Verify all of the following from the public HTTPS URL:

1. Register/login and refresh the page; the authentication cookie remains.
2. Create a project and create/read/update/delete files.
3. Open the same project in two browser sessions; presence and edits update.
4. Open the terminal and run a command.
5. Create a React + Vite project, install dependencies, run it, stop it, and
   build it.
6. Open the live preview and confirm the browser can reach it.
7. Reboot the VPS and confirm MongoDB data and workspace files remain.

## Operations

```bash
docker compose pull
docker compose up -d --build
docker compose ps
docker system df
```

Back up the `db_data` and `workspace_data` Docker volumes before upgrades.
Monitor disk usage because project dependencies and execution images can grow
quickly. Rotate or ship application logs rather than allowing the VPS disk to
fill.
