import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredBase = env.VITE_BASE_PATH?.trim();
  const base = configuredBase || "/";
  const manifestId = env.VITE_PWA_ID?.trim() || base;

  return {
    base,
    plugins: [
      VitePWA({
        registerType: "prompt",
        includeAssets: ["lab-icon.svg", "lab-maskable.svg"],
        manifest: {
          id: manifestId,
          name: "HomeInventory Sync Lab",
          short_name: "Sync Lab",
          description: "Isolated synthetic-data synchronization research.",
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#f4f7fa",
          theme_color: "#17324d",
          icons: [
            { src: "lab-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
            { src: "lab-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "index.html"),
          "auth-popup": resolve(import.meta.dirname, "auth-popup.html"),
        },
      },
    },
    test: {
      environment: "node",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
