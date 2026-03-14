// webapp/lib/env.ts
// Public (browser-exposed) vars MUST be prefixed with NEXT_PUBLIC_ in .env*
// Keep this file dependency-free; only parse & validate environment.

function asNumber(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asAddr(v: string | undefined): `0x${string}` | undefined {
  if (!v) return undefined;
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : undefined;
}

function asHex(v: string | undefined): `0x${string}` | undefined {
  if (!v) return undefined;
  return /^0x[0-9a-fA-F]+$/.test(v) ? (v as `0x${string}`) : undefined;
}

/* ────────────────────────────────────────────────────────────────
   Public config (safe in browser)
   ──────────────────────────────────────────────────────────────── */
export const CHAIN_ID = asNumber(process.env.NEXT_PUBLIC_CHAIN_ID, 504);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "";
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || "";
export const NATIVE_SYMBOL = process.env.NEXT_PUBLIC_NATIVE_SYMBOL || "LCAI";

/**
 * Optional legacy address envs (NOT source of truth).
 * UI must read addresses from /public/deployments/lightchain.json via lib/contracts.ts.
 */
export const CHALLENGEPAY_ADDR = asAddr(process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR);
export const TREASURY_ADDR = asAddr(process.env.NEXT_PUBLIC_TREASURY_ADDR);

/* ────────────────────────────────────────────────────────────────
   Server-only secrets (NO NEXT_PUBLIC prefix)
   ──────────────────────────────────────────────────────────────── */
export const AIVM_SIGNER_PRIVKEY =
  asHex(process.env.AIVM_SIGNER_KEY || process.env.AIVM_OPERATOR_PRIVKEY);

export const RPC_UPSTREAM_URL = process.env.RPC_UPSTREAM_URL || "";

/* ────────────────────────────────────────────────────────────────
   Dev-time warnings only
   ──────────────────────────────────────────────────────────────── */
if (process.env.NODE_ENV !== "production") {
  const missing: string[] = [];
  if (!RPC_URL) missing.push("NEXT_PUBLIC_RPC_URL");
  if (!EXPLORER_URL) missing.push("NEXT_PUBLIC_EXPLORER_URL");
  if (!BASE_URL) missing.push("NEXT_PUBLIC_BASE_URL");

  if (missing.length) {
    console.warn("[env] Missing vars:", missing.join(", "));
  }

  const legacySet = [
    CHALLENGEPAY_ADDR,
    TREASURY_ADDR,
  ].some(Boolean);

  if (legacySet) {
    console.warn(
      "[env] Contract address env vars are set. UI will prefer /public/deployments/lightchain.json. " +
      "If they disagree, update .env.local or remove the address envs to avoid confusion."
    );
  }
}
