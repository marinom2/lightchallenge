/**
 * Keep domain pure.
 * Your existing lib/utils.ts already has generateExternalId() using viem keccak.
 * This file just provides safe display + fallbacks.
 */
export function safeId(x: unknown) {
    const s = String(x ?? "").trim();
    return s.startsWith("0x") ? s : "";
  }