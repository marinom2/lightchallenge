import { keccak256, toBytes } from "viem";

/**
 * User-friendly share code we keep in UI (url-safe).
 * Example: lc_8GkK6gY2fQ
 */
export function makeShareCode(): string {
  const r = Math.random().toString(36).slice(2, 12);
  return `lc_${r}`;
}

/**
 * On-chain bytes32 bound to the share code.
 * We use keccak(code) to get a fixed 32 bytes, collision-resistant.
 */
export function shareCodeToBytes32(code: string) {
  return keccak256(toBytes(code));
}