#!/usr/bin/env ts-node
/* eslint-disable no-console */
import * as fs from "node:fs";
import * as path from "node:path";

// If you added the shared type:
let BINDINGS_PATH = "webapp/data/bindings.json";
try {
  const { BINDINGS_PATH: SHARED_PATH } = require("../webapp/lib/shared/bindings");
  BINDINGS_PATH = SHARED_PATH;
} catch {}

type Binding = { subject: `0x${string}`; provider: string; external_id: string };

function loadBindings(p: string): Binding[] {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return []; }
}

function main() {
  const [,, subjectArg, providerArg] = process.argv;
  if (!subjectArg) {
    console.error("Usage: ts-node scripts/check_binding.ts <wallet> [provider]");
    console.error("Example: ts-node scripts/check_binding.ts 0xAbC... steam");
    process.exit(1);
  }
  const subject = subjectArg.toLowerCase();
  const provider = providerArg?.toLowerCase();

  const abs = path.join(process.cwd(), BINDINGS_PATH);
  const all = loadBindings(abs);

  const filtered = all.filter(b =>
    b.subject.toLowerCase() === subject &&
    (!provider || b.provider.toLowerCase() === provider)
  );

  if (!filtered.length) {
    console.log("No bindings found.");
    process.exit(0);
  }

  console.log(`Bindings for ${subject}:`);
  for (const b of filtered) {
    console.log(`- ${b.provider}: ${b.external_id}`);
  }
}

main();