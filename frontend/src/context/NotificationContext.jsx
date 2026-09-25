// src/context/NotificationContext.jsx
// Responsibility: Global centralized real-time notification, invitation, task alerts, and unread badge state management.
// Automatically connects the user's private notification channel and updates badges/popups across the entire app.

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notification.service";
import { fetchUserInvitations } from "../services/invitation.service";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { addToast } = useToast();

  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [invitations, setInvitations] = useState([]);
  const [activeChatProjectId, setActiveChatProjectId] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activePopup, setActivePopup] = useState(null); // { type: "INVITE" | "TASK", data: {} }

  const closePopup = useCallback(() => {
    setActivePopup(null);
  }, []);

  // Load initial notifications & invitations
  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await fetchNotifications();
      const list = data.notifications || [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  }, [isAuthenticated]);

  const refreshInvitations = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await fetchUserInvitations();
      setInvitations(data.invitations || []);
    } catch (err) {
      console.error("Failed to load invitations:", err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshNotifications();
      refreshInvitations();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setInvitations([]);
      setActivePopup(null);
    }
  }, [isAuthenticated, refreshNotifications, refreshInvitations]);

  // Global authenticated socket connection
  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return undefined;
    }

    const defaultDevUrl = `http://${window.location.hostname}:5000`;
    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.startsWith("http")
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, "")
        : import.meta.env.MODE === "development"
        ? defaultDevUrl
        : window.location.origin);

    const s = io(socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    s.on("connect", () => {
      console.log("[Global Notification Socket] Connected on user notification channel");
    });

    // 1. In-app Notification Received
    s.on("notification-received", (notif) => {
      setNotifications((prev) => [notif, ...prev.filter((n) => n._id !== notif._id)]);
      setUnreadCount((c) => c + 1);
      addToast(notif.title ? `${notif.title}: ${notif.message}` : "New notification received", "info");
    });

    // 2. Real-Time Invitation Created (Instant state update & popup)
    s.on("invitation-created", (inviteData) => {
      const inviteObj = inviteData.invitation || inviteData;
      setInvitations((prev) => [inviteObj, ...prev.filter((i) => i._id !== inviteObj._id && i._id !== inviteData.invitationId)]);
      setUnreadCount((c) => c + 1);
      refreshInvitations();
      setActivePopup({
        type: "INVITE",
        data: inviteData,
      });
      addToast(`You were invited to project "${inviteData.projectName || "Workspace"}"!`, "info");
    });

    // 2.5 Real-Time Invitation Popup
    s.on("invitation-popup", (popupData) => {
      setActivePopup({
        type: "INVITE",
        data: popupData,
      });
      refreshInvitations();
    });

    // 3. Real-Time Task Assigned (Instant state update & popup)
    s.on("task-assigned", (taskData) => {
      setActivePopup({
        type: "TASK",
        data: taskData,
      });
      addToast(`Task assigned: "${taskData.title}" in ${taskData.projectName}`, "info");
      refreshNotifications();
    });

    // 3.5 Real-Time Task Popup
    s.on("task-popup", (popupData) => {
      setActivePopup({
        type: "TASK",
        data: popupData,
      });
    });

    // 4. Chat Notification from other projects or when chat is closed
    s.on("chat-message-notification", ({ projectId, projectName, message }) => {
      // If user is currently in this project and actively looking at the chat, do not duplicate notification
      if (activeChatProjectId === projectId && isChatOpen) {
        return;
      }

      const senderName = message.sender?.name || "Collaborator";
      const notifItem = {
        _id: `chat-${message._id || Date.now()}`,
        type: "CHAT",
        title: `${projectName} Chat`,
        message: `${senderName}: ${message.text}`,
        createdAt: message.createdAt || new Date().toISOString(),
        read: false,
        relatedProject: projectId,
      };

      setNotifications((prev) => [notifItem, ...prev]);
      setUnreadCount((c) => c + 1);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [isAuthenticated, user?._id || user?.id, addToast, activeChatProjectId, isChatOpen, refreshInvitations, refreshNotifications]);

  const markRead = async (id) => {
    try {
      if (typeof id === "string" && !id.startsWith("chat-")) {
        await markNotificationRead(id);
      }
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      addToast("All notifications marked as read", "success");
    } catch (err) {
      addToast("Failed to clear notifications", "error");
    }
  };

  const displayBadgeCount = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  const value = {
    socket,
    notifications,
    unreadCount,
    displayBadgeCount,
    invitations,
    activePopup,
    closePopup,
    refreshNotifications,
    refreshInvitations,
    markRead,
    markAllRead,
    setActiveChatProjectId,
    setIsChatOpen,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
