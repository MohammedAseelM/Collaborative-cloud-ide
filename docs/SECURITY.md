# Collaborative Cloud IDE - Security Architecture & Audit Report

This document outlines the security controls, access models, defensive safeguards, and vulnerability mitigations implemented across the Collaborative Cloud IDE platform.

---

## 1. Authentication & Session Management

* **Cryptographic Password Hashing**: Passwords are never stored in plaintext. They are salted and hashed using `bcryptjs` with a cost factor of 10 rounds. The password field is configured with `select: false` on the Mongoose `User` schema so queries never leak credential hashes.
* **JWT Token Security**:
  * Issued with cryptographically signed HMAC SHA-256 (`JWT_SECRET`).
  * Tokens are set in HTTP cookies with `httpOnly: true` (mitigates XSS extraction), `secure: true` in production, and `sameSite: "strict"` (mitigates CSRF).
  * Expired or malformed tokens receive immediate `401 Unauthorized` responses.
* **Brute-Force Rate Limiting (`authLimiter`)**: Authentication endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`) are strictly rate-limited to 10 attempts per 15 minutes per IP address to thwart dictionary attacks.

---

## 2. Server-Side Authorization & Role-Based Access Control (RBAC)

> **CORE PRINCIPLE**: The server NEVER trusts client-side authorization claims. Hiding buttons in the React UI is strictly an ergonomic UX enhancement; every protected action is verified independently on the backend.

### Project Role Hierarchy
* **Owner**: Full control. Only user permitted to rename/delete the project, alter member roles, or delete workspaces.
* **Admin**: Project administration, file management, code execution, dependency installation, and sending invitations.
* **Editor**: Code editing, saving, building, and running application servers.
* **Viewer**: Read-only access. Write operations (file creation, modification, deletion, code runs, terminal execution) are rejected with `403 Forbidden`. Monaco Editor is locked in `readOnly` mode.

Every project endpoint executes `verifyProjectPermission(req.user._id, project, minimumRole)` before allowing operations to proceed.

---

## 3. Real-Time Socket.IO Room Authorization

To prevent cross-project eavesdropping and unauthorized code tampering:

* **Authentication Handshake**: Socket connections must present a valid JWT in the cookie header or connection auth payload.
* **Room Join Verification (`project:${projectId}`)**:
  - A user cannot join a project room simply by sending a `projectId`.
  - The socket server validates against MongoDB that `socket.user._id` is an active member or owner of the project before permitting `socket.join(room)`.
* **File Join Verification (`file:${fileId}`)**:
  - When a client requests `join-file`, the server fetches the file record, looks up its owning `project`, and verifies user membership before admitting the socket to the document editing room.
* **Event Scoping**: Typing indicators, cursors, chat messages, and file synchronizations are strictly scoped to verified rooms.

---

## 4. Live Preview Proxy Security & Anti-SSRF Safeguards

Application previews are routed through `/preview/:projectId/` using an Express reverse proxy.

* **Identity & Membership Verification**:
  - The preview proxy intercepts all requests and validates the user's JWT from cookies or headers.
  - Verifies that the user has at least `Viewer` permissions on the requested project before proxying any byte of response.
* **Parameter Validation**:
  - `projectId` is strictly validated against `^[a-fA-F0-9]{24}$` to prevent injection or route desynchronization.
* **SSRF Prevention**:
  - The proxy destination is **never** determined by user input.
  - The backend resolves the port strictly from its internal, in-memory runtime registry (`projectRunner.service.js`).
  - Target URLs are hardcoded to `http://127.0.0.1:${targetPort}/`.
* **Port Isolation**:
  - Dev servers (e.g., Vite on port 5173) bind strictly to `127.0.0.1` and are never bound to external interfaces (`0.0.0.0`) in production.

---

## 5. File System & Path Traversal Mitigations

* **Safe Path Resolution (`safeJoin`)**:
  - All workspace file operations resolve file paths using strict canonical validation:
  ```javascript
  const safePath = path.resolve(workspaceRoot, relativePath);
  if (!safePath.startsWith(workspaceRoot)) {
    throw new Error("Access denied: Path traversal detected.");
  }
  ```
  - Rejects `../`, `..\`, absolute paths (`/etc/passwd`, `C:\Windows`), Windows drive prefixes, and null bytes.
* **File Node Flat Structure**: Files are represented in MongoDB as isolated `FileNode` documents with explicit `project` and `parentId` foreign keys, preventing filesystem leaks across projects.

---

## 6. Code Execution Sandboxing & Resource Constraints

* **Docker Sandbox Isolation (VPS Mode)**:
  - Untrusted code runs in ephemeral Alpine/Node containers with `--network none` (or controlled proxy access).
  - Explicit resource constraints: Memory capped at 512MB, CPU capped at 1.0 core, process count limited to prevent fork bombs.
  - Containers are run as non-root users (`USER node`). Privileged containers (`--privileged`) are strictly prohibited.
* **Native Process Fallback (Render/PaaS Mode)**:
  - Spawns child processes using sanitized environment variables (`getProjectExecutionEnv()`).
  - High-privilege host credentials and system secrets (`MONGO_URI`, `JWT_SECRET`) are deleted from the child execution environment.
  - Processes are terminated with timeout limits to prevent runaway infinite loops.

---

## 7. HTTP Hardening & Observability

* **Helmet**: Configures HTTP response headers including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict HSTS policies.
* **CORS**: Enforces origin restrictions based on configured `CLIENT_URL`.
* **Sanitized Structured Logging**: Winston logs capture runtime IDs, exit codes, and timestamps, but strictly redact passwords, tokens, API keys, and connection strings.
