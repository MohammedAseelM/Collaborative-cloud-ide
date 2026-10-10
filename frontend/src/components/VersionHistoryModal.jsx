// src/components/VersionHistoryModal.jsx
// Responsibility: Dedicated, state-of-the-art Version History & Snapshot Management Modal.
// Features: Create project snapshot (name + description), snapshot list, inspect file tree
// and file contents, compare diffs, and restore with confirmation and real-time synchronization.

import { useState, useEffect, useCallback } from "react";
import {
  History,
  Camera,
  RotateCcw,
  Eye,
  FileCode,
  Folder,
  File,
  Clock,
  User,
  Plus,
  Loader2,
  X,
  AlertTriangle,
  GitCommit,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  Shield,
  Layers,
  ArrowLeft,
} from "lucide-react";
import {
  fetchVersions,
  fetchVersionDetails,
  saveVersionRequest,
  restoreVersionRequest,
} from "../services/project.service";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";

const getFileIcon = (fileName, isFolder) => {
  if (isFolder) return <Folder size={14} className="text-amber-400 shrink-0" />;
  const ext = fileName?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return <FileCode size={14} className="text-yellow-400 shrink-0" />;
    case "ts":
    case "tsx":
      return <FileCode size={14} className="text-blue-400 shrink-0" />;
    case "html":
      return <FileCode size={14} className="text-orange-400 shrink-0" />;
    case "css":
      return <FileCode size={14} className="text-sky-400 shrink-0" />;
    case "json":
      return <FileCode size={14} className="text-emerald-400 shrink-0" />;
    case "md":
      return <FileCode size={14} className="text-purple-400 shrink-0" />;
    default:
      return <File size={14} className="text-slate-400 shrink-0" />;
  }
};

export default function VersionHistoryModal({
  isOpen,
  onClose,
  projectId,
  userRole = "Editor",
  onRestored,
  onOpenDiff,
}) {
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Snapshot creation form state
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshotDesc, setSnapshotDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);

  // Snapshot inspection state
  const [inspectingVersion, setInspectingVersion] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedInspectFile, setSelectedInspectFile] = useState(null);

  // Restore confirmation dialog state
  const [versionToRestore, setVersionToRestore] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const { addToast } = useToast();
  const isReadOnly = userRole === "Viewer" || userRole === "Client";

  // Load all snapshots
  const loadSnapshots = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchVersions(projectId);
      setVersions(data.versions || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load project snapshots");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
      setIsCreateFormOpen(false);
      setInspectingVersion(null);
      setSelectedInspectFile(null);
    }
  }, [isOpen, loadSnapshots]);

  // Handle Snapshot Creation
  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (isReadOnly) {
      addToast("Viewers and Clients cannot create snapshots", "error");
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        name: snapshotName.trim() || undefined,
        description: snapshotDesc.trim() || undefined,
      };
      const res = await saveVersionRequest(projectId, payload);
      addToast(res.message || "Version snapshot saved successfully!", "success");
      setSnapshotName("");
      setSnapshotDesc("");
      setIsCreateFormOpen(false);
      await loadSnapshots();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save snapshot", "error");
    } finally {
      setIsCreating(false);
    }
  };

  // Inspect Snapshot (Tree & Contents)
  const handleInspectSnapshot = async (version) => {
    setIsLoadingDetails(true);
    setSelectedInspectFile(null);
    try {
      const res = await fetchVersionDetails(projectId, version._id);
      setInspectingVersion(res.version);
      if (res.version.files && res.version.files.length > 0) {
        const firstFile = res.version.files.find((f) => !f.isFolder);
        setSelectedInspectFile(firstFile || res.version.files[0]);
      }
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to load snapshot details", "error");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Restore Snapshot Confirmation
  const handleConfirmRestore = async () => {
    if (!versionToRestore) return;
    setIsRestoring(true);
    try {
      const res = await restoreVersionRequest(projectId, versionToRestore._id);
      addToast(
        res.message || `Restored to Version ${versionToRestore.versionNumber} successfully!`,
        "success"
      );
      setVersionToRestore(null);
      setInspectingVersion(null);
      await loadSnapshots();
      if (onRestored) onRestored();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to restore snapshot", "error");
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 select-none animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100"
        style={{ backgroundColor: "#0f131c", borderColor: "#1e2638" }}
      >
        {/* Modal Header Bar */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between shrink-0"
          style={{ backgroundColor: "#131824", borderColor: "#1e2638" }}
        >
          <div className="flex items-center gap-3">
            {inspectingVersion ? (
              <button
                onClick={() => setInspectingVersion(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            ) : (
              <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                <History size={18} />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {inspectingVersion
                    ? `Inspecting Snapshot v${inspectingVersion.versionNumber}: ${inspectingVersion.name || "Untitled"}`
                    : "Project Version History & Snapshots"}
                </h2>
                {!inspectingVersion && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    {versions.length} {versions.length === 1 ? "Snapshot" : "Snapshots"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {inspectingVersion
                  ? `Created by ${inspectingVersion.createdBy?.name || "Member"} on ${new Date(inspectingVersion.createdAt).toLocaleString()}`
                  : "Capture project milestones, inspect file hierarchy snapshots, and restore state safely."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!inspectingVersion && !isReadOnly && (
              <button
                onClick={() => setIsCreateFormOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Snapshot</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Version History"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-5">
          {/* Create Snapshot Drawer / Form */}
          {isCreateFormOpen && !inspectingVersion && !isReadOnly && (
            <form
              onSubmit={handleCreateSnapshot}
              className="p-4 rounded-xl border border-indigo-500/30 space-y-3.5 transition-all animate-in zoom-in-95 duration-150"
              style={{ backgroundColor: "#161b26" }}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Camera size={15} className="text-indigo-400" />
                  <span>Create Project Snapshot</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateFormOpen(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs p-1"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Snapshot Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Added User Authentication, Milestone v1.0"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Description / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Completed JWT tokens, socket mesh, and folder restructuring"
                    value={snapshotDesc}
                    onChange={(e) => setSnapshotDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Captures current file tree, folder hierarchy, and all file contents.</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateFormOpen(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow disabled:opacity-50 cursor-pointer"
                  >
                    {isCreating ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    <span>{isCreating ? "Saving Snapshot..." : "Save Snapshot"}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* VIEW 1: INSPECT SNAPSHOT FILE TREE & CONTENTS */}
          {inspectingVersion ? (
            <div className="space-y-4">
              <div
                className="p-3.5 rounded-xl border flex items-center justify-between gap-4"
                style={{ backgroundColor: "#161b26", borderColor: "#273142" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 shrink-0">
                    v{inspectingVersion.versionNumber}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">
                      {inspectingVersion.name || "Untitled Milestone"}
                    </h3>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {inspectingVersion.description || "No description provided."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenDiff && inspectingVersion.code && (
                    <button
                      onClick={() => onOpenDiff(inspectingVersion)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Compare Diff
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      onClick={() => setVersionToRestore(inspectingVersion)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>Restore This Version</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Split Viewer: Snapshot File Tree on Left, File Content on Right */}
              <div
                className="h-[380px] rounded-xl border flex overflow-hidden"
                style={{ backgroundColor: "#10141e", borderColor: "#202838" }}
              >
                {/* File Tree Column */}
                <div className="w-1/3 min-w-[220px] max-w-[280px] border-r border-slate-850 flex flex-col shrink-0">
                  <div className="px-3 py-2 border-b border-slate-850 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Snapshot Files ({inspectingVersion.files?.length || 0})</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
                    {!inspectingVersion.files || inspectingVersion.files.length === 0 ? (
                      <p className="p-3 text-[11px] text-slate-500 italic text-center">
                        Single-file legacy snapshot
                      </p>
                    ) : (
                      inspectingVersion.files.map((file, idx) => {
                        const isSelected = selectedInspectFile?.originalId === file.originalId || selectedInspectFile?.name === file.name;
                        return (
                          <div
                            key={idx}
                            onClick={() => !file.isFolder && setSelectedInspectFile(file)}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded transition-colors ${
                              file.isFolder ? "opacity-80" : "cursor-pointer"
                            } ${
                              isSelected
                                ? "bg-indigo-600/25 text-white font-semibold border-l-2 border-indigo-400"
                                : "text-slate-300 hover:bg-slate-850 hover:text-white"
                            }`}
                          >
                            {getFileIcon(file.name, file.isFolder)}
                            <span className="truncate text-xs">{file.relativePath || file.name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* File Content Preview Column */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
                  <div className="px-3 py-2 border-b border-slate-850 bg-slate-900/40 text-xs font-mono text-slate-300 flex items-center justify-between">
                    <span className="truncate font-semibold text-white">
                      {selectedInspectFile ? (selectedInspectFile.relativePath || selectedInspectFile.name) : "File Content"}
                    </span>
                    {selectedInspectFile && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {selectedInspectFile.content?.length || 0} characters
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-200 whitespace-pre leading-relaxed select-text">
                    {selectedInspectFile ? (
                      selectedInspectFile.content || (
                        <span className="text-slate-600 italic">Empty file</span>
                      )
                    ) : inspectingVersion.code ? (
                      inspectingVersion.code
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                        Select a file to view its contents in this snapshot
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW 2: SNAPSHOTS LIST */
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <p className="text-xs">Loading project snapshots...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <AlertTriangle size={24} className="text-rose-400" />
                  <p className="text-xs text-rose-300">{error}</p>
                  <button
                    onClick={loadSnapshots}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-700"
                  >
                    Retry
                  </button>
                </div>
              ) : versions.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-2xl"
                  style={{ backgroundColor: "#121622", borderColor: "#202838" }}
                >
                  <div className="p-3.5 rounded-full bg-slate-900 text-indigo-400 mb-3 border border-slate-800">
                    <Camera size={26} />
                  </div>
                  <h4 className="text-sm font-bold text-white">No version snapshots saved yet</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Create snapshots to preserve your project files and folder structure as milestones while developing.
                  </p>
                  {!isReadOnly && (
                    <button
                      onClick={() => setIsCreateFormOpen(true)}
                      className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Take First Snapshot</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((ver) => {
                    const isAutoBackup = ver.metadata?.isAutoRollbackBackup;
                    const dateFormatted = new Date(ver.createdAt).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                    const creatorName = ver.createdBy?.name || "Workspace member";

                    return (
                      <div
                        key={ver._id}
                        className="flex items-center justify-between p-4 rounded-xl border transition-all shadow-sm group hover:border-indigo-500/50 gap-4"
                        style={{
                          backgroundColor: "#161b26",
                          borderColor: isAutoBackup ? "#2d3748" : "#232c3d",
                        }}
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className="pt-0.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 text-xs font-mono font-bold rounded-md border ${
                                isAutoBackup
                                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                              }`}
                            >
                              v{ver.versionNumber}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4
                                className="text-sm font-bold tracking-wide truncate"
                                style={{ color: "#ffffff" }}
                              >
                                {ver.name || `Snapshot v${ver.versionNumber}`}
                              </h4>
                              {isAutoBackup && (
                                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                  Safety Rollback Backup
                                </span>
                              )}
                            </div>

                            {ver.description && (
                              <p
                                className="text-xs truncate font-medium mt-0.5"
                                style={{ color: "#cbd5e1" }}
                              >
                                {ver.description}
                              </p>
                            )}

                            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock size={12} className="text-slate-500" />
                                <span>{dateFormatted}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <User size={12} className="text-slate-500" />
                                <span>By: {creatorName}</span>
                              </span>
                              {(ver.totalFiles > 0 || ver.totalFolders > 0) && (
                                <span className="flex items-center gap-1 text-slate-400">
                                  <Layers size={12} className="text-indigo-400" />
                                  <span>
                                    {ver.totalFiles || 0} file{ver.totalFiles === 1 ? "" : "s"}
                                    {ver.totalFolders > 0 ? `, ${ver.totalFolders} folder${ver.totalFolders === 1 ? "" : "s"}` : ""}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleInspectSnapshot(ver)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                            title="Inspect snapshot files and folder tree"
                          >
                            <Eye size={13} />
                            <span className="hidden sm:inline">Inspect</span>
                          </button>

                          {onOpenDiff && ver.code && (
                            <button
                              onClick={() => onOpenDiff(ver)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                              title="Compare code diff with current editor"
                            >
                              Diff
                            </button>
                          )}

                          {!isReadOnly && (
                            <button
                              onClick={() => setVersionToRestore(ver)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                              title="Restore workspace to this snapshot state"
                            >
                              <RotateCcw size={13} />
                              <span className="hidden sm:inline">Restore</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Bar */}
        <div
          className="px-6 py-3 border-t flex items-center justify-between text-xs text-slate-400 shrink-0"
          style={{ backgroundColor: "#131824", borderColor: "#1e2638" }}
        >
          <span className="flex items-center gap-1.5">
            <Shield size={13} className="text-indigo-400" />
            <span>Restoring auto-creates a safety rollback snapshot to preserve undo capabilities.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Dialog for Snapshot Restoration */}
      {versionToRestore && (
        <ConfirmDialog
          isOpen={Boolean(versionToRestore)}
          title={`Restore to Snapshot v${versionToRestore.versionNumber}?`}
          message={`Are you sure you want to restore "${versionToRestore.name || `Snapshot v${versionToRestore.versionNumber}`}"? This will recover all files and folder hierarchy to this milestone. A safety backup of your current workspace will be created automatically.`}
          confirmLabel={isRestoring ? "Restoring..." : "Confirm & Restore"}
          confirmVariant="success"
          isLoading={isRestoring}
          onConfirm={handleConfirmRestore}
          onCancel={() => setVersionToRestore(null)}
        />
      )}
    </div>
  );
}
