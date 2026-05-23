import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const appPath = resolveAppPath(args.app ?? "release/mac-arm64/Orbit.app");
const appEntry = join(appPath, "Contents/MacOS/Orbit");
if (!existsSync(appEntry)) {
  throw new Error(`Packaged Orbit executable is missing: ${appEntry}`);
}
assertPackagedScreenOcrHelper(appPath);
assertPackagedMacObserverHelper(appPath);
const privateScan = scanPackagedPrivateData(appPath);
if (privateScan.violations.length > 0) {
  throw new Error(
    `Packaged Orbit contains private or raw fixture data: ${privateScan.violations.join(", ")}`
  );
}

const orbitHome = args.orbitHome ? resolve(args.orbitHome) : mkdtempSync(join(tmpdir(), "orbit-package-smoke-"));
const cleanupOrbitHome = !args.orbitHome;
const env = {
  ...process.env,
  ORBIT_HOME: orbitHome,
  ORBIT_PACKAGED_SMOKE: "1",
  ORBIT_PACKAGED_NATIVE_HELPER_MODE: "unsigned",
  ORBIT_SKIP_LOGIN_ITEM_SETTINGS: "1"
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const child = spawn(appEntry, ["--disable-gpu"], {
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

let completed = false;
const timeout = setTimeout(() => {
  completed = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    child.kill("SIGKILL");
    cleanup();
    console.error("Packaged Orbit smoke timed out.");
    console.error(output);
    process.exit(1);
  }, 500).unref();
}, 20_000);

child.on("exit", (code, signal) => {
  if (completed) return;
  completed = true;
  clearTimeout(timeout);
  cleanup();
  if (signal === "SIGTERM" || signal === "SIGKILL") {
    process.exit(0);
  }
  if (code === 0 && output.includes("ORBIT_PACKAGED_SMOKE_OK")) {
    process.exit(0);
  }
  console.error(output);
  process.exit(code ?? 1);
});

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--app") {
      parsed.app = rawArgs[++index];
    } else if (arg === "--orbit-home") {
      parsed.orbitHome = rawArgs[++index];
    }
  }
  return parsed;
}

function resolveAppPath(input) {
  const directPath = resolve(input);
  if (existsSync(directPath)) {
    return directPath;
  }
  if (input.startsWith("apps/desktop/")) {
    return resolve(input.slice("apps/desktop/".length));
  }
  return directPath;
}

function cleanup() {
  if (cleanupOrbitHome) {
    rmSync(orbitHome, { recursive: true, force: true });
  }
}

function assertPackagedScreenOcrHelper(root) {
  const helperPath = join(root, "Contents/Resources/native/screen-ocr-helper/Sources/main.swift");
  if (!existsSync(helperPath)) {
    throw new Error(`Packaged Screen/OCR helper is missing: ${helperPath}`);
  }
  const helperSource = readFileSync(helperPath, "utf8");
  if (/write\s*\(|FileManager\.default/.test(helperSource)) {
    throw new Error("Packaged Screen/OCR helper must not persist raw images by itself.");
  }
}

function assertPackagedMacObserverHelper(root) {
  const helperPath = join(root, "Contents/Resources/native/macos-observer/Sources/main.swift");
  if (!existsSync(helperPath)) {
    throw new Error(`Packaged macOS observer helper is missing: ${helperPath}`);
  }
  const helperSource = readFileSync(helperPath, "utf8");
  if (!helperSource.includes("NSWorkspace.didActivateApplicationNotification")) {
    throw new Error("Packaged macOS observer helper does not include foreground app observation.");
  }
}

function scanPackagedPrivateData(root) {
  const violations = [];
  let scanned = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        stack.push(join(current, entry));
      }
      continue;
    }
    scanned += 1;
    if (/(?:fixtures|perception-sidecars|\.tmp)(?:\/|$)/.test(current)) {
      violations.push(current.replace(root, ""));
      continue;
    }
    if (stat.size <= 1024 * 1024 && /\.(?:json|jsonl|txt|md|log|env)$/i.test(current)) {
      const text = readFileSync(current, "utf8");
      if (/hunter2|sk-test|person@example\.com|RAW_OCR_TEXT|RAW_EVENT_TEXT/.test(text)) {
        violations.push(current.replace(root, ""));
      }
    }
  }
  return { scanned, violations };
}
