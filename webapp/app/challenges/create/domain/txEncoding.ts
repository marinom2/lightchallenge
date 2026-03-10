/**
 * This file exists so "tx payload encoding" / log parsing can evolve without touching UI.
 * You can keep it minimal now and expand when you finalize ABI + event parsing.
 */

export type Hex = `0x${string}`;

export function isHex(v: unknown): v is Hex {
  return typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v);
}
