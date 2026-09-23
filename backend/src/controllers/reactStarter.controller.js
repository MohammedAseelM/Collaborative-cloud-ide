// src/controllers/reactStarter.controller.js
// Responsibility: Create a complete Vite + React starter as a new workspace
// project. This gives the workspace terminal a safe, focused alternative to
// exposing an unrestricted host shell.

import Activity from "../models/activity.model.js";
import FileNode from "../models/file.model.js";
import Project from "../models/project.model.js";

const isValidProjectName = (name) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(name);

const buildReactStarterFiles = (projectName) => ({
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

export default defineConfig({
  plugins: [react()],
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
    <main>
      <h1>React is ready!</h1>
      <p>Your Vite + React project was created in this workspace.</p>
      <button onClick={() => setCount((value) => value + 1)}>
        Count: {count}
      </button>
    </main>
  );
}
`,
  "src/index.css": `:root {
  font-family: Inter, system-ui, sans-serif;
  color: #e2e8f0;
  background: #0f172a;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

main {
  max-width: 640px;
  margin: 0 auto;
  padding: 5rem 1.5rem;
  text-align: center;
}

button {
  border: 0;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  background: #4f46e5;
  color: white;
  cursor: pointer;
}
`,
});

/**
 * @route POST /api/projects/react-starter
 * @desc Create a new, runnable Vite + React project for the signed-in user.
 * @access Private
 */
export const createReactStarterProject = async (req, res, next) => {
  try {
    const projectName = (req.body.name || "react-app").trim().toLowerCase();

    if (!isValidProjectName(projectName)) {
      const error = new Error(
        "Use a project name with lowercase letters, numbers, and hyphens (for example: my-react-app)."
      );
      error.statusCode = 400;
      throw error;
    }

    const existingProject = await Project.findOne({
      owner: req.user._id,
      name: projectName,
    });
    if (existingProject) {
      const error = new Error(`You already have a project named "${projectName}".`);
      error.statusCode = 409;
      throw error;
    }

    const project = await Project.create({
      name: projectName,
      description: "Vite + React starter project",
      language: "javascript",
      owner: req.user._id,
      members: [req.user._id],
      memberRoles: { [req.user._id.toString()]: "Owner" },
      projectType: "react-vite",
      startCommand: "npm run dev",
      installCommand: "npm install",
    });

    const srcFolder = await FileNode.create({
      name: "src",
      isFolder: true,
      project: project._id,
      parentId: null,
      relativePath: "src",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    const starterFiles = buildReactStarterFiles(projectName);
    const fileNodes = Object.entries(starterFiles).map(([relativePath, content]) => {
      const isSourceFile = relativePath.startsWith("src/");
      const name = relativePath.split("/").pop();

      return {
        name,
        isFolder: false,
        project: project._id,
        parentId: isSourceFile ? srcFolder._id : null,
        relativePath,
        content,
        size: Buffer.byteLength(content, "utf8"),
        createdBy: req.user._id,
        updatedBy: req.user._id,
      };
    });
    await FileNode.insertMany(fileNodes);

    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "CREATE",
      details: { action: "create_react_starter", name: projectName },
    });

    res.status(201).json({
      success: true,
      message: "React project created successfully.",
      project,
    });
  } catch (error) {
    next(error);
  }
};
