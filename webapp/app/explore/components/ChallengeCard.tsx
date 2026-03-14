"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Coins, Clock3 } from "lucide-react";
import { useAccount } from "wagmi";
import { formatLCAIShort } from "@/lib/formatLCAI";
import type { Status } from "@/lib/types/status";
import GameIcon from "./GameIcon";

const statusChipClass = (s: Status) =>
  s === "Active" ? "chip chip--ok"
  : s === "Finalized" ? "chip chip--info"
  : s === "Canceled" ? "chip chip--warn"
  : "chip";

/** Skeleton shimmer for loading state */
function Shimmer({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        borderRadius: 6,
        background:
          "linear-gradient(90deg, rgba(255,255,255,.06) 25%, rgba(255,255,255,.13) 50%, rgba(255,255,255,.06) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s ease-in-out infinite",
      }}
      aria-hidden
    />
  );
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
  badges?: Record<string, unknown>;
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

  // Stats from the API: participants, pool, timestamps, youJoined.
  // title/description are NOT fetched — they come from props (DB meta, fast).
  const [statsState, setStatsState] = React.useState<
    | "loading"
    | {
        participants: number | null;
        pool: string | null;
        joinClosesTs: number | null;
        startTs: number | null;
        endTs: number | null;
        youJoined: boolean;
      }
  >("loading");

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
          : null;

        const pool = j?.snapshot?.committedPool ?? j?.pool?.committedWei ?? null;

        setStatsState({
          participants,
          pool,
          joinClosesTs: j?.joinClosesTs ? Number(j.joinClosesTs) : null,
          startTs: j?.startTs ? Number(j.startTs) : startSec,
          endTs: j?.endTs ? Number(j.endTs) : null,
          youJoined: !!(j?.youJoined || j?.youAlreadyJoined),
        });
      } catch {
        // best-effort; show dashes on error
        if (!dead) {
          setStatsState({
            participants: null,
            pool: null,
            joinClosesTs: null,
            startTs: startSec,
            endTs: null,
            youJoined: false,
          });
        }
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

  const loading = statsState === "loading";
  const stats = loading ? null : statsState;

  // Title comes from props immediately — no fallback fetch needed.
  // If the DB meta hasn't arrived yet the parent will re-render with it.
  const displayTitle = title ?? `Challenge #${idStr}`;

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
            className="w-10 h-10 rounded-full grid place-items-center font-extrabold text-sm shrink-0"
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
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] sm:text-[18px] font-extrabold tracking-[-.01em] truncate leading-tight">
              {displayTitle}
            </h3>
            <div className="flex items-center gap-2 text-[12px] text-(--text-muted) mt-0.5">
              <span className="truncate">{[game, mode].filter(Boolean).join(" • ") || "—"}</span>
              <div className="flex items-center gap-1 shrink-0" />
            </div>
          </div>
        </div>

        <span className={statusChipClass(status)}>{status}</span>
      </header>

      {/* Description — shown immediately from props, 2-line clamp */}
      {description ? (
        <p className="mt-2.5 text-[13px] leading-[1.45] text-(--text-muted) line-clamp-2">
          {description}
        </p>
      ) : (
        /* Reserve space so cards with/without descriptions align better */
        <div className="mt-2.5 h-[38px]" aria-hidden />
      )}

      {/* Stats row — skeleton while loading */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatPill
          icon={<Users size={12} />}
          label="Joined"
          value={
            loading ? (
              <Shimmer className="w-6 h-3.5 rounded" />
            ) : stats!.participants !== null ? (
              String(stats!.participants)
            ) : (
              "—"
            )
          }
        />
        <StatPill
          icon={<Coins size={12} />}
          label="Treasury"
          value={
            loading ? (
              <Shimmer className="w-10 h-3.5 rounded" />
            ) : formatLCAIShort(stats!.pool) !== null ? (
              formatLCAIShort(stats!.pool)!
            ) : (
              "—"
            )
          }
          suffix={!loading && formatLCAIShort(stats!.pool) !== null ? " LCAI" : undefined}
        />
      </div>

      {/* Timelines — only shown once stats are loaded (API returns seconds → *1000 for Date) */}
      {!loading && (
        <div className="mt-3 text-[12px] text-(--text-muted) flex flex-wrap gap-x-3 gap-y-1">
          {typeof stats!.joinClosesTs === "number" && (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} /> Join closes {new Date(stats!.joinClosesTs * 1000).toLocaleString()}
            </span>
          )}
          {typeof stats!.startTs === "number" && (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} /> Starts {new Date(stats!.startTs * 1000).toLocaleString()}
            </span>
          )}
          {typeof stats!.endTs === "number" && (
            <span className="inline-flex items-center gap-1">
              <Clock3 size={12} /> Ends {new Date(stats!.endTs * 1000).toLocaleString()}
            </span>
          )}
        </div>
      )}
      {loading && <div className="mt-3 h-4" aria-hidden />}

      {/* Footer: favorite + youJoined badge */}
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
        {!loading && stats!.youJoined && (
          <span className="chip chip--ok ml-auto">You joined</span>
        )}
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
      <span className="ml-auto font-semibold text-(--text) flex items-center gap-0.5">
        {value}
        {suffix ? <span className="opacity-70">{suffix}</span> : null}
      </span>
    </div>
  );
}
