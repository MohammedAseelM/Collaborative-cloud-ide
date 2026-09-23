// src/components/ScriptsModal.jsx
// Responsibility: Modal displaying available npm scripts from package.json with one-click execution.

import { useState, useEffect } from "react";
import { X, FileCode, Play, Loader2, RefreshCw } from "lucide-react";
import { getProjectScriptsRequest, runProjectScriptRequest } from "../services/reactProject.service";
import { useToast } from "../context/ToastContext";

export default function ScriptsModal({ isOpen, onClose, projectId, onRunScriptSuccess }) {
  const [scripts, setScripts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [runningScript, setRunningScript] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen && projectId) {
      loadScripts();
    }
  }, [isOpen, projectId]);

  const loadScripts = async () => {
    setIsLoading(true);
    try {
      const res = await getProjectScriptsRequest(projectId);
      setScripts(res.scripts || []);
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to load npm scripts.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunScript = async (scriptName) => {
    setRunningScript(scriptName);
    try {
      addToast(`Executing npm run ${scriptName}...`, "info");
      if (onRunScriptSuccess) onRunScriptSuccess();
      const res = await runProjectScriptRequest(projectId, scriptName);
      if (res.exitCode === 0) {
        addToast(`Script "${scriptName}" completed successfully!`, "success");
      } else {
        addToast(`Script "${scriptName}" exited with code ${res.exitCode}. Check terminal.`, "error");
      }
    } catch (err) {
      addToast(err.response?.data?.message || `Failed to run script "${scriptName}".`, "error");
    } finally {
      setRunningScript(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileCode size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Available npm Scripts</h2>
              <p className="text-xs text-slate-400">Scripts defined in your project's package.json</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadScripts}
              disabled={isLoading}
              title="Refresh scripts"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Loader2 size={24} className="animate-spin mb-2 text-emerald-400" />
              <span className="text-xs">Reading package.json scripts...</span>
            </div>
          ) : scripts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No npm scripts found in package.json.
            </div>
          ) : (
            <div className="space-y-2">
              {scripts.map((script) => (
                <div
                  key={script.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700/80 transition-colors group"
                >
                  <div className="min-w-0 mr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200 font-mono">
                        {script.name}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        npm run {script.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono truncate mt-0.5">
                      {script.command}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunScript(script.name)}
                    disabled={runningScript !== null}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-700/20"
                  >
                    {runningScript === script.name ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} fill="currentColor" />
                        <span>Run</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
