// app/api/status/route.ts
import { NextResponse } from "next/server";
import { createPublicClient, http, type Abi } from "viem";
import { RPC_URL, lightchain } from "@/lib/lightchain";
import { ABI, ADDR, ZERO_ADDR } from "@/lib/contracts";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

// V1 on-chain enum: Active=0, Finalized=1, Canceled=2
type Status = "Active" | "Finalized" | "Canceled";
const STATUS_MAP: Status[] = ["Active", "Finalized", "Canceled"];

function toStatus(n: number): Status {
  return STATUS_MAP[n] ?? "Active";
}

function parseIdsParam(val: string): bigint[] {
  const ids = val.split(",").map(s => s.trim()).filter(Boolean).map(s => { try { return BigInt(s); } catch { return null; } })
    .filter((x): x is bigint => x !== null);
  const seen = new Set<string>(); const out: bigint[] = [];
  for (const id of ids) { const k = id.toString(); if (!seen.has(k)) { seen.add(k); out.push(id); } }
  return out;
}

// ← Read named field first; fallback to common index if provider returns array-like
function extractStatusIndex(x: any): number {
  if (x && typeof x.status !== "undefined") {
    const n = Number(x.status);
    return Number.isFinite(n) ? n : 0;
  }
  const v = x?.[2];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function readStatusViaCall(client: ReturnType<typeof createPublicClient>, id: bigint) {
  try {
    const r = await client.readContract({
      address: ADDR.ChallengePay!,
      abi: ABI.ChallengePay as Abi,
      functionName: "getChallenge",
      args: [id],
    });
    const idx = extractStatusIndex(r);
    return { id: id.toString(), statusNum: idx, status: toStatus(idx) };
  } catch {
    // If the challenge doesn't exist yet or RPC hiccups — default to Active (index 0)
    return { id: id.toString(), statusNum: 0, status: "Active" as Status };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsRaw = (url.searchParams.get("ids") || "").trim();

  if (!idsRaw) return NextResponse.json({ error: "ids query param required, e.g. ?ids=1,2,3" }, { status: 400 });
  if (!RPC_URL) {
    console.error("[status] RPC_URL not configured");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  if (!ADDR.ChallengePay || ADDR.ChallengePay === ZERO_ADDR) {
    console.error("[status] ChallengePay address not configured");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  let ids = parseIdsParam(idsRaw);
  if (!ids.length) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "public, max-age=3" } });

  const MAX_IDS = 256;
  if (ids.length > MAX_IDS) ids = ids.slice(0, MAX_IDS);

  try {
    const client = createPublicClient({ chain: lightchain, transport: http(RPC_URL) });

    const CHUNK = 100;
    const items: Array<{ id: string; statusNum: number; status: Status }> = [];

    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);

      // Try multicall first…
      let needSingles: bigint[] = [];
      try {
        const mc = await client.multicall({
          contracts: slice.map((id) => ({
            address: ADDR.ChallengePay!,
            abi: ABI.ChallengePay as Abi,
            functionName: "getChallenge" as const,
            args: [id] as const,
          })),
          allowFailure: true,
        });

        mc.forEach((r, j) => {
          const id = slice[j];
          if (r.status !== "success" || !r.result) {
            needSingles.push(id); // ← don’t force Pending; do a single read
          } else {
            const idx = extractStatusIndex(r.result as any);
            items.push({ id: id.toString(), statusNum: idx, status: toStatus(idx) });
          }
        });
      } catch {
        // Whole multicall failed — single reads for the whole slice
        needSingles = slice;
      }

      // …then single reads for any failures
      if (needSingles.length) {
        for (const id of needSingles) {
          items.push(await readStatusViaCall(client, id));
        }
      }
    }

    return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=3" } });
  } catch (e: any) {
    console.error("[status]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}