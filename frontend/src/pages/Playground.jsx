// src/pages/Playground.jsx
// Responsibility: Render a standalone, multi-language Online Compiler Playground.

import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Play, Loader2, Terminal, ChevronRight, LayoutDashboard, Settings, Code2, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { runStandaloneCodeRequest } from "../services/project.service";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import Sidebar from "../components/Sidebar";

const starterTemplates = {
  javascript: `// JavaScript Online Playground\nconsole.log("Hello, World!");\n`,
  python: `# Python Online Playground\nprint("Hello, World!")\n`,
  java: `// Java Online Playground\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n`,
  cpp: `// C++ Online Playground\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, C++ World!" << endl;\n    return 0;\n}\n`,
  c: `// C Online Playground\n#include <stdio.h>\n\nint main() {\n    printf("Hello, C World!\\n");\n    return 0;\n}\n`,
  typescript: `// TypeScript Online Playground\nconst greeting: string = "Hello, TypeScript!";\nconsole.log(greeting);\n`,
};

const Playground = () => {
  const { monacoTheme } = useTheme();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(starterTemplates.javascript);
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [compileError, setCompileError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const editorRef = useRef(null);

  // Sync editor value when language is switched
  useEffect(() => {
    setCode(starterTemplates[language]);
    if (editorRef.current) {
      editorRef.current.setValue(starterTemplates[language]);
    }
  }, [language]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  const handleRunCode = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setStdout("");
    setStderr("");
    setCompileError("");

    const currentCode = editorRef.current ? editorRef.current.getValue() : code;

    try {
      addToast("Executing compiler task...", "info");
      const result = await runStandaloneCodeRequest(currentCode, stdin, language);

      if (result.compileError) {
        setCompileError(result.compileError);
        addToast("Compilation failed", "error");
      } else if (result.stderr) {
        setStderr(result.stderr);
        addToast("Execution completed with errors", "warning");
      } else {
        setStdout(result.stdout || "(No program output returned)");
        addToast("Executed successfully!", "success");
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || "Execution request failed. Ensure backend service is active.";
      setStderr(errMsg);
      addToast(errMsg, "error");
    } finally {
      setIsRunning(false);
    }
  };

  // Maps Monaco editor internal language names
  const getMonacoLanguage = (lang) => {
    if (lang === "cpp") return "cpp";
    if (lang === "c") return "c";
    return lang;
  };

  return (
    <div className="h-screen flex bg-slate-950">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header Bar */}
        <header className="h-16 border-b border-slate-900 bg-slate-950 px-4 md:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <Code2 className="text-indigo-500" size={24} />
              <h1 className="text-md md:text-lg font-bold text-slate-100 uppercase tracking-wide">
                Universal Online Compiler
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="play-lang" className="hidden sm:inline text-xs font-semibold text-slate-500">
                Language:
              </label>
              <select
                id="play-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-indigo-400 focus:outline-none cursor-pointer hover:border-slate-700 transition-colors"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="c">C</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer shadow-sm shadow-indigo-600/30 disabled:opacity-50"
            >
              {isRunning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  <span>Run Program</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Editor & Panel Split View */}
        <div className="flex-1 flex overflow-hidden min-h-0 divide-x divide-slate-900">
          
          {/* Monaco Editor Panel */}
          <div className="flex-1 bg-slate-950 relative">
            <Editor
              height="100%"
              language={getMonacoLanguage(language)}
              value={code}
              theme={monacoTheme}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "Fira Code, JetBrains Mono, Monaco, Courier New, monospace",
                lineNumbers: "on",
                cursorBlinking: "smooth",
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Stdin / Output Terminal Drawer Panel */}
          <div className="w-80 md:w-96 bg-slate-950/40 flex flex-col shrink-0 min-h-0 divide-y divide-slate-900">
            {/* Stdin Area */}
            <div className="flex-1 flex flex-col p-4 min-h-0">
              <div className="flex items-center gap-2 mb-2">
                <Terminal size={14} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Standard Input (stdin)
                </span>
              </div>
              <textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="Provide input parameters here..."
                className="flex-1 w-full rounded border border-slate-900 bg-slate-950 p-3 text-xs text-slate-300 font-mono focus:border-indigo-500 focus:outline-none resize-none transition-colors"
              />
            </div>

            {/* Stdout Terminal Area */}
            <div className="flex-1 flex flex-col p-4 min-h-0 bg-slate-950/60">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Execution Terminals
              </span>
              <div className="flex-1 w-full rounded border border-slate-900 bg-slate-950 p-4 font-mono text-xs overflow-y-auto min-h-0 selection:bg-indigo-500/30">
                {isRunning && (
                  <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Compiling code and booting sandbox container...</span>
                  </div>
                )}

                {compileError && (
                  <div className="text-red-500 whitespace-pre-wrap">
                    <p className="font-bold uppercase mb-1">Compilation Failure:</p>
                    {compileError}
                  </div>
                )}

                {stderr && (
                  <div className="text-red-400 whitespace-pre-wrap">
                    <p className="font-bold uppercase mb-1">Runtime Exception:</p>
                    {stderr}
                  </div>
                )}

                {!isRunning && !compileError && !stderr && stdout && (
                  <div className="text-emerald-400 whitespace-pre-wrap leading-relaxed">
                    {stdout}
                  </div>
                )}

                {!isRunning && !compileError && !stderr && !stdout && (
                  <span className="text-slate-700 italic">
                    Console ready. Click Run Sandbox to execute.
                  </span>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

export default Playground;
