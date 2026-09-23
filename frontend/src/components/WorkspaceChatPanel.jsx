// src/components/WorkspaceChatPanel.jsx
// Responsibility: A side panel inside the workspace for real-time developer group chat.

import { useEffect, useRef, useState } from "react";
import { Send, MessageSquare, X } from "lucide-react";
import { fetchProjectMessages } from "../services/chat.service";
import { useAuth } from "../context/AuthContext";

const WorkspaceChatPanel = ({ projectId, socket, onlineUsers, onClose }) => {
  const { user: currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  // Fetch initial chat history
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const data = await fetchProjectMessages(projectId);
        setMessages(data.messages || []);
      } catch (err) {
        console.error("Failed to load chat messages:", err);
      }
    };

    loadChatHistory();
  }, [projectId]);

  // Setup Socket listener for incoming chat messages
  useEffect(() => {
    if (!socket) return;

    const handleMessageReceived = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on("message-received", handleMessageReceived);

    return () => {
      socket.off("message-received", handleMessageReceived);
    };
  }, [socket]);

  // Scroll to bottom on new message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit("send-message", { text: inputText.trim() });
    setInputText("");
  };

  // Determine typing users (other than current user)
  const typingUsers = onlineUsers.filter(
    (u) => u.isTyping && u.userId !== currentUser?.id
  );

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 border-l border-slate-900 text-slate-200">
      {/* Header */}
      <div className="h-14 border-b border-slate-900 px-4 flex items-center justify-between shrink-0 bg-slate-950/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">Project Chat</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 p-4 text-center">
            <MessageSquare size={32} className="opacity-20 text-indigo-400 animate-pulse" />
            <p className="text-xs">No chat messages yet.</p>
            <p className="text-[10px] text-slate-600">Send a message to start collaborating!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender?._id === currentUser?.id;
            const senderName = msg.sender?.name || "Member";
            const initial = senderName.substring(0, 2).toUpperCase();

            // Hash user color based on name to keep colors consistent
            let hash = 0;
            for (let i = 0; i < senderName.length; i++) {
              hash = senderName.charCodeAt(i) + ((hash << 5) - hash);
            }
            const colors = [
              "bg-red-500", "bg-blue-500", "bg-emerald-500", 
              "bg-amber-500", "bg-pink-500", "bg-violet-500", 
              "bg-teal-500", "bg-orange-500"
            ];
            const colorClass = colors[Math.abs(hash) % colors.length];

            return (
              <div
                key={msg._id}
                className={`flex gap-2.5 max-w-[85%] ${
                  isMe ? "ml-auto flex-row-reverse" : ""
                }`}
              >
                {/* Avatar */}
                <div
                  className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white uppercase ${colorClass}`}
                >
                  {initial}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-0.5">
                  <div className={`flex items-center gap-1.5 text-[10px] text-slate-500 ${isMe ? "justify-end" : ""}`}>
                    <span className="font-semibold text-slate-300">
                      {isMe ? "You" : senderName}
                    </span>
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={`rounded-lg p-2.5 text-xs break-words whitespace-pre-wrap leading-5 ${
                      isMe
                        ? "bg-indigo-600 text-white rounded-tr-none"
                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator & Form */}
      <div className="p-3 border-t border-slate-900 shrink-0 bg-slate-950/40">
        {/* Typing alert */}
        <div className="h-5 text-[10px] text-indigo-400 font-medium px-1 flex items-center select-none">
          {typingUsers.length > 0 && (
            <span className="animate-pulse">
              {typingUsers.map((u) => u.name).join(", ")}{" "}
              {typingUsers.length === 1 ? "is" : "are"} typing...
            </span>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition-colors cursor-pointer shrink-0"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default WorkspaceChatPanel;
