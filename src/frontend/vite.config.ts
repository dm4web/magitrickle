import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tailwindcss(), sveltekit()],
    server: {
      proxy: {
        "/api": {
          target: env.VITE_API_TARGET || "http://127.0.0.1:6969",
          changeOrigin: true,
        },
      },
    },
    build: {
      cssTarget: "firefox115",
      target: "esnext",
    },
  };
});
