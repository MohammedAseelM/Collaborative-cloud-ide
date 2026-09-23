// src/pages/Workspace.jsx
// Responsibility: The core workspace panel. Manages the File Explorer, Tabbed Files,
// Monaco Editor with Ctrl+S commands, Socket.io presence indicators, and execution sandboxes.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";
import {
  Play,
  Save,
  Users,
  UserPlus,
  History,
  Activity as ActivityIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileCode,
  Loader2,
  X,
  FileText,
  MessageSquare,
  Globe,
  Square,
  Sparkles,
} from "lucide-react";

import {
  fetchProjectById,
  fetchVersions,
  saveVersionRequest,
  restoreVersionRequest,
  fetchActivities,
  runCodeRequest,
  fetchMembers,
  removeMemberRequest,
  updateMemberRoleRequest,
  startServerRequest,
  stopServerRequest,
  fetchServerStatusRequest,
} from "../services/project.service";
import {
  createInvitationRequest,
  fetchProjectInvitations,
  cancelInvitationRequest,
} from "../services/invitation.service";
import { fetchProjectFiles, fetchFileContent } from "../services/file.service";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { WorkspaceSkeleton } from "../components/Skeletons";
import MemberModal from "../components/MemberModal";
import DiffModal from "../components/DiffModal";
import FileExplorer from "../components/FileExplorer";
import WorkspaceChatPanel from "../components/WorkspaceChatPanel";
import NotificationDropdown from "../components/NotificationDropdown";
import LivePreviewPanel from "../components/LivePreviewPanel";
import { getMonacoLanguage } from "../utils/languageDetector";
import { useLiveCursor } from "../hooks/useLiveCursor";
import { useMouseTracking } from "../hooks/useMouseTracking";
import { usePresence } from "../hooks/usePresence";
import LiveMousePointers from "../components/LiveMousePointers";
import PresenceList from "../components/PresenceList";
import CollaboratorProfileModal from "../components/CollaboratorProfileModal";
import ThemeToggle from "../components/ThemeToggle";
import ReactCommandToolbar from "../components/ReactCommandToolbar";

const getExecutionLanguage = (filename) => {
  if (!filename) return null;
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "py": return "python";
    case "js": case "mjs": case "cjs": return "javascript";
    case "ts": case "tsx": return "typescript";
    case "c": return "c";
    case "cpp": case "cc": return "cpp";
    case "java": return "java";
    case "html": case "htm": return "html";
    case "css": return "css";
    case "jsx": return "react";
    case "txt": case "md": return "text";
    default: return null;
  }
};

const buildStaticPreview = (htmlCode, cssCode, htmlFiles = [], javascriptFiles = [], activeFileName = "index.html") => {
  const normalizeProjectPath = (filePath) => (filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .toLowerCase();
  const pages = {};
  htmlFiles.forEach((file) => {
    const content = file.content || "";
    const fileName = normalizeProjectPath(file.name);
    const relativePath = normalizeProjectPath(file.relativePath);
    if (fileName) pages[fileName] = content;
    if (relativePath) pages[relativePath] = content;
  });
  const activePageKey = normalizeProjectPath(activeFileName) || "index.html";
  pages[activePageKey] = htmlCode || pages[activePageKey] || "";
  if (!pages["index.html"]) pages["index.html"] = pages[activePageKey] || "";
  const scripts = Object.fromEntries(
    javascriptFiles.map((file) => [file.name.toLowerCase(), file.content || ""])
  );
  const scriptNavigationTargets = {};
  Object.values(scripts).forEach((source) => {
    const functionPattern = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
    let functionMatch;
    while ((functionMatch = functionPattern.exec(source)) !== null) {
      const targetMatch = functionMatch[2].match(/(?:window\.)?location(?:\.href\s*=|\.assign\s*\()\s*["']([^"']+)["']/i);
      if (targetMatch) scriptNavigationTargets[functionMatch[1]] = targetMatch[1];
    }
  });
  const serializedNavigationTargets = JSON.stringify(scriptNavigationTargets).replace(/</g, "\\u003c");
  const serializedScripts = JSON.stringify(scripts).replace(/</g, "\\u003c");
  const serializedPages = JSON.stringify(pages).replace(/</g, "\\u003c");
  const cleanHtml = (source) => (source || "")
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/gi, "")
    .replace(/\s+onclick=["']([^"']+)["']/gi, ' data-preview-click="$1"');
  const initialHtml = cleanHtml(htmlCode);
  const pageDocument = initialHtml || `<!DOCTYPE html><html><head></head><body></body></html>`;
  const navigationScript = `<script>
    const projectPages = ${serializedPages};
    const projectCss = ${JSON.stringify(cssCode || "")};
    const projectScripts = ${serializedScripts};
    const projectNavigationTargets = ${serializedNavigationTargets};
    const cleanProjectHtml = (source) => (source || "")
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
      .replace(/<script[^>]*src=["'][^"']+["'][^>]*>\\s*<\\/script>/gi, "")
      .replace(/\\s+onclick=["']([^"']+)["']/gi, ' data-preview-click="$1"');
    const runProjectScript = () => {
      Object.entries(projectScripts).forEach(([fileName, source]) => {
        if (!fileName.endsWith(".js")) return;
        try {
          window.eval(source);
        } catch (error) {
          console.error("Error in " + fileName + ":", error);
        }
      });
    };
    const renderProjectPage = (pageName) => {
      const pageKey = (pageName || "index.html").split("?")[0].split("#")[0]
        .replace(/^\\.\\//, "")
        .replace(/^\\//, "")
        .toLowerCase();
      const source = projectPages[pageKey] || projectPages[pageKey.split("/").pop()];
      if (typeof source !== "string") {
        console.warn("Preview page not found:", pageName);
        return;
      }
      const parsed = new DOMParser().parseFromString(cleanProjectHtml(source), "text/html");
      document.documentElement.innerHTML = parsed.documentElement.innerHTML;
      const style = document.createElement("style");
      style.textContent = projectCss;
      document.head.appendChild(style);
      runProjectScript();
    };
    const bindPreviewNavigation = () => {
      document.addEventListener("click", (event) => {
        const link = event.target.closest("a");
        if (!link || !link.getAttribute("href") || link.target === "_blank") return;
        const href = link.getAttribute("href");
        if (/^(https?:|mailto:|#)/i.test(href)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        renderProjectPage(href);
      }, true);
      document.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        const source = button?.getAttribute("data-preview-click") || "";
        const directMatch = source.match(/(?:window\\.)?location(?:\\.href\\s*=|\\.assign\\s*\\()\\s*["']([^"']+)["']/i);
        const functionName = source.trim().split("(")[0].trim();
        const normalizedFunctionName = functionName.toLowerCase();
        const fallbackTarget = normalizedFunctionName.includes("back")
          ? "index.html"
          : normalizedFunctionName.includes("newpage") || normalizedFunctionName.includes("new_page") || normalizedFunctionName.includes("next")
            ? "newpage.html"
            : null;
        const target = directMatch?.[1] || projectNavigationTargets[functionName] || fallbackTarget;
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        renderProjectPage(target);
      }, true);
    };
    bindPreviewNavigation();
  <\/script>`;
  const styledDocument = pageDocument.replace(/<\/head>/i, `<style>${cssCode || ""}</style></head>`);
  return styledDocument.replace(/<\/body>/i, `${navigationScript}<script>${Object.values(scripts).join("\n")}</script></body>`);
};

const Workspace = () => {
  const { id: projectId } = useParams();
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const { monacoTheme } = useTheme();
  const navigate = useNavigate();

  // Project & Files States
  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [activeTab, setActiveTab] = useState("users"); // "users" | "versions" | "activity"
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);

  // Tabbed files states
  const [openTabs, setOpenTabs] = useState([]); // Array of { fileId: string, name: string, isDirty: boolean }
  const [activeFileId, setActiveFileId] = useState(null);

  // Collaboration (Sockets) States
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const editorContainerRef = useRef(null);

  // Editor Ref & Monaco Instances
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  // Modals & Side panels Toggles
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [selectedCollaborator, setSelectedCollaborator] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isMouseTrackingEnabled = !isProfileModalOpen && !isMemberModalOpen && !isChatOpen;

  const isReactProject = useMemo(() => {
    return project?.projectType === "react-vite" || files.some((f) => f.name === "package.json");
  }, [project, files]);

  // Custom collaboration hooks for presence, live cursors & mouse pointers
  const { presenceList } = usePresence({ onlineUsers, files, currentUser });

  const { handleLocalCursorChange } = useLiveCursor({
    socket,
    activeFileId,
    projectId,
    editorRef,
    monacoRef,
    currentUser,
  });

  const { remotePointers, handleMouseMove } = useMouseTracking({
    socket,
    activeFileId,
    projectId,
    containerRef: editorContainerRef,
    currentUser,
    enabled: isMouseTrackingEnabled,
  });

  const handleSelectCollaborator = (user) => {
    setSelectedCollaborator(user);
    setIsProfileModalOpen(true);
  };

  // Full-App Dev Server Runner states
  const [serverStatus, setServerStatus] = useState("stopped"); // "stopped" | "installing" | "starting" | "running" | "error"
  const [devServerPort, setDevServerPort] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [editLock, setEditLock] = useState(null);

  // Team Management states
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Editor");
  const [isInviting, setIsInviting] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [diffVersion, setDiffVersion] = useState(null); // Version object being diffed

  // Versions & Timeline States
  const [versions, setVersions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [versionNote, setVersionNote] = useState("");

  const userRole = useMemo(() => {
    if (!project || !currentUser) return "Viewer";
    const ownerId = project.owner?._id || project.owner;
    if (ownerId === currentUser.id) return "Owner";
    return project.memberRoles?.[currentUser.id] || "Editor";
  }, [project, currentUser]);

  const isViewer = userRole === "Viewer" || userRole === "Client";
  const isOwner = userRole === "Owner";
  const isAdmin = userRole === "Admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const currentUserId = String(currentUser?.id || currentUser?._id || "");
  const isEditLockedByOther = Boolean(
    editLock?.isLocked && String(editLock.ownerUserId) !== currentUserId
  );
  const canModifyProject = !isViewer && !isEditLockedByOther;

  // Code Execution States
  const [stdin, setStdin] = useState("");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [compileError, setCompileError] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  // Editor Preferences Local Storage states
  const [editorFontSize, setEditorFontSize] = useState(14);

  useEffect(() => {
    const savedFontSize = localStorage.getItem("ide_font_size");
    if (savedFontSize) setEditorFontSize(parseInt(savedFontSize, 10));
  }, []);

  // Editor Ref & Monaco Instances
  const isApplyingSocketEdit = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Fetch Project Details & Flat file system
  const loadProjectAndFiles = useCallback(async () => {
    try {
      const pData = await fetchProjectById(projectId);
      setProject(pData.project);
      
      const fData = await fetchProjectFiles(projectId);
      const fileList = fData.files || [];
      setFiles(fileList);

      // Auto-open first priority source file if no active tab is currently open
      if (fileList.length > 0) {
        setOpenTabs((prev) => {
          if (prev.length > 0) return prev;
          const sourceFiles = fileList.filter((f) => !f.isFolder);
          if (sourceFiles.length > 0) {
            const priorityNames = [
              "app.jsx",
              "app.tsx",
              "main.jsx",
              "main.tsx",
              "index.js",
              "index.html",
              "main.py",
              "app.py",
              "main.java",
              "readme.md",
            ];
            const defaultFile =
              sourceFiles.find((f) => priorityNames.includes(f.name.toLowerCase())) || sourceFiles[0];
            setActiveFileId(defaultFile._id);
            return [{ fileId: defaultFile._id, name: defaultFile.name, isDirty: false }];
          }
          return prev;
        });
      }
      // Fetch active dev server status & port
      try {
        const sData = await fetchServerStatusRequest(projectId);
        if (sData) {
          setServerStatus(sData.serverStatus || "stopped");
          if (sData.devServerPort) setDevServerPort(sData.devServerPort);
          if (sData.previewUrl) setPreviewUrl(sData.previewUrl);
          setEditLock(sData.editLock || null);
          if (sData.serverStatus === "running") setIsPreviewOpen(true);
        }
      } catch {
        // Runner status fetch fallback
      }
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to load project details", "error");
    } finally {
      setIsLoadingProject(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    loadProjectAndFiles();
  }, [loadProjectAndFiles]);

  const refreshProjectFiles = useCallback(async () => {
    try {
      const data = await fetchProjectFiles(projectId);
      setFiles(data.files || []);
      return data.files || [];
    } catch (err) {
      console.error("Failed to refresh project files:", err);
      return [];
    }
  }, [projectId]);

  // Fetch version snapshots & activities
  const loadVersions = useCallback(async () => {
    try {
      const data = await fetchVersions(projectId);
      setVersions(data.versions || []);
    } catch (err) {
      console.error("Failed to load versions:", err);
    }
  }, [projectId]);

  const loadActivities = useCallback(async () => {
    try {
      const data = await fetchActivities(projectId);
      setActivities(data.activities || []);
    } catch (err) {
      console.error("Failed to load activities:", err);
    }
  }, [projectId]);

  const loadMembersAndInvites = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const membersData = await fetchMembers(projectId);
      setMembers(membersData.members || []);
      
      if (userRole === "Owner" || userRole === "Admin") {
        const invitesData = await fetchProjectInvitations(projectId);
        setPendingInvites(invitesData.invitations || []);
      } else {
        setPendingInvites([]);
      }
    } catch (err) {
      console.error("Failed to load members or invitations:", err);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [projectId, userRole]);

  // Load versions, activities and members on tab changes
  useEffect(() => {
    if (activeTab === "users") loadMembersAndInvites();
    if (activeTab === "versions") loadVersions();
    if (activeTab === "activity") loadActivities();
  }, [activeTab, loadVersions, loadActivities, loadMembersAndInvites]);

  // 1. Establish Socket Connection
  useEffect(() => {
    if (isLoadingProject || !project) return;

    const defaultDevUrl = `http://${window.location.hostname}:5000`;
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.startsWith("http")
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, "")
        : import.meta.env.MODE === "development"
        ? defaultDevUrl
        : window.location.origin);

    const socketInstance = io(socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketInstance.on("connect", () => {
      console.log("[IDE Workspace] Sockets online. Joining project presence room...");
      socketInstance.emit("join-project", { projectId });
    });

    socketInstance.on("connect_error", (err) => {
      console.error(`[IDE Workspace] Socket connection error: ${err.message}`);
      addToast("WebSocket connection failed. Collaboration offline.", "error");
    });

    // Receive full file code sync from server
    socketInstance.on("file-sync", ({ fileId, code }) => {
      if (activeFileId === fileId && editorRef.current) {
        isApplyingSocketEdit.current = true;
        const model = editorRef.current.getModel();
        if (model) {
          model.setValue(code || "");
          // Clear dirty state on sync
          setOpenTabs((prev) =>
            prev.map((t) => (t.fileId === fileId ? { ...t, isDirty: false } : t))
          );
        }
        isApplyingSocketEdit.current = false;
      }
    });

    // Receive character-level delta edits
    socketInstance.on("code-change", ({ fileId, userId, rangeOffset, rangeLength, text }) => {
      if (activeFileId !== fileId || !editorRef.current) return;

      const model = editorRef.current.getModel();
      if (!model) return;

      isApplyingSocketEdit.current = true;

      const startPos = model.getPositionAt(rangeOffset);
      const endPos = model.getPositionAt(rangeOffset + rangeLength);
      const range = new monacoRef.current.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column
      );

      editorRef.current.executeEdits("socket", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);

      isApplyingSocketEdit.current = false;
    });

    // Receive remote user online list
    socketInstance.on("users-update", (users) => {
      setOnlineUsers(users);
    });

    // Receive remote typing indicators
    socketInstance.on("typing-update", ({ fileId, userId, username, isTyping }) => {
      if (activeFileId !== fileId) return;
      setOnlineUsers((prev) =>
        prev.map((u) => (u.userId === userId ? { ...u, isTyping } : u))
      );
    });

    // Real-Time Dev Server status and terminal log listeners
    socketInstance.on("project-status-change", ({ status, port, previewUrl: pUrl }) => {
      setServerStatus(status);
      if (port) setDevServerPort(port);
      if (pUrl) setPreviewUrl(pUrl);
      if (status === "running") {
        setIsPreviewOpen(true);
      }
    });

    socketInstance.on("project-edit-lock-change", ({ editLock: nextEditLock }) => {
      setEditLock(nextEditLock || null);
    });

    socketInstance.on("project-terminal-log", ({ log }) => {
      setStdout((prev) => prev + (log.endsWith("\n") ? log : `${log}\n`));
    });

    // Real-Time Team Management updates
    socketInstance.on("member-joined", () => {
      loadMembersAndInvites();
      addToast("A new collaborator joined the project workspace!", "info");
    });

    // Real-Time Project Files synchronization (create, rename, delete, upload, import)
    socketInstance.on("files-updated", async (data) => {
      try {
        const dataFiles = await fetchProjectFiles(projectId);
        const updatedFiles = dataFiles.files || [];
        setFiles(updatedFiles);

        if (data?.action === "delete" && data.fileId) {
          setOpenTabs((prev) => {
            const filtered = prev.filter((t) => t.fileId !== data.fileId);
            setActiveFileId((currActive) => {
              if (currActive === data.fileId) {
                return filtered.length > 0 ? filtered[filtered.length - 1].fileId : null;
              }
              return currActive;
            });
            return filtered;
          });
        }

        if (data?.action === "rename" && data.file) {
          setOpenTabs((prev) =>
            prev.map((t) => (t.fileId === data.file._id ? { ...t, name: data.file.name } : t))
          );
        }

        const isOtherUser = data?.userId && String(data.userId) !== String(currentUser?.id || currentUser?._id);
        if (isOtherUser) {
          if (data.action === "create" && data.file?.name) {
            addToast(`Collaborator created "${data.file.name}"`, "info");
          } else if (data.action === "delete" && data.name) {
            addToast(`Collaborator deleted "${data.name}"`, "info");
          } else if (data.action === "rename" && data.file?.name) {
            addToast(`Collaborator renamed "${data.oldName || "file"}" to "${data.file.name}"`, "info");
          } else if (data.action === "upload" && data.file?.name) {
            addToast(`Collaborator uploaded "${data.file.name}"`, "info");
          } else if (data.action === "upload-folder" || data.action === "import") {
            addToast("Collaborator uploaded new project files", "info");
          }
        }
      } catch (err) {
        console.error("Failed to sync updated files:", err);
      }
    });

    socketInstance.on("member-role-updated", ({ userId, role }) => {
      loadMembersAndInvites();
      loadProjectAndFiles();
      if (userId === currentUser?.id) {
        addToast(`Your workspace role was updated to: ${role}`, "info");
      }
    });

    socketInstance.on("member-removed", ({ userId, name }) => {
      if (userId === currentUser?.id) {
        addToast("You have been removed from this project workspace.", "error");
        navigate("/dashboard");
      } else {
        loadMembersAndInvites();
        addToast(`Collaborator "${name}" was removed from the workspace.`, "info");
      }
    });

    socketInstance.on("error", (err) => {
      addToast(err.message || "Socket error occurred", "error");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [isLoadingProject, project, projectId, activeFileId, addToast, loadMembersAndInvites, loadProjectAndFiles, currentUser, navigate]);

  // 2. Tab & File Selection Handlers
  const handleSelectFile = async (file) => {
    // If folder, skip
    if (file.isFolder) return;

    // Add to open tabs if not already present
    setOpenTabs((prev) => {
      if (prev.some((t) => t.fileId === file._id)) return prev;
      return [...prev, { fileId: file._id, name: file.name, isDirty: false }];
    });

    // Set active file
    setActiveFileId(file._id);
  };

  const handleCloseTab = (e, fileId) => {
    e.stopPropagation();
    
    if (socket && fileId) {
      socket.emit("leave-file", { fileId });
    }

    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t.fileId !== fileId);
      
      // If we closed the active tab, find a fallback active tab
      if (activeFileId === fileId) {
        if (filtered.length > 0) {
          setActiveFileId(filtered[filtered.length - 1].fileId);
        } else {
          setActiveFileId(null);
        }
      }
      return filtered;
    });
  };

  // Load new file content on active file change
  useEffect(() => {
    if (!activeFileId) return;

    const loadFile = async () => {
      try {
        const data = await fetchFileContent(activeFileId);
        
        // Open file in Editor
        if (editorRef.current) {
          isApplyingSocketEdit.current = true;
          editorRef.current.setValue(data.content || "");
          isApplyingSocketEdit.current = false;
        }

        // Notify socket to switch rooms
        if (socket) {
          socket.emit("join-file", { fileId: activeFileId });
        }
      } catch (err) {
        addToast("Failed to fetch file content", "error");
      }
    };

    loadFile();
  }, [activeFileId, socket, addToast]);

  // 3. Local Monaco Change Handlers
  const handleEditorChange = (value, event) => {
    if (isApplyingSocketEdit.current || !socket || !activeFileId || !canModifyProject) return;

    const changes = event.changes;
    if (!changes || changes.length === 0) return;

    // Mark active tab as dirty/modified
    setOpenTabs((prev) =>
      prev.map((t) => (t.fileId === activeFileId ? { ...t, isDirty: true } : t))
    );

    // Emit character deltas to server
    changes.forEach((change) => {
      socket.emit("code-change", {
        fileId: activeFileId,
        rangeOffset: change.rangeOffset,
        rangeLength: change.rangeLength,
        text: change.text,
      });
    });

    // Emit typing indicator status
    socket.emit("typing-status", { fileId: activeFileId, isTyping: true });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing-status", { fileId: activeFileId, isTyping: false });
    }, 1000);
  };

  // Manual save trigger (emits immediate force-file-sync to save cached state in MongoDB)
  const handleManualSave = useCallback(() => {
    if (!socket || !activeFileId || !editorRef.current || !canModifyProject) return;
    const code = editorRef.current.getValue();

    socket.emit("force-file-sync", { fileId: activeFileId, code });
    
    // Clear dirty indicator
    setOpenTabs((prev) =>
      prev.map((t) => (t.fileId === activeFileId ? { ...t, isDirty: false } : t))
    );
    addToast("File saved to database", "success");
  }, [socket, activeFileId, addToast, canModifyProject]);

  // Setup Monaco instance commands
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // The first file can load before Monaco mounts; sync it again once the editor is ready.
    if (activeFileId) {
      fetchFileContent(activeFileId)
        .then((data) => {
          if (editorRef.current === editor) {
            isApplyingSocketEdit.current = true;
            editor.setValue(data.content || "");
            isApplyingSocketEdit.current = false;
          }
        })
        .catch(() => {
          addToast("Failed to fetch file content", "error");
        });
    }

    editor.onDidChangeCursorPosition(() => {
      handleLocalCursorChange();
    });
    editor.onDidChangeCursorSelection(() => {
      handleLocalCursorChange();
    });

    // Bind Ctrl+S / Cmd+S save command shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleManualSave();
    });
  };

  // Get active file metadata
  const activeFile = useMemo(() => {
    return files.find((f) => f._id === activeFileId);
  }, [files, activeFileId]);

  // 3.5 Team Management Action Handlers
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      await createInvitationRequest(projectId, { email: inviteEmail.trim(), role: inviteRole });
      addToast(`Collaboration invitation sent to ${inviteEmail}`, "success");
      setInviteEmail("");
      setInviteRole("Editor");
      loadMembersAndInvites();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to invite member", "error");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId, name) => {
    const isSelf = memberId === currentUser?.id;
    const confirmMessage = isSelf
      ? "Are you sure you want to leave this project?"
      : `Are you sure you want to remove "${name}" from this project?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await removeMemberRequest(projectId, memberId);
      addToast(isSelf ? "You left the project" : `${name} removed successfully`, "success");
      
      if (isSelf) {
        window.location.href = "/dashboard";
      } else {
        loadMembersAndInvites();
      }
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to remove member", "error");
    }
  };

  const handleRoleChange = async (memberId, role) => {
    try {
      await updateMemberRoleRequest(projectId, memberId, role);
      addToast("Member role updated successfully", "success");
      loadMembersAndInvites();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to change member role", "error");
    }
  };

  const handleCancelInvite = async (inviteId) => {
    const confirm = window.confirm("Are you sure you want to cancel this pending invitation?");
    if (!confirm) return;

    try {
      await cancelInvitationRequest(inviteId);
      addToast("Invitation canceled", "info");
      setPendingInvites((prev) => prev.filter((i) => i._id !== inviteId));
    } catch (err) {
      addToast("Failed to cancel invitation", "error");
    }
  };

  // 4. Version Controls Action
  const handleSaveVersion = async (e) => {
    e.preventDefault();
    if (isSavingVersion) return;

    setIsSavingVersion(true);
    try {
      // Force save active file first
      if (activeFileId && editorRef.current) {
        const code = editorRef.current.getValue();
        socket.emit("force-file-sync", { fileId: activeFileId, code });
      }

      await saveVersionRequest(projectId, versionNote.trim());
      addToast("Version snapshot saved!", "success");
      setVersionNote("");
      loadVersions();
      loadActivities();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to save version snapshot", "error");
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleRestoreVersion = async (version) => {
    const confirm = window.confirm(`Are you sure you want to restore to version v${version.versionNumber}? Current workspace contents will be replaced.`);
    if (!confirm) return;

    try {
      const data = await restoreVersionRequest(projectId, version._id);
      addToast(`Restored to Version ${version.versionNumber}`, "success");

      // Reload project file structure
      const fData = await fetchProjectFiles(projectId);
      setFiles(fData.files || []);

      // If active file is still open, reload its content
      if (activeFileId) {
        const fileData = await fetchFileContent(activeFileId);
        if (editorRef.current) {
          isApplyingSocketEdit.current = true;
          editorRef.current.setValue(fileData.content || "");
          isApplyingSocketEdit.current = false;
        }
        if (socket) {
          socket.emit("force-file-sync", { fileId: activeFileId, code: fileData.content });
        }
      }

      loadVersions();
      loadActivities();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to restore version snapshot", "error");
    }
  };

  // 5. Code Execution Controls Action
  const handleRunCode = async () => {
    if (isRunning || !activeFileId || !canModifyProject) return;

    setIsRunning(true);
    setStdout("");
    setStderr("");
    setCompileError("");
    setPreviewHtml("");

    try {
      const code = editorRef.current ? editorRef.current.getValue() : "";
      let fileLanguage = activeFile ? getExecutionLanguage(activeFile.name) : null;

      // Auto-detect React/JSX in .js files and render as live preview
      const hasJSX = /import\s+React|from\s+['"]react['"]|<[A-Z][a-zA-Z]*[\s/>]|<div[\s>]|<span[\s>]|<p[\s>]|<h[1-6][\s>]|<button[\s>]|<input[\s/>]|<form[\s>]/.test(code);
      const isReactCode = fileLanguage === "react" || (fileLanguage === "javascript" && hasJSX);

      if (!fileLanguage) {
        addToast("This file type cannot be executed. Select a code file (JS, TS, Python, C, C++, Java, HTML, CSS, React) to run.", "warning");
        setIsRunning(false);
        return;
      }

      // Static files can be previewed immediately without Docker or a dev server.
      if (fileLanguage === "html" || fileLanguage === "css") {
        const htmlFile = files.find((file) => !file.isFolder && file.name.toLowerCase() === "index.html");
        const cssFile = files.find((file) => !file.isFolder && /\.css$/i.test(file.name));
        const htmlCode = fileLanguage === "html" ? code : htmlFile?.content || "";
        const cssCode = fileLanguage === "css" ? code : cssFile?.content || "";
        const previewDoc = buildStaticPreview(
          htmlCode,
          cssCode,
          files.filter((file) => !file.isFolder && /\.html?$/i.test(file.name)),
          files.filter((file) => !file.isFolder && /\.js$/i.test(file.name)),
          activeFile.name
        );
        setPreviewHtml(previewDoc);
        setIsPreviewOpen(true);
        addToast("Preview generated successfully!", "success");
        setIsRunning(false);
        loadActivities();
        return;
      }

      // For React/JSX code, generate a live browser preview directly (no server round-trip needed)
      if (isReactCode) {
        // Strip ES module import/export for browser compatibility (React/ReactDOM loaded via CDN)
        let cleanCode = code
          .replace(/^import\s+.*from\s+['"]react(-dom)?(\/client)?['"];?\s*$/gm, "")
          .replace(/^import\s+.*from\s+['"][^'"]+['"];?\s*$/gm, "// (import removed for preview)")
          .replace(/^export\s+default\s+/gm, "var _DefaultExport = ")
          .replace(/^export\s+/gm, "");
        // Escape closing script tags inside the code
        cleanCode = cleanCode.replace(/<\/script>/gi, "<\\/script>");

        const previewDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React Live Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    #root { min-height: 100vh; }
    .error-overlay { position:fixed;bottom:0;left:0;right:0;background:#2d1b1b;color:#ff6b6b;padding:16px;font-family:monospace;font-size:13px;white-space:pre-wrap;border-top:3px solid #ff4444;z-index:9999; }
  </style>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="env,react">
    const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, useReducer } = React;

    ${cleanCode}

    // Auto-mount the component
    const _App = typeof _DefaultExport !== 'undefined' ? _DefaultExport : typeof App !== 'undefined' ? App : null;
    if (_App) {
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(_App));
    }
  <\/script>
  <script>window.onerror=function(m,u,l){var e=document.createElement('div');e.className='error-overlay';e.textContent='Error: '+m+'\\nLine: '+l;document.body.appendChild(e);};<\/script>
</body>
</html>`;
        setPreviewHtml(previewDoc);
        addToast("React preview generated!", "success");
        setIsRunning(false);
        loadActivities();
        return;
      }

      // Use Socket.IO only for languages supported by the interactive runner.
      // Java and TypeScript use the HTTP compiler path for compilation support.
      const supportsInteractiveExecution = ["python", "javascript", "c", "cpp"].includes(fileLanguage);
      if (socket && supportsInteractiveExecution) {
        // Define handlers before using them
        const handleOutput = (data) => {
          setStdout((prev) => prev + data.data);
        };

        const handleError = (data) => {
          setStderr((prev) => prev + data.message);
          if (data.message.startsWith("Compilation error:")) {
            setIsRunning(false);
            loadActivities();
            socket.off("code-execution-output", handleOutput);
            socket.off("code-execution-error", handleError);
            socket.off("code-execution-complete", handleComplete);
          }
        };

        const handleComplete = () => {
          setIsRunning(false);
          loadActivities();
          socket.off("code-execution-output", handleOutput);
          socket.off("code-execution-error", handleError);
          socket.off("code-execution-complete", handleComplete);
        };

        // Set up event listeners
        socket.on("code-execution-output", handleOutput);
        socket.on("code-execution-error", handleError);
        socket.on("code-execution-complete", handleComplete);

        // Emit the run command; keep isRunning true until complete/error events
        socket.emit("run-code-interactive", {
          projectId,
          code,
          language: fileLanguage,
        });
        return;
      } else {
        // Fallback to HTTP if socket is not available
        const result = await runCodeRequest(projectId, code, stdin, fileLanguage);

        if (result.compileError) {
          setCompileError(result.compileError);
          addToast("Compilation failed", "error");
        } else if (result.stderr) {
          setStderr(result.stderr);
          addToast("Runtime error occurred", "error");
        } else {
          // For HTML/CSS files, show preview; for others, show stdout
          if (fileLanguage === "html" || fileLanguage === "css") {
            setPreviewHtml(result.stdout || "");
            addToast("Preview generated successfully!", "success");
          } else {
            setStdout(result.stdout || "(No program output generated)");
            addToast("Code executed successfully!", "success");
          }
        }
        loadActivities();
        setIsRunning(false);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || "Execution run failed. Ensure Docker is started.";
      setStderr(errMsg);
      addToast(errMsg, "error");
      setIsRunning(false);
    }
  };

  // Full-App Dev Server Runner Action Handlers
  const handleStartDevServer = async () => {
    if (!canModifyProject) return;
    const fileLanguage = activeFile ? getExecutionLanguage(activeFile.name) : null;
    if (fileLanguage === "html" || fileLanguage === "css") {
      const code = editorRef.current ? editorRef.current.getValue() : activeFile.content || "";
      const htmlFile = files.find((file) => !file.isFolder && file.name.toLowerCase() === "index.html");
      const cssFile = files.find((file) => !file.isFolder && /\.css$/i.test(file.name));
      const htmlCode = fileLanguage === "html" ? code : htmlFile?.content || "";
      const cssCode = fileLanguage === "css" ? code : cssFile?.content || "";
      const previewDoc = buildStaticPreview(
        htmlCode,
        cssCode,
        files.filter((file) => !file.isFolder && /\.html?$/i.test(file.name)),
        files.filter((file) => !file.isFolder && /\.js$/i.test(file.name)),
        activeFile.name
      );
      setPreviewHtml(previewDoc);
      setIsPreviewOpen(true);
      setServerStatus("running");
      setPreviewUrl(null);
      setDevServerPort(null);
      addToast("HTML/CSS preview started instantly", "success");
      return;
    }

    setIsPreviewOpen(true);
    setServerStatus("starting");
    addToast("Launching development server...", "info");

    try {
      const res = await startServerRequest(projectId);
      setServerStatus("running");
      if (res.port) setDevServerPort(res.port);
      if (res.previewUrl) setPreviewUrl(res.previewUrl);
      addToast(`Dev server running on port ${res.port}!`, "success");
    } catch (err) {
      setServerStatus("error");
      addToast(err.response?.data?.message || "Failed to start dev server", "error");
    }
  };

  const handleStopDevServer = async () => {
    if (!canModifyProject) return;
    if (previewHtml && !previewUrl) {
      setPreviewHtml("");
      setServerStatus("stopped");
      setIsPreviewOpen(false);
      addToast("Preview stopped", "info");
      return;
    }

    try {
      await stopServerRequest(projectId);
      setServerStatus("stopped");
      setDevServerPort(null);
      setPreviewUrl(null);
      setPreviewHtml("");
      addToast("Dev server stopped", "info");
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to stop dev server", "error");
    }
  };

  const handleRestartDevServer = async () => {
    await handleStopDevServer();
    setTimeout(() => {
      handleStartDevServer();
    }, 1000);
  };

  // userRole variable relocated to top of component

  const currentLanguageLabel = useMemo(() => {
    if (!project) return "";
    return project.language === "cpp" ? "C++" : project.language === "c" ? "C" : project.language;
  }, [project]);

  if (isLoadingProject) {
    return <WorkspaceSkeleton />;
  }

  if (!project) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100">
        <AlertCircle className="text-red-500 mb-3" size={36} />
        <h1 className="text-xl font-semibold">Project not found</h1>
        <Link to="/dashboard" className="text-indigo-400 hover:text-indigo-300 mt-4 text-sm font-medium">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <header className="h-14 border-b border-slate-900 bg-slate-950 px-4 md:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <FileCode size={18} className="text-indigo-400 shrink-0" />
            <h1 className="text-sm md:text-base font-semibold text-slate-100 truncate">
              {project.name}
            </h1>
            <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 shrink-0 text-slate-400">
              {currentLanguageLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Collaborators Presence List */}
          <div className="hidden sm:flex items-center mr-2">
            <PresenceList
              presenceList={presenceList}
              compact={true}
              onSelectCollaborator={handleSelectCollaborator}
            />
          </div>

          <button
            onClick={() => setIsChatOpen((prev) => !prev)}
            className={`p-2 rounded border transition-colors cursor-pointer ${
              isChatOpen
                ? "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Workspace Chat"
          >
            <MessageSquare size={16} />
          </button>

          <ThemeToggle />

          <NotificationDropdown socket={socket} />

          <button
            onClick={() => setIsMemberModalOpen(true)}
            className="p-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-300 cursor-pointer"
            title="Manage Collaborators"
          >
            <Users size={16} />
          </button>

          {isOwnerOrAdmin && (
            <button
              onClick={() => setIsMemberModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Invite Collaborator"
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Invite</span>
            </button>
          )}

          {/* Dev Server App Runner Buttons */}
          <button
            onClick={() => setIsPreviewOpen((prev) => !prev)}
            className={`p-2 rounded border transition-colors cursor-pointer ${
              isPreviewOpen
                ? "bg-cyan-600 border-cyan-500 text-white"
                : "bg-slate-900 border-slate-800 text-cyan-400 hover:text-cyan-300"
            }`}
            title="Toggle Live Application Preview"
          >
            <Globe size={16} />
          </button>

          {serverStatus === "running" ? (
            <button
              onClick={handleStopDevServer}
              disabled={isViewer}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors cursor-pointer"
              title="Stop App Server"
            >
              <Square size={12} fill="currentColor" />
              <span>Stop Server</span>
            </button>
          ) : (
            <button
              onClick={handleStartDevServer}
              disabled={isViewer}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded shadow-sm shadow-emerald-600/30 transition-colors cursor-pointer"
              title="Run Complete Application Server"
            >
              <Play size={12} fill="currentColor" />
              <span>Start Server</span>
            </button>
          )}

          <button
            onClick={handleRunCode}
            disabled={isRunning || !activeFileId || isViewer}
            className={`flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors cursor-pointer ${
              isViewer
                ? "bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
            title="Run Single Code File"
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <Play size={13} fill="currentColor" />
                <span>Run File</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 2. Workspace Body Area */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left 1: Interactive File Explorer */}
        <aside className="w-56 border-r border-slate-900 bg-slate-950 flex flex-col shrink-0">
          <FileExplorer
            projectId={projectId}
            files={files}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            isReadOnly={isViewer}
            refreshFiles={refreshProjectFiles}
          />
        </aside>

        {/* Collaboration controls now live in the Project Collaborators modal. */}
        <aside className="hidden" aria-hidden="true">
          <div className="flex border-b border-slate-900 text-xs shrink-0">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === "users"
                  ? "border-indigo-500 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Team
            </button>
            <button
              onClick={() => setActiveTab("versions")}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === "versions"
                  ? "border-indigo-500 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Versions
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === "activity"
                  ? "border-indigo-500 text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              Timeline
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {activeTab === "users" && (
              <div className="space-y-5">
                {/* Invite Collaborator (Owner/Admin Only) */}
                {(userRole === "Owner" || userRole === "Admin") ? (
                  <form onSubmit={handleInviteSubmit} className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Invite Collaborator
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        placeholder="Invite by email..."
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none transition-colors min-w-0"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="rounded border border-slate-800 bg-slate-950 px-1 py-1.5 text-[10px] text-slate-300 focus:outline-none cursor-pointer"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Editor">Editor</option>
                        <option value="Viewer">Viewer</option>
                        <option value="Client">Client (read-only)</option>
                      </select>
                      <button
                        type="submit"
                        disabled={isInviting || !inviteEmail.trim()}
                        className="p-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 cursor-pointer disabled:opacity-50 transition-colors flex items-center justify-center"
                        title="Send invitation"
                      >
                        {isInviting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <UserPlus size={12} />
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded border border-slate-850 bg-slate-950/20 p-2.5">
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Only project Owners and Admins can invite team members.
                    </p>
                  </div>
                )}

                {/* Team Members List */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Workspace Members ({members.length})
                  </h3>

                  {isLoadingMembers ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={16} className="text-indigo-500 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[30vh] overflow-y-auto pr-1">
                      {members.map((member) => {
                        const isMemberOnline = onlineUsers.some((u) => u.userId.toString() === member._id.toString());
                        const isMemberSelf = member._id === currentUser?.id;
                        const isMemberOwner = member.role === "Owner";
                        const isRequesterOwner = userRole === "Owner";
                        const isRequesterAdmin = userRole === "Admin";
                        
                        // Permission checks for role edits & kicks
                        const canModify = (isRequesterOwner || (isRequesterAdmin && member.role !== "Admin" && member.role !== "Owner")) && !isMemberSelf;

                        return (
                          <div
                            key={member._id}
                            className="p-2.5 rounded border border-slate-900 bg-slate-900/10 flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {/* Online Status Indicator Dot */}
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    isMemberOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-700"
                                  }`}
                                  title={isMemberOnline ? "Online" : "Offline"}
                                />
                                <span className="text-xs font-semibold text-slate-200 truncate">
                                  {member.name} {isMemberSelf ? "(You)" : ""}
                                </span>
                              </div>

                              {/* Member Role Display or Change Dropdown */}
                              {canModify ? (
                                <select
                                  value={member.role}
                                  onChange={(e) => handleRoleChange(member._id, e.target.value)}
                                  className="text-[9px] font-bold bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-indigo-400 cursor-pointer focus:outline-none"
                                >
                                  {isRequesterOwner && <option value="Admin">Admin</option>}
                                  <option value="Editor">Editor</option>
                                  <option value="Viewer">Viewer</option>
                                  <option value="Client">Client</option>
                                </select>
                              ) : (
                                <span
                                  className={`px-1 rounded text-[8px] font-bold uppercase tracking-wider border ${
                                    isMemberOwner
                                      ? "bg-amber-950/20 border-amber-900/30 text-amber-400"
                                      : member.role === "Admin"
                                      ? "bg-red-950/20 border-red-900/30 text-red-400"
                                      : member.role === "Viewer"
                                      ? "bg-slate-900/40 border-slate-800/40 text-slate-500"
                                      : member.role === "Client"
                                      ? "bg-cyan-950/20 border-cyan-900/30 text-cyan-400"
                                      : "bg-indigo-950/20 border-indigo-900/30 text-indigo-400"
                                  }`}
                                >
                                  {member.role}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-500 gap-2 pl-3.5">
                              <span className="truncate">{member.email}</span>
                              
                              {/* Remove/Leave Actions */}
                              {canModify && (
                                <button
                                  onClick={() => handleRemoveMember(member._id, member.name)}
                                  className="text-[9px] text-red-500 hover:text-red-400 font-semibold cursor-pointer shrink-0 transition-colors"
                                  title="Remove from project"
                                >
                                  Remove
                                </button>
                              )}
                              {!isMemberOwner && isMemberSelf && (
                                <button
                                  onClick={() => handleRemoveMember(member._id, "Self")}
                                  className="text-[9px] text-red-500 hover:text-red-400 font-semibold cursor-pointer shrink-0 transition-colors"
                                >
                                  Leave
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pending Invitations Section (Owner/Admin Only) */}
                {(userRole === "Owner" || userRole === "Admin") && pendingInvites.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-900/80">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Pending Invites ({pendingInvites.length})
                    </h3>
                    <div className="space-y-1.5 max-h-[20vh] overflow-y-auto pr-1">
                      {pendingInvites.map((invite) => (
                        <div
                          key={invite._id}
                          className="p-2 rounded border border-slate-900 bg-slate-900/20 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-300 truncate">{invite.email}</p>
                            <p className="text-[9px] text-slate-500">
                              Role: <span className="text-indigo-400 font-bold">{invite.role}</span>
                            </p>
                          </div>
                          <button
                            onClick={() => handleCancelInvite(invite._id)}
                            className="text-[9px] text-red-500 hover:text-red-400 font-semibold cursor-pointer shrink-0"
                            title="Cancel invitation"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "versions" && (
              <div className="space-y-4">
                {!isViewer && (
                  <form onSubmit={handleSaveVersion} className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Save New Snapshot
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add brief note..."
                        value={versionNote}
                        onChange={(e) => setVersionNote(e.target.value)}
                        className="flex-1 rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isSavingVersion}
                        className="p-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 cursor-pointer"
                        title="Save snapshot version"
                      >
                        <Save size={14} />
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Snapshot Logs ({versions.length})
                  </h3>
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {versions.map((ver) => (
                      <div
                        key={ver._id}
                        className="p-3 rounded border border-slate-900 bg-slate-900/20 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/30 px-1.5 py-0.5 rounded">
                              v{ver.versionNumber}
                            </span>
                            <span className="text-[10px] text-slate-500 ml-2 font-mono">
                              {new Date(ver.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setDiffVersion(ver)}
                              className="text-[10px] text-slate-400 hover:text-indigo-400 border border-slate-800 hover:border-indigo-950 bg-slate-950 px-2 py-0.5 rounded cursor-pointer"
                              title="Compare code diffs"
                            >
                              Diff
                            </button>
                            {!isViewer && (
                              <button
                                onClick={() => handleRestoreVersion(ver)}
                                className="text-[10px] text-slate-400 hover:text-emerald-400 border border-slate-800 hover:border-emerald-950 bg-slate-950 px-2 py-0.5 rounded cursor-pointer"
                                title="Restore to this code"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-300 italic">"{ver.description}"</p>
                        <p className="text-[9px] text-slate-500 self-end font-medium">
                          By: {ver.createdBy?.name || "Member"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "activity" && (
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Timeline History
                </h3>
                <div className="space-y-4 border-l border-slate-800 ml-2 pl-3 py-1">
                  {activities.map((act) => (
                    <div key={act._id} className="relative text-xs">
                      <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-slate-700 border border-slate-950" />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono mb-0.5">
                        <span>{act.user?.name || "System"}</span>
                        <span>
                          {new Date(act.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-slate-300 leading-normal">
                        {act.type === "CREATE" && `Created project "${act.details?.name}"`}
                        {act.type === "JOIN" && "Joined workspace room"}
                        {act.type === "LEAVE" && "Left workspace room"}
                        {act.type === "ADD_MEMBER" && `Invited collaborator: ${act.details?.memberName}`}
                        {act.type === "REMOVE_MEMBER" && `Removed collaborator: ${act.details?.memberName}`}
                        {act.type === "SAVE_VERSION" && `Saved snapshot version v${act.details?.versionNumber}`}
                        {act.type === "RESTORE_VERSION" && `Restored project files to version v${act.details?.versionNumber}`}
                        {act.type === "RUN" && `Ran program in container (${act.details?.language})`}
                        {act.type === "EDIT" &&
                          `${act.details?.action === "create" ? "Created" : act.details?.action === "rename" ? "Renamed" : "Deleted"} ${
                            act.details?.type
                          } "${act.details?.name || act.details?.newName}"`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center: Open Tabs Bar, Monaco Editor & Bottom Console Drawer */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* React Project Command System Toolbar */}
          {isReactProject && (
            <ReactCommandToolbar
              projectId={projectId}
              serverStatus={serverStatus}
              devServerPort={devServerPort}
              previewUrl={previewUrl}
              isReadOnly={isViewer}
              isOwner={isOwner}
              onOpenPreview={() => setIsPreviewOpen(true)}
              onRefreshFiles={refreshProjectFiles}
              onDeleteProject={() => navigate("/dashboard")}
            />
          )}

          {/* Open Tabs Bar */}
          <div className="h-9 border-b border-slate-900 bg-slate-950 flex items-center overflow-x-auto shrink-0 scrollbar-none">
            {openTabs.map((tab) => (
              <div
                key={tab.fileId}
                onClick={() => handleSelectFile(files.find((f) => f._id === tab.fileId))}
                className={`group flex items-center h-full px-4 border-r border-slate-900 text-xs gap-2 select-none cursor-pointer transition-colors ${
                  activeFileId === tab.fileId
                    ? "bg-slate-900/60 text-slate-100 font-semibold border-t-2 border-t-indigo-500"
                    : "text-slate-500 hover:bg-slate-900/20 hover:text-slate-300"
                }`}
              >
                <FileText size={13} className="text-slate-400 shrink-0" />
                <span>{tab.name}</span>
                {tab.isDirty && (
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" title="Unsaved changes" />
                )}
                <button
                  onClick={(e) => handleCloseTab(e, tab.fileId)}
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Main Work Area: Monaco Editor + Live Preview Panel Split */}
          <div className="flex-1 min-h-0 flex bg-slate-950">
            {/* Monaco Editor Pane */}
            <div
              ref={editorContainerRef}
              onMouseMove={handleMouseMove}
              className="flex-1 min-h-0 bg-slate-950 relative overflow-hidden"
            >
              {/* Live Mouse Pointers Overlay */}
              <LiveMousePointers remotePointers={remotePointers} />

              {activeFileId ? (
                <Editor
                  height="100%"
                  language={activeFile ? getMonacoLanguage(activeFile.name) : "plaintext"}
                  theme={monacoTheme}
                  onMount={handleEditorDidMount}
                  onChange={handleEditorChange}
                  options={{
                    minimap: { enabled: false },
                    scrollbar: {
                      vertical: "visible",
                      horizontal: "visible",
                      useShadows: false,
                    },
                    fontSize: editorFontSize,
                    fontFamily: "Fira Code, JetBrains Mono, Monaco, Courier New, monospace",
                    lineNumbers: "on",
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    tabSize: 2,
                    automaticLayout: true,
                    readOnly: isViewer,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-500">
                  <div className="max-w-md">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 shadow-lg shadow-indigo-950/20">
                      <FileCode size={30} className="text-indigo-400" />
                    </div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400/80">
                      A blank canvas
                    </p>
                    <h3 className="text-xl font-semibold text-slate-200">Create something worth sharing.</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                      Start with a file, shape an idea, and turn this quiet workspace into your next project.
                    </p>
                    <p className="mt-5 text-xs text-slate-600">Use the + file button in the explorer to begin.</p>
                  </div>
                </div>
              )}

              {/* Floating Manual Save Button overlay (if file is dirty) */}
              {activeFileId && openTabs.find((t) => t.fileId === activeFileId)?.isDirty && (
                <button
                  onClick={handleManualSave}
                  className="absolute top-4 right-4 flex items-center gap-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 shadow-xl transition-all cursor-pointer z-10"
                >
                  <Save size={13} />
                  <span>Save Code</span>
                </button>
              )}
            </div>

            {/* Live Preview Side Panel */}
            {isPreviewOpen && (
              <div className="w-1/2 h-full min-w-[320px] transition-all border-l border-slate-900">
                <LivePreviewPanel
                  previewUrl={previewUrl}
                  previewHtml={previewHtml}
                  serverStatus={serverStatus}
                  port={devServerPort}
                  projectType={project?.projectType || "general"}
                  onStartServer={handleStartDevServer}
                  onStopServer={handleStopDevServer}
                  onRestartServer={handleRestartDevServer}
                />
              </div>
            )}
          </div>

        </div>
      </div>

      {isChatOpen && (
        <aside className="w-80 border-l border-slate-900 bg-slate-950 flex flex-col shrink-0">
          <WorkspaceChatPanel
            projectId={projectId}
            socket={socket}
            onlineUsers={onlineUsers}
            onClose={() => setIsChatOpen(false)}
          />
        </aside>
      )}

      <MemberModal
        isOpen={isMemberModalOpen}
        onClose={() => setIsMemberModalOpen(false)}
        projectId={projectId}
        userRole={userRole}
        currentUserId={currentUser?.id}
        onlineUsers={onlineUsers}
        onBeforeSaveVersion={handleManualSave}
        onRestoreVersion={handleRestoreVersion}
        onOpenDiff={(ver) => setDiffVersion(ver)}
      />

      <CollaboratorProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        collaborator={selectedCollaborator}
        projectId={projectId}
        currentUserRole={userRole}
        currentUserId={currentUser?.id}
        files={files}
        onRemoveCollaborator={handleRemoveMember}
        onUpdateRole={handleRoleChange}
      />

      {diffVersion && (
        <DiffModal
          isOpen={!!diffVersion}
          onClose={() => setDiffVersion(null)}
          originalCode={diffVersion.code}
          modifiedCode={editorRef.current ? editorRef.current.getValue() : ""}
          title={`Compare Version v${diffVersion.versionNumber}`}
        />
      )}
    </div>
  );
};

export default Workspace;
