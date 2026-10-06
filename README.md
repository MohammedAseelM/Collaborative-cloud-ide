# Collaborative Cloud IDE

A production-oriented, browser-based collaborative cloud integrated development environment (IDE) designed for team-based software engineering. Features real-time multi-user editing with Monaco Editor, presence and remote cursors via Socket.IO, role-based access control, file tree management, integrated terminal and log streaming, dev server execution, live application preview via secure reverse proxy, version snapshots, and isolated sandbox execution.

---

## Table of Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Screenshots](#screenshots)
4. [Architecture](#architecture)
5. [Technology Stack](#technology-stack)
6. [Repository Structure](#repository-structure)
7. [Authentication](#authentication)
8. [Collaboration](#collaboration)
9. [Monaco Editor](#monaco-editor)
10. [File Management](#file-management)
11. [Terminal](#terminal)
12. [Runtime Execution](#runtime-execution)
13. [React/Vite Execution](#reactvite-execution)
14. [Live Preview](#live-preview)
15. [Snapshots](#snapshots)
16. [Team Management](#team-management)
17. [Chat](#chat)
18. [Security](#security)
19. [Installation](#installation)
20. [Environment Variables](#environment-variables)
21. [Local Development](#local-development)
22. [Docker](#docker)
23. [Testing](#testing)
24. [Deployment](#deployment)
    - [Render](#render)
    - [Vercel](#vercel)
    - [MongoDB Atlas](#mongodb-atlas)
25. [Known Limitations](#known-limitations)
26. [Troubleshooting](#troubleshooting)
27. [Roadmap](#roadmap)
28. [Contributing](#contributing)
29. [License](#license)

---

## Overview

The Collaborative Cloud IDE provides a full software development lifecycle in a web browser. Teams can simultaneously edit code, manage files, chat, run development servers, inspect build outputs, and preview web applications in real time without local environment setup.

The platform separates the **Control Plane** (authentication, project management, real-time collaboration, and preview reverse proxy) from the **Execution Plane** (sandboxed runtime execution and dev server processes), ensuring secure and performant operation.

---

## Features

* **Multi-User Real-Time Collaboration**: Simultaneous editing powered by Socket.IO and Monaco Editor with live presence, remote cursor positions, selections, and typing indicators.
* **Monaco Code Editor**: Multi-tab interface, syntax highlighting for JavaScript, TypeScript, Python, HTML, CSS, JSON, and more, keyboard shortcuts (Ctrl+S save), and unsaved change tracking.
* **Hierarchical File Explorer**: Create, rename, delete, and organize files and nested directories. Protected against path traversal.
* **React & Vite Lifecycle Engine**: Automated dependency installation (`npm install`), production builds (`npm run build`), development server execution (`npm run dev`), stop, restart, and package management.
* **Live Application Preview**: Secure in-browser preview served via `/preview/:projectId/` through an authenticated backend reverse proxy (internal runtime ports like 5173 are never exposed directly).
* **Multi-Language Sandbox Execution**: Run scripts and compile code (Node.js, Python, TypeScript, C, C++, Java) in resource-constrained execution environments.
* **Integrated Terminal & Logs**: Stream real-time stdout, stderr, commands, and exit codes with structured logs.
* **Role-Based Access Control (RBAC)**: Enforced server-side roles: `Owner`, `Admin`, `Editor`, and `Viewer`. Viewers are restricted to read-only access.
* **Version Snapshots & History**: Create immutable snapshots of project code, restore historical versions with real-time broadcast synchronization across all active collaborators.
* **Workspace Chat & Activity Timeline**: Real-time project chat panel with auto-scroll and persistent message history, alongside an audit trail of project activities.
* **Security & Observability**: JWT authentication via HTTP-only cookies, password hashing with bcrypt, rate limiting on sensitive endpoints, Helmet HTTP security headers, and structured Winston logging.

---

## Screenshots

| View | Description |
| :--- | :--- |
| **Workspace & Editor** | Real-time code workspace featuring Monaco editor, file explorer tree, active cursors, live chat, and Team Management. |
| **Live Application Preview** | Embedded application preview displaying running React/Vite web apps via secure reverse proxy. |
| **Dashboard** | Project listings with search queries, archiving, favorites, and collaboration invitations inbox. |
| **Terminal & Build Logs** | Real-time terminal streaming dependency installations, build diagnostics, and server output. |

---

## Architecture

The target architecture routes client requests through an authenticated backend that coordinates database persistence, WebSocket rooms, execution management, and live previews:

```
                         USER BROWSER
                              |
                              v
                    +-------------------+
                    | React Frontend    |
                    | Vite              |
                    | Monaco Editor     |
                    +---------+---------+
                              |
                     HTTPS / Socket.IO
                              |
                              v
                    +-------------------+
                    | Node/Express      |
                    | Backend API       |
                    +---------+---------+
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
      +-------------+                 +----------------+
      | MongoDB     |                 | Runtime/Sandbox|
      | Atlas / DB  |                 | Manager        |
      +-------------+                 +--------+-------+
                                               |
                                     +---------+---------+
                                     |                   |
                                     v                   v
                                React/Vite           Node/Python
                                Dev Server           Sandboxes
                                     |
                                     v
                            Internal Port (e.g. 5173)
                            (Never directly exposed)
                                     |
                                     v
                           /preview/:projectId/
                                     |
                                     v
                              Browser Iframe
```

### Core Architecture Principles:
1. **Never Expose Internal Ports**: Dev servers bind locally to `127.0.0.1:${port}`. URLs like `backend.onrender.com:5173` or direct external ports are strictly prohibited.
2. **Reverse Proxy Routing**: All preview requests flow through `/preview/:projectId/` on the backend, which verifies the user's project authorization and proxies traffic internally.
3. **Control Plane / Execution Plane Separation**: The control plane (Express API & Socket.IO) runs reliably on standard cloud platforms (e.g., Render, VPS), while code execution can run in dedicated Docker containers (VPS) or controlled process fallbacks (Render).

---

## Technology Stack

### Frontend
* **Core Framework**: React 18
* **Build Tool**: Vite 5
* **Editor**: Monaco Editor (`@monaco-editor/react`)
* **Routing**: React Router DOM 6 (lazy-loaded routes)
* **Real-Time Client**: Socket.IO Client 4
* **Styling**: Tailwind CSS & Lucide Icons
* **HTTP Client**: Axios

### Backend
* **Runtime**: Node.js (v18.x / v20.x) & Express 4
* **Real-Time Engine**: Socket.IO Server 4
* **Database & ODM**: MongoDB & Mongoose 8
* **Authentication**: JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`
* **Reverse Proxy**: `http-proxy-middleware`
* **Security**: `helmet`, `cors`, `express-rate-limit`, `cookie-parser`
* **Logging**: Winston with daily log rotation
* **Execution & Sandboxing**: Docker Engine (`dockerode` / Docker CLI) with native child-process fallback

---

## Repository Structure

```text
collaborative-cloud-ide/
├── backend/                        # Express API & Runtime Server
│   ├── src/
│   │   ├── config/                 # Database and environment configurations
│   │   ├── controllers/            # Feature controllers (Auth, Project, File, Runner, etc.)
│   │   ├── middlewares/            # Auth, RBAC, Preview Proxy, Rate Limiters
│   │   ├── models/                 # Mongoose schemas (User, Project, FileNode, Version, etc.)
│   │   ├── routes/                 # Express REST endpoint routers
│   │   ├── services/               # Project runner, Docker sandbox, React project services
│   │   ├── sockets/                # Socket.IO handlers (presence, cursors, chat, rooms)
│   │   ├── utils/                  # Winston logger, path safety utilities
│   │   └── server.js               # Express application entrypoint and lifecycle
│   ├── tests/                      # Automated native test suites (14 suites, 73 tests)
│   ├── Dockerfile                  # Production backend container definition
│   └── package.json                # Backend dependencies and test scripts
├── frontend/                       # React + Vite Client
│   ├── src/
│   │   ├── components/             # Reusable UI components (Navbar, Modals, Terminal, Chat)
│   │   ├── context/                # Global contexts (AuthContext, ToastContext)
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── pages/                  # Views (Dashboard, Workspace, Login, Register, Settings)
│   │   ├── services/               # Axios API client modules
│   │   ├── App.jsx                 # Route configurations and layout wrappers
│   │   └── main.jsx                # Application DOM entrypoint
│   ├── Dockerfile                  # Production frontend container definition (Nginx)
│   ├── vite.config.js              # Vite build and proxy configuration
│   └── package.json                # Frontend dependencies
├── docs/                           # Comprehensive Architectural & Operational Documentation
│   ├── ARCHITECTURE.md             # In-depth architectural flows and sequence diagrams
│   ├── API.md                      # Complete REST and Preview API specification
│   ├── DATABASE.md                 # MongoDB schemas, models, and indexing strategy
│   ├── DEPLOYMENT.md               # Production deployment guide (Render, Vercel, VPS)
│   ├── SECURITY.md                 # Threat modeling, RBAC, and security safeguards
│   └── TESTING.md                  # Automated testing and multi-user validation report
├── docker-compose.yml              # Production multi-container orchestration
└── README.md                       # Main documentation
```

---

## Authentication

Authentication is handled securely via JSON Web Tokens:
* **Registration & Login**: Passwords are required to be at least 8 characters and are hashed using `bcryptjs` with 10 salt rounds.
* **Session Storage**: The JWT is delivered in an `httpOnly`, `secure`, `sameSite: "strict"` cookie, eliminating XSS token harvesting risks. Cross-origin authorization header tokens are also supported.
* **Brute-Force Protection**: The `authLimiter` limits authentication attempts to 10 requests per 15 minutes per IP.
* **Session Verification**: The `/api/auth/me` endpoint restores active sessions upon browser refresh.

---

## Collaboration

Real-time collaboration is powered by Socket.IO with strict room authorization:
* **Room Access Control**: Sockets must pass authentication. To join `project:${projectId}` or `file:${fileId}`, the server checks MongoDB to verify that the user is an active member or owner of the project.
* **Presence**: When users enter or leave a workspace, `user-joined` and `user-left` events update the avatar bar in real time.
* **Remote Cursors & Selection**: Cursors broadcast line/column coordinates and user labels. Each user is assigned a distinct cursor color.
* **Typing Indicators**: Informs teammates when another collaborator is typing in the active file.
* **Debounced Persistence**: Keystroke edits are cached in memory and saved to MongoDB after 2 seconds of inactivity or upon disconnect, reducing database writes by over 90%.

---

## Monaco Editor

The workspace integrates the Monaco Editor (`@monaco-editor/react`):
* **Multi-Tab Editing**: Open multiple files simultaneously and switch between active tabs.
* **Syntax Highlighting**: Supports JavaScript, JSX, TypeScript, TSX, Python, HTML, CSS, JSON, Markdown, and more.
* **Keyboard Shortcuts**: `Ctrl+S` (or `Cmd+S`) triggers explicit file saving.
* **Unsaved Changes**: Tracks dirty state per tab with visual indicators.
* **Role Enforcement**: If a user has the `Viewer` role, the editor is locked to `readOnly: true`.

---

## File Management

File operations are managed through the flat `FileNode` model in MongoDB and mirrored to the project workspace directory:
* **Creation**: Create new files or nested folders.
* **Renaming**: Rename files or folders with instant tree updates.
* **Deletion**: Deleting a folder recursively deletes all descendant files and directories.
* **Path Traversal Protection**: All paths are resolved using canonical path validation (`safeJoin`), strictly blocking `../`, `..\`, absolute paths, and Windows drive traversal.

---

## Terminal

The integrated terminal provides visibility into development operations:
* **Command Output Streaming**: Displays stdout and stderr in real time as dependencies install or dev servers run.
* **Command Execution**: Execute npm scripts and terminal commands within the project workspace.
* **Exit Codes**: Accurately reports process exit codes (0 for success, non-zero for failures) with full error logs to diagnose issues.

---

## Runtime Execution

The system supports multiple language sandboxes and long-running dev servers:
* **Docker Sandboxing (VPS)**: Runs untrusted code in ephemeral containers with `--network none` (or controlled proxy), 512MB RAM cap, and 1.0 CPU limit.
* **Native Process Runner (Render / PaaS)**: Runs commands via controlled child processes with sanitized environments (sensitive server secrets like `MONGO_URI` and `JWT_SECRET` are stripped from the child environment).
* **Supported Languages**: Node.js/JavaScript, TypeScript, Python, C, C++, and Java.

---

## React/Vite Execution

React projects work end-to-end:
1. **Scaffold / Load**: Project contains `package.json`, `index.html`, `vite.config.js`, `src/App.jsx`, `src/main.jsx`, and `src/index.css`.
2. **Install**: Executes `npm install`. Reuses cached `node_modules` if `package.json` and `package-lock.json` are unchanged.
3. **Build**: Executes `npm run build` as an independent operation, capturing duration, exit code, stdout, and stderr.
4. **Dev Server**: Runs `npm run dev -- --host 127.0.0.1 --port 5173`.
5. **Readiness Check**: The runtime monitors server stdout for `"Vite ready"` and verifies TCP connectivity before marking status as `Running`.
6. **Stop & Restart**: Cleanly terminates child processes and releases ports without leaving orphaned processes.

---

## Live Preview

Live application previews run securely inside an embedded iframe:
* **Preview URL Format**: `/preview/:projectId/` (with trailing slash) proxied through the Express backend.
* **Port Isolation**: Dev servers bind strictly to `127.0.0.1`. Internal ports (such as `5173`) are **never** directly exposed to external browsers.
* **Preview Security**:
  - Validates `projectId` against regex `^[a-fA-F0-9]{24}$`.
  - Verifies user authentication and project membership before proxying requests.
  - Proxies only to registered internal runtime ports, preventing Server-Side Request Forgery (SSRF).
* **Asset & WebSocket Proxying**: Proxies HTML, JavaScript modules, CSS, images, fonts, `/@vite/client`, and WebSocket upgrades for Hot Module Replacement.

---

## Snapshots

* **Create Snapshot**: Captures an immutable snapshot of all project files with a title, description, and author metadata.
* **Restore Snapshot**: Restores historical project files, updating the database and broadcasting a `force-file-sync` event via Socket.IO so all collaborators' editors refresh simultaneously.

---

## Team Management

Invite and manage team members with role-based access control:
* **Roles**:
  - `Owner`: Full project control (rename, delete, change member roles).
  - `Admin`: Project administration, file management, dependency installation, build/run.
  - `Editor`: Edit files, save, build, and run applications.
  - `Viewer`: Read-only access. Write operations are blocked with `403 Forbidden`.
* **Invitations**: Send invitations by email with secure cryptographic tokens and automatic TTL expiration.

---

## Chat

* **Project-Scoped Chat**: Built-in chat panel within the workspace.
* **Real-Time Distribution**: Messages are broadcast to active project members via Socket.IO.
* **Message History**: Messages are saved to MongoDB and loaded when opening a workspace.
* **Security**: Only authenticated members of the project can read or post messages.

---

## Security

* **Authentication**: Password hashing with `bcryptjs` (10 rounds); secure HTTP-only cookies for JWT tokens.
* **Authorization**: Strict server-side RBAC on every protected REST endpoint and Socket.IO room.
* **Rate Limiting**: Protects authentication endpoints (`authLimiter`) and code execution endpoints (`runLimiter`).
* **Path Traversal Defense**: All file paths validated using `safeJoin` to prevent directory traversal.
* **SSRF Prevention**: The preview proxy only targets verified internal ports on `127.0.0.1`.
* **HTTP Headers**: Hardened with Helmet (`X-Frame-Options: SAMEORIGIN`, `nosniff`, HSTS).
* **Sanitized Logging**: Sensitive information (passwords, JWTs, API keys, database credentials) is never logged.

---

## Installation

### Prerequisites
* **Node.js**: v18.x or v20.x
* **npm**: v9.x or later
* **MongoDB**: Local instance running on port 27017 or a MongoDB Atlas connection URI
* **Docker** (Optional, for container sandboxes): Docker Engine 24+

### Clone Repository
```bash
git clone https://github.com/MohammedAseelM/Collaborative-cloud-ide.git
cd Collaborative-cloud-ide
```

---

## Environment Variables

### Backend (`backend/.env`)
```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/collaborative-cloud-ide
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
CLIENT_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)
```ini
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## Local Development

### 1. Start MongoDB
Ensure MongoDB is running locally:
```bash
# Verify MongoDB is running
mongosh --eval "db.adminCommand('ping')"
```

### 2. Start Backend Server
```bash
cd backend
npm install
npm run dev
```
Backend will start on `http://localhost:5000`. Verify health at `http://localhost:5000/api/health`.

### 3. Start Frontend Dev Server
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Frontend will be available at `http://localhost:5173`.

---

## Docker

### Running Full Stack with Docker Compose
To launch the complete application stack (MongoDB, Backend, and Frontend) in Docker:
```bash
docker compose up -d --build
```

Verify services:
```bash
docker compose ps
curl http://127.0.0.1:8080/api/health
```

Stop stack:
```bash
docker compose down
```

---

## Testing

The project uses Node.js's native test runner (`node --test`), providing fast, process-isolated testing without external dependencies.

### Run All Backend Tests
```bash
cd backend
node tests/run_all.js
```

### Run Specific Test Suites
```bash
cd backend
node --test tests/auth.test.js
node --test tests/project.test.js
node --test tests/file.test.js
node --test tests/member.test.js
node --test tests/run.test.js
node --test tests/socket.test.js
```

### Verify Frontend Production Build
```bash
cd frontend
npm run build
```

---

## Deployment

### Render
Deploy the backend as a Render **Web Service**:
1. Connect your repository to Render.
2. Set **Root Directory** to `backend`.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Configure Environment Variables:
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
   - `MONGO_URI`: Your MongoDB Atlas URI
   - `JWT_SECRET`: Random 32+ character hex string
   - `CLIENT_URL`: Your Vercel frontend URL (e.g. `https://collaborative-cloud-ide.vercel.app`)
6. Set Health Check Path to `/api/health`.

### Vercel
Deploy the frontend to Vercel:
1. Import repository and set **Root Directory** to `frontend`.
2. Framework Preset: **Vite**.
3. Configure Environment Variables:
   - `VITE_API_URL`: `https://collaborative-cloud-ide-backend.onrender.com/api`
   - `VITE_SOCKET_URL`: `https://collaborative-cloud-ide-backend.onrender.com`
4. Deploy.

> **CRITICAL**: Do NOT append `:5173` to the backend URL on Vercel.

### MongoDB Atlas
1. Create a cluster on MongoDB Atlas.
2. Under **Network Access**, add `0.0.0.0/0` (for dynamic cloud IPs).
3. Under **Database Access**, create a user with read/write privileges.
4. Copy the connection string into the `MONGO_URI` environment variable.

---

## Known Limitations

1. **Docker Daemon on Render**: Render Web Services run inside unprivileged containers without access to `/var/run/docker.sock`. On Render, the platform automatically uses its controlled child-process runner fallback. Multi-tenant Docker container sandboxes require deployment on a dedicated VPS.
2. **Vite Hot Module Replacement via Proxy**: In high-latency cloud environments, WebSocket HMR through multi-hop reverse proxies may fall back to page refresh. Manual refresh in the preview iframe is always supported.
3. **Multi-Instance Port Scaling**: Long-running dev servers allocate dynamic internal ports on the host. In a multi-instance autoscaled backend cluster, sticky sessions or a shared execution plane are recommended.

---

## Troubleshooting

### 1. Backend Not Connecting
* Ensure backend is running and listening on `PORT=5000`.
* Check `curl http://localhost:5000/api/health`.
* Verify `CLIENT_URL` matches the exact frontend origin in CORS configuration.

### 2. MongoDB Connection Failure
* Verify local MongoDB service is running: `mongosh --eval "db.adminCommand('ping')"`.
* For Atlas, confirm IP whitelist includes your current IP or `0.0.0.0/0`.
* Ensure MongoDB password in `MONGO_URI` is URL-encoded if it contains special characters (`@`, `:`, `#`).

### 3. Render Cold Start
* Free-tier Render instances spin down after inactivity. Initial requests may take 30-60 seconds to respond.
* Health check requests or uptime monitors can keep the instance active.

### 4. Vercel API Error
* Verify `VITE_API_URL` points to `https://your-backend.onrender.com/api` (with `/api` prefix).
* Ensure there is no trailing slash on `VITE_API_URL` and no `:5173` appended.
* Rebuild the frontend on Vercel after updating environment variables.

### 5. Socket.IO Connection Error
* Ensure `VITE_SOCKET_URL` matches the backend host without `/api` (e.g. `https://your-backend.onrender.com`).
* Verify WebSocket transport is supported by any intermediate proxies or corporate firewalls.

### 6. npm install Failure
* Ensure project workspace contains a valid `package.json`.
* Inspect terminal output for incompatible package versions.
* Check network connectivity and npm registry access.

### 7. Exit Code 127
* **Root Cause**: Command or binary not found in system `PATH` (e.g., `vite: not found` or `npm: not found`).
* **Fix**: Ensure dependencies were installed via `npm install` before running dev server. The project runner prioritizes `node_modules/.bin` in the execution environment.

### 8. Vite Startup Failure
* Ensure `vite.config.js` exists and specifies `--host 127.0.0.1`.
* Verify entry point (`index.html` and `src/main.jsx`) exists and has no fatal syntax errors.
* Review terminal logs for detailed stack traces.

### 9. Build Failure
* Run `npm run build` locally in the project directory to view compilation errors.
* The backend build runner captures and displays the exact stderr and exit code in the terminal panel.

### 10. Preview Refused to Connect
* Check that the project dev server status is `Running`.
* Verify that the preview URL is `/preview/:projectId/` (routed through the backend reverse proxy).
* Never navigate to `backend.onrender.com:5173` directly.

### 11. Port Conflict
* The runtime manager automatically checks port availability and terminates zombie processes before starting new servers.
* If a port is blocked locally, stop the process or restart the backend server.

### 12. Docker Unavailable
* If running on a platform without Docker (like Render), the system automatically falls back to native process execution.
* If running locally, ensure Docker Desktop is started.

### 13. Permission Errors
* Verify your user role in the project (`Owner`, `Admin`, `Editor`, `Viewer`).
* Viewers cannot perform write operations (file edits, builds, runs).
* Only Owners can rename or delete projects and modify member roles.

---

## Roadmap

* [ ] Integrated interactive xterm.js terminal with full PTY support.
* [ ] Git integration (clone, branch, commit, push directly to GitHub).
* [ ] AI coding assistant with inline completions and code explanations.
* [ ] WebRTC voice and video channels within workspaces.
* [ ] Custom Docker image runtime definitions per project.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Commit your changes: `git commit -m "feat: add my feature"`.
4. Run tests: `cd backend && node tests/run_all.js`.
5. Push to the branch: `git push origin feature/my-feature`.
6. Open a Pull Request.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.
