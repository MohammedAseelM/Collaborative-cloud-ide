# Collaborative Cloud IDE - REST API Documentation

All API requests must be prefixed with `/api`. Authenticated endpoints require the session JWT to be present in the HTTP cookies (`token=...`).

---

## 1. Authentication Endpoints (`/api/auth`)

### Register User
* **Endpoint**: `/auth/register`
* **Method**: `POST`
* **Auth Required**: No
* **Request Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123"
  }
  ```
* **Success Response (201 Created)**:
  * **Headers**: `Set-Cookie: token=<JWT_TOKEN>; HttpOnly; Secure; SameSite=Strict`
  * **Body**:
    ```json
    {
      "success": true,
      "message": "User registered successfully",
      "user": {
        "_id": "6a4fe1776c86d06c418ed783",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user",
        "createdAt": "2026-07-09T18:00:00.000Z",
        "updatedAt": "2026-07-09T18:00:00.000Z"
      }
    }
    ```
* **Error Responses**:
  * `400 Bad Request`: Validation failure (e.g., password too short).
  * `409 Conflict`: Email already exists.

---

### Login User
* **Endpoint**: `/auth/login`
* **Method**: `POST`
* **Auth Required**: No
* **Request Body**:
  ```json
  {
    "email": "john@example.com",
    "password": "securepassword123"
  }
  ```
* **Success Response (200 OK)**:
  * **Headers**: `Set-Cookie: token=<JWT_TOKEN>; HttpOnly; Secure; SameSite=Strict`
  * **Body**:
    ```json
    {
      "success": true,
      "message": "Logged in successfully",
      "user": {
        "_id": "6a4fe1776c86d06c418ed783",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "user"
      }
    }
    ```
* **Error Responses**:
  * `401 Unauthorized`: Invalid email or password.

---

### Logout User
* **Endpoint**: `/auth/logout`
* **Method**: `POST`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  * **Headers**: `Set-Cookie: token=; Max-Age=0; Expires=...`
  * **Body**:
    ```json
    {
      "success": true,
      "message": "Logged out successfully"
    }
    ```

---

### Get Current Session (Auth Me)
* **Endpoint**: `/auth/me`
* **Method**: `GET`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "_id": "6a4fe1776c86d06c418ed783",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user"
    }
  }
  ```
* **Error Responses**:
  * `401 Unauthorized`: Not logged in or expired token.

---

## 2. Project Endpoints (`/api/projects`)

### Create Project
* **Endpoint**: `/projects`
* **Method**: `POST`
* **Auth Required**: Yes
* **Request Body**:
  ```json
  {
    "name": "My Workspace Project",
    "description": "Collaborative project files",
    "language": "javascript"
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Project created successfully",
    "project": {
      "_id": "6a4fe1786c86d06c418ed786",
      "name": "My Workspace Project",
      "description": "Collaborative project files",
      "language": "javascript",
      "owner": "6a4fe1776c86d06c418ed783",
      "members": ["6a4fe1776c86d06c418ed783"],
      "memberRoles": {
        "6a4fe1776c86d06c418ed783": "Owner"
      },
      "createdAt": "2026-07-09T18:01:00.000Z"
    }
  }
  ```

---

### List Projects
* **Endpoint**: `/projects`
* **Method**: `GET`
* **Auth Required**: Yes
* **Query Parameters**:
  * `search` (string, optional): Filter projects by name.
  * `filter` (string, optional): `favorites` or `archived`.
  * `sortBy` (string, optional): Sort by `name`, `createdAt`, or `updatedAt` (defaults to `-updatedAt`).
  * `page` (number, optional): Defaults to `1`.
  * `limit` (number, optional): Defaults to `10`.
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 1,
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "pages": 1
    },
    "projects": [
      {
        "_id": "6a4fe1786c86d06c418ed786",
        "name": "My Workspace Project",
        "description": "Collaborative project files",
        "language": "javascript",
        "owner": "6a4fe1776c86d06c418ed783",
        "isArchived": false,
        "favorites": []
      }
    ]
  }
  ```

---

### Get Project Details
* **Endpoint**: `/projects/:id`
* **Method**: `GET`
* **Auth Required**: Yes (Must be a workspace member)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "project": {
      "_id": "6a4fe1786c86d06c418ed786",
      "name": "My Workspace Project",
      "members": [
        {
          "_id": "6a4fe1776c86d06c418ed783",
          "name": "John Doe",
          "email": "john@example.com"
        }
      ],
      "memberRoles": {
        "6a4fe1776c86d06c418ed783": "Owner"
      }
    }
  }
  ```

---

### Rename Project
* **Endpoint**: `/projects/:id`
* **Method**: `PATCH`
* **Auth Required**: Yes (Must be Owner or Admin)
* **Request Body**:
  ```json
  {
    "name": "New Workspace Name"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "project": {
      "_id": "6a4fe1786c86d06c418ed786",
      "name": "New Workspace Name"
    }
  }
  ```

---

### Toggle Favorite / Archive Status
* **Endpoints**: 
  * `/projects/:id/favorite` (`PATCH`)
  * `/projects/:id/archive` (`PATCH`)
* **Method**: `PATCH`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Project favorite state toggled",
    "project": {
      "_id": "6a4fe1786c86d06c418ed786",
      "favorites": ["6a4fe1776c86d06c418ed783"],
      "isArchived": false
    }
  }
  ```

---

### Invite User
* **Endpoint**: `/projects/:id/invitations`
* **Method**: `POST`
* **Auth Required**: Yes (Owner or Admin only)
* **Request Body**:
  ```json
  {
    "email": "invitee@example.com",
    "role": "Editor"
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Invitation sent successfully",
    "invitation": {
      "_id": "6a4fe1786c86d06c418ed78e",
      "email": "invitee@example.com",
      "role": "Editor",
      "expiresAt": "2026-07-16T18:01:00.000Z"
    }
  }
  ```

---

### Execute Code Securely
* **Endpoint**: `/projects/:id/execute`
* **Method**: `POST`
* **Auth Required**: Yes (Must be Owner, Admin, or Editor)
* **Request Body**:
  ```json
  {
    "fileId": "6a4fe1786c86d06c418ed78b"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "output": "Hello, World!\r\n",
    "exitCode": 0
  }
  ```
* **Error Responses**:
  * `403 Forbidden`: User has `Viewer` role (read-only).
  * `500 Internal Server Error`: Execution timeout or sandbox allocation failure.

---

### Snapshot Versioning (Snapshots Timeline)
* **Save Snapshot**: `POST /projects/:id/versions` (Request body: `{ "note": "Snapshot label" }`)
* **List Snapshots**: `GET /projects/:id/versions`
* **Restore Snapshot**: `POST /projects/:id/versions/:versionId/restore`

---

## 3. File Endpoints (`/api/files`)

### List Project Files
* **Endpoint**: `/files/projects/:projectId/files`
* **Method**: `GET`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 2,
    "files": [
      {
        "_id": "6a4fe1786c86d06c418ed78b",
        "name": "index.js",
        "isFolder": false,
        "parentId": null
      }
    ]
  }
  ```

---

### Create File or Folder Node
* **Endpoint**: `/files/projects/:projectId/files`
* **Method**: `POST`
* **Auth Required**: Yes (Must have Editor/Admin/Owner permissions)
* **Request Body**:
  ```json
  {
    "name": "helper.js",
    "isFolder": false,
    "parentId": null
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "File created successfully",
    "file": {
      "_id": "6a4fe1786c86d06c418ed78c",
      "name": "helper.js",
      "isFolder": false,
      "content": "// Write your code here...\n"
    }
  }
  ```

---

### File Content Retrieval
* **Endpoint**: `/files/:fileId`
* **Method**: `GET`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "content": "console.log('Hello World');"
  }
  ```

---

### Rename & Delete File Nodes
* **Rename File**: `PATCH /files/:fileId` (Request body: `{ "name": "new_name.js" }`)
* **Delete File (Recursive)**: `DELETE /files/:fileId`

---

## 4. Inbox & Invitations Endpoints (`/api/invitations`)

### List User's Inbox Invites
* **Endpoint**: `/invitations/me`
* **Method**: `GET`
* **Auth Required**: Yes
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 1,
    "invitations": [
      {
        "_id": "6a4fe1786c86d06c418ed78e",
        "project": {
          "_id": "6a4fe1786c86d06c418ed786",
          "name": "My Workspace Project"
        },
        "role": "Viewer",
        "token": "427941c49c3239d6669c352798c7c233ab03e2551ac5b00c5b290fe83468eea9"
      }
    ]
  }
  ```

---

### Accept Invitation
* **Endpoint**: `/invitations/:token/accept`
* **Method**: `POST`
* **Auth Required**: Yes (Logged-in user's email must match invitation target email)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Joined project successfully"
  }
  ```

---

## 5. Notifications Endpoints (`/api/notifications`)

* **List Notifications**: `GET /notifications`
* **Mark Read**: `PATCH /notifications/:id/read`
* **Mark All Read**: `PATCH /notifications/read-all`

---

## 6. User Management Endpoints (`/api/users`)

* **Update Profile Details**: `PUT /users/profile` (Request body: `{ "name": "New Name" }`)
* **Change Password**: `PUT /users/password` (Request body: `{ "currentPassword": "old", "newPassword": "new12345" }`)
* **Delete Account (Cascading)**: `DELETE /users`

---

## 7. Admin Panel Governance Endpoints (`/api/admin`)

* **Get Platform Diagnostics**: `GET /admin/stats` (Returns total users, projects, CPU usage, memory stats, database status)
* **Inspect Rotating Logs**: `GET /admin/logs` (Returns logs from Winston `combined.log` file)
* **List All Users**: `GET /admin/users`
* **Delete User**: `DELETE /admin/users/:userId`
