import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Custom hook to track local mouse movements and receive real-time mouse positions
 * from collaborators in the same active file. Automatically hides inactive pointers after 3 seconds.
 */
export const useMouseTracking = ({
  socket,
  activeFileId,
  projectId,
  containerRef,
  currentUser,
  enabled = true,
}) => {
  const [remotePointers, setRemotePointers] = useState({});
  const animationFrameRef = useRef(null);
  const pendingMouseEmitRef = useRef(null);

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

  // Auto-hide remote pointers after 3 seconds of inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemotePointers((prev) => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach((userId) => {
          if (now - updated[userId].timestamp > 3000) {
            delete updated[userId];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Listen for socket mouse movement events
  useEffect(() => {
    if (!socket || !activeFileId || !enabled) {
      setRemotePointers({});
      return;
    }

    const currentUserId = String(currentUser?.id ?? currentUser?._id ?? "");

    const handleRemoteMouseMove = (data) => {
      if (!data || String(data.fileId) !== String(activeFileIdRef.current)) return;
      if (currentUserId && String(data.userId) === currentUserId) return;

      const uId = String(data.userId);
      setRemotePointers((prev) => ({
        ...prev,
        [uId]: {
          userId: uId,
          username: data.username || "Collaborator",
          avatar: data.avatar || null,
          userColor: data.userColor || data.color || "#3b82f6",
          mouseX: data.mouseX,
          mouseY: data.mouseY,
          timestamp: Date.now(),
        },
      }));
    };

    const handleRemoteMouseRemove = ({ userId, fileId }) => {
      if (fileId && String(fileId) !== String(activeFileIdRef.current)) return;
      setRemotePointers((prev) => {
        const copy = { ...prev };
        delete copy[String(userId)];
        return copy;
      });
    };

    const handleRemoteLeaveFile = ({ userId, fileId }) => {
      if (fileId && String(fileId) !== String(activeFileIdRef.current)) return;
      setRemotePointers((prev) => {
        const copy = { ...prev };
        delete copy[String(userId)];
        return copy;
      });
    };

    socket.on("mouse-move", handleRemoteMouseMove);
    socket.on("mouse-update", handleRemoteMouseMove);
    socket.on("mouse-remove", handleRemoteMouseRemove);
    socket.on("leave-file", handleRemoteLeaveFile);

    return () => {
      socket.off("mouse-move", handleRemoteMouseMove);
      socket.off("mouse-update", handleRemoteMouseMove);
      socket.off("mouse-remove", handleRemoteMouseRemove);
      socket.off("leave-file", handleRemoteLeaveFile);
    };
  }, [socket, activeFileId, currentUser, enabled]);

  // Track local mouse movement over container
  const handleMouseMove = useCallback(
    (e) => {
      const curSocket = socketRef.current;
      const curActiveFileId = activeFileIdRef.current;
      const curProjectId = projectIdRef.current;

      if (!enabled || !curSocket || !curActiveFileId || !containerRef?.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Check if mouse position is within container bounds (with slight padding allowance)
      if (
        e.clientX < rect.left - 20 ||
        e.clientX > rect.right + 20 ||
        e.clientY < rect.top - 20 ||
        e.clientY > rect.bottom + 20
      ) {
        return;
      }

      // Relative coordinates inside container (0 to 100 percentage)
      const mouseX = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 0), 100);
      const mouseY = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * 100, 0), 100);

      pendingMouseEmitRef.current = { mouseX, mouseY };

      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(() => {
          if (pendingMouseEmitRef.current && socketRef.current && activeFileIdRef.current) {
            socketRef.current.emit("mouse-move", {
              projectId: projectIdRef.current,
              fileId: activeFileIdRef.current,
              mouseX: pendingMouseEmitRef.current.mouseX,
              mouseY: pendingMouseEmitRef.current.mouseY,
            });
            pendingMouseEmitRef.current = null;
          }
          animationFrameRef.current = null;
        });
      }
    },
    [enabled, containerRef]
  );

  // Attach global mousemove listener to container for full-canvas mouse tracking
  useEffect(() => {
    if (!enabled || !socket || !activeFileId) return;

    const onGlobalMouseMove = (e) => {
      handleMouseMove(e);
    };

    window.addEventListener("mousemove", onGlobalMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onGlobalMouseMove);
    };
  }, [enabled, socket, activeFileId, handleMouseMove]);

  return {
    remotePointers,
    handleMouseMove,
  };
};
