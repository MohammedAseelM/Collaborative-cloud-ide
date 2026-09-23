# Collaborative Cloud IDE - Testing Documentation

This document outlines the testing methodologies, test results, performance validations, and security checks executed to ensure the stability of the platform.

---

## 1. Automated Integration REST API Suite

We created an automated integration test script: [api_test_suite.mjs](file:///c:/Users/moham/OneDrive/Desktop/MCP/collaborative-cloud-ide/backend/temp/api_test_suite.mjs). This script runs programmatically inside the Node.js environment, mimicking client behavior by managing authentication cookies and testing every REST endpoint sequentially.

### Test Results Summary
* **Authentication**: Registered, logged in, and verified sessions successfully. Verified that guest users are blocked from projects.
* **Project Management**: Created workspaces, favorited/unfavorited projects, and toggled archive states.
* **File Operations**: Created, renamed, and deleted folders and files. Verified the file content retrieval REST endpoints.
* **Invitations & Roles**: Invited team members as Viewers. The invitee successfully retrieved the invite from their inbox and accepted.
* **Role Locking**: Verified that the Viewer role is blocked with a `403 Forbidden` response when attempting write operations (e.g. file renames).
* **Notifications**: Created invite alerts and marked them read.
* **Admin Governance**: Successfully loaded system diagnostic statistics and read Winston logs as an Admin, and verified that standard users are blocked.
* **Database Cleanups**: Deleting a project correctly triggers cascading deletes of all associated file nodes. Deleting a user cleans up all user projects and settings.

---

## 2. Real-Time Socket.IO Testing

Socket.IO functionality was verified using multi-browser manual testing:

1. **Auth Handshake**: Verified that socket connections without JWT cookies are rejected.
2. **Presence Broadcasts**:
   * Logged in as User A and User B in separate browser windows.
   * Joined the same project workspace.
   * Verified that both users immediately saw each other's avatars in the online list.
3. **Monaco Editor Cursor Sync**:
   * Moved the cursor in User A's browser.
   * Verified that a colored cursor labeled "User A" appeared in the correct row and column on User B's screen.
4. **Typing Indicators**:
   * Began typing as User A.
   * Verified that User B's workspace immediately displayed a typing indicator ("User A is typing...").
5. **Chat Message Stream**:
   * Sent a chat message in the Workspace panel.
   * Verified that the message appeared in both user chat histories instantly.

---

## 3. Performance & Volume Testing

### Client Bundle Compilation
We compiled the frontend for production using Vite:
```text
transforming...✓ 1911 modules transformed.
rendering chunks...
dist/assets/Workspace-9OR6wFxK.js           101.28 kB (lazy routes split)
dist/assets/index-nfflAOVx.js               237.31 kB (main react package)
```
* **Lazy Loading**: Splitting the code into chunks ensures pages like the Settings page and Admin panel do not block the initial Dashboard render.

### Database Write Reductions
* Tested typing synchronization under rapid keystroke intervals (10–20 characters per second).
* **Debounce Caching**: Keystrokes are held in memory and saved to MongoDB only after 2 seconds of inactivity. This reduces write operations on the database by over 90% compared to saving on every keystroke.

---

## 4. Security & Hardening Tests

* **JWT in HTTP-only Cookie**: Inspected the browser cookies using Chrome DevTools. Verified that the `token` cookie has the `HttpOnly` and `Secure` flags set, preventing access from client-side scripts.
* **Rate Limiter**: Made rapid curl requests to the `/api/` endpoints. Verified that the server blocks requests with a `429 Too Many Requests` status code after exceeding 100 requests in 15 minutes.
* **Role Enforcement**: Verified that standard users attempting to load `/api/admin/stats` receive a `403 Forbidden` response.
* **Input Sanitization**: Sent invalid email addresses and passwords during registration. Verified that Express Validator blocks the request and returns structured `400 Bad Request` messages.

---

## 5. Bug Log & Fix Verification

* **Mongoose pre-save `next` TypeError**:
  * *Bug*: Registration failed with a 500 error: `TypeError: next is not a function`.
  * *Fix*: Removed the `next` callback argument from the async user schema pre-save hook, allowing Mongoose to manage flow via Promise resolution.
  * *Result*: Registration and password hashing now work flawlessly.
* **File Duplicate Conflict**:
  * *Bug*: Creating a file named `index.js` in a new project failed with a 400 error.
  * *Fix*: New projects automatically create a starter `index.js` file. The test script was updated to create `test_script.js` instead.
  * *Result*: File explorer endpoints now pass all automated checks.
