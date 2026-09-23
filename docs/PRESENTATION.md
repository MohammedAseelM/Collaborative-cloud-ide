# Academic Evaluation: Abstract, Synopsis, Presentation & Demo Scripts

This document compiles the academic deliverables for the final-year evaluation of the Collaborative Cloud IDE.

---

## 1. Project Abstract
Modern software development thrives on real-time feedback, remote collaboration, and friction-free development environments. This project presents a browser-based, production-ready **Collaborative Cloud IDE** that eliminates local development setup delays by letting remote teams write, share, execute, and version code collaboratively in real-time. 

Integrating the Monaco Editor with Socket.io enables simultaneous multi-user code editing with visual cursor tracking, latency-minimized presence status, and typing indicators. To secure code execution, the platform compiles scripts (Python, JavaScript, C++, C, Java, TypeScript) inside resource-constrained, isolated Docker containers, preventing host-level resource starvation. Version snapshot controls store codebase states in MongoDB, allowing remote teams to compare code states and restore projects. Secure user profiles are managed via JSON Web Tokens (JWT) stored in HTTP-only cookies, combined with role-based access control (RBAC).

---

## 2. Project Synopsis

### Problem Statement
Traditional local development suffers from the "it works on my machine" syndrome, complicated configuration pipelines, and slow peer review feedback loops. Developers need a unified workspace where they can edit, execute, discuss, and version code concurrently without configuring local runtimes.

### System Architecture
The application uses a 3-tier MVC layout:
1. **Presentation Layer**: Built with React, Vite, and Tailwind CSS. Employs Monaco Editor for coding and Socket.io client for delta syncing.
2. **Application Server Layer**: Powered by Node.js and Express. Handles REST endpoints, Socket.IO rooms, and interacts with the host Docker CLI.
3. **Data Layer**: MongoDB Atlas stores user models, workspace files (flat trees), timelines, chat messages, notifications, and snapshots.

```text
React (Vite) <--> REST API / WebSockets <--> Node.js (Express) <--> MongoDB / Docker
```

---

## 3. 10-Minute Presentation Script (Slide-by-Slide)

### Slide 1: Title & Team (Time: 0:00 - 1:00)
* **Speaker**: "Good morning respected evaluators. Today, we present our Mini Capstone Project: 'Collaborative Cloud IDE for Team-Based Software Development'. Our project aims to bring the power of live editing, secure sandboxed execution, and versioning to the browser."

### Slide 2: Problem Statement & Objectives (Time: 1:00 - 2:00)
* **Speaker**: "Local environment configuration is time-consuming and prone to compatibility errors. Our objective is to build a browser-based workspace similar to VS Code Live Share that supports real-time editing, sandboxed execution, access permissions, and snapshot timelines."

### Slide 3: Technology Stack (Time: 2:00 - 3:30)
* **Speaker**: "We chose React and Vite for a highly responsive frontend. The backend runs on Node.js and Express. For data storage, we use MongoDB with custom indexing. Real-time delta updates are powered by Socket.io, and code execution is isolated using resource-constrained Docker containers."

### Slide 4: Real-Time Synchronization Engine (Time: 3:30 - 5:00)
* **Speaker**: "Instead of broadcasting full code buffers over WebSockets, we synchronize character deltas (range offsets and replacements). Users are grouped into project-specific rooms, and edits are cached in-memory on the backend, debouncing database writes by 2 seconds to minimize I/O overhead."

### Slide 5: Sandboxed Code Execution (Time: 5:00 - 6:30)
* **Speaker**: "To execute code safely, the backend writes files to temporary mount paths on the host and spins up isolated Alpine-based Docker containers. Runtimes are resource-limited (CPU, memory, and network blockages) to prevent malicious scripts from affecting the server. Output is streamed back to our client-side terminal emulator."

### Slide 6: Security & Governance (Time: 6:30 - 8:00)
* **Speaker**: "Security is built-in. JWT tokens are stored in HttpOnly, secure, strict SameSite cookies to prevent XSS and CSRF attacks. Role-based permissions restrict Viewer roles to read-only editors. The admin panel provides diagnostics and system metrics."

### Slide 7: Compilation & Testing (Time: 8:00 - 9:00)
* **Speaker**: "Vite compiles the production bundle in 1.51 seconds. We ran an automated REST API test suite verifying Auth, Files, Sockets, and database cascade deletes. All tests passed."

### Slide 8: Conclusion & Future Scope (Time: 9:00 - 10:00)
* **Speaker**: "Our Cloud IDE successfully provides real-time collaboration. Future work includes integrating AI assistants, WebRTC voice/video, and interactive terminals. We are ready to demonstrate the live application."

---

## 4. 5-Minute Product Demo Script

### Phase 1: Onboarding & Dashboard (1.5 Minutes)
1. **Registration**: Open the app and register `developer_a@example.com`.
2. **Dashboard**: Navigate the project cards. Highlight sorting filters and the Star (Favorite) and Archive buttons.
3. **Project Creation**: Click **New Project**, name it "Collaborative Sandbox", choose "JavaScript", and click **Create**. Show that `index.js` is automatically generated.

### Phase 2: Collaborative Workspace Sync (1.5 Minutes)
1. **Invite Member**: Click **Invite**, type `developer_b@example.com` (already registered), select the `Viewer` role, and send the invite.
2. **Accept Invite**: Log in as Developer B in a separate incognito window. Open the dashboard, locate the invite, and click **Accept**.
3. **Simultaneous Editing**: 
   * Open the project as Developer A.
   * Open the project as Developer B. Show that Developer B can view Developer A's active cursor.
   * Type in Developer A's screen. Show that the edits reflect on Developer B's screen instantly. Show that Developer B (Viewer) cannot edit code because the editor is read-only.

### Phase 3: Code Execution & Chat (1 Minute)
1. **Execution**: As Developer A, change the code to `console.log("Welcome to Capstone Ide");` and click **Run Code**. Show the output in the bottom terminal.
2. **Workspace Chat**: Open the chat sidebar. Type "Let's save this version" as Developer A. Show that Developer B receives the message instantly.

### Phase 4: Version History Restore (1 Minute)
1. **Save Version**: Under the Version tab, type "Initial Release" and click **Save Snapshot**.
2. **Revert**: Make an edit in the editor, then click **Restore** on the "Initial Release" version. Show that the code reverts to its original state instantly on both Developer A's and Developer B's screens.
