// src/components/CreateReactModal.jsx
// Responsibility: Modal dialog allowing users to create a new React + Vite project.

import { useState } from "react";
import { X, Sparkles, Loader2, Layers } from "lucide-react";
import { createReactProjectRequest } from "../services/reactProject.service";
import { useToast } from "../context/ToastContext";

export default function CreateReactModal({ isOpen, onClose, onCreateSuccess }) {
  const [projectName, setProjectName] = useState("");
  const [template, setTemplate] = useState("react-vite");
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = projectName.trim().toLowerCase();
    if (!trimmed) {
      addToast("Please provide a project name.", "error");
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed)) {
      addToast("Use lowercase letters, numbers, and hyphens (e.g. my-app).", "error");
      return;
    }

    setIsLoading(true);
    try {
      const res = await createReactProjectRequest(trimmed);
      addToast(`React project "${trimmed}" created successfully!`, "success");
      setProjectName("");
      if (onCreateSuccess) onCreateSuccess(res.project);
      onClose();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to create React project.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles size={18} />
            </div>
            <h2 className="text-base font-semibold text-slate-100">Create React Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="my-react-app"
              required
              disabled={isLoading}
              autoFocus
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">
              Equivalent to: <code className="text-slate-400">npm create vite@latest &lt;project-name&gt; -- --template react</code>
            </p>
          </div>

          {/* Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Template
            </label>
            <div className="relative">
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                disabled={isLoading}
                className="w-full appearance-none px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
              >
                <option value="react-vite">React + Vite (JavaScript)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <Layers size={14} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !projectName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
