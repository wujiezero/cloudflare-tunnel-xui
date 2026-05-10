import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8866",
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: "dist"
  }
});
