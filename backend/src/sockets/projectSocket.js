// src/sockets/projectSocket.js
// Responsibility: Handle file-scoped real-time synchronization, online list management,
// cursor tracking, typing indicators, and debounced database file saves.

import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Project from "../models/project.model.js";
import FileNode from "../models/file.model.js";
import Activity from "../models/activity.model.js";
import Message from "../models/message.model.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";
import { spawn } from "node:child_process";
import { syncProjectFilesToDisk, syncFileNodeToWorkspace } from "../services/projectRunner.service.js";
import {
  acquireProjectEditLock,
  assertProjectEditable,
  releaseProjectEditLock,
} from "../services/projectEditLock.service.js";

const CURSOR_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // yellow
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#14b8a6", // teal
  "#f97316", // orange
];

// Reserve colours per project so simultaneous collaborators receive different
// cursors and mouse pointers. The reservation is cleared at disconnect.
const projectCursorAssignments = new Map();

const assignAvailableCursorColor = (socket, projectId) => {
  const assignments = projectCursorAssignments.get(projectId) || new Map();
  const usedColors = new Set(assignments.values());
  const color = CURSOR_COLORS.find((candidate) => !usedColors.has(candidate))
    || CURSOR_COLORS[assignments.size % CURSOR_COLORS.length];

  assignments.set(socket.id, color);
  projectCursorAssignments.set(projectId, assignments);
  socket.userColor = color;
};

const releaseCursorColor = (socket) => {
  if (!socket.projectId) return;
  const assignments = projectCursorAssignments.get(socket.projectId);
  if (!assignments) return;

  assignments.delete(socket.id);
  if (assignments.size === 0) {
    projectCursorAssignments.delete(socket.projectId);
  }
};

// In-memory cache to accumulate keystrokes per file node
const fileCodeCache = {}; // { [fileId]: { code: String, lastEditedBy: ObjectId, saveTimeout: Timeout } }
const fileActiveCursors = new Map(); // { [fileId]: Map<socketId, cursorPayload> }

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookieStr) => {
    const [key, value] = cookieStr.split("=");
    if (key && value) {
      acc[key.trim()] = decodeURIComponent(value.trim());
    }
    return acc;
  }, {});
};

const stopProjectTerminal = (socket) => {
  const terminalProcess = socket.projectTerminalProcess;
  if (!terminalProcess) return;

  socket.projectTerminalProcess = null;
  if (process.platform === "win32" && terminalProcess.pid) {
    spawn("taskkill", ["/pid", String(terminalProcess.pid), "/f", "/t"], { windowsHide: true });
  } else {
    terminalProcess.kill("SIGTERM");
  }
};

const releaseSocketExecutionLock = (socket, io) => {
  if (!socket.projectExecutionLock) return;
  releaseProjectEditLock(socket.projectExecutionLock.projectId, socket.user, io);
  socket.projectExecutionLock = null;
};

export const socketProtect = async (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies.token;

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("name email");

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    socket.user = user;
    next();
  } catch (err) {
    logger.error("Socket authorization failed: %s", err.message);
    next(new Error("Authentication error: Invalid or expired token"));
  }
};

/**
 * Broadcast the list of all online users currently in the project workspace,
 * including which specific file they are currently viewing.
 */
const broadcastProjectPresence = async (io, projectId) => {
  const roomSockets = await io.in(`project:${projectId}`).fetchSockets();
  
  const onlineUsers = roomSockets.map((s) => ({
    userId: s.user._id,
    name: s.user.name,
    email: s.user.email,
    color: s.userColor,
    isTyping: s.isTyping || false,
    activeFileId: s.activeFileId || null,
  }));

  // Unique list by userId
  const uniqueUsers = [];
  const seen = new Set();
  for (const user of onlineUsers) {
    if (!seen.has(user.userId.toString())) {
      seen.add(user.userId.toString());
      uniqueUsers.push(user);
    }
  }

  io.to(`project:${projectId}`).emit("users-update", uniqueUsers);
};

/**
 * Save cached file content back to MongoDB.
 */
const saveCachedFileToDB = async (fileId) => {
  const cache = fileCodeCache[fileId];
  if (!cache) return;

  try {
    if (cache.saveTimeout) {
      clearTimeout(cache.saveTimeout);
    }

    await FileNode.findByIdAndUpdate(fileId, {
      content: cache.code,
      updatedBy: cache.lastEditedBy,
    });

    await syncFileNodeToWorkspace(fileId, cache.code);

    logger.debug(`File ${fileId} code saved to database successfully.`);
  } catch (err) {
    logger.error(`Error saving cached file for fileNode ${fileId}: ${err.message}`);
  }
};

export const registerSocketHandlers = (io) => {
  io.use(socketProtect);

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.user.name})`);

    // Join user's personal notification channel
    socket.join(`user:${socket.user._id.toString()}`);

    socket.userColor = CURSOR_COLORS[0];

    // 1. Join Project Workspace Room
    socket.on("join-project", async ({ projectId }) => {
      try {
        const project = await Project.findById(projectId);
        if (!project) {
          socket.emit("error", { message: "Project not found" });
          return;
        }

        const isMember = project.members.some((m) => m.toString() === socket.user._id.toString());
        if (!isMember) {
          socket.emit("error", { message: "Not authorized to access this project" });
          return;
        }

        socket.projectId = projectId;
        socket.projectRole = project.owner.toString() === socket.user._id.toString()
          ? "Owner"
          : project.memberRoles?.get(socket.user._id.toString()) || "Editor";
        assignAvailableCursorColor(socket, projectId);
        socket.join(`project:${projectId}`);

        // Notify other room members of the presence change
        await broadcastProjectPresence(io, projectId);

        // Log join activity
        await Activity.create({
          project: projectId,
          user: socket.user._id,
          type: "JOIN",
        });

      } catch (err) {
        logger.error(`Error joining project socket: ${err.message}`);
        socket.emit("error", { message: "Failed to join project workspace" });
      }
    });

    // 2. Switch/Join File Edit Room
    socket.on("join-file", async ({ fileId, projectId: incomingProjectId }) => {
      try {
        const targetFileId = fileId ? fileId.toString() : null;
        if (!targetFileId) return;

        const file = await FileNode.findById(targetFileId);
        if (!file || file.isFolder) {
          socket.emit("error", { message: "File not found" });
          return;
        }

        if (!socket.projectId) {
          socket.projectId = incomingProjectId || file.project.toString();
          socket.join(`project:${socket.projectId}`);
        }

        const projectId = socket.projectId;

        // Leave previous file room if any
        if (socket.activeFileId && socket.activeFileId.toString() !== targetFileId) {
          const oldFileId = socket.activeFileId.toString();
          socket.to(`file:${oldFileId}`).emit("cursor-remove", {
            fileId: oldFileId,
            userId: socket.user._id,
          });
          socket.to(`file:${oldFileId}`).emit("mouse-remove", {
            fileId: oldFileId,
            userId: socket.user._id,
          });
          socket.to(`file:${oldFileId}`).emit("leave-file", {
            fileId: oldFileId,
            userId: socket.user._id,
            username: socket.user.name,
          });
          socket.leave(`file:${oldFileId}`);
        }

        socket.activeFileId = targetFileId;
        socket.join(`file:${targetFileId}`);

        // Initialize file code cache if not present
        if (!fileCodeCache[targetFileId]) {
          fileCodeCache[targetFileId] = {
            code: file.content || "",
            lastEditedBy: socket.user._id,
            saveTimeout: null,
          };
        }

        // Send current file content back to client
        socket.emit("file-sync", { fileId: targetFileId, code: fileCodeCache[targetFileId].code });

        // Send any existing collaborators' active cursors in this file to the joining user
        const existingCursors = fileActiveCursors.get(targetFileId);
        if (existingCursors) {
          for (const [sId, cData] of existingCursors.entries()) {
            if (sId !== socket.id) {
              socket.emit("cursor-move", cData);
              socket.emit("cursor-update", cData);
            }
          }
        }

        // Broadcast presence update (showing which file user is looking at)
        await broadcastProjectPresence(io, projectId);

      } catch (err) {
        logger.error(`Error joining file room: ${err.message}`);
        socket.emit("error", { message: "Failed to join file room" });
      }
    });

    // 2.5 Leave File Edit Room
    socket.on("leave-file", ({ fileId }) => {
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      fileActiveCursors.get(targetFileId)?.delete(socket.id);

      socket.to(`file:${targetFileId}`).emit("cursor-remove", {
        fileId: targetFileId,
        userId: socket.user._id,
      });
      socket.to(`file:${targetFileId}`).emit("mouse-remove", {
        fileId: targetFileId,
        userId: socket.user._id,
      });
      socket.to(`file:${targetFileId}`).emit("leave-file", {
        fileId: targetFileId,
        userId: socket.user._id,
        username: socket.user.name,
      });
      socket.leave(`file:${targetFileId}`);
      if (socket.activeFileId && socket.activeFileId.toString() === targetFileId) {
        socket.activeFileId = null;
      }
      if (socket.projectId) {
        broadcastProjectPresence(io, socket.projectId);
      }
    });

    // 3. Sync Real-Time Keystroke edits in File room
    socket.on("code-change", async ({ fileId, rangeOffset, rangeLength, text }) => {
      if (!["Owner", "Admin", "Editor"].includes(socket.projectRole)) {
        socket.emit("error", { message: "Your role has read-only access to this project" });
        return;
      }
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      if (!socket.activeFileId || socket.activeFileId.toString() !== targetFileId) {
        socket.activeFileId = targetFileId;
        socket.join(`file:${targetFileId}`);
      }

      try {
        assertProjectEditable(socket.projectId, socket.user);
      } catch (error) {
        socket.emit("error", { message: error.message, editLock: error.editLock });
        return;
      }

      if (!fileCodeCache[targetFileId]) {
        try {
          const file = await FileNode.findOne({ _id: targetFileId, project: socket.projectId });
          if (file) {
            fileCodeCache[targetFileId] = {
              code: file.content || "",
              lastEditedBy: socket.user._id,
              saveTimeout: null,
            };
          }
        } catch (e) {
          logger.error(`Error populating cache for code-change: ${e.message}`);
        }
      }

      const cache = fileCodeCache[targetFileId];
      if (!cache) return;

      const originalCode = cache.code || "";
      const validOffset = Math.max(0, Math.min(rangeOffset, originalCode.length));
      const validLength = Math.max(0, Math.min(rangeLength, originalCode.length - validOffset));
      const updatedCode =
        originalCode.substring(0, validOffset) +
        text +
        originalCode.substring(validOffset + validLength);

      cache.code = updatedCode;
      cache.lastEditedBy = socket.user._id;

      // Broadcast the delta changes to other users looking at this file
      socket.to(`file:${targetFileId}`).emit("code-change", {
        fileId: targetFileId,
        userId: socket.user._id,
        rangeOffset: validOffset,
        rangeLength: validLength,
        text,
      });

      // Update project model's lastEditedBy metadata for list queries
      Project.findByIdAndUpdate(socket.projectId, {
        lastEditedBy: socket.user._id,
        lastEditedAt: new Date(),
      }).catch((e) => logger.error(`Error updating project lastEdited: ${e.message}`));

      // Debounce saving file changes to Database (2 seconds)
      if (cache.saveTimeout) {
        clearTimeout(cache.saveTimeout);
      }
      cache.saveTimeout = setTimeout(() => {
        saveCachedFileToDB(targetFileId);
      }, 2000);
    });

    // 4. Cursor position & selection range tracking in File room
    socket.on("cursor-move", (payload = {}) => {
      const {
        fileId,
        cursorPosition,
        selection,
        cursorLine,
        cursorColumn,
        selectionStart,
        selectionEnd,
      } = payload;

      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      if (!socket.activeFileId || socket.activeFileId.toString() !== targetFileId) {
        socket.activeFileId = targetFileId;
        socket.join(`file:${targetFileId}`);
      }

      const cLine = cursorLine ?? cursorPosition?.lineNumber;
      const cCol = cursorColumn ?? cursorPosition?.column;

      const selStart = selectionStart || (selection ? {
        lineNumber: selection.startLineNumber,
        column: selection.startColumn,
      } : null);

      const selEnd = selectionEnd || (selection ? {
        lineNumber: selection.endLineNumber,
        column: selection.endColumn,
      } : null);

      const normalizedPayload = {
        projectId: socket.projectId,
        fileId: targetFileId,
        userId: socket.user._id.toString(),
        username: socket.user.name,
        avatar: socket.user.avatar || null,
        cursorLine: cLine,
        cursorColumn: cCol,
        selectionStart: selStart,
        selectionEnd: selEnd,
        // Legacy & extended cursor fields
        cursor: cLine ? { lineNumber: cLine, column: cCol } : cursorPosition,
        selection: selection || (selStart && selEnd ? {
          startLineNumber: selStart.lineNumber,
          startColumn: selStart.column,
          endLineNumber: selEnd.lineNumber,
          endColumn: selEnd.column,
        } : null),
        userColor: socket.userColor || CURSOR_COLORS[0],
        color: socket.userColor || CURSOR_COLORS[0],
        timestamp: Date.now(),
      };

      // Store in active cursor map
      let fileMap = fileActiveCursors.get(targetFileId);
      if (!fileMap) {
        fileMap = new Map();
        fileActiveCursors.set(targetFileId, fileMap);
      }
      fileMap.set(socket.id, normalizedPayload);

      // Broadcast both cursor-move and cursor-update
      socket.to(`file:${targetFileId}`).emit("cursor-move", normalizedPayload);
      socket.to(`file:${targetFileId}`).emit("cursor-update", normalizedPayload);
    });

    // 4.5 Selection Change Tracking in File room
    socket.on("selection-change", (payload = {}) => {
      const { fileId, selectionStart, selectionEnd, selection } = payload;
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      if (!socket.activeFileId || socket.activeFileId.toString() !== targetFileId) {
        socket.activeFileId = targetFileId;
        socket.join(`file:${targetFileId}`);
      }

      const selStart = selectionStart || (selection ? {
        lineNumber: selection.startLineNumber,
        column: selection.startColumn,
      } : null);

      const selEnd = selectionEnd || (selection ? {
        lineNumber: selection.endLineNumber,
        column: selection.endColumn,
      } : null);

      const normalizedPayload = {
        projectId: socket.projectId,
        fileId: targetFileId,
        userId: socket.user._id.toString(),
        username: socket.user.name,
        avatar: socket.user.avatar || null,
        selectionStart: selStart,
        selectionEnd: selEnd,
        selection: selection || (selStart && selEnd ? {
          startLineNumber: selStart.lineNumber,
          startColumn: selStart.column,
          endLineNumber: selEnd.lineNumber,
          endColumn: selEnd.column,
        } : null),
        userColor: socket.userColor || CURSOR_COLORS[0],
        color: socket.userColor || CURSOR_COLORS[0],
        timestamp: Date.now(),
      };

      // Store updated selection in active cursor map
      const fileMap = fileActiveCursors.get(targetFileId);
      if (fileMap && fileMap.has(socket.id)) {
        const existing = fileMap.get(socket.id);
        fileMap.set(socket.id, { ...existing, ...normalizedPayload });
      }

      socket.to(`file:${targetFileId}`).emit("selection-change", normalizedPayload);
    });

    // 4.6 Mouse Pointer Movement Tracking in File room
    socket.on("mouse-move", (payload = {}) => {
      const { fileId, mouseX, mouseY } = payload;
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      if (!socket.activeFileId || socket.activeFileId.toString() !== targetFileId) {
        socket.activeFileId = targetFileId;
        socket.join(`file:${targetFileId}`);
      }

      const normalizedPayload = {
        projectId: socket.projectId,
        fileId: targetFileId,
        userId: socket.user._id.toString(),
        username: socket.user.name,
        avatar: socket.user.avatar || null,
        mouseX,
        mouseY,
        userColor: socket.userColor || CURSOR_COLORS[0],
        color: socket.userColor || CURSOR_COLORS[0],
        timestamp: Date.now(),
      };

      socket.to(`file:${targetFileId}`).emit("mouse-move", normalizedPayload);
      socket.to(`file:${targetFileId}`).emit("mouse-update", normalizedPayload);
    });

    // 5. Typing indicators in File room
    socket.on("typing-status", ({ fileId, isTyping }) => {
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId) return;

      socket.isTyping = isTyping;
      socket.to(`file:${targetFileId}`).emit("typing-update", {
        fileId: targetFileId,
        userId: socket.user._id,
        username: socket.user.name,
        isTyping,
      });
    });

    // 6. Force File Sync (e.g. on Version Restore or manual file revert)
    socket.on("force-file-sync", ({ fileId, code }) => {
      if (!["Owner", "Admin", "Editor"].includes(socket.projectRole)) {
        socket.emit("error", { message: "Your role has read-only access to this project" });
        return;
      }
      const rawTarget = fileId || socket.activeFileId;
      const targetFileId = rawTarget ? rawTarget.toString() : null;
      if (!targetFileId || !fileCodeCache[targetFileId]) return;
      try {
        assertProjectEditable(socket.projectId, socket.user);
      } catch (error) {
        socket.emit("error", { message: error.message, editLock: error.editLock });
        return;
      }

      const cache = fileCodeCache[targetFileId];
      cache.code = code;
      cache.lastEditedBy = socket.user._id;

      // Broadcast new code content to everyone in the file room
      socket.to(`file:${targetFileId}`).emit("file-sync", { fileId: targetFileId, code });

      // Save to MongoDB immediately
      saveCachedFileToDB(targetFileId);
    });

    // 6.5 Project Chat Messages Handler
    socket.on("send-message", async ({ text }) => {
      try {
        const projectId = socket.projectId;
        if (!projectId) return;

        if (!text || text.trim() === "") return;

        const message = await Message.create({
          project: projectId,
          sender: socket.user._id,
          text: text.trim(),
        });

        const populated = await Message.findById(message._id).populate("sender", "name email");

        // Broadcast message to everyone in the project workspace
        io.to(`project:${projectId}`).emit("message-received", populated);

        // Notify other project members via their personal channels
        const project = await Project.findById(projectId).select("name members");
        if (project && project.members) {
          for (const memberId of project.members) {
            if (memberId.toString() !== socket.user._id.toString()) {
              io.to(`user:${memberId.toString()}`).emit("chat-message-notification", {
                projectId,
                projectName: project.name,
                message: populated,
              });
            }
          }
        }

      } catch (err) {
        logger.error(`Error processing socket chat message: ${err.message}`);
        socket.emit("error", { message: "Failed to send chat message" });
      }
    });

    // 6.6 Persistent project command terminal. The authenticated workspace
    // socket determines both the project directory and the member's role.
    socket.on("project-terminal:start", async ({ projectId }) => {
      try {
        if (!projectId) {
          socket.emit("project-terminal-error", { message: "No project is selected for this terminal." });
          return;
        }

        // The normal join-project event is asynchronous. Verify membership
        // here as well so opening the terminal immediately after the page
        // loads cannot leave it without a running shell.
        if (!socket.projectId) {
          const project = await Project.findById(projectId);
          const isMember = project?.members.some((member) => member.toString() === socket.user._id.toString());
          if (!isMember) {
            socket.emit("project-terminal-error", { message: "You do not have access to this project terminal." });
            return;
          }
          socket.projectId = projectId;
          socket.projectRole = project.owner.toString() === socket.user._id.toString()
            ? "Owner"
            : project.memberRoles?.get(socket.user._id.toString()) || "Editor";
          socket.join(`project:${projectId}`);
        }
        if (socket.projectId !== projectId) {
          socket.emit("project-terminal-error", { message: "This terminal belongs to a different project." });
          return;
        }
        if (socket.projectRole === "Viewer" || socket.projectRole === "Client") {
          socket.emit("project-terminal-error", { message: "Your project role cannot run terminal commands." });
          return;
        }

        stopProjectTerminal(socket);
        const projectDir = await syncProjectFilesToDisk(projectId);
        const isWindows = process.platform === "win32";
        const shell = isWindows ? "cmd.exe" : "bash";
        const shellArgs = isWindows ? ["/Q"] : ["--noprofile", "--norc", "-i"];
        const terminalProcess = spawn(shell, shellArgs, {
          cwd: projectDir,
          env: { ...process.env, FORCE_COLOR: "true" },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        socket.projectTerminalProcess = terminalProcess;
        socket.emit("project-terminal-ready");

        const forwardOutput = (data) => socket.emit("project-terminal-output", { data: data.toString() });
        terminalProcess.stdout.on("data", forwardOutput);
        terminalProcess.stderr.on("data", forwardOutput);
        terminalProcess.on("error", (error) => {
          logger.error(`Project terminal error: ${error.message}`);
          socket.emit("project-terminal-error", { message: `Unable to start terminal: ${error.message}` });
        });
        terminalProcess.on("exit", (exitCode) => {
          if (socket.projectTerminalProcess === terminalProcess) {
            socket.projectTerminalProcess = null;
          }
          socket.emit("project-terminal-exit", { exitCode });
        });
      } catch (error) {
        logger.error(`Project terminal setup failed: ${error.message}`);
        socket.emit("project-terminal-error", { message: `Unable to start terminal: ${error.message}` });
      }
    });

    socket.on("project-terminal:input", ({ data } = {}) => {
      if (!socket.projectTerminalProcess?.stdin?.writable || typeof data !== "string") return;
      if (data.length > 8_192) {
        socket.emit("project-terminal-error", { message: "Terminal input is too large." });
        return;
      }
      socket.projectTerminalProcess.stdin.write(data);
    });

    socket.on("project-terminal:stop", () => stopProjectTerminal(socket));

    // 6.7 Interactive Code Execution with stdin/stdout streaming
    socket.on("run-code-interactive", async ({ projectId, code, language, input }) => {
      try {
        if (!socket.projectId || socket.projectId !== projectId) {
          socket.emit("code-execution-error", { message: "Open the project before running code." });
          return;
        }
        if (!["Owner", "Admin", "Editor"].includes(socket.projectRole)) {
          socket.emit("code-execution-error", { message: "Your project role cannot run code." });
          return;
        }
        acquireProjectEditLock(projectId, socket.user, "running code", io);
        socket.projectExecutionLock = { projectId };
        const { spawnInteractive } = await import("../controllers/run.controller.js");
        const path = await import("path");
        const fs = await import("fs");
        
        // Create temp directory for this execution
        const os = await import("os");
        const runDir = path.join(os.tmpdir(), `run_${Date.now()}`);
        fs.mkdirSync(runDir, { recursive: true });
        
        // Write code file
        const config = {
          python: { file: "main.py" },
          javascript: { file: "main.js" },
          typescript: { file: "main.ts" },
          c: { file: "main.c" },
          cpp: { file: "main.cpp" },
          java: { file: "Main.java" },
          html: { file: "index.html" },
          css: { file: "style.css" },
          react: { file: "App.jsx" },
        };
        
        const fileConfig = config[language];
        if (!fileConfig) {
          socket.emit("code-execution-error", { message: `Unsupported language: ${language}` });
          releaseSocketExecutionLock(socket, io);
          return;
        }
        
        const codeFile = path.join(runDir, fileConfig.file);
        fs.writeFileSync(codeFile, code);
        
        let childProcess = null;
        let isUsingWandbox = false;
        
        // Compile if needed
        if (language === "c" || language === "cpp") {
          const binFile = path.join(runDir, process.platform === "win32" ? "prog.exe" : "prog");
          const compileCmd = language === "c" ? "gcc" : "g++";
          const compileArgs = [codeFile, "-o", binFile];

          try {
            await spawnInteractive(compileCmd, compileArgs, { cwd: runDir });
          } catch (err) {
            // If local gcc/g++ binary is not found, try Wandbox online compiler fallback
            if (err.message && (err.message.includes("ENOENT") || err.message.includes("spawn"))) {
              logger.warn(`[Socket Execution] Local ${compileCmd} not found on host. Attempting Wandbox online compiler API fallback...`);
              isUsingWandbox = true;
              try {
                const { runViaWandbox } = await import("../controllers/run.controller.js");
                const wandboxResult = await runViaWandbox(language, code, input || "");
                if (wandboxResult) {
                  if (wandboxResult.compileError) {
                    socket.emit("code-execution-error", { message: `[Wandbox Compiler Error]\n${wandboxResult.compileError}` });
                  }
                  if (wandboxResult.stdout) {
                    socket.emit("code-execution-output", { data: wandboxResult.stdout });
                  }
                  if (wandboxResult.stderr) {
                    socket.emit("code-execution-error", { message: wandboxResult.stderr });
                  }
                  socket.emit("code-execution-complete", { exitCode: 0 });
                  try {
                    fs.rmSync(runDir, { recursive: true, force: true });
                  } catch (cleanupErr) {}
                  releaseSocketExecutionLock(socket, io);
                }
              } catch (wandboxErr) {
                logger.error(`Wandbox fallback error: ${wandboxErr.message}`);
                socket.emit("code-execution-error", { message: `Wandbox fallback error: ${wandboxErr.message}` });
              }

              // Handle stdin input from client when using Wandbox
              const handleWandboxStdinInput = async (data) => {
                const inputData = typeof data === 'object' ? data.input : data;
                if (!inputData) return;
                try {
                  const { runViaWandbox } = await import("../controllers/run.controller.js");
                  const wandboxResult = await runViaWandbox(language, code, inputData);
                  if (wandboxResult) {
                    if (wandboxResult.stdout) {
                      socket.emit("code-execution-output", { data: wandboxResult.stdout });
                    }
                    if (wandboxResult.stderr) {
                      socket.emit("code-execution-error", { message: wandboxResult.stderr });
                    }
                    socket.emit("code-execution-complete", { exitCode: 0 });
                  }
                } catch (e) {
                  logger.error(`Wandbox stdin error: ${e.message}`);
                } finally {
                  socket.off("code-execution-input", handleWandboxStdinInput);
                }
              };
              socket.on("code-execution-input", handleWandboxStdinInput);
              releaseSocketExecutionLock(socket, io);
              return;
            }

            try {
              fs.rmSync(runDir, { recursive: true, force: true });
            } catch (cleanupErr) {
              logger.error(`Failed to cleanup temp directory: ${cleanupErr.message}`);
            }
            const isEnoent = err.message && err.message.includes("ENOENT");
            const errorMessage = isEnoent
              ? `C/C++ compiler (${compileCmd}) is not installed on the server's PATH.\nTip: Install GCC/MinGW, or start Docker Desktop for containerized execution.`
              : `Compilation error: ${err.message}`;
            socket.emit("code-execution-error", { message: errorMessage });
            releaseSocketExecutionLock(socket, io);
            return;
          }

          // Run the compiled program with piped stdin for interactive input
          const { spawn } = await import("child_process");
          childProcess = spawn(binFile, [], { cwd: runDir, stdio: ["pipe", "pipe", "pipe"] });
        } else if (language === "python") {
          const { spawn } = await import("child_process");
          childProcess = spawn("python", [codeFile], { cwd: runDir, stdio: ["pipe", "pipe", "pipe"] });
        } else if (language === "javascript" || language === "typescript") {
          const { spawn } = await import("child_process");
          childProcess = spawn("node", [codeFile], { cwd: runDir, stdio: ["pipe", "pipe", "pipe"] });
        } else {
          socket.emit("code-execution-error", { message: `Interactive execution not supported for ${language}` });
          releaseSocketExecutionLock(socket, io);
          return;
        }
        
        // Stream stdout
        childProcess.stdout.on('data', (data) => {
          socket.emit("code-execution-output", { data: data.toString() });
        });
        
        // Stream stderr
        childProcess.stderr.on('data', (data) => {
          socket.emit("code-execution-error", { message: data.toString() });
        });
        
        // Handle process exit
        childProcess.on('exit', (code) => {
          socket.emit("code-execution-complete", { exitCode: code });
          // Cleanup temp directory and event listeners
          try {
            fs.rmSync(runDir, { recursive: true, force: true });
          } catch (err) {
            logger.error(`Failed to cleanup temp directory: ${err.message}`);
          }
          // Remove stdin handler
          socket.off("code-execution-input", handleStdinInput);
          releaseSocketExecutionLock(socket, io);
        });
        
        // Handle stdin input from client (scoped to this execution)
        const handleStdinInput = (data) => {
          if (childProcess && childProcess.stdin.writable) {
            childProcess.stdin.write(data.input);
          }
        };
        
        socket.on("code-execution-input", handleStdinInput);
        
        // Store process reference for cleanup
        socket.currentProcess = childProcess;
        
      } catch (err) {
        logger.error(`Error in interactive code execution: ${err.message}`);
        socket.emit("code-execution-error", { message: err.message });
        releaseSocketExecutionLock(socket, io);
      }
    });

    // 7. Handle Disconnection
    socket.on("disconnect", async () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      stopProjectTerminal(socket);
      releaseSocketExecutionLock(socket, io);
      releaseCursorColor(socket);
      const projectId = socket.projectId;
      const fileId = socket.activeFileId;

      if (!projectId) return;

      socket.leave(`project:${projectId}`);
      if (fileId) {
        fileActiveCursors.get(fileId)?.delete(socket.id);
        socket.to(`file:${fileId}`).emit("cursor-remove", {
          fileId,
          userId: socket.user._id,
        });
        socket.to(`file:${fileId}`).emit("mouse-remove", {
          fileId,
          userId: socket.user._id,
        });
        socket.to(`file:${fileId}`).emit("leave-file", {
          fileId,
          userId: socket.user._id,
          username: socket.user.name,
        });
        socket.leave(`file:${fileId}`);
      }

      // Check if this was the last socket looking at the project
      const projectSockets = await io.in(`project:${projectId}`).fetchSockets();
      if (projectSockets.length === 0) {
        // If room is empty, force save all open files of this project in cache
        if (fileId && fileCodeCache[fileId]) {
          await saveCachedFileToDB(fileId);
          delete fileCodeCache[fileId];
        }
        logger.info(`Workspace project:${projectId} is empty. Cache cleared.`);
      } else {
        // If other users remain, refresh their online indicators
        await broadcastProjectPresence(io, projectId);
      }

      // Log leave activity
      try {
        await Activity.create({
          project: projectId,
          user: socket.user._id,
          type: "LEAVE",
        });
      } catch (err) {
        logger.error(`Error logging socket leave: ${err.message}`);
      }
    });
  });
};
