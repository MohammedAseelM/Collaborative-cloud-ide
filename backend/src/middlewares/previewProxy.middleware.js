// src/middlewares/previewProxy.middleware.js
// Responsibility: Reverse-proxy HTTP and WebSocket preview requests from /preview/:projectId
// to the isolated dev server running on localhost:<dynamic_port>.

import { createProxyMiddleware } from "http-proxy-middleware";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import Project from "../models/project.model.js";
import { getProjectPort, isPortAvailable } from "../services/portManager.js";
import { getActiveProjectPort } from "../services/projectRunner.service.js";
import logger from "../utils/logger.js";

const proxyInstances = new Map();

let lastPreviewedProjectId = null;

export const previewProxyHandler = async (req, res, next) => {
  let projectId = req.params.projectId || req.params.id;

  // If not in params, extract from referer header (for assets like /@vite/client or /src/main.jsx)
  if (!projectId && req.headers.referer) {
    const match = req.headers.referer.match(/\/preview\/([a-zA-Z0-9_-]+)/);
    if (match) {
      projectId = match[1];
    }
  }

  // If still not identified, check cookie
  if (!projectId && req.cookies?.preview_project_id) {
    projectId = req.cookies.preview_project_id;
  }

  // If still not identified, fallback to last previewed project
  if (!projectId && lastPreviewedProjectId) {
    projectId = lastPreviewedProjectId;
  }

  // If still not identified, query database for active running project
  if (!projectId) {
    try {
      const runningProject = await Project.findOne({ serverStatus: "running", devServerPort: { $ne: null } }).select("_id devServerPort");
      if (runningProject) {
        projectId = runningProject._id.toString();
      }
    } catch {}
  }

  // Validate projectId format to prevent directory traversal or malformed strings
  if (projectId && !/^[a-fA-F0-9]{24}$/.test(projectId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(projectId)) {
    return res.status(400).send("Invalid project ID.");
  }

  if (projectId) {
    lastPreviewedProjectId = projectId.toString();
    res.cookie("preview_project_id", projectId.toString(), {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  // Ensure trailing slash on root preview URL so relative paths in iframe resolve correctly
  if (projectId && req.originalUrl && req.originalUrl.split("?")[0] === `/preview/${projectId}`) {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    return res.redirect(301, `/preview/${projectId}/${query}`);
  }

  // Verify project membership if authentication token is present
  const token = req.cookies?.token || req.headers?.authorization?.replace(/^Bearer\s+/i, "");
  if (token && projectId && /^[a-fA-F0-9]{24}$/.test(projectId)) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      const project = await Project.findById(projectId).select("members owner");
      if (project) {
        const isMember = project.members.some((m) => m.toString() === decoded.userId.toString()) ||
          project.owner.toString() === decoded.userId.toString();
        if (!isMember) {
          return res.status(403).send("Forbidden: You do not have permission to view this project preview.");
        }
      }
    } catch {
      // Allow request to proceed if token verification failed on subresource fetch
    }
  }

  let port = getActiveProjectPort(projectId) || getProjectPort(projectId);
  if (!port && projectId && /^[a-fA-F0-9]{24}$/.test(projectId)) {
    try {
      const dbProject = await Project.findById(projectId).select("devServerPort serverStatus");
      if (dbProject?.devServerPort) {
        port = dbProject.devServerPort;
      }
    } catch (err) {
      logger.warn(`[PREVIEW] Could not query project port from DB: ${err.message}`);
    }
  }

  if (!port) {
    try {
      const is5173Bound = !(await isPortAvailable(5173));
      if (is5173Bound) {
        port = 5173;
      }
    } catch {}
  }

  // Set frame options to allow iframe embedding from IDE frontend
  res.removeHeader("X-Frame-Options");
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("Cross-Origin-Resource-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Referrer-Policy");
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (!port) {
    return res.status(503).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Project Not Running</title>
          <style>
            body {
              background-color: #0f172a;
              color: #94a3b8;
              font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              text-align: center;
              padding: 1.5rem;
            }
            .card {
              background-color: #1e293b;
              border: 1px solid #334155;
              border-radius: 12px;
              padding: 2rem;
              max-width: 400px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            }
            h3 {
              color: #f87171;
              margin-top: 0;
              font-size: 1.25rem;
            }
            p {
              font-size: 0.875rem;
              line-height: 1.5;
            }
            .badge {
              display: inline-block;
              background-color: #334155;
              color: #38bdf8;
              padding: 0.25rem 0.75rem;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 600;
              margin-top: 0.5rem;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Project Server Not Running</h3>
            <p>Click the <strong style="color:#4ade80;">▶ Run</strong> button in the top toolbar to start the development server.</p>
            <div class="badge">Collaborative Cloud IDE</div>
          </div>
        </body>
      </html>
    `);
  }

  // Create or reuse proxy middleware instance per port
  let proxy = proxyInstances.get(port);
  if (!proxy) {
    proxy = createProxyMiddleware({
      target: `http://127.0.0.1:${port}`,
      changeOrigin: true,
      ws: true,
      pathRewrite: (pathStr) => {
        // Strip /preview/:projectId or /api/projects/:projectId/preview prefix
        const cleanPath = pathStr.replace(new RegExp(`^(/preview|/api/projects)/${projectId}(/preview)?`), "");
        return cleanPath || "/";
      },
      onError: (err, req, res) => {
        logger.error(`[PREVIEW] Proxy error for project ${projectId} on port ${port}: ${err.message}`);
        if (res && !res.headersSent) {
          res.status(502).send("Bad Gateway: Dev server connection failed.");
        }
      },
      onProxyRes: (proxyRes) => {
        delete proxyRes.headers["x-frame-options"];
        delete proxyRes.headers["content-security-policy"];
        delete proxyRes.headers["cross-origin-resource-policy"];
        delete proxyRes.headers["cross-origin-opener-policy"];
      },
    });
    proxyInstances.set(port, proxy);
  }

  return proxy(req, res, next);
};
