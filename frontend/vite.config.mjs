import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

function logProxyHit(proxy) {
  proxy.on("proxyReq", (_proxyReq, req) => {
    req.__apiStartedAt = Date.now();
    req.__apiUrl = req.originalUrl || req.url;
  });
  proxy.on("proxyRes", (proxyRes, req) => {
    const status = Number(proxyRes.statusCode || 0);
    const ms = Date.now() - (req.__apiStartedAt || Date.now());
    const line = `[api] ${req.method} ${req.__apiUrl || req.url} -> ${status} ${ms}ms`;
    if (status >= 500) globalThis.console.error(line);
    else if (status >= 400) globalThis.console.warn(line);
    else globalThis.console.log(line);
  });
  proxy.on("error", (error, req) => {
    const ms = Date.now() - (req.__apiStartedAt || Date.now());
    globalThis.console.error(
      `[api] ${req.method} ${req.__apiUrl || req.url} ERROR ${error.code || error.message} ${ms}ms`,
    );
  });
}

function apiProxy(apiOrigin) {
  return {
    "/api/backend": {
      target: apiOrigin,
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/api\/backend/, "/api/v1"),
      configure: logProxyHit,
    },
    "/api/files": {
      target: apiOrigin,
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/api\/files/, "/api/v1/files"),
      configure: logProxyHit,
    },
  };
}

export default defineConfig(({ mode }) => {
  const frontendDir = path.dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, path.resolve(frontendDir, ".."), "");
  const apiOrigin =
    env.PUBLIC_API_BASE_URL ||
    `http://127.0.0.1:${env.BACKEND_PORT || 8000}`;
  return {
    plugins: [react()],

    envDir: path.resolve(frontendDir, ".."),
    resolve: { alias: { "@": path.resolve(frontendDir, "src") } },
    server: {
      host: "127.0.0.1",
      port: Number(env.FRONTEND_PORT || 3000),
      strictPort: true,
      proxy: apiProxy(apiOrigin),
    },

    // Production-like local serve (npm run start / vite preview) must not rely only on `server.proxy`.
    preview: {
      host: "127.0.0.1",
      port: Number(env.FRONTEND_PORT || 3000),
      strictPort: true,
      proxy: apiProxy(apiOrigin),
    },
    build: {
      // Fail the production client build when neither an explicit browser API origin
      // nor the same-origin proxy path strategy is intentional. Empty misconfig is rejected.
      rollupOptions: {},
    },
  };
});
