"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Coins, Clock3, ShieldCheck, Zap } from "lucide-react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import GameIcon from "./GameIcon";

type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";

const statusChipClass = (s: Status) =>
  s === "Approved" ? "chip chip--ok"
  : s === "Rejected" ? "chip chip--bad"
  : s === "Finalized" ? "chip chip--info"
  : s === "Canceled" ? "chip chip--warn"
  : "chip";

/** LCAI short (wei → x.xx) */
function fmtLCAIShort(wei?: string | null) {
  if (!wei) return "—";
  try {
    const x = BigInt(wei);
    const s = x.toString().padStart(19, "0");
    const head = s.slice(0, -18).replace(/^0+/, "") || "0";
    const tail = s.slice(-18, -16);
    return `${head}.${tail}`;
  } catch {
    return "—";
  }
}

export default function ChallengeCard({
  id,
  title,
  description,
  status,
  startTs,
  badges,
  game,
  mode,
  isFavorite,
  onToggleFavorite,
  onOpen,
}: {
  id: bigint;
  title?: string;
  description?: string;
  status: Status;
  startTs?: bigint; // seconds since epoch (on-chain)
  badges: { fast?: boolean; auto?: boolean; strategy?: Address | string | null };
  game?: string | null;
  mode?: string | null;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onOpen?: () => void;
}) {
  const idStr = id.toString();
  const router = useRouter();
  const { address } = useAccount();

  // startTs prop is seconds; keep it in seconds internally
  const startSec = typeof startTs === "bigint" ? Number(startTs) : null;

  // quick API hydrate: title/desc (fallback), participants, pool, join closes, starts, ends, youJoined
  const [stats, setStats] = React.useState<{
    participants?: number;
    pool?: string | null;
    joinClosesTs?: number | null; // seconds
    startTs?: number | null;      // seconds
    endTs?: number | null;        // seconds
    youJoined?: boolean;
    t?: { title?: string; description?: string };
  }>({});

  React.useEffect(() => {
    let dead = false;
    const ctl = new AbortController();

    (async () => {
      try {
        const url = `/api/challenge/${idStr}${address ? `?viewer=${address}` : ""}`;
        const r = await fetch(url, { cache: "no-store", signal: ctl.signal });
        const j = await r.json().catch(() => ({}));

        if (dead) return;

        const participants = Array.isArray(j?.timeline)
          ? j.timeline.filter((x: any) => x?.name === "Joined").length
          : undefined;

        const pool = j?.snapshot?.committedPool ?? j?.pool?.committedWei ?? null;

        setStats({
          participants,
          pool,
          joinClosesTs: j?.joinClosesTs ? Number(j.joinClosesTs) : null, // seconds
          startTs: j?.startTs ? Number(j.startTs) : startSec,             // seconds
          endTs: j?.endTs ? Number(j.endTs) : null,                       // seconds
          youJoined: !!(j?.youJoined || j?.youAlreadyJoined),
          t: { title: j?.title, description: j?.description },
        });
      } catch {
        // best-effort; keep card rendering
      }
    })();

    return () => {
      dead = true;
      ctl.abort();
    };
  }, [idStr, address, startSec]);

  function go() {
    if (onOpen) onOpen();
    else router.push(`/challenge/${idStr}`);
  }

  const effectiveTitle = (title || stats.t?.title) ?? `Challenge #${idStr}`;
  const effectiveDesc = description || stats.t?.description || "";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
      aria-label={`Open challenge ${idStr}`}
      className="dark-card group cursor-pointer"
      style={{
        padding: 20,
        borderRadius: "24px",
        minHeight: 210,
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 10%, transparent), color-mix(in oklab, var(--surface-2) 18%, var(--card)))",
      }}
    >
      <div className="dark-halo" aria-hidden />
      <div className="dark-sheen" aria-hidden />

      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full grid place-items-center font-extrabold text-sm"
            style={{
              background: "color-mix(in oklab, #fff 18%, transparent)",
              color: "#fff",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)",
            }}
            aria-hidden
          >
            {idStr}
          </div>
          <GameIcon name={game} className="w-6 h-6 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[16px] sm:text-[18px] font-extrabold tracking-[-.01em] truncate">
              {effectiveTitle}
            </h3>
            <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
              <span>{[game, mode].filter(Boolean).join(" • ") || "—"}</span>
              <div className="flex items-center gap-1 ml-1">
                {badges?.auto && (
                  <span className="chip chip--info" title="Auto-Approved">
                    <ShieldCheck size={12} /> Auto
                  </span>
                )}
                {badges?.fast && (
                  <span className="chip" title="Fast-Track">
                    <Zap size={12} /> Fast
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <span className={statusChipClass(status)}>{status}</span>
      </header>

      {/* Description */}
      {effectiveDesc && (
        <p className="mt-2 text-[13px] leading-5 text-[color:var(--text-muted)] line-clamp-2">
          {effectiveDesc}
        </p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatPill icon={<Users size={12} />} label="Joined" value={stats.participants ?? "—"} />
        <StatPill icon={<Coins size={12} />} label="Treasury" value={fmtLCAIShort(stats.pool)} suffix=" LCAI" />
      </div>

      {/* Timelines (API returns seconds → multiply by 1000 for Date) */}
      <div className="mt-3 text-[12px] text-[color:var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1">
        {typeof stats.joinClosesTs === "number" && (
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} /> Join closes {new Date(stats.joinClosesTs * 1000).toLocaleString()}
          </span>
        )}
        {typeof stats.startTs === "number" && (
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} /> Starts {new Date(stats.startTs * 1000).toLocaleString()}
          </span>
        )}
        {typeof stats.endTs === "number" && (
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} /> Ends {new Date(stats.endTs * 1000).toLocaleString()}
          </span>
        )}
      </div>

      {/* Footer: favorite only (NO dots menu, NO View/Join) */}
      <div className="mt-4 flex items-center gap-2">
        {onToggleFavorite && (
          <button
            className={`icon-btn star ${isFavorite ? "is-fav" : ""}`}
            title={isFavorite ? "Unfavorite" : "Favorite"}
            aria-pressed={!!isFavorite}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            ★
          </button>
        )}
        {stats.youJoined && <span className="chip chip--ok ml-auto">You joined</span>}
      </div>
    </article>
  );
}

function StatPill({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-2 text-[12px] flex items-center gap-1 min-h-[36px]"
      style={{
        background: "var(--ghost-bg)",
        border: "1px solid var(--ghost-border)",
        color: "var(--ghost-text)",
        backdropFilter: "blur(8px) saturate(1.06)",
      }}
    >
      {icon} <span>{label}</span>
      <span className="ml-auto font-semibold text-[color:var(--text)]">
        {value}
        {suffix ? <span className="opacity-70"> {suffix}</span> : null}
      </span>
    </div>
  );
}