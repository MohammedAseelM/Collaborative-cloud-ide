// src/components/TrashModal.jsx
// Responsibility: Render the project Trash recovery UI, showing soft-deleted files and folders,
// supporting instant restoration, permanent deletion, and empty trash with confirmation dialogs.

import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  RotateCcw,
  X,
  FileCode,
  File,
  Folder,
  Loader2,
  Clock,
  User,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";
import {
  fetchTrashFiles,
  restoreFileNodeRequest,
  permanentDeleteFileNodeRequest,
  emptyTrashRequest,
} from "../services/file.service";

const TrashModal = ({ isOpen, onClose, projectId, onRestored, isReadOnly = false, isOwnerOrAdmin = false }) => {
  const [trashFiles, setTrashFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingFile, setDeletingFile] = useState(null); // File targeted for permanent deletion
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [isActionInProgress, setIsActionInProgress] = useState(false);

  const { addToast } = useToast();

  const loadTrash = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTrashFiles(projectId);
      setTrashFiles(data.files || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load deleted files from trash");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadTrash();
    }
  }, [isOpen, loadTrash]);

  const handleRestore = async (file) => {
    setRestoringId(file._id);
    try {
      const res = await restoreFileNodeRequest(file._id);
      const ancestorCount = res.restoredAncestors?.length || 0;
      const msg = ancestorCount > 0
        ? `Restored "${file.name}" along with ${ancestorCount} parent folder${ancestorCount > 1 ? "s" : ""}`
        : `Restored "${file.name}" successfully`;
      addToast(msg, "success");
      await loadTrash();
      if (onRestored) onRestored();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to restore file", "error");
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deletingFile) return;
    setIsActionInProgress(true);
    try {
      await permanentDeleteFileNodeRequest(deletingFile._id);
      addToast(`Permanently deleted "${deletingFile.name}"`, "success");
      setDeletingFile(null);
      await loadTrash();
      if (onRestored) onRestored();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to permanently delete item", "error");
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleEmptyTrash = async () => {
    setIsActionInProgress(true);
    try {
      const res = await emptyTrashRequest(projectId);
      addToast(`Trash emptied (${res.count || 0} item${res.count === 1 ? "" : "s"} permanently removed)`, "success");
      setShowEmptyConfirm(false);
      await loadTrash();
      if (onRestored) onRestored();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to empty trash", "error");
    } finally {
      setIsActionInProgress(false);
    }
  };

  const getFileIcon = (fileName, isFolder) => {
    if (isFolder) {
      return <Folder className="text-amber-400 shrink-0 mr-2" size={16} />;
    }
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
        return <FileCode className="text-yellow-400 shrink-0 mr-2" size={16} />;
      case "ts":
      case "tsx":
        return <FileCode className="text-blue-400 shrink-0 mr-2" size={16} />;
      case "py":
        return <FileCode className="text-green-400 shrink-0 mr-2" size={16} />;
      case "html":
        return <FileCode className="text-orange-400 shrink-0 mr-2" size={16} />;
      case "css":
        return <FileCode className="text-teal-400 shrink-0 mr-2" size={16} />;
      default:
        return <File className="text-slate-400 shrink-0 mr-2" size={16} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Trash2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">Project Trash & File Recovery</h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                  {trashFiles.length} item{trashFiles.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Recover deleted files or permanently remove them from the project.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isReadOnly && isOwnerOrAdmin && trashFiles.length > 0 && (
              <button
                onClick={() => setShowEmptyConfirm(true)}
                disabled={isActionInProgress}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-950/40 text-rose-400 border border-rose-500/30 hover:bg-rose-900/50 transition-colors cursor-pointer flex items-center gap-1.5"
                title="Permanently empty all items in trash"
              >
                <Trash2 size={13} />
                <span>Empty Trash</span>
              </button>
            )}

            <button
              onClick={loadTrash}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
              title="Refresh Trash List"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
              title="Close Trash"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-[250px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
              <Loader2 size={24} className="animate-spin text-indigo-400" />
              <p className="text-xs">Loading deleted files...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 gap-3">
              <AlertTriangle size={24} className="text-amber-400" />
              <p className="text-xs text-rose-300">{error}</p>
              <button
                onClick={loadTrash}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-800 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : trashFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 gap-2">
              <div className="p-3 rounded-full bg-slate-900 text-slate-600">
                <Trash2 size={28} />
              </div>
              <p className="text-xs font-semibold text-slate-400">Trash is completely empty</p>
              <p className="text-[11px] text-slate-600 max-w-xs">
                Deleted workspace files and folders will appear here so you can safely restore them.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trashFiles.map((file) => {
                const isRestoring = restoringId === file._id;
                const pathDisplay = file.relativePath || file.name;
                const deletedDate = file.deletedAt ? new Date(file.deletedAt).toLocaleString() : "Recently";
                const deletedUser = file.deletedBy?.name || file.deletedBy?.email || "Workspace collaborator";

                return (
                  <div
                    key={file._id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/50 hover:bg-slate-900/80 hover:border-slate-700 transition-all gap-4"
                  >
                    <div className="flex items-start min-w-0 flex-1">
                      {getFileIcon(file.name, file.isFolder)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-100 truncate">{file.name}</p>
                          {file.isFolder && (
                            <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-amber-500/15 text-amber-300 rounded border border-amber-500/30">
                              Folder
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate font-mono mt-0.5" title={pathDisplay}>
                          {pathDisplay}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-slate-500" />
                            <span>Deleted: {deletedDate}</span>
                          </span>
                          <span className="flex items-center gap-1 truncate">
                            <User size={11} className="text-slate-500" />
                            <span className="truncate">By: {deletedUser}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isReadOnly && (
                        <button
                          onClick={() => handleRestore(file)}
                          disabled={isRestoring || isActionInProgress}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/35 border border-indigo-500/30 transition-all cursor-pointer disabled:opacity-50"
                          title="Restore to workspace"
                        >
                          {isRestoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          <span>Restore</span>
                        </button>
                      )}

                      {!isReadOnly && isOwnerOrAdmin && (
                        <button
                          onClick={() => setDeletingFile(file)}
                          disabled={isRestoring || isActionInProgress}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Permanently delete item"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-900 bg-slate-950 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>Restoring a file automatically recovers any required ancestor folders.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Dialog for Permanent Deletion */}
      {deletingFile && (
        <ConfirmDialog
          title={`Permanently delete "${deletingFile.name}"?`}
          message="This action cannot be undone. The file and its version snapshots will be permanently removed from disk and database."
          confirmLabel="Delete Permanently"
          onConfirm={handlePermanentDelete}
          onCancel={() => setDeletingFile(null)}
          isDangerous={true}
        />
      )}

      {/* Confirmation Dialog for Empty Trash */}
      {showEmptyConfirm && (
        <ConfirmDialog
          title="Empty Entire Project Trash?"
          message={`Are you sure you want to permanently delete all ${trashFiles.length} item(s) in the trash? This action cannot be undone.`}
          confirmLabel="Empty Trash Now"
          onConfirm={handleEmptyTrash}
          onCancel={() => setShowEmptyConfirm(false)}
          isDangerous={true}
        />
      )}
    </div>
  );
};

export default TrashModal;
