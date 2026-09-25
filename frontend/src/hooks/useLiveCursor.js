import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Custom hook to manage Monaco Editor live cursor and text selection synchronization
 * for remote collaborators.
 */
export const useLiveCursor = ({
  socket,
  activeFileId,
  projectId,
  editorRef,
  monacoRef,
  currentUser,
}) => {
  const [remoteCursors, setRemoteCursors] = useState({});
  const decorationsMapRef = useRef({}); // { [userId]: decorationIds[] }
  const animationFrameRef = useRef(null);
  const pendingCursorEmitRef = useRef(false);

  const activeFileIdRef = useRef(activeFileId);
  const socketRef = useRef(socket);
  const projectIdRef = useRef(projectId);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Helper to safely format/inject user cursor CSS styles
  useEffect(() => {
    const styleId = "monaco-live-cursors-dynamic-styles";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    let css = "";
    Object.values(remoteCursors).forEach((remote) => {
      const { userId, userColor, color, username } = remote;
      const finalColor = userColor || color || "#3b82f6";
      const uId = userId ? userId.toString() : null;
      if (!uId) return;

      const safeName = (username || "Collaborator").replace(/["\\]/g, "");

      css += `
        .monaco-remote-caret-${uId} {
          border-left: 2px solid ${finalColor} !important;
          margin-left: -1px !important;
          position: absolute !important;
          height: 100% !important;
          pointer-events: none !important;
          z-index: 25 !important;
        }
        .monaco-remote-cursor-tag-${uId} {
          position: absolute !important;
          top: -18px !important;
          left: 0 !important;
          background-color: ${finalColor} !important;
          color: #ffffff !important;
          font-size: 10px !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-weight: 700 !important;
          padding: 1px 5px !important;
          border-radius: 3px 3px 3px 0px !important;
          white-space: nowrap !important;
          pointer-events: none !important;
          z-index: 50 !important;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4) !important;
          line-height: 13px !important;
        }
        .monaco-remote-cursor-tag-${uId}::after {
          content: "${safeName}" !important;
        }
        .monaco-remote-selection-${uId} {
          background-color: ${finalColor}33 !important;
        }
      `;
    });

    styleEl.innerHTML = css;
  }, [remoteCursors]);

  // Update Monaco decorations when remoteCursors state changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFileId) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Build decorations per user
    const currentUsers = Object.keys(remoteCursors);

    currentUsers.forEach((userId) => {
      const remote = remoteCursors[userId];
      if (!remote) return;

      const { cursorLine, cursorColumn, cursor, selectionStart, selectionEnd, selection } = remote;
      const cLine = cursorLine ?? cursor?.lineNumber;
      const cCol = cursorColumn ?? cursor?.column;

      const newDecorations = [];

      // Caret & Username Label Decoration
      if (cLine && cCol) {
        newDecorations.push({
          range: new monaco.Range(cLine, cCol, cLine, cCol),
          options: {
            className: `monaco-remote-caret-${userId}`,
            before: {
              content: "\u200B", // Zero-width space is required by Monaco to instantiate the inline DOM container
              inlineClassName: `monaco-remote-cursor-tag-${userId}`,
            },
            hoverMessage: {
              value: `**${remote.username || "Collaborator"}** (Ln ${cLine}, Col ${cCol})`,
            },
          },
        });
      }

      // Selection Range Decoration
      const selStartLine = selectionStart?.lineNumber ?? selection?.startLineNumber;
      const selStartCol = selectionStart?.column ?? selection?.startColumn;
      const selEndLine = selectionEnd?.lineNumber ?? selection?.endLineNumber;
      const selEndCol = selectionEnd?.column ?? selection?.endColumn;

      if (
        selStartLine &&
        selStartCol &&
        selEndLine &&
        selEndCol &&
        (selStartLine !== selEndLine || selStartCol !== selEndCol)
      ) {
        newDecorations.push({
          range: new monaco.Range(selStartLine, selStartCol, selEndLine, selEndCol),
          options: {
            className: `monaco-remote-selection-${userId}`,
            isWholeLine: false,
          },
        });
      }

      const oldIds = decorationsMapRef.current[userId] || [];
      decorationsMapRef.current[userId] = editor.deltaDecorations(oldIds, newDecorations);
    });

    // Remove decorations for users no longer in remoteCursors
    Object.keys(decorationsMapRef.current).forEach((userId) => {
      if (!remoteCursors[userId]) {
        const oldIds = decorationsMapRef.current[userId] || [];
        if (oldIds.length > 0) {
          editor.deltaDecorations(oldIds, []);
        }
        delete decorationsMapRef.current[userId];
      }
    });
  }, [remoteCursors, editorRef, monacoRef, activeFileId]);

  // Clean up all decorations when switching files or unmounting
  const clearAllDecorations = useCallback(() => {
    if (editorRef.current) {
      Object.keys(decorationsMapRef.current).forEach((userId) => {
        const oldIds = decorationsMapRef.current[userId] || [];
        if (oldIds.length > 0) {
          editorRef.current.deltaDecorations(oldIds, []);
        }
      });
    }
    decorationsMapRef.current = {};
    setRemoteCursors({});
  }, [editorRef]);

  // Listen to remote cursor socket events
  useEffect(() => {
    if (!socket || !activeFileId) {
      clearAllDecorations();
      return;
    }

    const currentUserId = String(currentUser?.id || currentUser?._id || "");

    const handleRemoteCursorMove = (data) => {
      if (!data || String(data.fileId) !== String(activeFileIdRef.current)) return;
      if (currentUserId && String(data.userId) === currentUserId) return;

      setRemoteCursors((prev) => ({
        ...prev,
        [String(data.userId)]: {
          ...data,
          userId: String(data.userId),
          userColor: data.userColor || data.color,
        },
      }));
    };

    const handleRemoteSelectionChange = (data) => {
      if (!data || String(data.fileId) !== String(activeFileIdRef.current)) return;
      if (currentUserId && String(data.userId) === currentUserId) return;

      setRemoteCursors((prev) => {
        const uId = String(data.userId);
        const existing = prev[uId] || {};
        return {
          ...prev,
          [uId]: {
            ...existing,
            ...data,
            userId: uId,
            userColor: data.userColor || data.color || existing.userColor,
          },
        };
      });
    };

    const handleRemoteCursorRemove = ({ userId, fileId }) => {
      if (fileId && String(fileId) !== String(activeFileIdRef.current)) return;
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[String(userId)];
        return updated;
      });
    };

    const handleRemoteLeaveFile = ({ userId, fileId }) => {
      if (fileId && String(fileId) !== String(activeFileIdRef.current)) return;
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[String(userId)];
        return updated;
      });
    };

    socket.on("cursor-move", handleRemoteCursorMove);
    socket.on("cursor-update", handleRemoteCursorMove);
    socket.on("selection-change", handleRemoteSelectionChange);
    socket.on("cursor-remove", handleRemoteCursorRemove);
    socket.on("leave-file", handleRemoteLeaveFile);

    return () => {
      socket.off("cursor-move", handleRemoteCursorMove);
      socket.off("cursor-update", handleRemoteCursorMove);
      socket.off("selection-change", handleRemoteSelectionChange);
      socket.off("cursor-remove", handleRemoteCursorRemove);
      socket.off("leave-file", handleRemoteLeaveFile);
    };
  }, [socket, activeFileId, currentUser, clearAllDecorations]);

  // Emitter for local cursor & selection updates
  const emitCursorPosition = useCallback(() => {
    const currentSocket = socketRef.current;
    const currentActiveFileId = activeFileIdRef.current;
    const currentProjectId = projectIdRef.current;
    const editor = editorRef.current;

    if (!currentSocket || !currentActiveFileId || !editor) return;

    const position = editor.getPosition();
    const selection = editor.getSelection();

    if (!position) return;

    const payload = {
      projectId: currentProjectId,
      fileId: currentActiveFileId,
      cursorLine: position.lineNumber,
      cursorColumn: position.column,
      cursorPosition: {
        lineNumber: position.lineNumber,
        column: position.column,
      },
      selectionStart: selection
        ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
        : null,
      selectionEnd: selection
        ? { lineNumber: selection.endLineNumber, column: selection.endColumn }
        : null,
      selection: selection
        ? {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null,
    };

    currentSocket.emit("cursor-move", payload);
  }, [editorRef]);

  const handleLocalCursorChange = useCallback(() => {
    pendingCursorEmitRef.current = true;
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (pendingCursorEmitRef.current) {
          emitCursorPosition();
          pendingCursorEmitRef.current = false;
        }
        animationFrameRef.current = null;
      });
    }
  }, [emitCursorPosition]);

  return {
    remoteCursors,
    handleLocalCursorChange,
    clearAllDecorations,
  };
};
