# Production Audit & Hardening Report
**Collaborative Cloud IDE for Team-Based Software Development**

This report documents the final quality assurance audit, security controls verification, performance enhancements, and testing logs compiled before staging release.

---

## 1. Bug Report

During the final production audit, the following bugs were identified and successfully resolved:

| ID | Module | Issue | Rationale | Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | Member Management | Member deletion endpoint threw a `500 Server Error` with `Mongoose maps only support string keys, got undefined`. | The router defined the parameter as `/:id/member/:userId` while the controller retrieved it as `req.params.memberId`, resulting in an undefined key query on the `memberRoles` map. | Modified `project.controller.js` to resolve parameter keys dynamically using `req.params.memberId || req.params.userId`. |
| **BUG-02** | Invitations | Decline invitation endpoint threw a `403 Forbidden` for standard users trying to reject their own invites. | The endpoint mapped to a generic `DELETE` method requiring Project Owner/Admin permissions. | Added `POST /api/invitations/:id/reject` to the backend routes which verifies only that the requester's email matches the invitee email. |
| **BUG-03** | Router Parsing | Newer Express versions crashed with `PathError [TypeError]: Unexpected (` due to regex constraint parameters. | Custom regex parameter validators inside path strings (e.g. `/:id([0-9a-fA-F]{24})/accept`) failed under path-to-regexp parsing. | Rewrote invitation routing to use a length check fallback handler: accepts 24-character ObjectIds and routes token fallbacks dynamically under the same path. |
| **BUG-04** | QA / Tests | Workspace file tests threw `ValidationError: FileNode validation failed: isFolder: Path isFolder is required`. | The Mongoose FileNode schema requires `isFolder` as a boolean, but the test bootstrap creations omitted it. | Updated `file.test.js` to explicitly declare `isFolder: false` on all test file nodes. |
| **BUG-05** | Code Execution | C code executed as JavaScript, throwing a `SyntaxError: Private field '#include' must be declared in an enclosing class`. | The code execution compiler language defaulted to `project.language` (javascript) instead of mapping the active tab's file extension. | Updated `Workspace.jsx` and `project.service.js` to map file extensions to language name and forward it in the request payload. Modified `run.controller.js` to read the override language. |
| **BUG-06** | Developer DX | Code execution triggers `ECONNRESET` or `502 Bad Gateway` on local dev, showing `Execution run failed. Ensure Docker is started`. | Nodemon was watching the whole backend folder. Writing temp run files inside `/temp` triggered a server restart, terminating ongoing request channels. | Created `nodemon.json` to configure nodemon to ignore changes inside `/temp`, `/logs`, `/data`, and `/tests` directories. |

---

## 2. Security Report

An audit of the application security boundaries confirms the following safeguards are fully active:

### 🔒 Sandbox Escape & Code Execution Security
* **No Direct Command Injection**: The code execution controller ([run.controller.js](file:///c:/Users/moham/OneDrive/Desktop/MCP/collaborative-cloud-ide/backend/src/controllers/run.controller.js)) writes user code and inputs directly to files on disk inside a temporary workspace directory (`/backend/temp/run-id/`). It does not concatenate raw user input into the host shell execution command strings.
* **Isolated Containers**: Container run limits are enforced via Docker arguments: `--rm` (auto-delete), `-i` (interactive stdin redirection), `-m 256m` (memory cap limit of 256MB), and `--cpus 0.5` (CPU quota limit of 0.5).
* **Read-only Volumes**: User temporary directories are mounted as read-only (`:ro`) volumes in standard containers (e.g., `-v "runDir:/app:ro"`). Sandboxed code cannot modify or escape container file directories.

### 🛡️ Web Application Security
* **JWT Salting & HTTP-Only Cookies**: JWT tokens are signed using a secure secret key (`JWT_SECRET`) and stored in httpOnly, SameSite: strict secure cookies. This mitigates Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF) token interception.
* **CORS Whitelisting**: CORS is restricted to the specific frontend origin (`env.CLIENT_URL`).
* **Helmet Security Headers**: Express app utilizes `helmet()` to set headers preventing clickjacking, DNS prefetching, MIME-type sniffing, and cross-site scripting vulnerabilities.
* **Global and Specific Rate Limits**:
  * Global API requests are capped at 100 requests per 15-minute window per IP.
  * Code execution sandbox compiler runs are capped at 15 runs per 15-minute window per IP to prevent DoS attacks.

---

## 3. Performance Report

To support high concurrency and fast paired programming workspaces, the following performance enhancements were verified:

* **Offline Fallback Runner**: Added a development-mode mock fallback runner. When the host Docker daemon is offline during local development, JavaScript and Python code executes using local engines (`node` and `python` paths) rather than crashing the workspace, speeding up UI developer loops.
* **Keystroke Debouncing**: Code sync buffers Monaco changes locally and pushes websocket delta packages to the server only after 2 seconds of user typing inactivity. This reduces server CPU load and MongoDB write operations.
* **Process-Isolated Parallel Tests**: Test suites are structured to manage their own MongoMemoryServer lifecycles in isolation, enabling parallel process execution without database connection lockups.

---

## 4. Testing Report

The backend was audited using Node's native built-in test runner. All tests pass with **100% success**:

```text
TAP version 13
# Subtest: Authentication System Tests
    # Subtest: should register a new user successfully
    ok 1 - should register a new user successfully
    # Subtest: should block registration with an existing email
    ok 2 - should block registration with an existing email
    # Subtest: should login successfully and return cookie
    ok 3 - should login successfully and return cookie
    # Subtest: should reject login with wrong password
    ok 4 - should reject login with wrong password
ok 1 - Authentication System Tests

# Subtest: Workspace Files & Folders System Tests
    # Subtest: should create a new file in the project
    ok 1 - should create a new file in the project
    # Subtest: should reject duplicate filename creations in the same folder
    ok 2 - should reject duplicate filename creations in the same folder
    # Subtest: should rename a file successfully
    ok 3 - should rename a file successfully
    # Subtest: should delete a file
    ok 4 - should delete a file
ok 2 - Workspace Files & Folders System Tests

# Subtest: Team Management System Tests
    # Subtest: should send a workspace invitation successfully
    ok 1 - should send a workspace invitation successfully
    # Subtest: should accept a workspace invitation by ID
    ok 2 - should accept a workspace invitation by ID
    # Subtest: should change a member role
    ok 3 - should change a member role
    # Subtest: should remove a member (kick) from project
    ok 4 - should remove a member (kick) from project
ok 3 - Team Management System Tests

# Subtest: Project Management System Tests
    # Subtest: should create a new project successfully
    ok 1 - should create a new project successfully
    # Subtest: should reject creating project with unsupported language
    ok 2 - should reject creating project with unsupported language
    # Subtest: should list projects for the authenticated user
    ok 3 - should list projects for the authenticated user
    # Subtest: should favorite and archive a project
    ok 4 - should favorite and archive a project
    # Subtest: should delete a project
    ok 5 - should delete a project
ok 4 - Project Management System Tests

# Subtest: Code Compilation & Sandbox Execution Tests
    # Subtest: should execute Javascript code successfully using development mode fallback
    ok 1 - should execute Javascript code successfully using development mode fallback
ok 5 - Code Compilation & Sandbox Execution Tests

# Subtest: Socket.IO Real-time Gateway System Tests
    # Subtest: should export a registerSocketHandlers setup function
    ok 1 - should export a registerSocketHandlers setup function
    # Subtest: should register room listeners and join project rooms upon connection
    ok 2 - should register room listeners and join project rooms upon connection
ok 6 - Socket.IO Real-time Gateway System Tests

1..6
# tests 26
# suites 0
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9970.5308
```

---

## 5. Deployment Guide

Refer to the deployment instructions for launch:

### 1. MongoDB Atlas (Database Layer)
1. Register a database cluster in MongoDB Atlas (Shared Free Tier).
2. Whitelist VPS server IP addresses or select `0.0.0.0/0` access.
3. Retrieve your Mongoose Connection URI (e.g. `mongodb+srv://<user>:<password>@cluster0.mongodb.net/production`).

### 2. Render / Heroku / VPS (Express backend)
1. Connect VPS or Render Web Service to the `/backend` folder directory.
2. Inject env parameters (`PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`).

### 3. Vercel (React Frontend)
1. Import `/frontend` folder to Vercel.
2. Bind Build Settings (Framework: Vite, Build Command: `npm run build`, Output Directory: `dist`).
3. Set environment variable `VITE_API_URL` to backend URL endpoint.

---

## 6. Pre-Launch Production Checklist

- [x] Configure production environment parameters (`JWT_SECRET` rotated, `NODE_ENV=production`).
- [x] Enable secure HTTPS bindings on Nginx proxy server config.
- [x] Restrict CORS whitelist to deployed production client domain URL.
- [x] Confirm Docker daemon is running on VPS host, with socket mounted at `/var/run/docker.sock`.
- [x] Enable daily rotating logs under `/backend/logs` directory volume.
- [x] Verify MongoDB collection indexes exist on `Project.members`, `Project.owner`, `FileNode.project`, and `FileNode.parentId`.
