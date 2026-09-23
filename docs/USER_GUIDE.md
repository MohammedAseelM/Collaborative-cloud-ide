# Collaborative Cloud IDE - User Guide

Welcome to the Collaborative Cloud IDE. This guide outlines how to use the platform's core collaborative features to develop applications with your team.

---

## 1. Onboarding

### Registering a New Account
1. Open the application in your browser (`http://localhost:5173`).
2. Click **Register** on the landing page.
3. Fill in your **Name**, **Email**, and a secure **Password** (minimum 8 characters).
4. Click **Create Account**. You will be automatically logged in and redirected to the Dashboard.

### Logging In
1. Navigate to the **Login** page.
2. Enter your registered email and password.
3. Click **Login**. If you check "Remember me" (optional), your session will persist across browser restarts.

---

## 2. Managing Projects

### Creating a Project
1. On your **Dashboard**, click the **+ New Project** button.
2. Enter a **Project Name** and a brief description.
3. Select your target programming language (JavaScript, Python, C++, Java, etc.).
4. Click **Create**. The platform will initialize your project and automatically create a default starter file (e.g. `index.js` or `main.py`).

### Searching, Favoriting, and Archiving
* **Search**: Use the search bar at the top of the dashboard to filter projects by name.
* **Favorite**: Click the **Star** icon on a project card to add it to your favorites. Use the "Favorites" filter to view them.
* **Archive**: Click the **Archive** box icon to hide projects from your active dashboard. Archived projects can be retrieved by toggling the "Archived" filter.
* **Sorting**: Sort your workspaces using the dropdown menu (e.g., sort alphabetically or by recent modifications).

---

## 3. Real-Time Workspace Collaboration

### Inviting Team Members
1. Open your project workspace.
2. Click the **Invite** button in the header toolbar.
3. Enter the collaborator's registered email address.
4. Assign their permission role:
   * **Admin**: Full access (except project deletion), can invite/promote others, rename the project, edit code, and restore snapshots.
   * **Editor**: Can create files, rename items, edit code, and run code.
   * **Viewer**: Read-only access. Monaco Editor is locked, and code execution or file management buttons are hidden.
5. Click **Send Invitation**.

### Accepting Invitations (Inbox)
1. When invited to a project, a notification badge will appear on your dashboard navbar.
2. Scroll to the **Pending Invitations** inbox panel on your Dashboard.
3. Review the pending project invite, sender, and assigned role.
4. Click **Accept** to join the workspace, or **Reject** to dismiss the invite.

---

## 4. Coding & Execution

### Managing Files
* **Add Files/Folders**: Right-click or use the action buttons in the File Explorer panel on the left to create new files or folders.
* **Rename/Delete**: Hover over a file node, click the options icon, and choose **Rename** or **Delete**.
* **Navigation**: Click any file to open it in a new editor tab. You can switch between multiple open tabs at the top of the editor.

### Editing Code
* Type inside the editor. Your changes will automatically synchronize with all online collaborators in real-time.
* You can see other users' cursors, labeled with their names and custom colors, moving as they type.
* Active typing indicators will appear at the bottom of the collaborator panel, showing who is currently editing.

### Saving Code
* **Auto-Save**: The platform automatically saves your code changes to the database 2 seconds after you stop typing.
* **Manual Save**: Press `Ctrl + S` or click the save icon in the editor toolbar to save changes immediately.

### Executing Code
1. Open a runnable code file in the active editor tab.
2. Click the green **Run Code** button in the top right.
3. The secure sandbox container will allocate, execute your code, and output stdout/stderr logs in the integrated Terminal panel at the bottom.

---

## 5. Timeline & Version Snapshots

### Saving a Snapshot
1. Click the **Save Version** tab in the right-hand panel.
2. Enter a brief description of the current changes (e.g., "Feature completed").
3. Click **Save Snapshot**. This records the current state of all files in the project.

### Restoring a Version
1. Open the **History** tab in the right-hand panel.
2. Review the list of saved version numbers, creation timestamps, authors, and notes.
3. Click **Restore** next to the target version.
4. Confirm the prompt. The workspace will immediately revert all files, and your collaborators' screens will update automatically.

---

## 6. Workspace Communication

### Chatting with Your Team
1. Click the **Chat** tab in the right-hand panel to open the sidebar.
2. Type your message in the text input at the bottom and press **Enter** or click send.
3. Messages will stream in real-time, showing usernames, profile avatars, and message timestamps.
4. The chat history scrolls automatically to show new messages.

---

## 7. Account Configuration

### Profile & Settings
1. Click your profile icon in the top right corner of the navbar and select **Settings**.
2. **Update Profile**: Modify your display name and click Save.
3. **Change Password**: Provide your current password and set a new secure password.
4. **Editor Preferences**: Customize your editor font size and theme (Light, Dark, Oceanic). These settings save locally to your device.
5. **Delete Account**: Click the delete button at the bottom of the Settings page. This permanently deletes your profile and all owned projects from the database.
