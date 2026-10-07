import axios from "axios";
import { getApiBaseUrl } from "../config/env.js";

const api = axios.create({
  baseURL: getApiBaseUrl(),
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
