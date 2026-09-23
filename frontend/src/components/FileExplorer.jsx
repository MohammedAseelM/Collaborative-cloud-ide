// src/components/FileExplorer.jsx
// Responsibility: Render an interactive directory tree listing files and folders,
// supporting folder expansions, inline additions, renames, and deletions on hover.

import { useState, useMemo, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FolderPlus,
  FilePlus,
  Edit2,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FolderUp,
  RefreshCw,
  Minus,
  Plus,
  Star,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import ImportProjectModal from "./ImportProjectModal";
import {
  createFileNodeRequest,
  renameFileNodeRequest,
  deleteFileNodeRequest,
} from "../services/file.service";

const FileExplorer = ({ projectId, files, activeFileId, onSelectFile, refreshFiles, isReadOnly = false }) => {
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const [creatingNode, setCreatingNode] = useState(null); // { parentId: string | null, isFolder: boolean }
  const [creatingName, setCreatingName] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const { addToast } = useToast();

  const [favoriteNodes, setFavoriteNodes] = useState(() => {
    try {
      const saved = localStorage.getItem(`ide_favorites_${projectId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleFavorite = (e, nodeId) => {
    e.stopPropagation();
    setFavoriteNodes((prev) => {
      const isFav = !prev[nodeId];
      const updated = { ...prev, [nodeId]: isFav };
      localStorage.setItem(`ide_favorites_${projectId}`, JSON.stringify(updated));
      addToast(isFav ? "Marked resource as favorite!" : "Removed from favorites", isFav ? "success" : "info");
      return updated;
    });
  };

  const favoriteItems = useMemo(() => {
    return files.filter((f) => favoriteNodes[f._id]);
  }, [files, favoriteNodes]);

  // 1. Build nested tree structure in-memory from flat files list
  const fileTree = useMemo(() => {
    const map = {};
    const roots = [];

    // Populate node maps
    files.forEach((file) => {
      map[file._id] = { ...file, children: [] };
    });

    // Link parents and children
    files.forEach((file) => {
      const mapped = map[file._id];
      if (file.parentId) {
        const parent = map[file.parentId];
        if (parent) {
          parent.children.push(mapped);
        } else {
          roots.push(mapped); // Treat as root if parent is missing
        }
      } else {
        roots.push(mapped);
      }
    });

    // Sort folders first, then files alphabetically
    const sortTree = (nodes) => {
      nodes.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((n) => {
        if (n.children.length > 0) {
          sortTree(n.children);
        }
      });
    };

    sortTree(roots);
    return roots;
  }, [files]);

  // Toggle folder collapse
  const toggleFolder = (folderId) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Expand all folders by default for better VS Code-like experience
  const expandAllFolders = () => {
    const allFolderIds = files.filter(f => f.isFolder).map(f => f._id);
    const expandedState = {};
    allFolderIds.forEach(id => {
      expandedState[id] = false; // false = expanded
    });
    setCollapsedFolders(expandedState);
  };

  // Collapse all folders
  const collapseAllFolders = () => {
    const allFolderIds = files.filter(f => f.isFolder).map(f => f._id);
    const collapsedState = {};
    allFolderIds.forEach(id => {
      collapsedState[id] = true; // true = collapsed
    });
    setCollapsedFolders(collapsedState);
  };

  // Auto-expand folders when files are loaded
  useEffect(() => {
    if (files.length > 0) {
      expandAllFolders();
    }
  }, [files]);

  // 2. Action Submissions
  const handleCreateNodeSubmit = async (e) => {
    e.preventDefault();
    if (!creatingName.trim()) {
      setCreatingNode(null);
      return;
    }

    try {
      await createFileNodeRequest(projectId, {
        name: creatingName.trim(),
        isFolder: creatingNode.isFolder,
        parentId: creatingNode.parentId,
      });
      addToast(`${creatingNode.isFolder ? "Folder" : "File"} created successfully`, "success");
      setCreatingName("");
      setCreatingNode(null);
      refreshFiles();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to create resource", "error");
    }
  };

  // Keep the inline create form open while its confirm or cancel button is
  // clicked. Previously, the input's blur handler closed the form before the
  // confirm button's submit event could run.
  const handleCreateFormBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setCreatingNode(null);
    }
  };

  const handleRenameSubmit = async (e, fileId) => {
    e.preventDefault();
    if (!editingName.trim()) {
      setEditingNodeId(null);
      return;
    }

    try {
      await renameFileNodeRequest(fileId, editingName.trim());
      addToast("Resource renamed successfully", "success");
      setEditingNodeId(null);
      setEditingName("");
      refreshFiles();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to rename resource", "error");
    }
  };

  const handleDeleteNode = async (e, fileId, name, isFolder) => {
    e.stopPropagation();
    const msg = `Are you sure you want to delete "${name}"? ${
      isFolder ? "All files inside this folder will be deleted recursively." : ""
    }`;
    if (!window.confirm(msg)) return;

    try {
      await deleteFileNodeRequest(fileId);
      addToast("Deleted successfully", "success");
      refreshFiles();
    } catch (err) {
      addToast(err.response?.data?.message || "Failed to delete resource", "error");
    }
  };

  // Render language-specific file icons
  const getFileIcon = (fileName) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const style = "shrink-0 mr-1.5";
    switch (ext) {
      case "js":
      case "jsx":
        return <FileCode className={`${style} text-yellow-500`} size={16} />;
      case "ts":
      case "tsx":
        return <FileCode className={`${style} text-blue-400`} size={16} />;
      case "py":
        return <FileCode className={`${style} text-green-500`} size={16} />;
      case "html":
        return <FileCode className={`${style} text-orange-500`} size={16} />;
      case "css":
        return <FileCode className={`${style} text-teal-400`} size={16} />;
      case "md":
        return <File className={`${style} text-slate-400`} size={16} />;
      case "java":
        return <FileCode className={`${style} text-red-500`} size={16} />;
      default:
        return <File className={`${style} text-slate-300`} size={16} />;
    }
  };

  // 3. Recursive Tree Node Renderer
  const renderNode = (node, depth = 0) => {
    const isCollapsed = collapsedFolders[node._id];
    const isSelected = activeFileId === node._id;
    const isEditing = editingNodeId === node._id;
    const isFavorite = !!favoriteNodes[node._id];

    return (
      <div key={node._id} className="flex flex-col select-none">
        {/* Row */}
        {isEditing ? (
          <form
            onSubmit={(e) => handleRenameSubmit(e, node._id)}
            className="flex items-center gap-1 py-1 pr-2"
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
          >
            {node.isFolder ? (
              <Folder className="text-yellow-500/70 shrink-0 mr-1.5" size={16} />
            ) : (
              getFileIcon(node.name)
            )}
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="flex-1 bg-slate-900 border border-indigo-500 rounded px-1 text-xs text-slate-200 outline-none"
              autoFocus
              onBlur={() => setEditingNodeId(null)}
            />
            <button type="submit" className="p-0.5 text-emerald-400 hover:text-emerald-300">
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setEditingNodeId(null)}
              className="p-0.5 text-red-400 hover:text-red-300"
            >
              <X size={12} />
            </button>
          </form>
        ) : (
          <div
            onClick={() => (node.isFolder ? toggleFolder(node._id) : onSelectFile(node))}
            className={`group flex items-center justify-between py-1.5 pr-2 hover:bg-slate-900/60 rounded cursor-pointer relative overflow-hidden transition-all ${
              isSelected ? "bg-indigo-950/40 border-l-2 border-indigo-500" : ""
            }`}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
          >
            <div className="flex items-center min-w-0 z-10">
              {node.isFolder && (
                <span className="text-slate-500 shrink-0 mr-0.5">
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
              )}
              {node.isFolder ? (
                isCollapsed ? (
                  <Folder className="text-yellow-600 shrink-0 mr-1.5" size={16} />
                ) : (
                  <FolderOpen className="text-yellow-500 shrink-0 mr-1.5" size={16} />
                )
              ) : (
                getFileIcon(node.name)
              )}
              <span className={`text-xs truncate ${isSelected ? "text-indigo-300 font-medium" : "text-slate-300"}`}>
                {node.name}
              </span>
            </div>

            {/* Hover Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {!isReadOnly && (
                <>
                  {node.isFolder && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCollapsed) toggleFolder(node._id);
                          setCreatingNode({ parentId: node._id, isFolder: false });
                        }}
                        className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                        title="New File"
                      >
                        <FilePlus size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCollapsed) toggleFolder(node._id);
                          setCreatingNode({ parentId: node._id, isFolder: true });
                        }}
                        className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                        title="New Folder"
                      >
                        <FolderPlus size={12} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNodeId(node._id);
                      setEditingName(node.name);
                    }}
                    className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                    title="Rename"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteNode(e, node._id, node.name, node.isFolder)}
                    className="p-0.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Create Node Form (Shows inline directly under current folder) */}
        {creatingNode && creatingNode.parentId === node._id && (
          <form
            onSubmit={handleCreateNodeSubmit}
            onBlur={handleCreateFormBlur}
            className="flex items-center gap-1 py-1 pr-2"
            style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
          >
            {creatingNode.isFolder ? (
              <Folder className="text-yellow-500/70 shrink-0 mr-1.5" size={16} />
            ) : (
              <File className="text-slate-400 shrink-0 mr-1.5" size={16} />
            )}
            <input
              type="text"
              placeholder={creatingNode.isFolder ? "Folder name..." : "File name (e.g. main.c)..."}
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              className="flex-1 bg-slate-900 border border-indigo-500 rounded px-1 text-xs text-slate-200 outline-none"
              autoFocus
            />
            <button type="submit" className="p-0.5 text-emerald-400 hover:text-emerald-300">
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setCreatingNode(null)}
              className="p-0.5 text-red-400 hover:text-red-300"
            >
              <X size={12} />
            </button>
          </form>
        )}

        {/* Children Render */}
        {node.isFolder && !isCollapsed && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 select-none">
      {/* File Explorer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Workspace Files
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={collapseAllFolders}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              title="Collapse All"
            >
              <Minus size={11} />
            </button>
            <button
              onClick={expandAllFolders}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              title="Expand All"
            >
              <Plus size={11} />
            </button>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-1">
            <button
              onClick={refreshFiles}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Refresh Tree"
            >
              <RefreshCw size={13} />
            </button>

            <button
              onClick={() => setCreatingNode({ parentId: null, isFolder: false })}
              className="p-1 rounded hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer"
              title="Create a new file such as C, HTML, Java, or CSS"
            >
              <FilePlus size={13} />
            </button>
            <button
              onClick={() => setCreatingNode({ parentId: null, isFolder: true })}
              className="p-1 rounded hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer"
              title="Create a new folder"
            >
              <FolderPlus size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Explorer Tree Canvas with Drag & Drop Import Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          setIsImportModalOpen(true);
        }}
        className={`relative flex-1 overflow-y-auto p-2 min-h-0 space-y-0.5 ${
          isDraggingOver ? "bg-cyan-500/10 border-2 border-dashed border-cyan-400" : ""
        }`}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 text-cyan-400 p-4 text-center">
            <FolderUp size={32} className="animate-bounce mb-2" />
            <p className="text-xs font-semibold">Drop folder or files to import into workspace</p>
          </div>
        )}

        <ImportProjectModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          targetProjectId={projectId}
          onSuccess={refreshFiles}
        />
        {/* Create Root Node Form */}
        {creatingNode && creatingNode.parentId === null && (
          <form
            onSubmit={handleCreateNodeSubmit}
            onBlur={handleCreateFormBlur}
            className="flex items-center gap-1 py-1 pr-2 pl-1.5"
          >
            {creatingNode.isFolder ? (
              <Folder className="text-yellow-500/70 shrink-0 mr-1.5" size={16} />
            ) : (
              <File className="text-slate-400 shrink-0 mr-1.5" size={16} />
            )}
            <input
              type="text"
              placeholder={creatingNode.isFolder ? "Folder name..." : "File name..."}
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              className="flex-1 bg-slate-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-slate-200 outline-none"
              autoFocus
            />
            <button type="submit" className="p-0.5 text-emerald-400 hover:text-emerald-300">
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setCreatingNode(null)}
              className="p-0.5 text-red-400 hover:text-red-300"
            >
              <X size={12} />
            </button>
          </form>
        )}

        {files.length === 0 && !creatingNode ? (
          <div className="mx-2 my-4 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-3 py-5 text-center">
            <FilePlus size={20} className="mx-auto mb-2 text-indigo-400/80" />
            <p className="text-[11px] font-semibold text-slate-300">Your workspace is ready</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Create your first file and make this project yours.
            </p>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setCreatingNode({ parentId: null, isFolder: false })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                <FilePlus size={12} />
                Create your first file
              </button>
            )}
          </div>
        ) : (
          fileTree.map((node) => renderNode(node))
        )}
      </div>
    </div>
  );
};

export default FileExplorer;
