# Collaborative Cloud IDE - Security Documentation

This document explains the security architecture, safeguards, and defensive measures implemented in the Collaborative Cloud IDE.

---

## 1. Authentication & Session Management

The platform secures user sessions using **JSON Web Tokens (JWT)** stored in the browser's cookie storage.

### Cookie Configuration
When a user logs in or registers, the server generates a token and sets it as an HTTP cookie with the following security flags:
* `httpOnly: true`: Prevents client-side scripts (such as JavaScript) from accessing the cookie, eliminating token theft via Cross-Site Scripting (XSS) attacks.
* `secure: true`: Ensures the browser sends the cookie only over encrypted (HTTPS) connections.
* `sameSite: "strict"`: Instructs the browser to only send the cookie with requests originating from the same site, mitigating Cross-Site Request Forgery (CSRF) attacks.

---

## 2. Password Hashing & Storage

Passwords are never stored in plain text.
* **Bcrypt salting**: A Mongoose pre-save hook automatically salts and hashes the password before saving it to MongoDB, using `bcryptjs` with a work factor of 10 salt rounds.
* **Schema Exclusion**: The User model defines the password field with `select: false`. Database queries (such as fetching user details or listing users) will not return the hashed password by default unless explicitly requested.

---

## 3. Role-Based Access Control (RBAC)

The platform supports four roles, each with increasing levels of authority:

| Role | Workspace Access | Code Execution | File Management | Invite Team Members | Rename/Delete Project |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Owner** | Yes | Yes | Yes | Yes (Can promote members) | Yes |
| **Admin** | Yes | Yes | Yes | Yes | No |
| **Editor** | Yes | Yes | Yes | No | No |
| **Viewer** | Yes (Read-Only) | No | No | No | No |

### Implementation
Permission checks are enforced on both the backend and frontend:
* **Backend validation**: The `verifyProjectPermission` utility checks the user's role against the minimum required role for the requested operation. If unauthorized, it returns a `403 Forbidden` response.
* **Frontend UI enforcement**: The frontend hides write-sensitive buttons (e.g. Run Code, Save Snapshot, File Additions) and configures the Monaco Editor option to `readOnly: true` when the user has a Viewer role.

---

## 4. Protected Routes & Authorization Middleware

* **Authentication Guard**: The `protect` middleware intercepts HTTP requests, extracts the JWT from cookies, verifies it, and attaches the user's details to `req.user`. Requests without a valid token receive a `401 Unauthorized` response.
* **Admin Guard**: The `admin` middleware restricts endpoints in `admin.routes.js` to users with `role: "admin"`. Standard users attempting to access these routes receive a `403 Forbidden` response.

---

## 5. Input Validation & Sanitization

To prevent SQL/NoSQL injection and cross-site scripting:
* **Express Validator**: Incoming requests are validated using `express-validator` middleware. Parameters are checked for email formats, password lengths, and required string inputs.
* **Mongoose Schema Validation**: Schema paths use strong validation rules, enforcing enum limits, length bounds, and sanitizing fields before database insertion.

---

## 6. Rate Limiting & DDoS Mitigation

To protect API endpoints from denial-of-service (DDoS) and brute-force login attempts:
* The `express-rate-limit` middleware limits client requests to **100 requests per 15 minutes** per IP.
* IP addresses that exceed this limit receive a `429 Too Many Requests` response.

---

## 7. HTTP Header Hardening (Helmet)

The server integrates the **Helmet** middleware to configure secure HTTP headers:
* **Content Security Policy (CSP)**: Restricts the origins from which scripts, styles, and assets can be loaded.
* **X-Frame-Options**: Set to `SAMEORIGIN` to prevent clickjacking attacks by blocking the app from being embedded in external iframes.
* **Strict-Transport-Security (HSTS)**: Forces browsers to use secure HTTPS connections.
* **X-Content-Type-Options**: Set to `nosniff` to prevent the browser from interpreting files as a different MIME type than declared.
