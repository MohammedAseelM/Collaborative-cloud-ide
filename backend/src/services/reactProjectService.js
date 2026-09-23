// src/services/reactProjectService.js
// Responsibility: Core business logic for React (Vite) Project Command System,
// including scaffolding, lifecycle (install, run, stop, restart, build), reset,
// and package management (install, uninstall, update).

import fs from "fs";
import path from "path";
import Project from "../models/project.model.js";
import FileNode from "../models/file.model.js";
import Activity from "../models/activity.model.js";
import Version from "../models/version.model.js";
import Invitation from "../models/invitation.model.js";
import Message from "../models/message.model.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";
import {
  syncProjectFilesToDisk,
  installDependencies,
  startDevServer,
  stopDevServer,
  runProjectTerminalCommand,
  getDevServerStatus,
} from "./projectRunner.service.js";
import { syncDiskToDatabase } from "./workspaceSync.service.js";
import {
  acquireProjectEditLock,
  releaseProjectEditLock,
} from "./projectEditLock.service.js";

export const isValidProjectName = (name) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(name);

export const isValidPackageName = (name) => {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  // Support standard npm package names including scoped packages e.g. @types/react, axios, lodash@4.17.21
  return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[a-z0-9^~.><=-]+)?$/i.test(trimmed);
};

export const getReactTemplateFiles = (projectName) => ({
  "package.json": JSON.stringify(
    {
      name: projectName,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^6.0.0",
      },
    },
    null,
    2
  ),
  "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    strictPort: false,
  },
});
`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  "src/main.jsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,
  "src/App.jsx": `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="card">
      <h1>Vite + React</h1>
      <p>Collaborative Cloud IDE React Environment</p>
      <div className="button-group">
        <button onClick={() => setCount((c) => c + 1)}>
          Count is {count}
        </button>
      </div>
      <p className="read-the-docs">
        Edit <code>src/App.jsx</code> and test hot-module replacement.
      </p>
    </div>
  );
}
`,
  "src/index.css": `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #0f172a;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  justify-content: center;
}

.card {
  padding: 2.5em;
  text-align: center;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}

h1 {
  font-size: 2.2em;
  line-height: 1.1;
  margin-bottom: 0.5em;
  background: linear-gradient(135deg, #60a5fa, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.7em 1.5em;
  font-size: 1em;
  font-weight: 600;
  font-family: inherit;
  background-color: #6366f1;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

button:hover {
  background-color: #4f46e5;
  transform: translateY(-1px);
}

.read-the-docs {
  color: #94a3b8;
  font-size: 0.875rem;
  margin-top: 1.5em;
}

code {
  background: #334155;
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
`,
  "public/vite.svg": `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="31.88" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 257"><defs><linearGradient id="IconifyId1813088fe1fbc01fb466" x1="-.828%" x2="57.636%" y1="7.652%" y2="78.411%"><stop offset="0%" stop-color="#41D1FF"></stop><stop offset="100%" stop-color="#BD34FE"></stop></linearGradient><linearGradient id="IconifyId1813088fe1fbc01fb467" x1="43.376%" x2="50.316%" y1="2.242%" y2="89.03%"><stop offset="0%" stop-color="#FFEA83"></stop><stop offset="8.333%" stop-color="#FFDD35"></stop><stop offset="100%" stop-color="#FFA800"></stop></linearGradient></defs><path fill="url(#IconifyId1813088fe1fbc01fb466)" d="M255.153 37.938L134.897 252.976c-2.483 4.44-8.862 4.466-11.382.048L.875 37.958c-2.746-4.814 1.371-10.646 6.827-9.67l120.385 21.517a6.537 6.537 0 0 0 2.322-.004l117.867-21.483c5.438-.991 9.574 4.796 6.877 9.62Z"></path><path fill="url(#IconifyId1813088fe1fbc01fb467)" d="M185.432.063L96.44 17.501a3.268 3.268 0 0 0-2.634 3.014l-5.474 92.456a3.268 3.268 0 0 0 3.997 3.378l24.777-5.718c2.318-.535 4.413 1.507 3.936 3.838l-7.361 36.047c-.495 2.426 1.782 4.5 4.151 3.78l15.304-4.649c2.372-.72 4.652 1.36 4.15 3.788l-11.698 56.621c-.732 3.542 3.979 5.473 5.943 2.437l1.313-2.028l72.516-144.72c1.215-2.423-.88-5.186-3.54-4.672l-25.505 4.922c-2.396.462-4.435-1.77-3.759-4.114l16.646-57.705c.677-2.35-1.37-4.583-3.769-4.113Z"></path></svg>`,
});

/**
 * 1. Create a complete Vite + React project.
 */
export const createReactProject = async ({ userId, name, description = "", io = null }) => {
  const normalizedName = (name || "react-app").trim().toLowerCase();

  if (!isValidProjectName(normalizedName)) {
    const error = new Error(
      "Use a project name with lowercase letters, numbers, and hyphens (for example: my-react-app)."
    );
    error.statusCode = 400;
    throw error;
  }

  const existingProject = await Project.findOne({
    owner: userId,
    name: normalizedName,
  });
  if (existingProject) {
    const error = new Error(`You already have a project named "${normalizedName}".`);
    error.statusCode = 409;
    throw error;
  }

  // Create Project in MongoDB
  const project = await Project.create({
    name: normalizedName,
    description: description || "Vite + React development workspace",
    language: "javascript",
    owner: userId,
    members: [userId],
    memberRoles: { [userId.toString()]: "Owner" },
    projectType: "react-vite",
    startCommand: "npm run dev",
    installCommand: "npm install",
    serverStatus: "ready",
  });

  // Create folders (src, public)
  const srcFolder = await FileNode.create({
    name: "src",
    isFolder: true,
    project: project._id,
    parentId: null,
    relativePath: "src",
    createdBy: userId,
    updatedBy: userId,
  });

  const publicFolder = await FileNode.create({
    name: "public",
    isFolder: true,
    project: project._id,
    parentId: null,
    relativePath: "public",
    createdBy: userId,
    updatedBy: userId,
  });

  // Scaffold template files
  const templateFiles = getReactTemplateFiles(normalizedName);
  const fileNodes = Object.entries(templateFiles).map(([relPath, content]) => {
    const isSrc = relPath.startsWith("src/");
    const isPublic = relPath.startsWith("public/");
    const fileName = relPath.split("/").pop();

    let parentId = null;
    if (isSrc) parentId = srcFolder._id;
    else if (isPublic) parentId = publicFolder._id;

    return {
      name: fileName,
      isFolder: false,
      project: project._id,
      parentId,
      relativePath: relPath,
      content,
      size: Buffer.byteLength(content, "utf8"),
      createdBy: userId,
      updatedBy: userId,
    };
  });

  await FileNode.insertMany(fileNodes);

  // Sync files to physical disk workspace
  await syncProjectFilesToDisk(project._id);

  // Record Activity
  await Activity.create({
    project: project._id,
    user: userId,
    type: "CREATE",
    details: { action: "create_react_project", name: normalizedName },
  });

  // Real-time broadcast if socket server is provided
  if (io) {
    io.to(`project:${project._id}`).emit("files-updated", {
      action: "create-project",
      projectId: project._id,
      userId,
    });
  }

  const allFiles = await FileNode.find({ project: project._id });
  return { project, files: allFiles };
};

/**
 * 2. Install project dependencies.
 */
export const installReactDependencies = async (projectId, io = null) => {
  const success = await installDependencies(projectId, io);
  await syncDiskToDatabase(projectId);

  if (io) {
    io.to(`project:${projectId}`).emit("files-updated", {
      action: "install",
      projectId,
    });
  }

  return { success };
};

/**
 * 3. Run React dev server.
 */
export const runReactProject = async (projectId, user, io = null) => {
  acquireProjectEditLock(projectId, user, "running the React development server", io);
  try {
    const result = await startDevServer(projectId, io);
    return result;
  } catch (err) {
    releaseProjectEditLock(projectId, user, io);
    throw err;
  }
};

/**
 * 4. Stop React dev server.
 */
export const stopReactProject = async (projectId, user, io = null) => {
  const result = await stopDevServer(projectId, io);
  return result;
};

/**
 * 5. Restart React dev server.
 */
export const restartReactProject = async (projectId, user, io = null) => {
  await stopDevServer(projectId, io);
  acquireProjectEditLock(projectId, user, "restarting the React development server", io);
  try {
    const result = await startDevServer(projectId, io);
    return result;
  } catch (err) {
    releaseProjectEditLock(projectId, user, io);
    throw err;
  }
};

/**
 * 6. Build React project for production.
 */
export const buildReactProject = async (projectId, io = null) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  await Project.findByIdAndUpdate(projectId, { serverStatus: "building" });
  if (io) {
    io.to(`project:${projectId}`).emit("project-status-change", {
      projectId,
      status: "building",
    });
  }

  try {
    const result = await runProjectTerminalCommand(projectId, "npm run build");
    const status = result.exitCode === 0 ? "ready" : "error";
    await Project.findByIdAndUpdate(projectId, { serverStatus: status });

    if (io) {
      io.to(`project:${projectId}`).emit("project-status-change", {
        projectId,
        status,
      });
    }

    // Sync generated dist directory into FileNodes
    await syncDiskToDatabase(projectId);
    if (io) {
      io.to(`project:${projectId}`).emit("files-updated", {
        action: "build",
        projectId,
      });
    }

    return result;
  } catch (err) {
    await Project.findByIdAndUpdate(projectId, { serverStatus: "error" });
    if (io) {
      io.to(`project:${projectId}`).emit("project-status-change", {
        projectId,
        status: "error",
      });
    }
    throw err;
  }
};

/**
 * 7. Delete React Project with full resource cleanup.
 */
export const deleteReactProject = async (projectId, userId, io = null) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Stop active dev server if running
  try {
    await stopDevServer(projectId, io);
  } catch (err) {
    logger.warn(`Failed to stop dev server during deletion: ${err.message}`);
  }

  // 2. Remove workspace disk files
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  if (fs.existsSync(projectDir)) {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn(`Failed to delete project directory: ${err.message}`);
    }
  }

  // 3. Clean up database records
  await Promise.all([
    FileNode.deleteMany({ project: projectId }),
    Version.deleteMany({ project: projectId }),
    Activity.deleteMany({ project: projectId }),
    Invitation.deleteMany({ project: projectId }),
    Message.deleteMany({ project: projectId }),
  ]);

  await Project.findByIdAndDelete(projectId);

  if (io) {
    io.to(`project:${projectId}`).emit("project-deleted", { projectId });
  }

  return { success: true, message: `Project "${project.name}" deleted successfully` };
};

/**
 * 8. Clear / Reset project to original React template.
 */
export const resetReactProject = async (projectId, userId, io = null) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Stop active dev server
  try {
    await stopDevServer(projectId, io);
  } catch (err) {
    logger.warn(`Failed to stop dev server during reset: ${err.message}`);
  }

  // 2. Remove existing disk files (preserve node_modules if present to avoid slow reinstall)
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir);
    for (const entry of entries) {
      if (entry === "node_modules") continue; // keep node_modules cache for quick startup
      try {
        fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
      } catch (err) {
        logger.warn(`Failed to remove entry ${entry} during reset: ${err.message}`);
      }
    }
  }

  // 3. Remove old FileNodes in MongoDB
  await FileNode.deleteMany({ project: projectId });

  // 4. Re-create folders
  const srcFolder = await FileNode.create({
    name: "src",
    isFolder: true,
    project: projectId,
    parentId: null,
    relativePath: "src",
    createdBy: userId,
    updatedBy: userId,
  });

  const publicFolder = await FileNode.create({
    name: "public",
    isFolder: true,
    project: projectId,
    parentId: null,
    relativePath: "public",
    createdBy: userId,
    updatedBy: userId,
  });

  // 5. Re-create template files
  const templateFiles = getReactTemplateFiles(project.name);
  const fileNodes = Object.entries(templateFiles).map(([relPath, content]) => {
    const isSrc = relPath.startsWith("src/");
    const isPublic = relPath.startsWith("public/");
    const fileName = relPath.split("/").pop();

    let parentId = null;
    if (isSrc) parentId = srcFolder._id;
    else if (isPublic) parentId = publicFolder._id;

    return {
      name: fileName,
      isFolder: false,
      project: projectId,
      parentId,
      relativePath: relPath,
      content,
      size: Buffer.byteLength(content, "utf8"),
      createdBy: userId,
      updatedBy: userId,
    };
  });

  await FileNode.insertMany(fileNodes);
  await syncProjectFilesToDisk(projectId);

  // 6. Update project metadata
  project.serverStatus = "ready";
  project.devServerPort = null;
  await project.save();

  // 7. Log Activity
  await Activity.create({
    project: projectId,
    user: userId,
    type: "RESTORE_VERSION",
    details: { action: "reset_react_project" },
  });

  // 8. Broadcast updates
  if (io) {
    io.to(`project:${projectId}`).emit("project-status-change", {
      projectId,
      status: "ready",
      port: null,
      previewUrl: null,
    });
    io.to(`project:${projectId}`).emit("files-updated", {
      action: "reset",
      projectId,
    });
  }

  const refreshedFiles = await FileNode.find({ project: projectId });
  return { project, files: refreshedFiles };
};

/**
 * 9. Add / Install package.
 */
export const installPackage = async (projectId, packageName, version = "", io = null) => {
  if (!isValidPackageName(packageName)) {
    const error = new Error("Invalid package name. Please provide a valid npm package (e.g. axios, lodash, lucide-react).");
    error.statusCode = 400;
    throw error;
  }

  let cleanPkg = packageName.trim();
  if (version && typeof version === "string" && version.trim()) {
    const cleanVer = version.trim().replace(/^@/, "");
    cleanPkg = `${cleanPkg}@${cleanVer}`;
  }

  const command = `npm install ${cleanPkg}`;
  const result = await runProjectTerminalCommand(projectId, command);

  // Re-sync package.json & package-lock.json from disk to MongoDB
  await syncDiskToDatabase(projectId);

  if (io) {
    io.to(`project:${projectId}`).emit("files-updated", {
      action: "package-install",
      packageName: cleanPkg,
      projectId,
    });
  }

  return result;
};

/**
 * 10. Remove / Uninstall package.
 */
export const uninstallPackage = async (projectId, packageName, io = null) => {
  if (!isValidPackageName(packageName)) {
    const error = new Error("Invalid package name.");
    error.statusCode = 400;
    throw error;
  }

  const cleanPkg = packageName.trim();
  const command = `npm uninstall ${cleanPkg}`;
  const result = await runProjectTerminalCommand(projectId, command);

  await syncDiskToDatabase(projectId);

  if (io) {
    io.to(`project:${projectId}`).emit("files-updated", {
      action: "package-uninstall",
      packageName: cleanPkg,
      projectId,
    });
  }

  return result;
};

/**
 * 11. Update Packages.
 */
export const updatePackages = async (projectId, io = null) => {
  const result = await runProjectTerminalCommand(projectId, "npm update");
  await syncDiskToDatabase(projectId);

  if (io) {
    io.to(`project:${projectId}`).emit("files-updated", {
      action: "package-update",
      projectId,
    });
  }

  return result;
};

/**
 * 12. Preview React Project (npm run preview).
 */
export const previewReactProject = async (projectId, user, io = null) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  // Ensure production build exists before starting preview server
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  const distDir = path.join(projectDir, "dist");
  if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, "index.html"))) {
    // Run build first
    await buildReactProject(projectId, io);
  }

  acquireProjectEditLock(projectId, user, "running the React production preview", io);
  try {
    const result = await startDevServer(projectId, io, { mode: "preview" });
    return result;
  } catch (err) {
    releaseProjectEditLock(projectId, user, io);
    throw err;
  }
};

/**
 * 13. Get available npm scripts from package.json.
 */
export const getAvailableScripts = async (projectId) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  // Try reading from disk first, fallback to FileNode
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  const pkgPath = path.join(projectDir, "package.json");

  let scripts = {};
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, "utf-8");
      const parsed = JSON.parse(raw);
      scripts = parsed.scripts || {};
    } catch {
      // Fallback
    }
  }

  if (Object.keys(scripts).length === 0) {
    const pkgNode = await FileNode.findOne({ project: projectId, name: "package.json" });
    if (pkgNode && pkgNode.content) {
      try {
        const parsed = JSON.parse(pkgNode.content);
        scripts = parsed.scripts || {};
      } catch {
        // Leave empty
      }
    }
  }

  return {
    scripts: Object.entries(scripts).map(([name, command]) => ({ name, command })),
  };
};

/**
 * 14. Run a specific npm script from package.json safely.
 */
export const runProjectScript = async (projectId, scriptName, io = null) => {
  if (!scriptName || typeof scriptName !== "string") {
    const error = new Error("Script name is required");
    error.statusCode = 400;
    throw error;
  }

  const cleanName = scriptName.trim();
  // Ensure safe characters only (no shell chaining or redirection)
  if (!/^[a-zA-Z0-9_:.-]+$/.test(cleanName)) {
    const error = new Error("Invalid script name format.");
    error.statusCode = 400;
    throw error;
  }

  const { scripts } = await getAvailableScripts(projectId);
  const exists = scripts.some((s) => s.name === cleanName);
  if (!exists) {
    const error = new Error(`Script "${cleanName}" not found in package.json.`);
    error.statusCode = 400;
    throw error;
  }

  const result = await runProjectTerminalCommand(projectId, `npm run ${cleanName}`);
  return result;
};

/**
 * 15. Check Node.js version.
 */
export const getNodeVersion = async (projectId) => {
  const result = await runProjectTerminalCommand(projectId, "node --version");
  const version = (result.output || "").trim();
  return { version, raw: result };
};

/**
 * 16. Check npm version.
 */
export const getNpmVersion = async (projectId) => {
  const result = await runProjectTerminalCommand(projectId, "npm --version");
  const version = (result.output || "").trim();
  return { version, raw: result };
};
