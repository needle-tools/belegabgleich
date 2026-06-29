import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url)); // .../packages/web
const repoRoot = resolve(here, "..", "..");

// Build stamp shown in the UI. Time is when the bundle was built (or the dev
// server started); the git short hash pins the exact commit (empty if missing).
const BUILD_TIME = new Date().toISOString();
let GIT_SHA = "";
try { GIT_SHA = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim(); } catch { /* not a git checkout */ }

// No backend: the browser uses the Web File System Access API and (optionally) a
// local Ollama daemon. We only need to import the shared workspace packages and
// read the repo-root providers.json, so allow serving from the repo root.
export default defineConfig({
  plugins: [svelte()],
  server: { port: 7790, fs: { allow: [repoRoot] } },
  preview: { port: 7790 },
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __GIT_SHA__: JSON.stringify(GIT_SHA),
  },
  build: { outDir: "dist", emptyOutDir: true },
});
