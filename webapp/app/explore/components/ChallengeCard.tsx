"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { formatLCAIShort } from "@/lib/formatLCAI";
import type { Status } from "@/lib/types/status";
import Badge from "@/app/components/ui/Badge";
import GameIcon from "./GameIcon";

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
  startTs?: bigint;
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

  const startSec = typeof startTs === "bigint" ? Number(startTs) : null;

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

        const participants = typeof j?.participantsCount === "number"
          ? j.participantsCount
          : Array.isArray(j?.timeline)
            ? new Set(j.timeline.filter((x: any) => x?.name === "Joined").map((x: any) => x?.who?.toLowerCase?.())).size
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
  const displayTitle = title ?? `Challenge #${idStr}`;

  const statusTone = status === "Active" ? "success" : status === "Finalized" ? "accent" : "warning";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
      aria-label={`Open challenge ${idStr}`}
      style={{
        padding: "var(--lc-space-5)",
        borderRadius: "var(--lc-radius-lg)",
        border: "1px solid var(--lc-border)",
        backgroundColor: "var(--lc-bg-raised)",
        cursor: "pointer",
        transition: "border-color var(--lc-dur-fast) var(--lc-ease), box-shadow var(--lc-dur-fast) var(--lc-ease)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-3)",
        minHeight: 200,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--lc-border-strong)";
        e.currentTarget.style.boxShadow = "var(--lc-shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--lc-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header: ID circle + game icon + title + status */}
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--lc-space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)", minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: "var(--lc-accent-muted)",
              color: "var(--lc-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "var(--lc-weight-bold)" as any,
              fontSize: "var(--lc-text-caption)",
              flexShrink: 0,
            }}
          >
            {idStr}
          </div>
          <GameIcon name={game} className="w-5 h-5 shrink-0" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                fontSize: "var(--lc-text-body)",
                fontWeight: "var(--lc-weight-semibold)" as any,
                color: "var(--lc-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayTitle}
            </h3>
            <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 1 }}>
              {[game, mode].filter(Boolean).join(" \u00B7 ") || "\u2014"}
            </div>
          </div>
        </div>

        <Badge variant="tone" tone={statusTone} size="sm">{status}</Badge>
      </header>

      {/* Description */}
      {description ? (
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            lineHeight: 1.45,
            color: "var(--lc-text-secondary)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {description}
        </p>
      ) : (
        <div style={{ height: 38 }} aria-hidden />
      )}

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--lc-space-2)" }}>
        <StatPill
          label="Joined"
          value={loading ? null : stats!.participants !== null ? String(stats!.participants) : "\u2014"}
          loading={loading}
        />
        <StatPill
          label="Pool"
          value={
            loading
              ? null
              : formatLCAIShort(stats!.pool) !== null
                ? `${formatLCAIShort(stats!.pool)} LCAI`
                : "\u2014"
          }
          loading={loading}
        />
      </div>

      {/* Timeline */}
      {!loading && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--lc-space-3)", fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
          {typeof stats!.endTs === "number" && (
            <span>Ends {new Date(stats!.endTs * 1000).toLocaleDateString()}</span>
          )}
          {typeof stats!.joinClosesTs === "number" && (
            <span>Join closes {new Date(stats!.joinClosesTs * 1000).toLocaleDateString()}</span>
          )}
        </div>
      )}
      {loading && <div style={{ height: 16 }} aria-hidden />}

      {/* Footer: favorite + youJoined */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginTop: "auto" }}>
        {onToggleFavorite && (
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid var(--lc-border)",
              backgroundColor: isFavorite ? "var(--lc-warning-muted)" : "transparent",
              color: isFavorite ? "var(--lc-warning)" : "var(--lc-text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              transition: "all var(--lc-dur-fast) var(--lc-ease)",
            }}
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
          <span style={{ marginLeft: "auto" }}>
            <Badge variant="tone" tone="success" size="sm">You joined</Badge>
          </span>
        )}
      </div>
    </article>
  );
}

function StatPill({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: "var(--lc-radius-md)",
        padding: "var(--lc-space-2) var(--lc-space-3)",
        fontSize: "var(--lc-text-caption)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--lc-space-2)",
        minHeight: 34,
        backgroundColor: "var(--lc-bg-inset)",
        border: "1px solid var(--lc-border)",
      }}
    >
      <span style={{ color: "var(--lc-text-muted)" }}>{label}</span>
      {loading ? (
        <span
          style={{
            width: 40,
            height: 12,
            borderRadius: "var(--lc-radius-sm)",
            background: "linear-gradient(90deg, var(--lc-bg-inset) 25%, var(--lc-border) 50%, var(--lc-bg-inset) 75%)",
            backgroundSize: "200% 100%",
            animation: "lc-shimmer 1.4s ease-in-out infinite",
          }}
          aria-hidden
        />
      ) : (
        <span style={{ fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
          {value}
        </span>
      )}
    </div>
  );
}
