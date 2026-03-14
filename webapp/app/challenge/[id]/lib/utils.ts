// webapp/app/challenge/[id]/lib/utils.ts
// Pure utility functions — no React or external dependencies

export function isHexAddress(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
}

export function safeLower(v?: string | null) {
  return (v ?? "").toLowerCase();
}

export function safeBigintFrom(v: unknown): bigint | null {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "") return BigInt(v);
    return null;
  } catch {
    return null;
  }
}

export function safeParseId(id: unknown): bigint | null {
  if (typeof id !== "string" || !id.trim()) return null;
  if (!/^\d+$/.test(id.trim())) return null;
  try {
    const x = BigInt(id.trim());
    return x >= 0n ? x : null;
  } catch {
    return null;
  }
}

export function normalizeDecimalInput(s: string) {
  return (s ?? "").trim().replace(",", ".");
}

export function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function safeJson<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function dedupeStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    if (typeof x !== "string") continue;
    const k = x.trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const c = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      c.abort(s.reason);
      return c.signal;
    }
    s.addEventListener("abort", () => c.abort(s.reason), { once: true });
  }
  return c.signal;
}

export async function fetchJson<T>(
  url: string,
  opts?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = opts?.signal ? anySignal([opts.signal, ctrl.signal]) : ctrl.signal;

  try {
    const res = await fetch(url, { ...opts, signal, cache: "no-store" });
    const txt = await res.text();
    const parsed = typeof txt === "string" && txt.length ? safeJson<any>(txt) : null;

    clearTimeout(t);

    if (!res.ok) {
      return {
        ok: false,
        error: parsed?.error || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return { ok: true, data: parsed as T };
  } catch (e: any) {
    clearTimeout(t);
    if (e?.name === "AbortError") return { ok: false, error: "Request timed out" };
    return { ok: false, error: e?.message || "Fetch failed" };
  }
}
