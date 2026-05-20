import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(appDir, "..");
const outdir = resolve(rootDir, "dist-electron");
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(rootDir, "electron/main.ts"), resolve(rootDir, "electron/preload.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outdir,
  outExtension: {
    ".js": ".cjs"
  },
  packages: "external",
  external: ["electron", "better-sqlite3"],
  logLevel: "info"
});
