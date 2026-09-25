// src/components/NotificationDropdown.jsx
// Responsibility: Render user notifications feed in a Navbar dropdown, displaying unread count and marking options.

import { useEffect, useRef, useState } from "react";
import { Bell, Info, Mail, Activity, CheckSquare, MessageSquare, Loader2 } from "lucide-react";
import { useNotification } from "../context/NotificationContext";

const NotificationDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const {
    notifications,
    unreadCount,
    displayBadgeCount,
    markRead,
    markAllRead,
    refreshNotifications,
  } = useNotification();

  useEffect(() => {
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

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      refreshNotifications();
    }
  };

  const handleMarkRead = (e, id) => {
    e.stopPropagation();
    markRead(id);
  };

  // Maps notifications to indicators
  const notificationIcons = {
    INVITE: <Mail size={14} className="text-indigo-400" />,
    ACTIVITY: <Activity size={14} className="text-emerald-400" />,
    SYSTEM: <Info size={14} className="text-amber-400" />,
    CHAT: <MessageSquare size={14} className="text-cyan-400" />,
    TASK: <CheckSquare size={14} className="text-emerald-400" />,
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
          <span className="absolute top-1 right-1 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white border border-slate-950 animate-pulse">
            {displayBadgeCount || unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-900 bg-slate-950 shadow-2xl z-50 flex flex-col max-h-96 min-h-[150px] overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="p-3 border-b border-slate-900 bg-slate-950/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">Alert Center</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-indigo-950 text-indigo-400 font-bold px-1.5 py-0.2 rounded border border-indigo-800">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare size={10} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto min-h-0 select-text">
            {notifications.length === 0 ? (
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
