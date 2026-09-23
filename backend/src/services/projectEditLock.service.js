// src/services/projectEditLock.service.js
// Responsibility: Keep one active runner in control of a project while it is
// executing code or hosting a development server. Other collaborators may
// still view the project, but cannot change its files until the lock clears.

const activeProjectLocks = new Map();

const toUserId = (user) => String(user?._id || user?.id || user || "");

const toPublicLock = (lock) => {
  if (!lock) return null;
  return {
    isLocked: true,
    ownerUserId: lock.ownerUserId,
    ownerName: lock.ownerName,
    reason: lock.reason,
  };
};

const broadcastLockChange = (projectId, io) => {
  if (!io) return;
  io.to(`project:${projectId}`).emit("project-edit-lock-change", {
    projectId,
    editLock: toPublicLock(activeProjectLocks.get(String(projectId))),
  });
};

const lockedError = (lock) => {
  const error = new Error(`${lock.ownerName || "Another collaborator"} is ${lock.reason}. File editing is temporarily locked.`);
  error.statusCode = 423;
  error.editLock = toPublicLock(lock);
  return error;
};

export const getProjectEditLock = (projectId) =>
  toPublicLock(activeProjectLocks.get(String(projectId)));

export const acquireProjectEditLock = (projectId, user, reason, io = null) => {
  const key = String(projectId);
  const ownerUserId = toUserId(user);
  const existing = activeProjectLocks.get(key);

  if (existing && existing.ownerUserId !== ownerUserId) {
    throw lockedError(existing);
  }

  const lock = {
    ownerUserId,
    ownerName: user?.name || "A collaborator",
    reason,
  };
  activeProjectLocks.set(key, lock);
  broadcastLockChange(key, io);
  return toPublicLock(lock);
};

export const assertProjectEditable = (projectId, user) => {
  const lock = activeProjectLocks.get(String(projectId));
  if (lock && lock.ownerUserId !== toUserId(user)) {
    throw lockedError(lock);
  }
};

export const assertProjectLockOwner = (projectId, user) => {
  const lock = activeProjectLocks.get(String(projectId));
  if (lock && lock.ownerUserId !== toUserId(user)) {
    throw lockedError(lock);
  }
};

export const releaseProjectEditLock = (projectId, user = null, io = null) => {
  const key = String(projectId);
  const lock = activeProjectLocks.get(key);
  if (!lock) return false;
  if (user && lock.ownerUserId !== toUserId(user)) return false;

  activeProjectLocks.delete(key);
  broadcastLockChange(key, io);
  return true;
};
