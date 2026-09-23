// src/services/projectDetector.service.js
// Responsibility: Deep inspection of project tree files (package.json, vite.config.js, next.config.js,
// requirements.txt, pom.xml, etc.) to determine project type, startup commands, and install scripts.

import FileNode from "../models/file.model.js";
import Project from "../models/project.model.js";

/**
 * Inspects a project's files in MongoDB and determines its framework type and execution commands.
 * @param {string} projectId - MongoDB Project ObjectId
 * @returns {Promise<{ projectType: string, startCommand: string, installCommand: string, defaultPort: number }>}
 */
export const detectAndSaveProjectType = async (projectId) => {
  const files = await FileNode.find({ project: projectId }).select("name isFolder parentId content relativePath");

  const filenames = files.map((f) => (f.name || "").toLowerCase());
  const relativePaths = files.map((f) => (f.relativePath || f.name || "").toLowerCase());

  let projectType = "general";
  let startCommand = "npm start";
  let installCommand = "npm install";
  let defaultPort = 5173;

  // 1. JavaScript / TypeScript Projects (package.json)
  const packageFile = files.find((f) => f.name.toLowerCase() === "package.json" && !f.isFolder);

  if (packageFile) {
    let pkgJson = {};
    try {
      pkgJson = JSON.parse(packageFile.content || "{}");
    } catch {
      pkgJson = {};
    }

    const scripts = pkgJson.scripts || {};
    const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };

    installCommand = "npm install";

    if (deps.vite || filenames.includes("vite.config.js") || filenames.includes("vite.config.ts")) {
      projectType = "react-vite";
      startCommand = scripts.dev ? "npm run dev" : "npx vite";
      defaultPort = 5173;
    } else if (deps.next || filenames.includes("next.config.js") || filenames.includes("next.config.mjs")) {
      projectType = "nextjs";
      startCommand = scripts.dev ? "npm run dev" : "npx next dev";
      defaultPort = 3000;
    } else if (deps["@angular/core"] || filenames.includes("angular.json")) {
      projectType = "angular";
      startCommand = scripts.start ? "npm start" : "npx ng serve";
      defaultPort = 4200;
    } else if (deps.express || deps.fastify || deps.koa || scripts.start) {
      projectType = "node-express";
      startCommand = scripts.start ? "npm start" : scripts.dev ? "npm run dev" : "node index.js";
      defaultPort = 3000;
    } else {
      projectType = "javascript";
      startCommand = scripts.dev ? "npm run dev" : scripts.start ? "npm start" : "node index.js";
      defaultPort = 5173;
    }
  } 
  // 2. Python Projects (requirements.txt, app.py, main.py)
  else if (filenames.includes("requirements.txt") || filenames.some((f) => f.endsWith(".py"))) {
    installCommand = filenames.includes("requirements.txt") ? "pip install -r requirements.txt" : "";
    const reqFile = files.find((f) => f.name.toLowerCase() === "requirements.txt");
    const reqContent = (reqFile?.content || "").toLowerCase();

    if (reqContent.includes("flask")) {
      projectType = "python-flask";
      startCommand = "flask run --host=0.0.0.0";
      defaultPort = 5000;
    } else if (reqContent.includes("django") || filenames.includes("manage.py")) {
      projectType = "python-django";
      startCommand = "python manage.py runserver 0.0.0.0:8000";
      defaultPort = 8000;
    } else if (reqContent.includes("fastapi")) {
      projectType = "python-fastapi";
      startCommand = "uvicorn main:app --host 0.0.0.0 --port 8000";
      defaultPort = 8000;
    } else {
      projectType = "python-app";
      const mainPy = filenames.includes("main.py") ? "main.py" : filenames.includes("app.py") ? "app.py" : "main.py";
      startCommand = `python ${mainPy}`;
      defaultPort = 8000;
    }
  } 
  // 3. Java Projects (pom.xml, build.gradle)
  else if (filenames.includes("pom.xml") || filenames.includes("build.gradle")) {
    installCommand = filenames.includes("pom.xml") ? "mvn dependency:resolve" : "gradle dependencies";
    projectType = "java-maven";
    startCommand = filenames.includes("pom.xml") ? "mvn spring-boot:run" : "gradle bootRun";
    defaultPort = 8080;
  }
  // 4. Rust Projects (Cargo.toml)
  else if (filenames.includes("cargo.toml")) {
    installCommand = "cargo check";
    projectType = "rust-cargo";
    startCommand = "cargo run";
    defaultPort = 8080;
  }
  // 5. Go Projects (go.mod)
  else if (filenames.includes("go.mod")) {
    installCommand = "go mod download";
    projectType = "go-app";
    startCommand = "go run .";
    defaultPort = 8080;
  }
  // 6. Dockerfile
  else if (filenames.includes("dockerfile")) {
    installCommand = "";
    projectType = "docker-app";
    startCommand = "docker build -t cloud-app . && docker run -p 5173:5173 cloud-app";
    defaultPort = 5173;
  }

  // Update Project model in MongoDB
  await Project.findByIdAndUpdate(projectId, {
    projectType,
    startCommand,
    installCommand,
  });

  return { projectType, startCommand, installCommand, defaultPort };
};
