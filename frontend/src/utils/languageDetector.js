// frontend/src/utils/languageDetector.js
// Responsibility: Map file extensions to Monaco editor language modes and detect project framework types.

/**
 * Detects Monaco Editor language mode from filename or extension
 * @param {string} filename 
 * @returns {string} - Monaco language ID
 */
export const getMonacoLanguage = (filename = "") => {
  const ext = filename.split(".").pop()?.toLowerCase();

  const languageMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "cpp",
    h: "cpp",
    hpp: "cpp",
    cs: "csharp",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    rs: "rust",
    go: "go",
    php: "php",
    rb: "ruby",
    dockerfile: "dockerfile",
  };

  if (filename.toLowerCase() === "dockerfile") return "dockerfile";
  return languageMap[ext] || "plaintext";
};

/**
 * Detects framework or language type badge for a list of imported files
 * @param {Array<{ name?: string, webkitRelativePath?: string }>} fileList 
 * @returns {{ type: string, name: string, badgeColor: string, icon: string }}
 */
export const detectFrameworkType = (fileList = []) => {
  const names = fileList.map((f) => (f.webkitRelativePath || f.name || "").split("/").pop().toLowerCase());

  if (names.includes("package.json") || names.some((n) => n.endsWith(".jsx") || n.endsWith(".tsx"))) {
    if (names.some((n) => n.endsWith(".tsx") || n.endsWith(".ts"))) {
      return { type: "react-ts", name: "React (TypeScript)", badgeColor: "bg-blue-900/60 text-blue-300 border-blue-700", icon: "⚡" };
    }
    return { type: "react-js", name: "React (JavaScript)", badgeColor: "bg-cyan-900/60 text-cyan-300 border-cyan-700", icon: "⚛️" };
  }

  if (names.includes("requirements.txt") || names.some((n) => n.endsWith(".py"))) {
    return { type: "python", name: "Python Project", badgeColor: "bg-emerald-900/60 text-emerald-300 border-emerald-700", icon: "🐍" };
  }

  if (names.includes("pom.xml") || names.includes("build.gradle") || names.some((n) => n.endsWith(".java"))) {
    return { type: "java", name: "Java Project", badgeColor: "bg-amber-900/60 text-amber-300 border-amber-700", icon: "☕" };
  }

  if (names.some((n) => n.endsWith(".cpp") || n.endsWith(".c") || n.endsWith(".hpp"))) {
    return { type: "cpp", name: "C/C++ Project", badgeColor: "bg-indigo-900/60 text-indigo-300 border-indigo-700", icon: "🛠️" };
  }

  if (names.includes("cargo.toml") || names.some((n) => n.endsWith(".rs"))) {
    return { type: "rust", name: "Rust Project", badgeColor: "bg-orange-900/60 text-orange-300 border-orange-700", icon: "🦀" };
  }

  return { type: "general", name: "Source Code Project", badgeColor: "bg-slate-800 text-slate-300 border-slate-700", icon: "📁" };
};
