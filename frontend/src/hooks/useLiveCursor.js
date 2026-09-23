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
  const pendingCursorEmitRef = useRef(null);

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
      const uId = userId?.toString();
      if (!uId) return;

      css += `
        .monaco-remote-caret-${uId} {
          border-left: 2px solid ${finalColor} !important;
          margin-left: -1px;
          position: relative;
          z-index: 10;
        }
        .monaco-remote-cursor-tag-${uId} {
          position: relative;
        }
        .monaco-remote-cursor-tag-${uId}::after {
          content: "${username || "Collaborator"}";
          position: absolute;
          top: -18px;
          left: -2px;
          background-color: ${finalColor};
          color: #ffffff;
          font-size: 10px;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px 4px 4px 0px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 50;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
          line-height: 12px;
        }
        .monaco-remote-selection-${uId} {
          background-color: ${finalColor}35 !important;
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
              content: "",
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

    const handleRemoteCursorMove = (data) => {
      if (data.fileId !== activeFileId) return;
      if (currentUser && (data.userId === currentUser.id || data.userId === currentUser._id)) return;

      setRemoteCursors((prev) => ({
        ...prev,
        [data.userId]: {
          ...data,
          userColor: data.userColor || data.color,
        },
      }));
    };

    const handleRemoteSelectionChange = (data) => {
      if (data.fileId !== activeFileId) return;
      if (currentUser && (data.userId === currentUser.id || data.userId === currentUser._id)) return;

      setRemoteCursors((prev) => {
        const existing = prev[data.userId] || {};
        return {
          ...prev,
          [data.userId]: {
            ...existing,
            ...data,
            userColor: data.userColor || data.color || existing.userColor,
          },
        };
      });
    };

    const handleRemoteCursorRemove = ({ userId, fileId }) => {
      if (fileId && fileId !== activeFileId) return;
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
    };

    const handleRemoteLeaveFile = ({ userId, fileId }) => {
      if (fileId && fileId !== activeFileId) return;
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        delete updated[userId];
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

  // Throttled emitter for local cursor & selection updates (30-60 FPS)
  const emitCursorPosition = useCallback(() => {
    if (!socket || !activeFileId || !editorRef.current) return;

    const editor = editorRef.current;
    const position = editor.getPosition();
    const selection = editor.getSelection();

    if (!position) return;

    const payload = {
      projectId,
      fileId: activeFileId,
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

    socket.emit("cursor-move", payload);
  }, [socket, activeFileId, projectId, editorRef]);

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
