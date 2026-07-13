import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.RUNTRACE_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": apiTarget,
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
  },
});
