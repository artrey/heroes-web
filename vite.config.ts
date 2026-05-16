import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// На GitHub Pages приложение живёт в подпути /<repo-name>/.
// В CI экспортируем BASE_PATH из имени репозитория; локально base = '/'.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
