import { NextResponse } from "next/server";
import { Pool } from "pg";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  title: string | null;
  description: string | null;
  model_id: string | null;
  model_hash: string | null;
  params: any | null;
  proof: any | null;
  options: any | null;
  created_at: Date | null;
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function asAddrOrNull(v: unknown): `0x${string}` | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s === "true" || s === "false") return null;
  return isAddress(s) ? (s as `0x${string}`) : null;
}

export async function GET(_: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;

    const res = await pool.query<ItemRow>(
      `
      select
        id,
        title,
        description,
        model_id,
        model_hash,
        params,
        proof,
        options,
        created_at
      from public.challenges
      where id = $1::bigint
      limit 1
      `,
      [id]
    );

    const row = res.rows[0];
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const proof = row.proof ?? {};
    const options = row.options ?? {};

    const out = {
      title: String(row.title || ""),
      description: String(row.description ?? ""),
      category: String(options.category ?? "custom"),
      verifier:
        asAddrOrNull(proof.verifierUsed) ??
        asAddrOrNull(proof.verifier) ??
        "dapp",
      modelHash: row.model_hash ?? null,
      plonkVerifier: asAddrOrNull(proof.plonkVerifier),
      verifierUsed: asAddrOrNull(proof.verifierUsed),
      params: row.params ?? "",
      tags: Array.isArray(options.tags) ? options.tags : [],
      game: options.game ?? null,
      mode: options.mode ?? null,
      createdAt: row.created_at
        ? Math.floor(new Date(row.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      externalId: options.externalId ?? undefined,
      modelId: row.model_id ?? proof.modelId ?? null,
      modelKind: proof.kind ?? null,
      proof: row.proof ?? null,
    };

    return NextResponse.json(out, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}