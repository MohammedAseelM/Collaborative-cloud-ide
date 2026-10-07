// src/config/env.js
// Responsibility: Centralized client-side environment variable resolution.
// Provides robust fallbacks for API base URL and Socket.IO endpoints.

export const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  }
  // Vite proxy forwards /api to backend in local development
  if (import.meta.env.DEV) {
    return "/api";
  }
  return "https://collaborative-cloud-ide-backend.onrender.com/api";
};

export const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL.replace(/\/$/, "");
  }
  const apiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith("http")) {
    return apiUrl.replace(/\/api\/?$/, "");
  }
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname || "localhost"}:5000`;
  }
  return "https://collaborative-cloud-ide-backend.onrender.com";
};
