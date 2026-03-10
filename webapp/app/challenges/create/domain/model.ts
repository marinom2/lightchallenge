// webapp/app/challenges/create/domain/model.ts
export type ModelKind = "aivm" | "zk" | "plonk" | "unknown";

export type VerificationSettlementKind =
  | "lightchain_aivm"
  | "lightchain_poi"
  | "zk"
  | "plonk"
  | "api"
  | "unknown";

export function normalizeModelKind(kind: unknown): ModelKind {
  const k = String(kind || "").toLowerCase();
  if (k === "aivm") return "aivm";
  if (k === "zk") return "zk";
  if (k === "plonk") return "plonk";
  return "unknown";
}

export function prettyModelKind(kind: unknown) {
  const k = normalizeModelKind(kind);
  if (k === "aivm") return "AIVM";
  if (k === "zk") return "ZK";
  if (k === "plonk") return "PLONK";
  return "Unknown";
}

export function normalizeVerificationSettlementKind(
  kind: unknown
): VerificationSettlementKind {
  const k = String(kind || "").toLowerCase();
  if (k === "lightchain_aivm") return "lightchain_aivm";
  if (k === "lightchain_poi") return "lightchain_poi";
  if (k === "zk") return "zk";
  if (k === "plonk") return "plonk";
  if (k === "api") return "api";
  return "unknown";
}

export function prettyVerificationSettlementKind(kind: unknown) {
  const k = normalizeVerificationSettlementKind(kind);
  if (k === "lightchain_aivm") return "Lightchain AIVM";
  if (k === "lightchain_poi") return "Lightchain PoI";
  if (k === "zk") return "ZK";
  if (k === "plonk") return "PLONK";
  if (k === "api") return "API";
  return "Unknown";
}

export function shortenHex(hex?: string | null, chars = 6) {
  if (!hex) return "—";
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}