export function safeNum(x: unknown) {
    const n = Number.parseFloat(String(x ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  
  export function clampNonNeg(n: number) {
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  
  export function formatAmount(n: number, opts?: { maxFrac?: number }) {
    const maxFrac = opts?.maxFrac ?? 4;
    const v = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: maxFrac,
      }).format(v);
    } catch {
      return String(v);
    }
  }