// src/components/PackageManagerModal.jsx
// Responsibility: Manage npm packages (install, remove, update) for a React project.

import { useState, useEffect } from "react";
import { X, PackagePlus, PackageMinus, RefreshCw, Loader2, Boxes } from "lucide-react";
import {
  installPackageRequest,
  uninstallPackageRequest,
  updatePackagesRequest,
} from "../services/reactProject.service";
import { useToast } from "../context/ToastContext";

export default function PackageManagerModal({ isOpen, onClose, projectId, onPackageActionSuccess, initialTab = "add" }) {
  const [activeTab, setActiveTab] = useState(initialTab); // "add" | "remove" | "update"
  const [packageName, setPackageName] = useState("");
  const [packageVersion, setPackageVersion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setPackageName("");
      setPackageVersion("");
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleInstall = async (e) => {
    e.preventDefault();
    if (!packageName.trim()) return;

    setIsLoading(true);
    try {
      const res = await installPackageRequest(projectId, packageName.trim(), packageVersion.trim());
      addToast(res.message || `Package "${packageName.trim()}" installed successfully!`, "success");
      setPackageName("");
      setPackageVersion("");
      if (onPackageActionSuccess) onPackageActionSuccess();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.message || `Failed to install package "${packageName}"`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUninstall = async (e) => {
    e.preventDefault();
    if (!packageName.trim()) return;

    setIsLoading(true);
    try {
      const res = await uninstallPackageRequest(projectId, packageName.trim());
      addToast(res.message || `Package "${packageName.trim()}" removed successfully!`, "success");
      setPackageName("");
      if (onPackageActionSuccess) onPackageActionSuccess();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.message || `Failed to remove package "${packageName}"`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    setIsLoading(true);
    try {
      const res = await updatePackagesRequest(projectId);
      addToast(res.message || "Dependencies updated successfully!", "success");
      if (onPackageActionSuccess) onPackageActionSuccess();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to update dependencies", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Sync tab when opening modal
  const handleOpen = () => {
    setActiveTab(initialTab);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">NPM Package Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="mt-4 flex rounded-lg bg-slate-950 p-1">
          <button
            onClick={() => setActiveTab("add")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === "add"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <PackagePlus size={13} />
            <span>Add</span>
          </button>
          <button
            onClick={() => setActiveTab("remove")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === "remove"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <PackageMinus size={13} />
            <span>Remove</span>
          </button>
          <button
            onClick={() => setActiveTab("update")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === "update"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <RefreshCw size={13} />
            <span>Update All</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="mt-5">
          {activeTab === "add" && (
            <form onSubmit={handleInstall} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Package Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. axios, react-router-dom, lucide-react"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Version (optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. latest, ^1.6.0, 18.2.0"
                  value={packageVersion}
                  onChange={(e) => setPackageVersion(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Command: <code className="text-indigo-400">npm install {packageName ? (packageVersion ? `${packageName}@${packageVersion}` : packageName) : "<package>"}</code>
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !packageName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <PackagePlus size={13} />}
                  <span>Install</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === "remove" && (
            <form onSubmit={handleUninstall} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Package Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. axios"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                  autoFocus
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Command: <code className="text-rose-400">npm uninstall {packageName || "<package>"}</code>
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !packageName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <PackageMinus size={13} />}
                  <span>Remove</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === "update" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Run <code className="text-indigo-400">npm update</code> to update all outdated dependencies listed in package.json according to their semver range constraints.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  <span>Update Dependencies</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
