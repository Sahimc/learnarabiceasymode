import fs from "node:fs";
import path from "node:path";

export function loadLocalEnv() {
  const root = process.cwd();
  for (const filename of [".env.local", ".env"]) {
    const file = path.join(root, filename);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://qawt:qawt_local_dev@localhost:5432/qawt";
  }
}
