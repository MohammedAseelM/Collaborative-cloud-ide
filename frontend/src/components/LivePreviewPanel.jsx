// frontend/src/components/LivePreviewPanel.jsx
// Responsibility: Render an interactive iframe live preview panel for running dev servers,
// complete with status badges, viewport controls, address bar, and server lifecycle buttons.

import React, { useState } from "react";
import {
  Play,
  Square,
  RotateCw,
  ExternalLink,
  RefreshCw,
  Monitor,
  Smartphone,
  Tablet,
  Loader2,
  AlertTriangle,
  Globe,
  Sparkles,
} from "lucide-react";

export default function LivePreviewPanel({
  previewUrl,
  serverStatus = "stopped", // "stopped" | "installing" | "starting" | "running" | "error"
  port = null,
  projectType = "general",
  previewHtml = "",
  onStartServer,
  onStopServer,
  onRestartServer,
}) {
  const [viewportMode, setViewportMode] = useState("desktop"); // "desktop" | "tablet" | "mobile"
  const [iframeKey, setIframeKey] = useState(0);

  const handleRefreshIframe = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenPreview = () => {
    if (previewHtml) {
      const previewUrl = URL.createObjectURL(new Blob([previewHtml], { type: "text/html" }));
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
      return;
    }

    if (activeUrl) window.open(activeUrl, "_blank", "noopener,noreferrer");
  };

  const activeUrl = previewUrl || (port ? `http://localhost:${port}` : "");

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-900 overflow-hidden select-none">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-900 bg-slate-950/80 shrink-0">
        {/* Left: Controls & Status */}
        <div className="flex items-center space-x-2">
          {serverStatus === "running" ? (
            <>
              <button
                onClick={onStopServer}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg transition-all cursor-pointer"
                title="Stop Development Server"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
              <button
                onClick={onRestartServer}
                className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Restart Server"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          ) : serverStatus === "installing" || serverStatus === "starting" ? (
            <div className="flex items-center space-x-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded-lg text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{serverStatus === "installing" ? "Installing npm modules..." : "Starting server..."}</span>
            </div>
          ) : (
            <button
              onClick={onStartServer}
              className="flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm shadow-emerald-600/30 transition-all cursor-pointer"
              title="Start Development Server"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Server</span>
            </button>
          )}

          {/* Status Badge */}
          {serverStatus === "running" && (
            <span className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Port :{port || 5173}</span>
            </span>
          )}
        </div>

        {/* Middle: Address bar */}
        {(activeUrl || previewHtml) && serverStatus === "running" && (
          <div className="flex-1 max-w-sm flex items-center space-x-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate flex-1 font-mono text-[11px]">{activeUrl || "In-memory project preview"}</span>
            <button
              onClick={handleRefreshIframe}
              className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 cursor-pointer"
              title="Refresh Preview"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={handleOpenPreview}
              className="text-slate-400 hover:text-cyan-300 transition-colors p-0.5 cursor-pointer"
              title="Open in New Tab"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Right: Viewport Mode Toggles */}
        <div className="flex items-center space-x-1 bg-slate-900 p-0.5 border border-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setViewportMode("desktop")}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewportMode === "desktop" ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title="Desktop View (Full Width)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewportMode("tablet")}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewportMode === "tablet" ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title="Tablet View (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewportMode("mobile")}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewportMode === "mobile" ? "bg-slate-800 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title="Mobile View (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Preview Frame Canvas */}
      <div className="flex-1 bg-slate-950 flex items-center justify-center p-2 overflow-auto min-h-0">
        {serverStatus === "running" && (activeUrl || previewHtml) ? (
          <div
            className={`h-full bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${
              viewportMode === "mobile"
                ? "w-[375px] max-h-[667px] border-4 border-slate-800"
                : viewportMode === "tablet"
                ? "w-[768px] max-h-[1024px] border-4 border-slate-800"
                : "w-full h-full border border-slate-800"
            }`}
          >
            <iframe
              key={iframeKey}
              src={previewHtml ? undefined : activeUrl}
              srcDoc={previewHtml || undefined}
              title="Live App Preview"
              className="w-full h-full border-none bg-white"
              sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            />
          </div>
        ) : serverStatus === "installing" || serverStatus === "starting" ? (
          <div className="flex flex-col items-center justify-center space-y-4 p-8 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-200">
                {serverStatus === "installing"
                  ? "Installing Project Dependencies..."
                  : "Launching Development Server..."}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Check the integrated terminal panel below for real-time compilation and stdout logs.
              </p>
            </div>
          </div>
        ) : serverStatus === "error" ? (
          <div className="flex flex-col items-center justify-center space-y-3 p-8 text-center max-w-md">
            <div className="p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-200">Server Startup Failed</h4>
              <p className="text-xs text-slate-400 mt-1">
                An error occurred while installing dependencies or executing the startup command. Review terminal logs for details.
              </p>
            </div>
            <button
              onClick={onStartServer}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry Start Server</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 p-8 text-center max-w-md">
            <div className="p-4 rounded-full bg-slate-900 border border-slate-800 text-slate-500">
              <Globe className="w-10 h-10" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-200">Live Application Preview</h4>
              <p className="text-xs text-slate-400 mt-1">
                Run complete framework applications (React, Vite, Next.js, Express, Python, Java) with hot reloading.
              </p>
            </div>
            <button
              onClick={onStartServer}
              className="flex items-center space-x-2 px-5 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Development Server</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
