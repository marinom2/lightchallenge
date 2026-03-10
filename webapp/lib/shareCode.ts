// lib/shareCode.ts
import { keccak256, toBytes } from "viem";

/** User-friendly share code for URLs */
export function makeShareCode(): string {
  const r = Math.random().toString(36).slice(2, 12);
  return `lc_${r}`;
}

/** On-chain bytes32 bound to the share code (keccak(code)) */
export function shareCodeToBytes32(code: string) {
  return keccak256(toBytes(code));
}