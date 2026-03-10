#!/usr/bin/env ts-node
/* eslint-disable no-console */
import * as fs from "node:fs";
import * as path from "node:path";

let BINDINGS_PATH = "webapp/data/bindings.json";
try {
  const { BINDINGS_PATH: SHARED_PATH } = require("../webapp/lib/shared/bindings");
  BINDINGS_PATH = SHARED_PATH;
} catch {}

type Binding = { subject: `0x${string}`; provider: string; external_id: string };

function loadBindings(p: string): Binding[] {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return []; }
}
function saveBindings(p: string, all: Binding[]) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}

function main() {
  const [,, subjectArg, providerArg, externalIdArg] = process.argv;
  if (!subjectArg || !providerArg || !externalIdArg) {
    console.error("Usage: ts-node scripts/set_binding.ts <wallet> <provider> <external_id>");
    console.error('Example: ts-node scripts/set_binding.ts 0xAbC... steam 76561198000000000');
    process.exit(1);
  }
  const subject = subjectArg.toLowerCase() as `0x${string}`;
  const provider = providerArg.toLowerCase();
  const external_id = String(externalIdArg).trim();

  const abs = path.join(process.cwd(), BINDINGS_PATH);
  const all = loadBindings(abs);

  const i = all.findIndex(b => b.subject.toLowerCase() === subject && b.provider.toLowerCase() === provider);
  if (i >= 0) all[i].external_id = external_id; else all.push({ subject, provider, external_id });

  saveBindings(abs, all);
  console.log(`Saved binding: ${subject} ↔ ${provider}:${external_id}`);
}

main();