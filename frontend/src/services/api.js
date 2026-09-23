// src/services/api.js
// Responsibility: Single, pre-configured Axios instance used by every
// service module in the app. Centralizing this here means the base
// URL, headers, and (later) auth token attachment only need to be
// configured in one place.

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
  // Required so the browser sends/receives the httpOnly JWT cookie
  // set by the backend during login/registration.
  withCredentials: true,
});

// Placeholder for future request interceptor (e.g. attaching JWT token):
// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem("token");
//   if (token) config.headers.Authorization = `Bearer ${token}`;
//   return config;
// });

export default api;
