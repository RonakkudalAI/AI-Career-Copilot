import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const frontendDir = path.dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, path.resolve(frontendDir, ".."), "");
  const apiOrigin =
    env.PUBLIC_API_BASE_URL ||
    `http://127.0.0.1:${env.BACKEND_PORT || process.env.BACKEND_PORT || 8000}`;
  return {
    plugins: [react()],

    envDir: path.resolve(frontendDir, ".."),
    resolve: { alias: { "@": path.resolve(frontendDir, "src") } },
    server: {
      host: "127.0.0.1",
      port: Number(env.FRONTEND_PORT || 3000),
      strictPort: true,
      proxy: {
        "/api/backend": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/backend/, "/api/v1"),
        },
        "/api/files": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/files/, "/api/v1/files"),
        },
      },
    },
    // Production-like local serve (npm run start / vite preview) must not rely only on `server.proxy`.
    preview: {
      host: "127.0.0.1",
      port: Number(env.FRONTEND_PORT || 3000),
      strictPort: true,
      proxy: {
        "/api/backend": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/backend/, "/api/v1"),
        },
        "/api/files": {
          target: apiOrigin,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/files/, "/api/v1/files"),
        },
      },
    },
    build: {
      // Fail the production client build when neither an explicit browser API origin
      // nor the same-origin proxy path strategy is intentional. Empty misconfig is rejected.
      rollupOptions: {},
    },
  };
});
