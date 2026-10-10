import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite proxies /api and the runtime snippet host to the FastAPI backend so the
// dev server can serve the frontend while the backend serves the API + loc.js.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: "127.0.0.1",
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/loc.js": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/runtime": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/sample-site": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
