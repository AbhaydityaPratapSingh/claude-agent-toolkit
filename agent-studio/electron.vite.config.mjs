import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    // agent-core is a local file: dependency — bundle it instead of resolving it
    // from node_modules at runtime, so the packaged app carries no symlink.
    plugins: [externalizeDepsPlugin({ exclude: ["agent-core"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["agent-core"] })],
  },
  renderer: {
    resolve: {
      alias: { "@renderer": resolve("src/renderer/src") },
    },
    plugins: [react()],
  },
});
