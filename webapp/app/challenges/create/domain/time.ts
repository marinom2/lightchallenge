export function isValidDate(d: unknown): d is Date {
    return d instanceof Date && Number.isFinite(d.getTime());
  }
  
  export function fmtDT(d?: Date | null) {
    if (!d || !isValidDate(d)) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  
  /**
   * datetime-local wants local time without timezone.
   * This converts a Date to the correct yyyy-mm-ddThh:mm string.
   */
  export function toLocalDatetimeValue(d: Date) {
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 16);
  }
  
  /**
   * Parse datetime-local string safely.
   */
  export function fromLocalDatetimeValue(val: string) {
    const t = String(val || "").trim();
    if (!t) return null;
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d : null;
  }