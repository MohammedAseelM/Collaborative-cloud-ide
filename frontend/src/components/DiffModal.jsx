// src/components/DiffModal.jsx
// Responsibility: Render a premium side-by-side git diff interface
// comparing two code blocks using Monaco DiffEditor.

import { X } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "../context/ThemeContext";

const DiffModal = ({ isOpen, onClose, originalCode, modifiedCode, title = "Compare Changes" }) => {
  const { monacoTheme } = useTheme();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-pointer"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[80vh] flex flex-col rounded-lg border border-slate-800 bg-slate-900 shadow-2xl z-10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4 shrink-0 bg-slate-900/60">
          <div>
            <h2 className="text-lg font-medium text-slate-100">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Original Version (Left) vs. Modified Current Version (Right)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close diff viewer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Diff Editor Pane */}
        <div className="flex-1 bg-slate-950 min-h-0 relative">
          <DiffEditor
            original={originalCode || ""}
            modified={modifiedCode || ""}
            language="javascript" // Monaco diff inherits syntax highlighting
            theme={monacoTheme}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollbar: {
                vertical: "visible",
                horizontal: "visible",
              },
              fontSize: 13,
              fontFamily: "Fira Code, JetBrains Mono, Monaco, Courier New, monospace",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DiffModal;
