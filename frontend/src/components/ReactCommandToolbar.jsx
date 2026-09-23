// src/components/ReactCommandToolbar.jsx
// Responsibility: Render the streamlined React + Vite Project Command Panel.
// Cleanly displays status, primary runtime controls (Run/Stop/Restart/Build),
// quick package & script management, and an organized dropdown for secondary operations.

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Play,
  Square,
  RotateCw,
  Hammer,
  Eye,
  FileCode,
  Package,
  Trash2,
  RefreshCcw,
  ExternalLink,
  Loader2,
  Cpu,
  Hash,
  MoreHorizontal,
  Boxes,
} from "lucide-react";
import {
  installDependenciesRequest,
  runReactProjectRequest,
  stopReactProjectRequest,
  restartReactProjectRequest,
  buildReactProjectRequest,
  previewReactProjectRequest,
  resetReactProjectRequest,
  deleteReactProjectRequest,
  getNodeVersionRequest,
  getNpmVersionRequest,
} from "../services/reactProject.service";
import CreateReactModal from "./CreateReactModal";
import ScriptsModal from "./ScriptsModal";
import PackageManagerModal from "./PackageManagerModal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "../context/ToastContext";

export default function ReactCommandToolbar({
  projectId,
  serverStatus = "stopped",
  devServerPort = null,
  previewUrl = null,
  isReadOnly = false,
  isOwner = false,
  onOpenPreview,
  onRefreshFiles,
  onDeleteProject,
  onCreateProjectSuccess,
}) {
  const [actionLoading, setActionLoading] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isScriptsModalOpen, setIsScriptsModalOpen] = useState(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [packageModalTab, setPackageModalTab] = useState("add");
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const moreMenuRef = useRef(null);
  const { addToast } = useToast();

  const isRunning = serverStatus === "running";
  const isPreviewing = serverStatus === "previewing";
  const isInstalling = serverStatus === "installing";
  const isBuilding = serverStatus === "building";
  const isStarting = serverStatus === "starting";

  // Close "More" dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Install Dependencies
  const handleInstall = async () => {
    setActionLoading("install");
    try {
      addToast("Starting dependency installation (npm install)...", "info");
      const res = await installDependenciesRequest(projectId);
      if (res.success) {
        addToast("Dependencies installed successfully!", "success");
      } else {
        addToast("Dependency installation failed.", "error");
      }
      if (onRefreshFiles) onRefreshFiles();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to install dependencies.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Run Dev Server
  const handleRun = async () => {
    setActionLoading("run");
    try {
      const res = await runReactProjectRequest(projectId);
      addToast(`React dev server active on port ${res.port}!`, "success");
      if (onOpenPreview) onOpenPreview();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to start React dev server.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 3. Stop Server
  const handleStop = async () => {
    setActionLoading("stop");
    try {
      await stopReactProjectRequest(projectId);
      addToast("React server stopped.", "info");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to stop React server.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Restart Dev Server
  const handleRestart = async () => {
    setActionLoading("restart");
    try {
      const res = await restartReactProjectRequest(projectId);
      addToast(`React dev server restarted on port ${res.port}!`, "success");
      if (onOpenPreview) onOpenPreview();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to restart React dev server.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 5. Build Project
  const handleBuild = async () => {
    setActionLoading("build");
    try {
      addToast("Building React project for production (npm run build)...", "info");
      const res = await buildReactProjectRequest(projectId);
      if (res.exitCode === 0) {
        addToast("Build Successful! Output available in dist/", "success");
      } else {
        addToast("Build Failed.", "error");
      }
      if (onRefreshFiles) onRefreshFiles();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to build project.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 6. Preview Production Build
  const handlePreview = async () => {
    setActionLoading("preview");
    try {
      addToast("Starting production preview (npm run preview)...", "info");
      const res = await previewReactProjectRequest(projectId);
      addToast(`Preview server active on port ${res.port}!`, "success");
      if (onOpenPreview) onOpenPreview();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to start preview server.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 7. Check Node Version
  const handleCheckNode = async () => {
    setActionLoading("node");
    setIsMoreMenuOpen(false);
    try {
      const res = await getNodeVersionRequest(projectId);
      addToast(`Node.js: ${res.version || "Unknown"}`, "info");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to check Node.js version.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 8. Check npm Version
  const handleCheckNpm = async () => {
    setActionLoading("npm");
    setIsMoreMenuOpen(false);
    try {
      const res = await getNpmVersionRequest(projectId);
      addToast(`npm: ${res.version || "Unknown"}`, "info");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to check npm version.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 9. Reset Confirmation
  const handleResetConfirm = () => {
    setIsMoreMenuOpen(false);
    setConfirmDialog({
      title: "Reset Project?",
      message:
        "This will restore the project to its original React + Vite template and may remove your current changes. Are you sure you want to proceed?",
      isDestructive: true,
      onConfirm: async () => {
        setActionLoading("reset");
        setConfirmDialog(null);
        try {
          await resetReactProjectRequest(projectId);
          addToast("Project restored to original React + Vite template.", "success");
          if (onRefreshFiles) onRefreshFiles();
        } catch (err) {
          addToast(err.response?.data?.message || "Failed to reset project.", "error");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // 10. Delete Confirmation
  const handleDeleteConfirm = () => {
    setIsMoreMenuOpen(false);
    setConfirmDialog({
      title: "Delete Project?",
      message:
        "This will permanently remove the project and its files from the server. This action cannot be undone.",
      isDestructive: true,
      onConfirm: async () => {
        setActionLoading("delete");
        setConfirmDialog(null);
        try {
          await deleteReactProjectRequest(projectId);
          addToast("Project deleted successfully.", "success");
          if (onDeleteProject) onDeleteProject();
        } catch (err) {
          addToast(err.response?.data?.message || "Failed to delete project.", "error");
          setActionLoading(null);
        }
      },
    });
  };

  // Render Status Badge
  const renderStatusBadge = () => {
    if (isRunning) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Running {devServerPort ? `(:${devServerPort})` : ""}</span>
        </div>
      );
    }
    if (isPreviewing) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-800/80 text-sky-400 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span>Preview {devServerPort ? `(:${devServerPort})` : ""}</span>
        </div>
      );
    }
    if (isInstalling) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-800/80 text-amber-400 text-xs font-semibold">
          <Loader2 size={11} className="animate-spin text-amber-400" />
          <span>Installing...</span>
        </div>
      );
    }
    if (isBuilding) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-800/80 text-purple-400 text-xs font-semibold">
          <Loader2 size={11} className="animate-spin text-purple-400" />
          <span>Building...</span>
        </div>
      );
    }
    if (isStarting) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-950/80 border border-blue-800/80 text-blue-400 text-xs font-semibold">
          <Loader2 size={11} className="animate-spin text-blue-400" />
          <span>Starting...</span>
        </div>
      );
    }
    if (serverStatus === "error") {
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-800/80 text-rose-400 text-xs font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          <span>Error</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span>Stopped</span>
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-slate-900 bg-slate-950/90 px-3 py-1.5 backdrop-blur-md flex-wrap">
        {/* Left Side: Brand badge & Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Package size={14} className="text-indigo-400" />
            React
          </span>
          {renderStatusBadge()}
          {isRunning && onOpenPreview && (
            <button
              onClick={onOpenPreview}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors cursor-pointer"
              title="Open Live Preview"
            >
              <Eye size={12} />
              <span>Preview</span>
            </button>
          )}
        </div>

        {/* Right Side: Streamlined, Context-Aware Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Primary Action: Run / Stop / Restart */}
          {!isRunning && !isPreviewing ? (
            <button
              onClick={handleRun}
              disabled={isReadOnly || actionLoading !== null || isInstalling}
              title="Run React Dev Server (npm run dev)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-600/20"
            >
              {actionLoading === "run" ? (
                <Loader2 size={12} className="animate-spin text-white" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
              <span>Run Dev</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded border border-slate-800">
              <button
                onClick={handleStop}
                disabled={isReadOnly || actionLoading !== null}
                title="Stop dev server"
                className="flex items-center gap-1 px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "stop" ? (
                  <Loader2 size={12} className="animate-spin text-rose-400" />
                ) : (
                  <Square size={12} fill="currentColor" />
                )}
                <span>Stop</span>
              </button>

              <button
                onClick={handleRestart}
                disabled={isReadOnly || actionLoading !== null}
                title="Restart dev server"
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                {actionLoading === "restart" ? (
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                ) : (
                  <RotateCw size={12} />
                )}
                <span>Restart</span>
              </button>
            </div>
          )}

          {/* Quick Action: Install Dependencies */}
          <button
            onClick={handleInstall}
            disabled={isReadOnly || actionLoading !== null || isInstalling}
            title="Install dependencies (npm install)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
          >
            {actionLoading === "install" ? (
              <Loader2 size={12} className="animate-spin text-amber-400" />
            ) : (
              <Package size={12} className="text-amber-400" />
            )}
            <span>Install</span>
          </button>

          {/* Quick Action: Build for production */}
          <button
            onClick={handleBuild}
            disabled={isReadOnly || actionLoading !== null || isBuilding}
            title="Build for production (npm run build)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
          >
            {actionLoading === "build" ? (
              <Loader2 size={12} className="animate-spin text-purple-400" />
            ) : (
              <Hammer size={12} className="text-purple-400" />
            )}
            <span>Build</span>
          </button>

          {/* Quick Action: NPM Package Manager */}
          <button
            onClick={() => {
              setPackageModalTab("add");
              setIsPackageModalOpen(true);
            }}
            disabled={isReadOnly || actionLoading !== null}
            title="Manage npm packages (Add, Remove, Update)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Boxes size={12} className="text-emerald-400" />
            <span>Packages</span>
          </button>

          {/* Quick Action: npm Scripts */}
          <button
            onClick={() => setIsScriptsModalOpen(true)}
            title="View & run npm scripts from package.json"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            <FileCode size={12} className="text-teal-400" />
            <span>Scripts</span>
          </button>

          {/* Dropdown for Secondary / Infrequent Operations */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              title="More project actions"
            >
              <MoreHorizontal size={14} />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-2xl py-1 z-50 animate-fade-in">
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    setIsCreateModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Plus size={13} className="text-indigo-400" />
                  <span>New React Project</span>
                </button>

                <button
                  onClick={handlePreview}
                  disabled={isReadOnly || actionLoading !== null}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Eye size={13} className="text-sky-400" />
                  <span>Preview Prod Build</span>
                </button>

                <div className="my-1 border-t border-slate-800" />

                <button
                  onClick={handleCheckNode}
                  disabled={actionLoading !== null}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Cpu size={13} className="text-green-400" />
                  <span>Check Node Version</span>
                </button>

                <button
                  onClick={handleCheckNpm}
                  disabled={actionLoading !== null}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Hash size={13} className="text-red-400" />
                  <span>Check npm Version</span>
                </button>

                {isOwner && (
                  <>
                    <div className="my-1 border-t border-slate-800" />

                    <button
                      onClick={handleResetConfirm}
                      disabled={actionLoading !== null}
                      className="w-full text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <RefreshCcw size={13} />
                      <span>Reset to Template</span>
                    </button>

                    <button
                      onClick={handleDeleteConfirm}
                      disabled={actionLoading !== null}
                      className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Trash2 size={13} />
                      <span>Delete Project</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateReactModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateSuccess={(newProject) => {
          if (onCreateProjectSuccess) onCreateProjectSuccess(newProject);
          else if (onRefreshFiles) onRefreshFiles();
        }}
      />

      <PackageManagerModal
        isOpen={isPackageModalOpen}
        initialTab={packageModalTab}
        onClose={() => setIsPackageModalOpen(false)}
        projectId={projectId}
        onPackageActionSuccess={() => {
          if (onRefreshFiles) onRefreshFiles();
        }}
      />

      <ScriptsModal
        isOpen={isScriptsModalOpen}
        onClose={() => setIsScriptsModalOpen(false)}
        projectId={projectId}
      />

      {confirmDialog && (
        <ConfirmDialog
          isOpen={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.isDestructive ? "Confirm" : "Continue"}
          isDestructive={confirmDialog.isDestructive}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}
