// Syntax-checks every top-level server/*.js module. The explicit file list this
// replaces kept drifting as modules were added (for example protocol.js).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* global process */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");

const files = fs
  .readdirSync(serverDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => path.join(serverDir, entry.name))
  .sort();

if (files.length === 0) {
  console.error(`No server/*.js files found in ${serverDir}.`);
  process.exit(1);
}

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      `Could not run node --check on ${file}: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${path.relative(root, file)}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`checked ${files.length} server files`);
