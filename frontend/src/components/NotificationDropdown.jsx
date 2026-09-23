// src/components/NotificationDropdown.jsx
// Responsibility: Render user notifications feed in a Navbar dropdown, displaying unread count and marking options.

import { useEffect, useRef, useState } from "react";
import { Bell, Info, Mail, Activity, CheckSquare, Loader2 } from "lucide-react";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "../services/notification.service";
import { useToast } from "../context/ToastContext";

const NotificationDropdown = ({ socket }) => {
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  // 1. Initial Load of alerts count
  const loadAlerts = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchNotifications();
      const list = data.notifications || [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts(true);

    // Click outside listener to close dropdown
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 2. Real-time Socket alert sync (when active socket is passed down from workspace)
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((c) => c + 1);
      addToast(notification.title || "New notification received", "info");
    };

    socket.on("notification-received", handleNewNotification);

    return () => {
      socket.off("notification-received", handleNewNotification);
    };
  }, [socket, addToast]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      loadAlerts(); // reload list on open
    }
  };

  const handleMarkRead = async (e, id) => {
    e.stopPropagation();
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      addToast("All notifications marked as read", "success");
    } catch (err) {
      addToast("Failed to clear notifications", "error");
    }
  };

  // Maps notifications to indicators
  const notificationIcons = {
    INVITE: <Mail size={14} className="text-indigo-400" />,
    ACTIVITY: <Activity size={14} className="text-emerald-400" />,
    SYSTEM: <Info size={14} className="text-amber-400" />,
  };

  return (
    <div className="relative z-[60]" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="p-2 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors relative cursor-pointer"
        aria-label="Notifications Panel"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white border border-slate-950 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-900 bg-slate-950 shadow-2xl z-50 flex flex-col max-h-96 min-h-[150px] overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-slate-900 bg-slate-950/60 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-slate-200">Alert Center</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare size={10} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0 select-text">
            {isLoading ? (
              <div className="h-28 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 size={13} className="animate-spin text-indigo-500" />
                <span className="text-[11px]">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-slate-500 gap-1.5 text-center px-4">
                <Bell size={24} className="opacity-15 text-indigo-400" />
                <span className="text-[11px] font-semibold text-slate-400">Clean Slate</span>
                <span className="text-[9px] text-slate-600">You don't have any notifications.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-900/60">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    onClick={(e) => !notif.read && handleMarkRead(e, notif._id)}
                    className={`p-3 flex items-start gap-3 transition-colors cursor-pointer text-left ${
                      notif.read ? "bg-slate-950/20 opacity-70" : "bg-slate-900/30 hover:bg-slate-900/50"
                    }`}
                  >
                    <div className="shrink-0 mt-0.5 p-1 rounded-md bg-slate-900 border border-slate-800">
                      {notificationIcons[notif.type] || <Info size={14} />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className={`text-[11px] truncate ${notif.read ? "text-slate-400" : "font-semibold text-slate-200"}`}>
                          {notif.title}
                        </h4>
                        <span className="text-[8px] text-slate-600 font-mono shrink-0">
                          {new Date(notif.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal break-words line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                    {!notif.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0 mt-2" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
