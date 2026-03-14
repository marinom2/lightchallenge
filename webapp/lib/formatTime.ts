/**
 * Canonical time formatting utilities.
 */

/** Relative time: "3m ago", "2h ago", "5d ago" */
export function timeAgo(ms: number): string {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Bidirectional relative time: "3m ago" or "in 3m" */
export function timeAgoAbs(ms: number): string {
  const diff = ms - Date.now();
  const sec = Math.abs(Math.floor(diff / 1000));
  if (sec < 60) return diff < 0 ? `${sec}s ago` : `in ${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return diff < 0 ? `${m}m ago` : `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return diff < 0 ? `${h}h ago` : `in ${h}h`;
  const d = Math.floor(h / 24);
  return diff < 0 ? `${d}d ago` : `in ${d}d`;
}

/** Countdown: "1:05:30" or "5:30" */
export function prettyCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x: number) => x.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
