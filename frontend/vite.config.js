// vite.config.js
// Responsibility: Vite build/dev-server configuration for the frontend.
// Configures the React plugin, Tailwind CSS v4 plugin, and a dev-server
// proxy so frontend calls to /api are forwarded to the backend server.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      // Forwards /api requests from the frontend dev server to the backend,
      // avoiding CORS issues during local development.
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
