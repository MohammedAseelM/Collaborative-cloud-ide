// frontend/src/components/ProjectTerminal.jsx
// Responsibility: Render a professional, collapsible, interactive terminal panel
// similar to VS Code, connected to the active project workspace.

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  Terminal,
  Maximize2,
  Minimize2,
  X,
  RotateCcw,
  Trash2,
  Square,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Box,
} from "lucide-react";

export default function ProjectTerminal({
  isOpen,
  onClose,
  socket,
  projectId,
  projectName = "Workspace",
  height = 240,
  onHeightChange,
  isMaximized = false,
  onToggleMaximize,
}) {
  const terminalElementRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const resizeDragRef = useRef({ isDragging: false, startY: 0, startHeight: 240 });

  // Only instantiate XTerm once the user opens the panel for the first time
  const [hasMountedOnce, setHasMountedOnce] = useState(false);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const [connectionStatus, setConnectionStatus] = useState("connecting"); // "connecting" | "connected" | "disconnected" | "error"
  const [errorMessage, setErrorMessage] = useState("");
  const [serverMode, setServerMode] = useState("host-pipe"); // "docker-tty" | "host-pipe"
  const [isolationInfo, setIsolationInfo] = useState({
    isolation: "restricted-workspace",
    dockerAvailable: false,
    blocker: null,
  });

  // Track initial open
  useEffect(() => {
    if (isOpen) {
      setHasMountedOnce(true);
    }
  }, [isOpen]);

  // Resize drag handler
  const handleMouseDownResize = (e) => {
    e.preventDefault();
    resizeDragRef.current = {
      isDragging: true,
      startY: e.clientY,
      startHeight: height,
    };

    const handleMouseMove = (moveEvent) => {
      if (!resizeDragRef.current.isDragging) return;
      const deltaY = resizeDragRef.current.startY - moveEvent.clientY;
      const nextHeight = Math.min(Math.max(resizeDragRef.current.startHeight + deltaY, 120), 600);
      onHeightChange?.(nextHeight);
    };

    const handleMouseUp = () => {
      resizeDragRef.current.isDragging = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      fitAddonRef.current?.fit();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleClear = () => {
    terminalRef.current?.clear();
    terminalRef.current?.focus();
  };

  const handleStop = useCallback(() => {
    if (!socket) return;
    socket.emit("project-terminal:stop");
    setConnectionStatus("disconnected");
    terminalRef.current?.writeln("\r\n\x1b[33m[Session stopped by user]\x1b[0m\r\n");
  }, [socket]);

  const handleRestart = useCallback(() => {
    if (!socket || !projectId) return;
    setConnectionStatus("connecting");
    setErrorMessage("");
    terminalRef.current?.clear();
    terminalRef.current?.writeln("\x1b[90mConnecting to project terminal session...\x1b[0m\r\n");
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("project-terminal:stop");
    socket.emit("project-terminal:start", {
      projectId,
      cols: terminalRef.current?.cols || 80,
      rows: terminalRef.current?.rows || 24,
    });
  }, [socket, projectId]);

  // Main terminal initialization lifecycle
  useEffect(() => {
    if (!hasMountedOnce || !socket || !projectId || !terminalElementRef.current) return undefined;

    setConnectionStatus(socket.connected ? "connecting" : "disconnected");

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      convertEol: true,
      scrollback: 1000,
      fontFamily: "'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.25,
      theme: {
        background: "#0c0e14",
        foreground: "#d1d5db",
        cursor: "#34d399",
        selectionBackground: "rgba(52, 211, 153, 0.25)",
        black: "#1f2937",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#f3f4f6",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Clean DOM node before mounting new XTerm instance
    if (terminalElementRef.current) {
      terminalElementRef.current.innerHTML = "";
    }
    terminal.open(terminalElementRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const initFitTimeout = setTimeout(() => {
      try {
        fitAddon.fit();
        if (isOpenRef.current) terminal.focus();
      } catch {}
    }, 50);

    let currentServerMode = "host-pipe";

    const handleReady = ({
      mode = "host-pipe",
      isolation = "restricted-workspace",
      dockerAvailable = false,
      blocker = null,
    } = {}) => {
      currentServerMode = mode;
      setServerMode(mode);
      setIsolationInfo({ isolation, dockerAvailable, blocker });
      setConnectionStatus("connected");
      setErrorMessage("");
      if (isOpenRef.current) terminal.focus();
    };

    const writeOutput = ({ data }) => {
      terminal.write(data);
    };

    const writeError = ({ message, blocker }) => {
      setConnectionStatus("error");
      const errText = message || "Terminal error occurred";
      setErrorMessage(errText);
      terminal.writeln(`\r\n\x1b[1;31m[Error] ${errText}\x1b[0m`);
      if (blocker) {
        terminal.writeln(`\x1b[90m[Blocker details] ${blocker}\x1b[0m\r\n`);
      }
    };

    const handleExit = ({ exitCode, stoppedByUser }) => {
      setConnectionStatus("disconnected");
      if (stoppedByUser) {
        terminal.writeln("\r\n\x1b[33m[Session stopped by user]\x1b[0m\r\n");
      } else {
        terminal.writeln(`\r\n\x1b[33m[Session exited with code ${exitCode ?? 0}]\x1b[0m\r\n`);
      }
    };

    const handleSocketConnect = () => {
      setConnectionStatus("connecting");
      terminal.writeln("\x1b[90mConnected to server. Starting terminal...\x1b[0m\r\n");
      socket.emit("project-terminal:start", {
        projectId,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
      });
    };

    const handleSocketDisconnect = () => {
      setConnectionStatus("disconnected");
      terminal.writeln("\r\n\x1b[33m[Connection lost. Waiting to reconnect...]\x1b[0m\r\n");
    };

    socket.on("project-terminal-ready", handleReady);
    socket.on("project-terminal-output", writeOutput);
    socket.on("project-terminal-error", writeError);
    socket.on("project-terminal-exit", handleExit);
    socket.on("connect", handleSocketConnect);
    socket.on("disconnect", handleSocketDisconnect);

    if (socket.connected) {
      terminal.writeln("\x1b[90mConnecting to project terminal session...\x1b[0m");
      socket.emit("project-terminal:start", {
        projectId,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
      });
    } else {
      terminal.writeln("\x1b[90mWaiting for workspace connection...\x1b[0m");
    }

    const inputSubscription = terminal.onData((data) => {
      // In host-pipe mode (cmd.exe or sh raw pipe), the shell does not echo
      // keys back to stdout, so echo typing locally. In docker-tty mode,
      // the container PTY handles echo automatically.
      if (currentServerMode === "host-pipe") {
        if (data === "\r") {
          terminal.write("\r\n");
        } else if (data === "\u007f") {
          terminal.write("\b \b");
        } else if (data === "\u0003") {
          terminal.write("^C\r\n");
        } else if (!data.startsWith("\u001b")) {
          terminal.write(data);
        }
      }
      socket.emit("project-terminal:input", { data });
    });

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
        socket.emit("project-terminal:resize", { cols: terminal.cols, rows: terminal.rows });
      } catch {}
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      clearTimeout(initFitTimeout);
      socket.emit("project-terminal:stop");
      socket.off("project-terminal-ready", handleReady);
      socket.off("project-terminal-output", writeOutput);
      socket.off("project-terminal-error", writeError);
      socket.off("project-terminal-exit", handleExit);
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      window.removeEventListener("resize", handleWindowResize);
      inputSubscription.dispose();
      terminal.dispose();
      if (terminalElementRef.current) {
        terminalElementRef.current.innerHTML = "";
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [hasMountedOnce, socket, projectId]);

  // Re-fit on height or maximized or open state change
  useEffect(() => {
    if (!isOpen || !fitAddonRef.current) return undefined;
    const timeout = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
        socket?.emit("project-terminal:resize", {
          cols: terminalRef.current?.cols,
          rows: terminalRef.current?.rows,
        });
      } catch {}
    }, 60);
    return () => clearTimeout(timeout);
  }, [isOpen, height, isMaximized, socket]);

  // If the terminal has never been opened yet, do not render or consume resources
  if (!hasMountedOnce) return null;

  return (
    <div
      style={{ height: isMaximized ? "100%" : `${height}px` }}
      className={`flex flex-col border-t border-slate-800 bg-[#0c0e14] text-slate-200 select-none transition-all z-20 shrink-0 ${
        isMaximized ? "absolute inset-0 z-30" : "relative"
      } ${isOpen ? "flex" : "hidden"}`}
    >
      {/* Top Interactive Resize Handle (when not maximized) */}
      {!isMaximized && (
        <div
          onMouseDown={handleMouseDownResize}
          className="h-1.5 w-full cursor-row-resize bg-slate-900 hover:bg-indigo-500/80 active:bg-indigo-500 transition-colors shrink-0 flex items-center justify-center"
          title="Drag to resize terminal panel"
        >
          <div className="h-0.5 w-10 rounded-full bg-slate-700" />
        </div>
      )}

      {/* Terminal Header Toolbar */}
      <header className="flex h-8 items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-3 text-xs shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Terminal size={14} className="text-emerald-400 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-[180px]" title={projectName}>
              {projectName}
            </span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Connection Status Badge */}
          <div className="flex items-center gap-1.5 text-[11px]">
            {connectionStatus === "connecting" && (
              <span className="flex items-center gap-1 text-amber-400">
                <Loader2 size={12} className="animate-spin" />
                <span>Connecting</span>
              </span>
            )}
            {connectionStatus === "connected" && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected</span>
              </span>
            )}
            {connectionStatus === "disconnected" && (
              <button
                type="button"
                onClick={handleRestart}
                className="flex items-center gap-1 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
                title="Click to reconnect terminal session"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                <span>Disconnected (Reconnect)</span>
              </button>
            )}
            {connectionStatus === "error" && (
              <button
                type="button"
                onClick={handleRestart}
                className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                title={errorMessage || "Click to retry"}
              >
                <AlertCircle size={12} />
                <span className="truncate max-w-[140px]">{errorMessage || "Error (Retry)"}</span>
              </button>
            )}
          </div>

          {/* Sandbox Status Badge */}
          {connectionStatus === "connected" && (
            <>
              <span className="text-slate-700 hidden sm:inline">|</span>
              {serverMode === "docker-tty" || isolationInfo.dockerAvailable ? (
                <span
                  className="hidden sm:flex items-center gap-1 rounded bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 text-[10px] text-emerald-300 font-medium"
                  title="Docker Sandbox container active (isolated workspace, restricted cgroups, non-root)"
                >
                  <Box size={11} className="text-emerald-400" />
                  <span>Docker Sandbox</span>
                </span>
              ) : (
                <span
                  className="hidden sm:flex items-center gap-1 rounded bg-amber-950/70 border border-amber-800/60 px-1.5 py-0.5 text-[10px] text-amber-300 font-medium"
                  title={isolationInfo.blocker || "Docker engine unavailable. Running in workspace directory with sanitized environment."}
                >
                  <ShieldAlert size={11} className="text-amber-400" />
                  <span>Host Fallback</span>
                </span>
              )}
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
            title="Clear terminal output (Ctrl+L)"
          >
            <Trash2 size={12} />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            type="button"
            onClick={handleStop}
            disabled={connectionStatus !== "connected"}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Stop running terminal session"
          >
            <Square size={12} />
            <span className="hidden sm:inline">Stop</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-indigo-300 transition-colors cursor-pointer"
            title="Restart terminal session"
          >
            <RotateCcw size={12} />
            <span className="hidden sm:inline">Restart</span>
          </button>

          <button
            type="button"
            onClick={onToggleMaximize}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer"
            title={isMaximized ? "Restore terminal height" : "Maximize terminal"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition-colors cursor-pointer ml-1"
            title="Close terminal"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* XTerm Element Area */}
      <div
        ref={terminalElementRef}
        onClick={() => terminalRef.current?.focus()}
        className="min-h-0 flex-1 overflow-hidden p-1.5"
      />
    </div>
  );
}
