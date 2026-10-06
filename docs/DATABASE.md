# Collaborative Cloud IDE - MongoDB Database Architecture

This document describes the MongoDB database design, Mongoose schemas, document models, relationships, and performance indexes used across the platform.

---

## 1. User Model (`User`)

Stores registered user accounts and credential hashes.

### Schema Fields
| Field Name | Type | Validation / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | Primary Key |
| `name` | String | Trimmed, 2 to 50 chars | Display name |
| `email` | String | Unique, lowercase, indexed | Login email address |
| `password` | String | `select: false`, min length: 8 | Bcrypt hashed password (10 rounds) |
| `role` | String | Enum: `["user", "admin"]`, default: `"user"` | Global administrative access |
| `googleId` | String | Optional, indexed | Google OAuth identity |
| `avatar` | String | Optional | Profile image URL |
| `resetPasswordToken` | String | Optional | Token for password recovery |
| `resetPasswordExpires`| Date | Optional | Expiration time for reset token |
| `createdAt` / `updatedAt` | Date | Auto timestamps | Audit trail |

### Indexes
* `{ email: 1 }` (Unique) - Fast lookup during login; guarantees email uniqueness.

---

## 2. Project Model (`Project`)

Represents workspaces containing files, configurations, and collaborator associations.

### Schema Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId | Primary Key |
| `name` | String | Project name (trimmed, 2-100 characters) |
| `description` | String | Optional description (max 500 characters) |
| `owner` | ObjectId (Ref: `User`) | Project creator with full administrative control |
| `members` | `[ObjectId]` (Ref: `User`) | List of collaborator user IDs |
| `memberRoles` | Map (`userId` -> `Role`) | Explicit roles: `Owner`, `Admin`, `Editor`, `Viewer` |
| `isArchived` | Boolean | Archive toggle flag |
| `favorites` | `[ObjectId]` (Ref: `User`) | List of users who favorited this project |
| `language` | String | Language/template indicator (`javascript`, `python`, etc.) |
| `lastEditedBy` | ObjectId (Ref: `User`) | User who made the most recent modification |
| `lastEditedAt` | Date | Timestamp of last modification |

### Indexes
* `{ owner: 1, name: 1 }` - Fast filtering and dashboard querying.
* `{ members: 1 }` - Fast project discovery for collaborators.

---

## 3. FileNode Model (`FileNode`)

Represents files and folders using a flat hierarchical model. Flat node storage avoids the MongoDB 16MB document size limit and enables efficient single-file retrieval and streaming.

### Schema Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId | Primary Key |
| `name` | String | File or folder name (e.g., `App.jsx`, `src`) |
| `isFolder` | Boolean | `true` for directories, `false` for code files |
| `project` | ObjectId (Ref: `Project`) | Owning project reference |
| `parentId` | ObjectId (Ref: `FileNode`) | Parent directory (`null` for project root) |
| `content` | String | File text buffer (`""` for folders) |

### Indexes
* `{ project: 1, parentId: 1 }` - High-speed retrieval for directory tree rendering.
* `{ project: 1, parentId: 1, name: 1 }` (Unique) - Prevents duplicate sibling filenames.

---

## 4. Version Model (`Version`)

Stores immutable historical snapshots of a project's codebase.

### Schema Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `_id` | ObjectId | Primary Key |
| `project` | ObjectId (Ref: `Project`) | Project reference |
| `name` | String | Snapshot version title |
| `description` | String | Commit/version description |
| `files` | Array | Serialized snapshot of all project files at time of creation |
| `createdBy` | ObjectId (Ref: `User`) | User who created the snapshot |

---

## 5. Activity Model (`Activity`)

Maintains an audit trail of meaningful user actions.

### Schema Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `project` | ObjectId (Ref: `Project`) | Project reference |
| `user` | ObjectId (Ref: `User`) | User who performed the action |
| `action` | String | Action type (e.g. `FILE_CREATE`, `MEMBER_JOIN`, `RUN_START`, `SNAPSHOT_RESTORE`) |
| `details` | Object | Additional contextual parameters |
| `createdAt` | Date | Timestamp |

---

## 6. Message Model (`Message`)

Stores workspace chat messages.

### Schema Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `project` | ObjectId (Ref: `Project`) | Project room association |
| `sender` | ObjectId (Ref: `User`) | Message sender |
| `text` | String | Message content |
| `createdAt` | Date | Timestamp |

---

## 7. Invitation Model (`Invitation`)

Manages collaboration invitations sent via email with TTL expiration.

### Schema Fields & Indexes
* `token`: Unique cryptographic invite token.
* `expiresAt`: TTL index (`expireAfterSeconds: 0`) automatically deletes expired invitations.
* `{ project: 1, email: 1 }`: Unique index preventing duplicate active invitations.
