/**
 * Canonical LCAI formatter — converts wei string to human-readable LCAI amount.
 *
 * formatLCAI("1230000000000000000") → "1.23 LCAI"
 * formatLCAIShort("1230000000000000000") → "1.23"
 */

function parse(wei?: string | null): { neg: string; head: string; tail: string } | null {
  if (!wei) return null;
  try {
    const x = BigInt(wei);
    const neg = x < 0n ? "-" : "";
    const abs = x < 0n ? -x : x;
    const s = abs.toString().padStart(19, "0");
    const head = s.slice(0, -18).replace(/^0+/, "") || "0";
    const tail = s.slice(-18, -16);
    return { neg, head, tail };
  } catch {
    return null;
  }
}

/** Full format: "1.23 LCAI" or "—" */
export function formatLCAI(weiStr?: string | null): string {
  const p = parse(weiStr);
  if (!p) return "—";
  return `${p.neg}${p.head}.${p.tail} LCAI`;
}

/** Short format: "1.23" or null (caller decides fallback) */
export function formatLCAIShort(weiStr?: string | null): string | null {
  const p = parse(weiStr);
  if (!p) return null;
  return `${p.neg}${p.head}.${p.tail}`;
}
