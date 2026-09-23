// src/context/ToastContext.jsx
// Responsibility: Provide a global system for animated, non-blocking toast notifications.

import { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-hide after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastStyles = {
    success: "bg-slate-900/90 border-emerald-500/30 text-emerald-400 shadow-emerald-950/20",
    error: "bg-slate-900/90 border-red-500/30 text-red-400 shadow-red-950/20",
    info: "bg-slate-900/90 border-indigo-500/30 text-indigo-400 shadow-indigo-950/20",
  };

  const toastIcons = {
    success: <CheckCircle2 size={18} className="text-emerald-400" />,
    error: <AlertCircle size={18} className="text-red-400" />,
    info: <Info size={18} className="text-indigo-400" />,
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container overlay */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-lg border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-slide-in pointer-events-auto ${toastStyles[toast.type]}`}
            role="alert"
          >
            <div className="shrink-0 mt-0.5">{toastIcons[toast.type]}</div>
            <p className="text-sm font-medium leading-5 flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-0.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Close notification"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
