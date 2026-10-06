# Collaborative Cloud IDE - REST & Preview API Documentation

All API endpoints are prefixed with `/api` unless otherwise specified (e.g. the `/preview/:projectId/` proxy route). Authenticated endpoints require either a valid JWT cookie (`token=...`) or a Bearer token in the `Authorization` header (`Authorization: Bearer <TOKEN>`).

---

## 1. Authentication Endpoints (`/api/auth`)

Rate limited via `authLimiter` (10 requests per 15 minutes per IP on registration/login).

### Register User
* **Endpoint**: `POST /auth/register`
* **Request Body**:
  ```json
  {
    "name": "Jane Developer",
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "user": {
      "_id": "60d0fe4f5311236168a109ca",
      "name": "Jane Developer",
      "email": "jane@example.com",
      "role": "user"
    },
    "token": "<JWT_TOKEN>"
  }
  ```

### Login User
* **Endpoint**: `POST /auth/login`
* **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully",
    "user": {
      "_id": "60d0fe4f5311236168a109ca",
      "name": "Jane Developer",
      "email": "jane@example.com",
      "role": "user"
    },
    "token": "<JWT_TOKEN>"
  }
  ```

### Logout User
* **Endpoint**: `POST /auth/logout`
* **Success Response (200 OK)**: Clears authentication cookie.

### Get Current User Profile
* **Endpoint**: `GET /auth/me`
* **Auth Required**: Yes

---

## 2. Project Management Endpoints (`/api/projects`)

### List User Projects
* **Endpoint**: `GET /projects`
* **Query Params**: `search`, `archived`, `favorite`, `page`, `limit`

### Create Project
* **Endpoint**: `POST /projects`
* **Request Body**:
  ```json
  {
    "name": "My Fullstack App",
    "description": "Collaborative cloud IDE test project",
    "language": "javascript"
  }
  ```

### Get Project Details
* **Endpoint**: `GET /projects/:id`

### Update Project
* **Endpoint**: `PATCH /projects/:id`
* **Request Body**: `{ "name": "Renamed App", "description": "Updated" }`

### Delete Project
* **Endpoint**: `DELETE /projects/:id`
* **Auth Requirement**: Owner only. Cascading deletes project files, versions, and activities.

### Toggle Archive / Favorite
* **Endpoint**: `PATCH /projects/:id/archive`
* **Endpoint**: `PATCH /projects/:id/favorite`

---

## 3. Team & Collaborator Endpoints (`/api/projects/:id/members`)

### List Project Members
* **Endpoint**: `GET /projects/:id/members`

### Add Member (Direct)
* **Endpoint**: `POST /projects/:id/members`
* **Request Body**: `{ "email": "collab@example.com", "role": "Editor" }`

### Update Member Role
* **Endpoint**: `PATCH /projects/:id/member/:userId/role`
* **Request Body**: `{ "role": "Admin" | "Editor" | "Viewer" }`
* **Auth Requirement**: Owner only.

### Remove Member
* **Endpoint**: `DELETE /projects/:id/members/:memberId`

---

## 4. File Management Endpoints (`/api/files`)

All operations validate and sanitize paths using `safeJoin` to prevent directory traversal (`../` or absolute paths).

### Get Project Files
* **Endpoint**: `GET /files/project/:projectId`
* **Returns**: Flat list of file and folder nodes forming the project tree.

### Create File or Folder
* **Endpoint**: `POST /files`
* **Request Body**:
  ```json
  {
    "projectId": "60d0fe4f5311236168a109cb",
    "name": "index.js",
    "isFolder": false,
    "parentId": null,
    "content": "console.log('Hello');"
  }
  ```

### Read File Content
* **Endpoint**: `GET /files/:fileId`

### Rename File or Folder
* **Endpoint**: `PATCH /files/:fileId`
* **Request Body**: `{ "name": "App.jsx" }`

### Delete File or Folder
* **Endpoint**: `DELETE /files/:fileId`
* **Behavior**: Recursively deletes all child nodes if deleting a directory.

---

## 5. Project Runner & Dev Server Endpoints (`/api/projects/:id/runner`)

Controls the development server lifecycle (e.g. Vite dev server).

### Install Dependencies
* **Endpoint**: `POST /projects/:id/runner/install`
* **Response**:
  ```json
  {
    "success": true,
    "message": "Dependencies installed successfully",
    "cached": false,
    "output": "added 120 packages in 2s"
  }
  ```

### Start Dev Server
* **Endpoint**: `POST /projects/:id/runner/start`
* **Behavior**: Spawns dev process (e.g., `npm run dev -- --host 127.0.0.1 --port 5173`), monitors stdout for readiness, allocates port, and reports state.
* **Response**:
  ```json
  {
    "success": true,
    "status": "running",
    "port": 5173,
    "previewUrl": "/preview/60d0fe4f5311236168a109cb/"
  }
  ```

### Stop Dev Server
* **Endpoint**: `POST /projects/:id/runner/stop`
* **Behavior**: Terminates running process / container, releases ports, and cleans up resources.

### Get Server Status & Logs
* **Endpoint**: `GET /projects/:id/runner/status`
* **Endpoint**: `GET /projects/:id/runner/logs`

### Execute Terminal Command
* **Endpoint**: `POST /projects/:id/terminal/execute`
* **Request Body**: `{ "command": "npm test" }`

---

## 6. React/Vite Project Commands (`/api/projects/:projectId/...`)

Specialized lifecycle and package management endpoints:

* `POST /projects/react/create` - Scaffolds clean React/Vite project structure.
* `POST /projects/:projectId/install` - Dependency installation with package lock caching.
* `POST /projects/:projectId/run` - Runs dev server.
* `POST /projects/:projectId/stop` - Stops dev server.
* `POST /projects/:projectId/restart` - Cleanly restarts dev server.
* `POST /projects/:projectId/build` - Runs `npm run build` and captures exit code, duration, stdout, and stderr.
* `POST /projects/:projectId/preview` - Starts preview server for production builds.
* `POST /projects/:projectId/packages/install` - Installs specific npm package (`{ "packageName": "axios" }`).
* `POST /projects/:projectId/packages/uninstall` - Uninstalls npm package.
* `GET /projects/:projectId/scripts` - Returns available scripts from `package.json`.
* `POST /projects/:projectId/scripts/run` - Executes named npm script.

---

## 7. Application Live Preview Proxy (`/preview/:projectId/`)

* **Endpoint**: `/preview/:projectId/*`
* **Security & Auth**:
  - Validates `projectId` against regex `^[a-fA-F0-9]{24}$`.
  - Verifies authenticated user is Owner, Admin, Editor, or Viewer of the project.
  - Proxies only to registered internal port on `127.0.0.1` (prevents SSRF).
  - Internal port (e.g. 5173) is **never** accessible directly by clients.
* **WebSocket / HMR**: Supports WebSocket upgrades for Vite Hot Module Replacement.

---

## 8. Version Snapshots (`/api/projects/:id/versions`)

* `GET /projects/:id/versions` - List all snapshots with commit messages, dates, and author info.
* `POST /projects/:id/versions` - Create a new snapshot of current project files.
* `POST /projects/:id/versions/:versionId/restore` - Restores snapshot and broadcasts `force-file-sync` to all collaborators.

---

## 9. Project Chat & Activity Timeline

* `GET /projects/:id/messages` - Retrieve chat message history.
* `GET /projects/:id/activities` - Retrieve activity log (files created, members added, snapshots created, runtimes started).

---

## 10. System Health (`/api/health`)

* **Endpoint**: `GET /api/health`
* **Auth Required**: No
* **Response**:
  ```json
  {
    "success": true,
    "status": "healthy",
    "timestamp": "2026-10-06T18:30:00.000Z",
    "database": "connected"
  }
  ```
