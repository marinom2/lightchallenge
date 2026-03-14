"use client";

import * as React from "react";
import {
  Clock,
  Hourglass,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassIcon } from "@/app/components/ui/GlassIcon";
import type { Status } from "../lib/types";
import { formatLCAI, formatDateShort, prettyCountdown } from "../lib/formatters";

export function StatusCapsule({ label, note }: { label?: string; note?: string }) {
  if (!label) return null;

  // V1 display labels: Completed, Finalizing, In progress, Upcoming, Canceled
  const tone =
    label === "Completed"
      ? "chip chip--ok"
      : label === "Finalizing"
        ? "chip chip--warn"
        : label === "In progress" || label === "Upcoming"
          ? "chip chip--info"
          : label === "Canceled"
            ? "chip chip--bad"
            : "chip chip--soft";

  const Icon: LucideIcon =
    label === "Completed"
      ? CheckCircle2
      : label === "Finalizing"
        ? Hourglass
        : label === "In progress"
          ? Clock
          : label === "Canceled"
            ? AlertTriangle
            : Info;

  return (
    <span className={`${tone} py-1! inline-flex items-center gap-1.5`}>
      <Icon size={14} />
      <span>{label}</span>
      {note ? <span className="text-(--text-muted)">• {note}</span> : null}
    </span>
  );
}

export function DetailsRibbon({ text }: { text: string }) {
  return (
    <div className="text-xs text-(--text-muted) flex flex-wrap gap-x-2 gap-y-1 items-center">
      <span className="mono opacity-80">{text}</span>
    </div>
  );
}

export function HeroMetricsRow({
  treasuryLabel,
  treasuryWei,
  winnersClaimed = 0,
  startTs,
  endTs,
}: {
  treasuryLabel: string;
  treasuryWei: string | null;
  winnersClaimed?: number;
  startTs?: number | null;
  endTs?: number | null;
}) {
  const pot = formatLCAI(treasuryWei);

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="subpanel">
        <div className="subpanel__body">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-(--text-muted) flex items-center gap-2">
                <span className="metric-ic" aria-hidden>
                  <GlassIcon icon={Zap} size={18} />
                </span>
                {treasuryLabel}
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums">{pot}</div>
              <div className="mt-1 text-xs text-(--text-muted)">This is what's at stake.</div>
            </div>

            <div className="text-right text-xs text-(--text-muted) tabular-nums">
              <div>Winners claimed</div>
              <div className="mt-1 text-base font-semibold text-(--text)">{winnersClaimed}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="metric">
              <div className="flex items-center gap-2">
                <span className="metric-ic" aria-hidden>
                  <GlassIcon icon={Clock} size={18} />
                </span>
                <div className="text-xs uppercase tracking-wider text-(--text-muted)">Starts</div>
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{startTs ? formatDateShort(startTs) : "—"}</div>
            </div>

            <div className="metric">
              <div className="flex items-center gap-2">
                <span className="metric-ic" aria-hidden>
                  <GlassIcon icon={Hourglass} size={18} />
                </span>
                <div className="text-xs uppercase tracking-wider text-(--text-muted)">Ends</div>
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{endTs ? formatDateShort(endTs) : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroProgress({
  start,
  end,
  joinClose,
  status,
}: {
  start: number | null;
  end: number | null;
  joinClose?: number | null;
  status?: Status;
}) {
  if (!start || !end) return null;

  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));
  React.useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const canceled = status === "Canceled";
  const finalized = status === "Finalized";

  const total = Math.max(1, end - start);
  const elapsed = Math.min(Math.max(0, now - start), total);
  const pctRaw = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const pct = Math.round(pctRaw);

  const joinOpen = !!joinClose && now < joinClose && now < start;
  const preStart = now < start;
  const active = now >= start && now < end && !canceled;
  const finalizing = now >= end && !finalized && !canceled;

  const caption =
    finalized
      ? "Completed"
      : finalizing
        ? "Finalizing…"
        : active
          ? `${pct}% complete`
          : joinOpen
            ? `Join open • closes in ${prettyCountdown(Math.max(0, (joinClose ?? 0) - now))}`
            : preStart
              ? `Starts in ${prettyCountdown(Math.max(0, start - now))}`
              : canceled
                ? "Canceled"
                : "";

  const widthPct = `${finalized ? 100 : pctRaw}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={caption}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="text-xs text-(--text-muted) tabular-nums"
          >
            {caption}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="relative overflow-hidden rounded-full"
        style={{
          height: 12,
          background: "var(--progress-track)",
          boxShadow:
            "inset 0 0 0 1px var(--progress-outline, color-mix(in oklab, var(--border-strong) 75%, transparent))",
        }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={finalized ? 100 : pct}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          animate={{ width: widthPct }}
          transition={{ type: "spring", stiffness: 140, damping: 26 }}
          style={{
            background: "var(--progress-fill)",
            boxShadow:
              "0 0 0 1px var(--progress-edge, color-mix(in oklab, var(--border) 30%, transparent)), " +
              "0 10px 24px var(--progress-glow, color-mix(in oklab, var(--accent-2) 18%, transparent))",
          }}
        />

        <motion.div
          className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
          animate={{ width: widthPct }}
          transition={{ type: "spring", stiffness: 140, damping: 26 }}
          style={{
            background:
              "var(--progress-sheen, linear-gradient(90deg, transparent, color-mix(in oklab, white 22%, transparent), transparent))",
            opacity: 0.55,
          }}
        />
      </div>
    </div>
  );
}
