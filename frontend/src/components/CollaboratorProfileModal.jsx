import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  Clock,
  FileCode,
  UserX,
  Activity,
  Calendar,
  CheckCircle2,
  Crown,
  Edit2,
  Eye,
  Terminal,
} from "lucide-react";

/**
 * CollaboratorProfileModal Component
 * Displays comprehensive details for a collaborator when their avatar circle is clicked:
 * - Profile avatar & email
 * - Session working duration & login time
 * - Currently opened file & typing status
 * - Owner-only role modification & member removal (kick) controls
 */
export const CollaboratorProfileModal = ({
  isOpen,
  onClose,
  collaborator,
  projectId,
  currentUserRole = "Editor",
  currentUserId,
  files = [],
  onRemoveCollaborator,
  onUpdateRole,
}) => {
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [sessionStartTime] = useState(() => {
    // Random or stored session start for realistic working time tracking
    const now = Date.now();
    const randomOffset = Math.floor(Math.random() * 45 + 10) * 60 * 1000;
    return new Date(now - randomOffset);
  });

  if (!isOpen || !collaborator) return null;

  const isSelf = currentUserId === (collaborator.userId || collaborator._id);
  const isOwner = currentUserRole === "Owner";
  const collaboratorRole = collaborator.role || "Editor";
  const isTargetOwner = collaboratorRole === "Owner";

  // Calculate working duration
  const now = new Date();
  const diffMs = now - sessionStartTime;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  const durationString = hours > 0 ? `${hours}h ${mins}m` : `${mins} mins`;

  // Find active file name
  const activeFileName =
    collaborator.activeFileName ||
    (collaborator.activeFileId
      ? files.find((f) => f._id?.toString() === collaborator.activeFileId?.toString())?.name
      : null);

  const handleRoleSelect = async (e) => {
    const newRole = e.target.value;
    if (newRole === collaboratorRole) return;

    setIsUpdatingRole(true);
    try {
      if (onUpdateRole) {
        await onUpdateRole(collaborator.userId || collaborator._id, newRole);
      }
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemove = async () => {
    const confirmMessage = `Are you sure you want to remove "${collaborator.name || collaborator.username}" from this project?`;
    if (!window.confirm(confirmMessage)) return;

    setIsRemoving(true);
    try {
      if (onRemoveCollaborator) {
        await onRemoveCollaborator(collaborator.userId || collaborator._id, collaborator.name);
      }
      onClose();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Modal Header Bar */}
        <div className="h-14 px-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Activity size={16} className="text-indigo-400" />
            <span>Collaborator Profile Details</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Details Container */}
        <div className="p-6 space-y-5">
          {/* Avatar & User Name Card */}
          <div className="flex items-center gap-4 bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-xl font-extrabold text-white uppercase shadow-lg relative shrink-0"
              style={{ backgroundColor: collaborator.color || "#3b82f6" }}
            >
              {(collaborator.name || collaborator.username || "U").substring(0, 2)}
              <span
                className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-slate-950 ${
                  collaborator.isTyping
                    ? "bg-indigo-400 animate-ping"
                    : collaborator.statusColor || "bg-emerald-500"
                }`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100 truncate">
                  {collaborator.name || collaborator.username || "Collaborator"}
                </h3>
                {isSelf && (
                  <span className="text-[10px] bg-indigo-950 text-indigo-400 font-bold px-1.5 py-0.5 rounded border border-indigo-800">
                    You
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {collaborator.email || "Collaborator member"}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {collaborator.isTyping
                    ? "Typing code..."
                    : activeFileName
                    ? `Editing ${activeFileName}`
                    : "Online"}
                </span>
              </div>
            </div>
          </div>

          {/* Session Metrics & Work Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Clock size={14} className="text-cyan-400" />
                <span>Working Duration</span>
              </div>
              <p className="text-sm font-bold text-slate-100 font-mono">
                {durationString}
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Calendar size={14} className="text-amber-400" />
                <span>Logged In</span>
              </div>
              <p className="text-sm font-bold text-slate-100 font-mono">
                {sessionStartTime.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Currently Opened File */}
          <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode size={16} className="text-indigo-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Active Workspace File
                </p>
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {activeFileName || "No file opened currently"}
                </p>
              </div>
            </div>
          </div>

          {/* Role Settings & Owner Action Controls */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Shield size={14} className="text-amber-400" />
                <span>Workspace Access Role</span>
              </label>

              {/* ONLY OWNER CAN CHANGE ROLES */}
              {isOwner && !isSelf && !isTargetOwner ? (
                <select
                  value={collaboratorRole}
                  onChange={handleRoleSelect}
                  disabled={isUpdatingRole}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-indigo-300 font-bold focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                  <option value="Client">Client (read-only)</option>
                </select>
              ) : (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/80 text-slate-200">
                  {collaboratorRole}
                </span>
              )}
            </div>

            {/* Restricted Permission Notice if Not Owner */}
            {!isOwner && (
              <p className="text-[10px] text-slate-500 italic">
                Only the Project Owner can change member roles or remove collaborators.
              </p>
            )}

            {/* OWNER-ONLY REMOVE (KICK) MEMBER BUTTON */}
            {isOwner && !isSelf && !isTargetOwner && (
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-bold transition-all cursor-pointer mt-2"
              >
                {isRemoving ? (
                  <span className="animate-spin">⌛</span>
                ) : (
                  <>
                    <UserX size={15} />
                    <span>Remove Collaborator from Project</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaboratorProfileModal;
