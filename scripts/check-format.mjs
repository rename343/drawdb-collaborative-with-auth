import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const prettier = require.resolve("prettier/bin/prettier.cjs");

const EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".json",
  ".jsonc",
  ".css",
  ".scss",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".html",
  ".graphql",
]);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function refExists(ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function baseRef() {
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  if (
    process.env.GITHUB_EVENT_BEFORE &&
    !/^0+$/.test(process.env.GITHUB_EVENT_BEFORE)
  ) {
    return process.env.GITHUB_EVENT_BEFORE;
  }
  if (process.env.GITHUB_REF_TYPE === "tag" && refExists("HEAD^")) {
    return "HEAD^";
  }
  if (refExists("origin/main")) return "origin/main";
  if (refExists("HEAD^")) return "HEAD^";
  return null;
}

const base = baseRef();
if (!base) {
  console.log("format:check: no base commit found; skipping");
  process.exit(0);
}
if (!refExists(base)) {
  console.error(`format:check: base ref ${base} not found; fetch it first`);
  process.exit(1);
}

const files = new Set(
  git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`])
    .split("\n")
    .filter(Boolean),
);

if (!process.env.CI) {
  for (const args of [
    ["diff", "--name-only", "--diff-filter=ACMR"],
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  ]) {
    for (const file of git(args).split("\n")) {
      if (file) files.add(file);
    }
  }
}

const changed = [...files]
  .filter((file) => EXTENSIONS.has(path.extname(file).toLowerCase()))
  .filter((file) => existsSync(file))
  .sort();

if (changed.length === 0) {
  console.log("format:check: no changed Prettier-supported files");
  process.exit(0);
}

console.log(`format:check: checking ${changed.length} changed file(s)`);
const result = spawnSync(process.execPath, [prettier, "--check", ...changed], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
