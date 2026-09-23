// frontend/src/components/ProjectTerminal.jsx
// Responsibility: Render a persistent, interactive terminal session backed by
// the currently open project's workspace directory.

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Maximize2, Minimize2, Terminal, X } from "lucide-react";

export default function ProjectTerminal({ isOpen, onClose, socket, projectId, isMaximized, onToggleMaximize }) {
  const terminalElementRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalReadyRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !socket || !terminalElementRef.current) return undefined;

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      convertEol: true,
      fontFamily: "Cascadia Code, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#0c0e14",
        foreground: "#d1d5db",
        cursor: "#34d399",
        selectionBackground: "rgba(52, 211, 153, 0.25)",
        black: "#374151",
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
    terminal.open(terminalElementRef.current);
    fitAddon.fit();
    terminal.focus();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    let startRequested = false;
    const writeOutput = ({ data }) => terminal.write(data);
    const writeError = ({ message }) => terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
    const handleExit = ({ exitCode }) => terminal.writeln(`\r\n\x1b[33m[Terminal exited with code ${exitCode ?? "unknown"}]\x1b[0m`);
    const handleReady = () => {
      terminalReadyRef.current = true;
      terminal.focus();
    };
    const startTerminal = () => {
      if (startRequested || !socket.connected) return;
      startRequested = true;
      terminal.writeln("\x1b[90mStarting project terminal...\x1b[0m");
      socket.emit("project-terminal:start", {
        projectId,
        cols: terminal.cols,
        rows: terminal.rows,
      });
    };
    const handleConnect = () => {
      startRequested = false;
      terminalReadyRef.current = false;
      startTerminal();
    };
    const handleDisconnect = () => {
      startRequested = false;
      terminalReadyRef.current = false;
      terminal.writeln("\r\n\x1b[33m[Connection lost. Reconnecting terminal...]\x1b[0m");
    };

    socket.on("project-terminal-output", writeOutput);
    socket.on("project-terminal-error", writeError);
    socket.on("project-terminal-exit", handleExit);
    socket.on("project-terminal-ready", handleReady);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    if (socket.connected) {
      startTerminal();
    } else {
      terminal.writeln("\x1b[90mConnecting to project terminal...\x1b[0m");
    }

    const inputSubscription = terminal.onData((data) => {
      // cmd.exe receives stdin through a stream rather than a Windows TTY,
      // so it does not echo keys back to the browser. Echo ordinary typing
      // locally to make this behave like the command terminal users expect.
      if (data === "\r") {
        terminal.write("\r\n");
      } else if (data === "\u007f") {
        terminal.write("\b \b");
      } else if (!data.startsWith("\u001b") && !data.startsWith("\u0003")) {
        terminal.write(data);
      }
      socket.emit("project-terminal:input", { data });
    });
    const fitTerminal = () => {
      fitAddon.fit();
      socket.emit("project-terminal:resize", { cols: terminal.cols, rows: terminal.rows });
    };
    window.addEventListener("resize", fitTerminal);

    return () => {
      socket.emit("project-terminal:stop");
      socket.off("project-terminal-output", writeOutput);
      socket.off("project-terminal-error", writeError);
      socket.off("project-terminal-exit", handleExit);
      socket.off("project-terminal-ready", handleReady);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      window.removeEventListener("resize", fitTerminal);
      inputSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      terminalReadyRef.current = false;
    };
  }, [isOpen, socket, projectId]);

  useEffect(() => {
    if (!isOpen || !fitAddonRef.current) return undefined;
    const timeout = window.setTimeout(() => {
      fitAddonRef.current?.fit();
      terminalRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [isOpen, isMaximized]);

  if (!isOpen) return null;

  return (
    <div className={`fixed z-50 flex flex-col overflow-hidden border border-slate-700 bg-[#0c0e14] shadow-2xl ${
      isMaximized ? "inset-0" : "inset-x-4 bottom-4 h-80 rounded-xl"
    }`}>
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-emerald-400" />
          <div>
            <h2 className="text-xs font-semibold text-slate-100">Project Command Terminal</h2>
            <p className="text-[10px] text-slate-400">Interactive shell in this project folder</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleMaximize}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            title={isMaximized ? "Restore terminal" : "Maximize terminal"}
          >
            {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-400"
            title="Close terminal"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div
        ref={terminalElementRef}
        onClick={() => terminalRef.current?.focus()}
        className="min-h-0 flex-1 p-2"
      />
    </div>
  );
}
