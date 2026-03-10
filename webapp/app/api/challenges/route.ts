import { NextResponse } from "next/server";
import { Pool } from "pg";
import { isAddress } from "viem";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type UiStatus =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

type Category = "gaming" | "fitness" | "social" | "custom";

export type RosterSlot = {
  id: string;
  team?: string | null;
  wallet?: string | null;
};

export type ChallengeMeta = {
  id: string;
  title: string;
  description?: string;
  params?: Record<string, any> | string;
  category?: Category;
  verifier?: string | null;
  txHash?: `0x${string}` | null;
  subject?: `0x${string}` | null;
  status?: UiStatus | string;
  tags?: string[];
  game?: string | null;
  mode?: string | null;
  externalId?: string;
  createdAt?: number;

  modelId?: string | null;
  modelKind?: "aivm" | "zk" | "plonk" | null;
  modelHash?: `0x${string}` | null;
  plonkVerifier?: `0x${string}` | null;
  verifierUsed?: `0x${string}` | null;

  proof?: {
    kind: "aivm" | "zk" | "plonk";
    modelId: string;
    params: Record<string, any>;
    paramsHash: `0x${string}`;
    [key: string]: any;
  } | null;

  timeline?: {
    joinClosesAt?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    proofDeadline?: string | null;
    peerDeadline?: string | null;
  };

  funds?: {
    stake?: string;
    bond?: string;
    currency?: {
      type: "NATIVE" | "ERC20";
      symbol?: string | null;
      address?: string | null;
    };
  };

  options?: {
    participantCap?: string;
    charity?: { percent?: string; address?: string };
    externalId?: string;
    category?: string;
    game?: string | null;
    mode?: string | null;
    tags?: string[];
    peers?: string[];
    peerApprovalsNeeded?: number;
    proofSource?: string;
    invites?: { roster: RosterSlot[] };
  };

  peers?: string[];
  peerApprovalsNeeded?: number;
  proofSource?: "API" | "HYBRID" | "PEERS" | string;
  invites?: { roster: RosterSlot[] };
};

type AnyBody = Partial<ChallengeMeta> & { meta?: any; essentials?: any };

type ChallengeRow = {
  id: string;
  title: string | null;
  description: string | null;
  subject: string | null;
  tx_hash: string | null;
  model_id: string | null;
  model_hash: string | null;
  params: any | null;
  proof: any | null;
  timeline: any | null;
  funds: any | null;
  options: any | null;
  status: string | null;
  created_at: Date | null;
  updated_at: Date | null;
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

function asTxOrNull(v: unknown): `0x${string}` | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s === "true" || s === "false") return null;
  if (!s.startsWith("0x")) return null;
  if (s.length < 10) return null;
  return s as `0x${string}`;
}

function asStringOrUndef(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function normalizeStatus(s?: string): UiStatus {
  if (!s) return "Pending";
  const k = s.toLowerCase().trim();

  if (
    ["pending", "approved", "rejected", "finalized", "canceled", "paused"].includes(
      k
    )
  ) {
    return (k.charAt(0).toUpperCase() + k.slice(1)) as UiStatus;
  }

  if (["active", "verified"].includes(k)) return "Approved";
  if (["waiting", "created"].includes(k)) return "Pending";
  if (["complete", "completed", "done"].includes(k)) return "Finalized";
  if (k === "cancelled") return "Canceled";

  return "Pending";
}

function normalizeCategory(c?: string): Category | undefined {
  if (!c) return undefined;
  const k = c.toLowerCase().trim();
  if (["gaming", "fitness", "social", "custom"].includes(k)) return k as Category;
  return undefined;
}

function kindToCategory(kind?: string | null): Category | undefined {
  if (!kind) return undefined;
  const k = kind.toLowerCase();
  if (["gaming", "fitness", "social", "custom"].includes(k)) return k as Category;
  return undefined;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function mergeShallow<T extends object>(
  a: T | undefined | null,
  b: Partial<T> | undefined | null
): T | undefined {
  if (!a && !b) return undefined;
  return { ...(a as any), ...(b as any) };
}

function pickTitle(input: AnyBody, fallback: string) {
  const t = (input?.meta?.title ?? input?.title ?? "").toString().trim();
  return t || fallback;
}

function coerceParams(val: unknown): Record<string, any> | string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === "object" && parsed !== null ? parsed : val;
    } catch {
      return val;
    }
  }
  if (typeof val === "object") return val as Record<string, any>;
  return undefined;
}

function pickCategory(input: AnyBody, prev?: Category): Category | undefined {
  const fromExplicit = normalizeCategory(input?.category as string);
  if (fromExplicit) return fromExplicit;

  const fromKind = kindToCategory(input?.meta?.kind);
  if (fromKind) return fromKind;

  const typeUpper = String(input?.meta?.type || "").toUpperCase();
  if (["GAMING", "FITNESS", "SOCIAL", "CUSTOM"].includes(typeUpper)) {
    return typeUpper.toLowerCase() as Category;
  }

  if (input?.game || input?.mode || input?.meta?.game) return "gaming";

  return prev;
}

function enrichTags(
  base: string[] | undefined,
  game?: string | null,
  mode?: string | null,
  modelKind?: string | null
) {
  const extras = [game, mode, modelKind]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());

  const lowered = (base || [])
    .map((t) => String(t).toLowerCase())
    .filter(Boolean);

  return uniq([...lowered, ...extras]);
}

function rowToMeta(row: ChallengeRow): ChallengeMeta {
  const proof = row.proof ?? {};
  const options = row.options ?? {};

  return {
    id: String(row.id),
    title: row.title ?? "",
    description: row.description ?? undefined,
    params: row.params ?? undefined,
    category:
      normalizeCategory(options.category) ??
      normalizeCategory(proof.category) ??
      undefined,
    verifier:
      asAddrOrNull(proof.verifierUsed) ??
      asAddrOrNull(proof.verifier) ??
      null,
    txHash: asTxOrNull(row.tx_hash),
    subject: asAddrOrNull(row.subject),
    status: normalizeStatus(row.status ?? undefined),
    tags: Array.isArray(options.tags) ? options.tags.filter(Boolean) : [],
    game: options.game ?? null,
    mode: options.mode ?? null,
    externalId:
      asStringOrUndef(options.externalId) ??
      asStringOrUndef(proof.externalId),
    createdAt: row.created_at
      ? Math.floor(new Date(row.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),

    modelId: row.model_id ?? proof.modelId ?? null,
    modelKind: proof.kind ?? null,
    modelHash:
      typeof row.model_hash === "string" ? (row.model_hash as `0x${string}`) : null,
    plonkVerifier: asAddrOrNull(proof.plonkVerifier),
    verifierUsed: asAddrOrNull(proof.verifierUsed),

    proof: row.proof ?? null,
    timeline: row.timeline ?? undefined,
    funds: row.funds ?? undefined,
    options: row.options ?? undefined,
    peers: Array.isArray(options.peers) ? options.peers : [],
    peerApprovalsNeeded:
      typeof options.peerApprovalsNeeded === "number"
        ? options.peerApprovalsNeeded
        : 0,
    proofSource: options.proofSource ?? undefined,
    invites: options.invites ?? undefined,
  };
}

async function getAllRows(filters?: {
  subject?: string;
  status?: string;
  externalId?: string;
}) {
  const where: string[] = [];
  const values: any[] = [];

  if (filters?.subject) {
    values.push(filters.subject.toLowerCase());
    where.push(`lower(subject) = $${values.length}`);
  }

  if (filters?.status) {
    values.push(filters.status.toLowerCase());
    where.push(`lower(status) = $${values.length}`);
  }

  if (filters?.externalId) {
    values.push(filters.externalId.toLowerCase());
    where.push(`lower(coalesce(options->>'externalId','')) = $${values.length}`);
  }

  const sql = `
    select
      id,
      title,
      description,
      subject,
      tx_hash,
      model_id,
      model_hash,
      params,
      proof,
      timeline,
      funds,
      options,
      status,
      created_at,
      updated_at
    from public.challenges
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by created_at desc
  `;

  const res = await pool.query<ChallengeRow>(sql, values);
  return res.rows;
}

async function getRowById(id: string) {
  const res = await pool.query<ChallengeRow>(
    `
    select
      id,
      title,
      description,
      subject,
      tx_hash,
      model_id,
      model_hash,
      params,
      proof,
      timeline,
      funds,
      options,
      status,
      created_at,
      updated_at
    from public.challenges
    where id = $1::bigint
    limit 1
    `,
    [id]
  );

  return res.rows[0] ?? null;
}

async function upsertChallenge(body: AnyBody) {
  const id = String(body.id ?? Date.now());
  const prevRow = await getRowById(id);
  const prev = prevRow ? rowToMeta(prevRow) : undefined;
  const nowSec = Math.floor(Date.now() / 1000);

  const title = pickTitle(body, prev?.title ?? `Challenge #${id}`);
  const params = coerceParams(body.params) ?? prev?.params ?? null;
  const category = pickCategory(body, prev?.category);
  const game = body.game ?? body.meta?.game ?? prev?.game ?? null;
  const mode = body.mode ?? body.meta?.gameMode ?? prev?.mode ?? null;

  const modelId = body.modelId ?? prev?.modelId ?? null;
  const modelKind = body.modelKind ?? prev?.modelKind ?? null;
  const modelHash =
    (typeof body.modelHash === "string" ? body.modelHash : prev?.modelHash) ?? null;

  const subject = asAddrOrNull(body.subject ?? prev?.subject);
  const verifier = asAddrOrNull(body.verifier ?? prev?.verifier);
  const verifierUsed = asAddrOrNull(body.verifierUsed ?? prev?.verifierUsed);
  const plonkVerifier = asAddrOrNull(body.plonkVerifier ?? prev?.plonkVerifier);
  const txHash = asTxOrNull(body.txHash ?? prev?.txHash);

  const proof = {
    ...(prev?.proof ?? {}),
    ...(body.proof ?? {}),
    ...(verifier ? { verifier } : {}),
    ...(verifierUsed ? { verifierUsed } : {}),
    ...(plonkVerifier ? { plonkVerifier } : {}),
    ...(modelKind ? { kind: modelKind } : {}),
    ...(modelId ? { modelId } : {}),
  };

  const tags = enrichTags(
    uniq([...(prev?.tags ?? []), ...(body.tags ?? [])]),
    game,
    mode,
    modelKind
  );

  const timeline = mergeShallow(prev?.timeline, body.timeline) ?? null;
  const funds = mergeShallow(prev?.funds, body.funds) ?? null;

  const options = {
    ...(prev?.options ?? {}),
    ...(body.options ?? {}),
    ...(category ? { category } : {}),
    game,
    mode,
    tags,
    externalId:
      asStringOrUndef(body.externalId ?? body.options?.externalId ?? prev?.externalId) ??
      undefined,
    peers: body.peers ?? prev?.peers ?? [],
    peerApprovalsNeeded:
      body.peerApprovalsNeeded ?? prev?.peerApprovalsNeeded ?? 0,
    proofSource: body.proofSource ?? prev?.proofSource ?? undefined,
    invites:
      mergeShallow(prev?.invites, body.invites) ??
      body.options?.invites ??
      undefined,
  };

  const status = normalizeStatus(body.status ?? prev?.status);
  const createdAtSec = body.createdAt ?? prev?.createdAt ?? nowSec;

  await pool.query(
    `
    insert into public.challenges (
      id,
      title,
      description,
      subject,
      tx_hash,
      model_id,
      model_hash,
      params,
      proof,
      timeline,
      funds,
      options,
      status,
      created_at,
      updated_at
    )
    values (
      $1::bigint,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8::jsonb,
      $9::jsonb,
      $10::jsonb,
      $11::jsonb,
      $12::jsonb,
      $13,
      to_timestamp($14),
      now()
    )
    on conflict (id) do update
    set
      title = excluded.title,
      description = excluded.description,
      subject = excluded.subject,
      tx_hash = excluded.tx_hash,
      model_id = excluded.model_id,
      model_hash = excluded.model_hash,
      params = excluded.params,
      proof = excluded.proof,
      timeline = excluded.timeline,
      funds = excluded.funds,
      options = excluded.options,
      status = excluded.status,
      updated_at = now()
    `,
    [
      id,
      title,
      body.description ?? prev?.description ?? null,
      subject,
      txHash,
      modelId,
      modelHash,
      JSON.stringify(params),
      JSON.stringify(proof),
      JSON.stringify(timeline),
      JSON.stringify(funds),
      JSON.stringify(options),
      status,
      createdAtSec,
    ]
  );

  const saved = await getRowById(id);
  return saved ? rowToMeta(saved) : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const subjectFilter = (url.searchParams.get("subject") || "").trim();
    const statusFilter = (url.searchParams.get("status") || "").trim();
    const externalId = (url.searchParams.get("externalId") || "").trim();

    const rows = await getAllRows({
      subject: subjectFilter || undefined,
      status: statusFilter || undefined,
      externalId: externalId || undefined,
    });

    const items = rows.map(rowToMeta);

    return NextResponse.json({ items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AnyBody;
    const item = await upsertChallenge(body);

    return NextResponse.json(
      { ok: true, item },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AnyBody;
    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const item = await upsertChallenge(body);

    return NextResponse.json(
      { ok: true, item },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}