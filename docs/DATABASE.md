# Collaborative Cloud IDE - MongoDB Schema & Database Documentation

This document explains the MongoDB database design, Mongoose models, data types, relationships, and performance indexes.

---

## 1. User Collection (`users`)
Represents registered user accounts on the platform.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `name` | String | Trimmed, length: `2` to `50` chars | | User full name |
| `email` | String | Unique, lowercase, matching regex | | Account email (login credential) |
| `password` | String | Select: `false` (hidden by default), min length: `8` | | Hashed password |
| `role` | String | Enum: `["user", "admin"]` | `"user"` | Admin role grants global diagnostic dashboard access |
| `resetPasswordToken` | String | Optional | | For password retrieval |
| `resetPasswordExpires` | Date | Optional | | Reset token expiry date |
| `createdAt` | Date | Auto-generated | | Timestamp |
| `updatedAt` | Date | Auto-generated | | Timestamp |

### Indexes
* `email: 1` (Unique) - Accelerates credential lookup and enforces unique emails.

---

## 2. Project Collection (`projects`)
Represents workspaces created by users.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `name` | String | Trimmed, length: `2` to `100` chars | | Project display name |
| `description` | String | Trimmed, max length: `500` chars | `""` | Optional details |
| `owner` | ObjectId | Refers to `User`, Required, Indexed | | Workspace owner |
| `members` | Array | Refers to `User` ObjectIds | `[]` | Collaborators list |
| `memberRoles` | Map | Key: string (UserId), Value: string (Role) | `{}` | Role map (Owner, Admin, Editor, Viewer) |
| `isArchived` | Boolean | | `false` | Quick archiving flag |
| `favorites` | Array | Refers to `User` ObjectIds | `[]` | Users who favorited this project |
| `language` | String | Enum: `["javascript", "python", "java", "cpp", "c", "typescript", "other"]` | `"javascript"` | Target compilation language |
| `code` | String | | `""` | Legacy project-level code buffer |
| `lastEditedBy` | ObjectId | Refers to `User` | | Track last editor |
| `lastEditedAt` | Date | | | Last edit time |
| `createdAt` | Date | Auto-generated | | Timestamp |
| `updatedAt` | Date | Auto-generated | | Timestamp |

### Indexes
* `owner: 1, name: 1` - Speeds up dashboard workspace listings and searches.

---

## 3. File Node Collection (`filenodes`)
Represents files and folders in a flat list structure. This avoids the 16MB document size limit of embedding within the Project model.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `name` | String | Trimmed, max length: `100` chars | | File or folder name |
| `isFolder` | Boolean | Required | | Directory vs code file flag |
| `project` | ObjectId | Refers to `Project`, Required | | Owning project |
| `parentId` | ObjectId | Refers to `FileNode` | `null` | Reference to parent folder (`null` = root level) |
| `content` | String | | `""` | Text contents of the file |
| `createdAt` | Date | Auto-generated | | Timestamp |
| `updatedAt` | Date | Auto-generated | | Timestamp |

### Indexes
* `project: 1, parentId: 1` - Speeds up fetching of folders and directory rendering.
* `project: 1, name: 1, parentId: 1` (Unique) - Enforces unique file names in the same folder.

---

## 4. Invitation Collection (`invitations`)
Manages pending workspace invitations.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `project` | ObjectId | Refers to `Project`, Required | | Targeted project workspace |
| `email` | String | Required, lowercase, email regex | | Invitee email |
| `role` | String | Enum: `["Admin", "Editor", "Viewer"]` | `"Editor"` | Assigned collaboration level |
| `token` | String | Unique, Indexed, Required | | Secure registration token |
| `expiresAt` | Date | Required | | Expiry timestamp |
| `invitedBy` | ObjectId | Refers to `User`, Required | | Sponsoring user |

### Indexes
* `token: 1` (Unique) - Rapid verification when accepting invitations.
* `expiresAt: 1` (TTL Index: `expireAfterSeconds: 0`) - Automatically removes expired invitations.
* `project: 1, email: 1` (Unique) - Enforces a single active invite per user per project.

---

## 5. Notification Collection (`notifications`)
Stores in-app messages and real-time alerts.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `recipient` | ObjectId | Refers to `User`, Required | | Target recipient |
| `type` | String | Enum: `["INVITE", "ACTIVITY", "SYSTEM"]` | | Category of alert |
| `title` | String | Required, Trimmed | | Header display |
| `message` | String | Required, Trimmed | | Content text |
| `read` | Boolean | | `false` | Unread notifications tracker |
| `relatedProject` | ObjectId | Refers to `Project` | `null` | Link to relevant project |

### Indexes
* `recipient: 1, read: 1, createdAt: -1` - Fast retrieval of unread notifications ordered by date.

---

## 6. Version Collection (`versions`)
Stores codebase historical snapshots.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `project` | ObjectId | Refers to `Project`, Required | | Snapshotted project |
| `code` | String | Required | | Full codebase text content state |
| `versionNumber` | Number | Required | | Incremental index counter |
| `description` | String | Trimmed, max length: `200` chars | `"Auto-save snapshot"` | User snapshot label/notes |
| `createdBy` | ObjectId | Refers to `User`, Required | | Creator of snapshot |
| `createdAt` | Date | Auto-generated | | Timestamp |

### Indexes
* `project: 1, versionNumber: -1` - Fast retrieval of snapshots in chronological order.

---

## 7. Message Collection (`messages`)
Stores workspace chat conversations.

### Schema Fields
| Field Name | Data Type | Validation / Constraints | Default Value | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto-generated | | Primary Key |
| `project` | ObjectId | Refers to `Project`, Required | | Containing workspace room |
| `sender` | ObjectId | Refers to `User`, Required | | Sending user |
| `text` | String | Required, Trimmed, max length: `1000` | | Message content text |
| `createdAt` | Date | Auto-generated | | Timestamp |

### Indexes
* `project: 1, createdAt: 1` - Speeds up fetching of historical chat conversations in sequential order.
