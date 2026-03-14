// webapp/app/challenges/create/domain/model.ts
//
// COMPATIBILITY NOTE:
// Active product model kinds: "aivm" (Lightchain AIVM + PoI).
// "zk" and "plonk" are retained in the type union for backward compatibility
// with legacy DB data. Do not use for new challenge creation.

export type ModelKind = "aivm" | "custom" | "zk" | "plonk" | "unknown";

export type VerificationSettlementKind =
  | "lightchain_aivm"
  | "lightchain_poi"
  | "api"
  | "unknown";

export function normalizeModelKind(kind: unknown): ModelKind {
  const k = String(kind || "").toLowerCase();
  if (k === "aivm") return "aivm";
  if (k === "custom") return "custom";
  // Legacy — kept for reading existing data only
  if (k === "zk") return "zk";
  if (k === "plonk") return "plonk";
  return "unknown";
}

export function prettyModelKind(kind: unknown) {
  const k = normalizeModelKind(kind);
  if (k === "aivm") return "AIVM";
  if (k === "custom") return "Custom";
  if (k === "zk") return "ZK (legacy)";
  if (k === "plonk") return "PLONK (legacy)";
  return "Unknown";
}

export function normalizeVerificationSettlementKind(
  kind: unknown
): VerificationSettlementKind {
  const k = String(kind || "").toLowerCase();
  if (k === "lightchain_aivm") return "lightchain_aivm";
  if (k === "lightchain_poi") return "lightchain_poi";
  if (k === "api") return "api";
  return "unknown";
}

export function prettyVerificationSettlementKind(kind: unknown) {
  const k = normalizeVerificationSettlementKind(kind);
  if (k === "lightchain_aivm") return "Lightchain AIVM";
  if (k === "lightchain_poi") return "Lightchain PoI";
  if (k === "api") return "API";
  return "Unknown";
}

export function shortenHex(hex?: string | null, chars = 6) {
  if (!hex) return "—";
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}