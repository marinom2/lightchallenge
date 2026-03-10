// scripts/readMeta.ts
// Node 18+ has global fetch
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ChallengeMeta = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  game?: string | null;
  mode?: string | null;
};

function baseUrl() {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

async function tryHttp(): Promise<ChallengeMeta[]> {
  const res = await fetch(`${baseUrl()}/api/challenges`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const j: any = await res.json();
  const arr = Array.isArray(j?.items) ? j.items : [];
  return arr as ChallengeMeta[];
}

async function tryFile(): Promise<ChallengeMeta[]> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(__dirname, "../public/challenges.json");
  const raw = await readFile(file, "utf-8").catch(() => "[]");
  const j = JSON.parse(raw);
  // Support either an array or {models:[...]}
  const arr = Array.isArray(j?.models) ? j.models : Array.isArray(j) ? j : [];
  return arr as ChallengeMeta[];
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: tsx scripts/readMeta.ts <id>");
  const id = String(raw);

  let items: ChallengeMeta[] = [];
  try {
    items = await tryHttp();
  } catch {
    items = await tryFile();
  }
  const row = items.find((x) => String(x.id) === id);
  if (!row) {
    console.log("No off-chain metadata found for id", id);
    return;
  }

  console.log("Off-chain metadata for", id);
  console.log("Title       :", row.title ?? "—");
  console.log("Description :", row.description ?? "—");
  console.log("Category    :", row.category ?? "—");
  console.log("Game        :", row.game ?? "—");
  console.log("Mode        :", row.mode ?? "—");
  console.log("Tags        :", Array.isArray(row.tags) ? row.tags.join(", ") : "—");
}
main().catch((e) => { console.error(e); process.exit(1); });