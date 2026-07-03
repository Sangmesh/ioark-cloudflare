import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/authorize": "http://localhost:8000",
      "/oauth": "http://localhost:8000",
      "/scim": "http://localhost:8000",
      "/.well-known": "http://localhost:8000",
    },
  },
});
