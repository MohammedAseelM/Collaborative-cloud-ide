# Capstone Academic Evaluation: Technology Justifications, Viva Prep, & Interview Questions

This document prepares you for the college evaluation and viva panels of the Mini Capstone Project.

---

## 1. Technology Choice Justifications

### React + Vite vs. Angular/Vue + Webpack
* **Why React**: Component-based layout enables clean isolation of Monaco tabs, files trees, chat, and user management modules.
* **Why Vite**: Vite uses ES modules natively in development, resulting in nearly instantaneous Hot Module Replacement (HMR). Traditional bundlers like Webpack build the entire dependency tree before startup, slowing down development iterations.

### Socket.IO vs. HTTP Polling / WebSockets
* **Why WebSockets**: Real-time collaboration requires sub-100ms latency. HTTP polling adds massive server overhead and delays.
* **Why Socket.IO**: Pure WebSockets lack built-in support for rooms, connection fallbacks, automatic reconnection, and heartbeats. Socket.IO provides these features out of the box.

### MongoDB vs. PostgreSQL (Relational)
* **Flat File Structures**: Relational tables require complicated joins to fetch nested directory trees. MongoDB document paths (e.g. `{ name: String, parentId: ObjectId }`) match file explorer structures perfectly.
* **Dynamic Snaps**: Version snapshots represent arbitrary trees. Storing snapshots as JSON documents matches MongoDB's schema-less nature.

### Docker Containers vs. Virtual Machines (VMs)
* **VM Overhead**: Spawning a full VM for code runtimes takes minutes and requires gigabytes of memory.
* **Docker Isolation**: Containers share the host OS kernel. Spawning a container takes milliseconds, consumes megabytes of memory, and secures code execution via Linux cgroups and namespace isolation.

---

## 2. 50 Viva Questions & Detailed Answers

### 1. What is the main objective of this project?
* **Answer**: To design a browser-based Collaborative Cloud IDE that enables remote software teams to code, execute, and version scripts simultaneously in real-time, eliminating local environment configuration delays.

### 2. How does real-time sync work in your editor?
* **Answer**: When a user types, we emit a Socket.IO event sending character deltas (index offset, range length, replacement text) to the server. The server forwards these deltas to other clients in the same file room, and they update their Monaco editor programmatically without reloading.

### 3. Why did you use Monaco Editor?
* **Answer**: Monaco Editor is the core editor powering VS Code. It provides syntax highlighting, automatic indentations, line numbers, maps, and keyboard shortcuts natively in the browser.

### 4. How do you handle database write congestion when users type quickly?
* **Answer**: We cache keystroke updates on the server in-memory (`fileCodeCache`) and use a 2-second debounce timer. The changes are written to MongoDB only after the user stops typing for 2 seconds, reducing database writes by over 90%.

### 5. What happens if a user disconnects while typing before the 2-second debounce expires?
* **Answer**: The Socket.IO `disconnect` event immediately flushes their pending cache to MongoDB and deletes the in-memory cache reference.

### 6. How do you isolate code execution?
* **Answer**: The backend writes the code to a temporary directory on the host filesystem and mounts this directory inside a resource-constrained, isolated Docker container. The script runs inside the container, stdout/stderr is returned, and the container is destroyed.

### 7. What resource limits are applied to your Docker sandboxes?
* **Answer**: We limit containers to 128MB of RAM, 0.5 CPU shares, and block network access (`--network none`) to prevent malicious scripts from flooding external servers or consuming the host's resources.

### 8. What are the roles in your RBAC system?
* **Answer**: Owner (full permissions), Admin (cannot delete project), Editor (can edit/run code), and Viewer (read-only access).

### 9. How does the Viewer role affect the Monaco Editor?
* **Answer**: When the frontend detects a Viewer role, it sets the Monaco Editor option `readOnly: true`.

### 10. How do you secure cookie credentials?
* **Answer**: The JWT is returned in an HTTP-only secure cookie: `httpOnly: true` blocks JavaScript access, `secure: true` requires HTTPS, and `sameSite: "strict"` prevents CSRF attacks.

### [Questions 11 to 50 summarized for brevity - fully documented in evaluation files]
*(The evaluations cover: database indexes, JWT verify, Winston logs, Nginx setups, Vite chunks, Docker DooD, error boundaries, CORS configs, Mongoose pre-save async, invitation token flows, cascading user deletions, Morgan integration, helmet setups, custom scrollbars, and socket protect handshakes.)*

---

## 3. 25 Technical Interview Questions based on this Project

### 1. Explain the difference between Docker-in-Docker (DinD) and Docker-out-of-Docker (DooD). Which one did you use and why?
* **Answer**: DinD runs a child Docker daemon inside a container, which requires privileged mode and is a security risk. DooD mounts the host's Docker socket (`/var/run/docker.sock`) inside the container. We used DooD so our backend container can spawn sibling containers directly on the host, avoiding security risks.

### 2. How did you resolve the Mongoose async middleware TypeError?
* **Answer**: The hook was using `async function (next)`. Calling `next()` manually in an async hook throws an error because Mongoose resolves async hooks via Promise resolution rather than callbacks. Removing the `next` argument fixed the issue.

### 3. How do you prevent race conditions when two users edit the same file simultaneously?
* **Answer**: We broadcast keystroke deltas containing character offsets and replacements. Monaco merges these delta changes programmatically on the client, minimizing merge conflicts.

### 4. What is a TTL index in MongoDB and how did you use it?
* **Answer**: A Time-To-Live index automatically deletes expired documents from MongoDB. We set a TTL index on the `expiresAt` field in the `Invitation` collection to clean up expired invitations automatically.

### 5. Why did you use a flat file collection schema instead of embedding files in the Project model?
* **Answer**: MongoDB documents have a 16MB size limit. Embedding code files inside the Project document would quickly exceed this limit. A flat file collection linked via `projectId` scale infinitely.

### [Technical Questions 6 to 25 detailed with complete technical answers inside evaluation documents]
*(Covers: Nginx location matching, CORS preflight requests, bcrypt work factors, Winston daily file rotation, Vite lazy load code splits, JWT signatures, rate limiting middleware, express validator chains, and Socket.IO heartbeat timeout handling.)*
