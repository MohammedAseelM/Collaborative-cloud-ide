import { useMemo } from "react";

/**
 * Custom hook to format live collaborator presence state, showing active opened files
 * and typing indicators (e.g. 🟢 Mohammed editing App.jsx, 🟣 John viewing index.js, 🔵 Alice typing).
 */
export const usePresence = ({ onlineUsers = [], files = [], currentUser }) => {
  const presenceList = useMemo(() => {
    const fileMap = new Map(files.map((f) => [f._id?.toString(), f.name]));

    return onlineUsers.map((u) => {
      const isSelf = currentUser && (u.userId === currentUser.id || u.userId === currentUser._id);
      const activeFileName = u.activeFileId ? fileMap.get(u.activeFileId?.toString()) : null;

      let statusText = "viewing workspace";
      let statusColor = "bg-emerald-500";

      if (u.isTyping) {
        statusText = activeFileName ? `typing in ${activeFileName}` : "typing...";
        statusColor = "bg-indigo-400";
      } else if (activeFileName) {
        statusText = `editing ${activeFileName}`;
        statusColor = "bg-emerald-500";
      } else {
        statusText = "viewing workspace";
        statusColor = "bg-slate-400";
      }

      return {
        ...u,
        isSelf,
        activeFileName,
        statusText,
        statusColor,
        displayText: `${u.name} ${isSelf ? "(You)" : ""} — ${statusText}`,
      };
    });
  }, [onlineUsers, files, currentUser]);

  return {
    presenceList,
  };
};
