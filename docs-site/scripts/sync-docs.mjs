// Syncs Markdown files from the repo root into pages/ for Nextra.
// Source of truth remains the repo-root docs; this script copies them at build time.

import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGES = resolve(import.meta.dirname, "../pages");

const SYNC_MAP = [
  // [source relative to repo root, destination relative to pages/]
  ["PROTOCOL.md",               "protocol.mdx"],
  ["DEPLOY.md",                 "guides/deploy.mdx"],
  ["OPERATIONS.md",             "guides/operations.mdx"],
  ["ENVIRONMENTS.md",           "guides/environments.mdx"],
  ["SECURITY.md",               "guides/security.mdx"],
  ["CONTRIBUTING.md",           "guides/contributing.mdx"],
  ["db/DATABASE.md",            "guides/database.mdx"],
  ["docs/SCRIPTS.md",           "guides/scripts.mdx"],
];

for (const [src, dest] of SYNC_MAP) {
  const srcPath = resolve(ROOT, src);
  const destPath = resolve(PAGES, dest);

  if (!existsSync(srcPath)) {
    console.log(`  skip: ${src} (not found)`);
    continue;
  }

  mkdirSync(dirname(destPath), { recursive: true });
  copyFileSync(srcPath, destPath);
  console.log(`  ✓ ${src} → pages/${dest}`);
}

console.log("Docs sync complete.");
