# Collaborative Cloud IDE - Testing Documentation & Verification Report

This document outlines the testing strategy, test suites, automated test execution, and end-to-end multi-user validation for the Collaborative Cloud IDE.

---

## 1. Automated Test Suite Overview

The backend uses Node.js's built-in native test runner (`node --test`), delivering lightweight, process-isolated test execution without heavy third-party framework overhead.

### Test Execution Command
From the `backend/` directory:
```bash
node tests/run_all.js
```
Or to run a specific test suite:
```bash
node --test tests/auth.test.js
node --test tests/project.test.js
node --test tests/file.test.js
node --test tests/member.test.js
node --test tests/run.test.js
node --test tests/socket.test.js
```

---

## 2. Test Suite Coverage & Verification Results

All 14 test suites and 73 test cases pass with zero failures:

```
ℹ tests 73
ℹ suites 14
ℹ pass 73
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Breakdown of Test Suites

1. **Authentication Tests (`tests/auth.test.js`)**:
   - User registration with password hashing.
   - Login credential verification and JWT cookie issuance.
   - Logout cookie clearance.
   - Token validation via `/api/auth/me`.
   - Rejection of invalid passwords, missing fields, and duplicate emails.

2. **Google OAuth Tests (`tests/googleAuth.test.js`)**:
   - OAuth token parsing and profile ingestion.
   - Account linking and user auto-provisioning.

3. **Project Management Tests (`tests/project.test.js`)**:
   - Workspace creation with initial file templates.
   - Workspace search, filtering, archiving, and favoriting.
   - Validation of project names and unique ownership constraints.
   - Cascading deletion of project files upon project removal.

4. **File Operations Tests (`tests/file.test.js`)**:
   - Creation of files and hierarchical folders.
   - File renaming and content updates.
   - Path traversal prevention (`../` and absolute paths rejected).
   - Recursive folder deletion.

5. **Role-Based Access Control Tests (`tests/member.test.js`)**:
   - Team invitations and token generation.
   - Role assignment: Owner, Admin, Editor, Viewer.
   - Viewer role enforcement: Attempts by Viewers to edit files or run servers return `403 Forbidden`.
   - Protection against unauthorized role elevation or removing the project Owner.

6. **Code Sandbox Execution Tests (`tests/run.test.js`)**:
   - Execution of JavaScript, Python, TypeScript, and compiled languages.
   - Handling of compilation errors, syntax errors, and nonzero exit codes.
   - Execution timeout limits and runaway process termination.

7. **Real-Time Collaboration Tests (`tests/socket.test.js`)**:
   - Socket connection authentication verification.
   - Room authorization: Rejection of room joins without project membership.
   - Presence joining and departure broadcasts.
   - Typing indicator and chat message distribution.
   - Monaco cursor coordinate sharing.

8. **Snapshot Versioning Tests (`tests/version.test.js`)**:
   - Creation of immutable project snapshots.
   - Listing snapshots with metadata.
   - Restoring a historical snapshot and broadcasting `force-file-sync`.

9. **Live Preview & Proxy Security Tests**:
   - Parameter format validation on `projectId`.
   - Access rejection for unauthenticated users or non-members.
   - Target URL verification (strictly restricted to `127.0.0.1:${port}`).

---

## 3. Negative Testing & Security Boundary Verification

| Test Scenario | Input / Action | Expected Result | Verified Status |
| :--- | :--- | :--- | :--- |
| **Unauthenticated API Access** | `GET /api/projects` without cookie or token | `401 Unauthorized` | Pass |
| **Invalid Project ID** | `GET /api/projects/invalid-id-123` | `400 Bad Request` | Pass |
| **Cross-Project Access** | User B attempts to delete User A's project | `403 Forbidden` | Pass |
| **Path Traversal Attack** | `POST /api/files` with name `../../etc/passwd` | `400 Bad Request` / Traversal Blocked | Pass |
| **Unauthorized Socket Join** | Non-member emits `join-project` for private workspace | Access denied; room join blocked | Pass |
| **Unauthorized Preview Proxy** | Non-member accesses `/preview/:projectId/` | `403 Forbidden` | Pass |
| **Failed Build Handling** | React project with intentional syntax error | Terminal logs stderr; build reported failed with actual error | Pass |
| **Premature Vite Exit** | Invalid entry file causing immediate Vite crash | Error diagnosed; server status updated to stopped | Pass |

---

## 4. End-to-End Multi-User Collaboration Test Flow

To verify multi-user collaboration:

1. **User A (Owner)** registers, logs in, and creates a project.
2. User A invites **User B** as an `Editor`.
3. User B registers, accepts the invite, and joins the workspace.
4. **Presence**: User A and User B appear in each other's online collaborator avatars.
5. **Editing**: User A opens `App.jsx` and types. User B sees User A's cursor (with name badge and distinct color) and real-time text updates.
6. **Chat**: User A sends a message in the workspace chat panel. User B receives the message instantly.
7. **Runtime & Preview**:
   - User A clicks "Install" -> dependencies installed.
   - User A clicks "Run Dev" -> Vite dev server boots on `127.0.0.1:5173`.
   - Preview loads at `/preview/:projectId/` inside the iframe.
   - User B opens preview and can interact with the running application.
8. **Snapshots**: User A saves a snapshot, makes breaking edits, and restores the snapshot. User B's Monaco editor buffer instantly syncs to the restored version.
