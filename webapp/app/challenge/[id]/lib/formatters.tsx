// webapp/app/challenge/[id]/lib/formatters.tsx
// Display formatting helpers — some return JSX

import * as React from "react";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";
import { formatLCAI as _formatLCAI } from "@/lib/formatLCAI";
import { timeAgo as _timeAgo, timeAgoAbs as _timeAgoAbs, prettyCountdown as _prettyCountdown } from "@/lib/formatTime";
import type { Status } from "./types";

export function safeText(v?: any) {
  const s = v == null ? "" : String(v);
  return s.trim() ? s : "";
}

export function shortWide(v: string) {
  const s = (v ?? "").trim();
  if (!s) return "—";
  return s.length > 22 ? `${s.slice(0, 12)}…${s.slice(-6)}` : s;
}

export function formatDateTiny(sec: number) {
  const d = new Date(sec * 1000);
  return d.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function buildDetailsRibbon(input: {
  category: string | null;
  game: string | null;
  mode: string | null;
  joinCloseSec: number | null;
  startSec: number | null;
  endSec: number | null;
  externalId: string | null;
}) {
  const parts: string[] = [];
  if (input.game) parts.push(input.game);
  if (input.mode) parts.push(input.mode);
  if (input.category) parts.push(input.category);
  if (input.startSec) parts.push(`Starts ${formatDateTiny(input.startSec)}`);
  if (input.endSec) parts.push(`Ends ${formatDateTiny(input.endSec)}`);
  if (input.joinCloseSec) parts.push(`Join closes ${formatDateTiny(input.joinCloseSec)}`);
  if (input.externalId) parts.push(`ID ${shortWide(input.externalId)}`);
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}

export function code(v?: any) {
  return v ? <code className="mono">{String(v)}</code> : "—";
}

export function safe(v?: any, hint?: string) {
  return v == null || v === "" ? (hint ?? "Not set") : String(v);
}

export function yesno(v?: any) {
  return v == null ? "Not set" : v ? "Yes" : "No";
}

export function ts(n?: number | null, hint?: string) {
  return n ? new Date(n * 1000).toLocaleString() : (hint ?? "Not scheduled");
}

export function fmtNum(n?: any, hint?: string) {
  if (n == null) return hint ?? "0";
  try {
    const x = typeof n === "bigint" ? Number(n) : Number(n);
    return Number.isFinite(x) ? String(x) : (hint ?? "0");
  } catch {
    return hint ?? "0";
  }
}

export function short(a: string) {
  if (!a) return "None";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortOrDash(a?: string | null) {
  return a ? short(a) : "None";
}

export function linkAddr(a?: string | null) {
  return a ? (
    <a className="link" href={addressUrl(a)} target="_blank" rel="noreferrer">
      {short(a)}
    </a>
  ) : (
    "—"
  );
}

export function linkBlock(b?: string | number | null) {
  return b ? (
    <a className="link" href={blockUrl(String(b))} target="_blank" rel="noreferrer">
      #{b}
    </a>
  ) : (
    "—"
  );
}

export function linkTx(t?: string | null) {
  return t ? (
    <a className="link" href={txUrl(t)} target="_blank" rel="noreferrer">
      {t.slice(0, 12)}…
    </a>
  ) : (
    "—"
  );
}

// Delegated to shared canonical implementations
export const timeAgo = _timeAgo;
export const timeAgoAbs = _timeAgoAbs;
export const formatLCAI = _formatLCAI;

export function groupByDate(items: any[]) {
  const fmt = (ts?: number) => new Date((ts ?? 0) * 1000).toLocaleDateString();
  const m = new Map<string, any[]>();
  for (const it of items) {
    const k = fmt(it.timestamp);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  const out = Array.from(m.entries()).map(([date, arr]) => ({
    date,
    arr: arr.slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
  }));
  out.sort((a, b) => {
    const ta = a.arr?.[0]?.timestamp ?? 0;
    const tb = b.arr?.[0]?.timestamp ?? 0;
    return tb - ta;
  });
  return out;
}

export function formatMaxParticipants(n?: number | null) {
  if (n == null) return "No limit";
  return n === 0 ? "No limit" : String(n);
}

export function formatDuration(sec?: number | null) {
  if (!sec || sec < 0) return "Not set";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export const prettyCountdown = _prettyCountdown;

export function formatDateShort(sec?: number | null) {
  if (!sec) return "Not scheduled";
  const d = new Date(sec * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function enumLabel(kind: "kind" | "outcome", v?: number | null) {
  if (v == null) return "—";
  if (kind === "kind") {
    const map: Record<number, string> = { 0: "Unknown", 1: "Standard", 2: "AIVM", 3: "Legacy ZK" };
    return map[v] ?? `Type #${v}`;
  }
  const out: Record<number, string> = { 0: "Unset / Pending", 1: "Success", 2: "Fail", 3: "Canceled" };
  return out[v] ?? `#${v}`;
}

export function computePublicStatus({
  now,
  start,
  end,
  joinClose,
  adminStatus,
  snapshotSet,
  snapshotSuccess,
  verdictPass,
}: {
  now: number;
  start: number | null;
  end: number | null;
  joinClose?: number | null;
  adminStatus?: Status;
  snapshotSet?: boolean;
  /** On-chain snapshot success (global challenge outcome). */
  snapshotSuccess?: boolean | null;
  /** Per-participant verdict from DB (personal outcome). */
  verdictPass?: boolean | null;
}) {
  if (!start || !end) return { label: "Draft", note: "" };
  if (adminStatus === "Canceled") return { label: "Canceled", note: "" };
  if (now >= end) {
    if (snapshotSet || adminStatus === "Finalized") {
      // Prefer per-user verdict when available, fall back to global outcome
      const passed = verdictPass ?? snapshotSuccess;
      if (passed === true) return { label: "Challenge completed", note: "" };
      if (passed === false) return { label: "Challenge failed", note: "" };
      return { label: "Completed", note: "" };
    }
    return { label: "Finalizing", note: "" };
  }
  if (now < start) {
    const joinOpen = !!joinClose && now < joinClose;
    return { label: "Upcoming", note: joinOpen ? "Join open" : "Join closed" };
  }
  return { label: "In progress", note: "" };
}
