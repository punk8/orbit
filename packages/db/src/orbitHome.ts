import { homedir } from "node:os";
import { join } from "node:path";

export function resolveOrbitHome(input?: string): string {
  return (
    input ?? process.env.ORBIT_HOME ?? join(homedir(), "Library", "Application Support", "Orbit")
  );
}

export function resolveOrbitDbPath(orbitHome: string): string {
  return join(orbitHome, "orbit.db");
}
