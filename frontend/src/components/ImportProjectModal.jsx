// frontend/src/components/ImportProjectModal.jsx
// Responsibility: Modal UI allowing users to select or drag & drop local folders,
// auto-detect project types, fill project metadata, and trigger atomic project imports.

import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderUp,
  FileUp,
  Upload,
  Folder,
  FileCode,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  scanDirectoryHandle,
  filterImportFiles,
  importProject,
  importIntoProject,
} from "../services/importService.js";
import { detectFrameworkType } from "../utils/languageDetector.js";

export default function ImportProjectModal({
  isOpen,
  onClose,
  targetProjectId = null,
  targetParentId = null,
  onSuccess,
}) {
  const navigate = useNavigate();
  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const singleFileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState("folder"); // "folder" | "files" | "single"
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [detectedFramework, setDetectedFramework] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  if (!isOpen) return null;

  const handleFilesSelected = (files) => {
    setError(null);
    const clean = filterImportFiles(files);

    if (clean.length === 0) {
      setError("No valid source files found in selected upload.");
      return;
    }

    setSelectedFiles(clean);
    const framework = detectFrameworkType(clean);
    setDetectedFramework(framework);

    // Auto-prefill project name from root folder or first file if not set
    if (!projectName && !targetProjectId) {
      const firstPath = clean[0]?.webkitRelativePath || clean[0]?.name || "";
      const topFolder = firstPath.split("/")[0];
      if (topFolder && topFolder !== clean[0]?.name) {
        setProjectName(topFolder);
      } else {
        const baseName = (clean[0]?.name || "Imported Project").replace(/\.[^/.]+$/, "");
        setProjectName(baseName);
      }
    }
  };

  // Browser Native File System Access API (showDirectoryPicker)
  const handleDirectoryPicker = async () => {
    try {
      if ("showDirectoryPicker" in window) {
        const dirHandle = await window.showDirectoryPicker();
        const scannedFiles = await scanDirectoryHandle(dirHandle, dirHandle.name);
        if (!projectName) setProjectName(dirHandle.name);
        handleFilesSelected(scannedFiles);
      } else if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(`Folder selection failed: ${err.message}`);
      }
    }
  };

  const handleFolderInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const droppedFiles = [];

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            await scanEntry(entry, "", droppedFiles);
          } else {
            const file = item.getAsFile();
            if (file) droppedFiles.push(file);
          }
        }
      }
    } else if (e.dataTransfer.files) {
      droppedFiles.push(...Array.from(e.dataTransfer.files));
    }

    handleFilesSelected(droppedFiles);
  };

  // Helper to scan DataTransferFileSystemEntry recursively
  const scanEntry = async (entry, pathPrefix = "", fileList = []) => {
    const currentPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => {
          Object.defineProperty(file, "webkitRelativePath", {
            value: currentPath,
            writable: true,
          });
          fileList.push(file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const entries = await new Promise((resolve) => {
        dirReader.readEntries((results) => resolve(results));
      });
      for (const childEntry of entries) {
        if (["node_modules", ".git", "dist", "build", ".next", "__pycache__"].includes(childEntry.name)) {
          continue;
        }
        await scanEntry(childEntry, currentPath, fileList);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (selectedFiles.length === 0) {
      setError("Please select a local folder or files to import.");
      return;
    }

    if (!targetProjectId && (!projectName || projectName.trim().length < 2)) {
      setError("Please specify a project name (at least 2 characters).");
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      if (targetProjectId) {
        // Append into existing project
        const res = await importIntoProject(targetProjectId, selectedFiles, targetParentId, setProgress);
        setSuccessMessage(`Imported ${res.createdFilesCount} files successfully!`);
        setTimeout(() => {
          setIsUploading(false);
          if (onSuccess) onSuccess(res);
          onClose();
        }, 1000);
      } else {
        // Create new project & import
        const res = await importProject(
          {
            name: projectName.trim(),
            description: description.trim(),
            files: selectedFiles,
          },
          setProgress
        );

        setSuccessMessage("Project created and imported successfully! Opening workspace...");
        setTimeout(() => {
          setIsUploading(false);
          onClose();
          navigate(`/workspace/${res.project._id}`);
        }, 1200);
      }
    } catch (err) {
      setIsUploading(false);
      const errMsg = err.response?.data?.message || err.message || "Failed to import project";
      setError(errMsg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <FolderUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-100">
                {targetProjectId ? "Import Files into Workspace" : "Import Project to Cloud IDE"}
              </h3>
              <p className="text-xs text-slate-400">
                Upload single files, multiple files, or complete local project folders.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tabs */}
          <div className="flex bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("folder")}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-all ${
                activeTab === "folder"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Folder className="w-4 h-4" />
              <span>Complete Folder</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("files")}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-all ${
                activeTab === "files"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileUp className="w-4 h-4" />
              <span>Multiple Files</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("single")}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-all ${
                activeTab === "single"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>Single File</span>
            </button>
          </div>

          {/* Hidden inputs */}
          <input
            type="file"
            ref={folderInputRef}
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
            onChange={handleFolderInputChange}
          />
          <input
            type="file"
            ref={filesInputRef}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
          />
          <input
            type="file"
            ref={singleFileInputRef}
            className="hidden"
            onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
          />

          {/* Dropzone Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (activeTab === "folder") handleDirectoryPicker();
              else if (activeTab === "files") filesInputRef.current?.click();
              else singleFileInputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-cyan-400 bg-cyan-500/10 scale-[1.01]"
                : selectedFiles.length > 0
                ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                : "border-slate-700 hover:border-slate-500 bg-slate-950/40"
            }`}
          >
            {selectedFiles.length > 0 ? (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-base font-medium text-slate-100">
                    {selectedFiles.length} source file(s) selected
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click or drag new files to replace selection.
                  </p>
                </div>
                {detectedFramework && (
                  <div
                    className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold border ${detectedFramework.badgeColor}`}
                  >
                    <span>{detectedFramework.icon}</span>
                    <span>Detected: {detectedFramework.name}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-base font-medium text-slate-200">
                    {activeTab === "folder"
                      ? "Click to choose a folder or drag & drop here"
                      : activeTab === "files"
                      ? "Click to select files or drag & drop here"
                      : "Click to select a file"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports React, Node.js, Python, Java, C/C++, TypeScript, and nested directories.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Project Details Form (When creating a new project) */}
          {!targetProjectId && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Project Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. My React App"
                  disabled={isUploading}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Description <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of the imported workspace..."
                  rows={2}
                  disabled={isUploading}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="flex items-center space-x-3 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="flex items-center space-x-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Uploading and parsing project hierarchy...</span>
                </span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800/80 bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isUploading || selectedFiles.length === 0}
            className="flex items-center space-x-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{targetProjectId ? "Import Files" : "Import & Create Project"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
