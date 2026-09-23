import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import io from 'socket.io-client';
import { TerminalSquare, X, Maximize2, Minimize2 } from 'lucide-react';

function Terminal({ isOpen, onClose, onToggleMaximize, isMaximized, projectPath }) {
  const termRef = useRef(null);
  const xtermRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const xterm = new XTerm({
      theme: {
        background: '#0c0e14',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0c0e14',
        selectionBackground: 'rgba(56, 139, 253, 0.3)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39d2c0',
        white: '#c9d1d9',
      },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
    });

    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);

    xterm.open(termRef.current);
    fitAddon.fit();

    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.startsWith("http")
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, "")
        : import.meta.env.MODE === "development"
        ? "http://localhost:5000"
        : window.location.origin);

    const socket = io(`${socketUrl}/terminal`, {
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('terminal:start', { cols: xterm.cols, rows: xterm.rows, projectPath });
    });

    socket.on('terminal:output', (data) => {
      xterm.write(data);
    });

    xterm.onData((data) => {
      socket.emit('terminal:input', data);
    });

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal:resize', { cols: xterm.cols, rows: xterm.rows });
    };
    window.addEventListener('resize', handleResize);

    socket.on('terminal:exit', () => {
      xterm.write('\r\n\x1b[1;31m[Process exited]\x1b[0m\r\n');
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
      socket.disconnect();
      xtermRef.current = null;
      socketRef.current = null;
      fitAddonRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !fitAddonRef.current) return;

    const timeout = setTimeout(() => {
      fitAddonRef.current?.fit();
    }, 100);

    return () => clearTimeout(timeout);
  }, [isOpen, isMaximized]);

  if (!isOpen) return null;

  return (
    <div className={`flex flex-col bg-[#0c0e14] border-t border-slate-800 ${isMaximized ? 'fixed inset-0 z-50' : 'h-64'}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare size={14} className="text-emerald-400" />
          <span className="text-xs font-medium text-slate-300">Terminal</span>
          <span className="text-[10px] text-slate-500 font-mono">powershell</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMaximize}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            title="Close terminal"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      {/* Terminal container */}
      <div ref={termRef} className="flex-1 p-1 overflow-hidden" />
    </div>
  );
}

export default Terminal;
