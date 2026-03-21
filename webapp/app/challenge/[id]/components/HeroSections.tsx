"use client";

import * as React from "react";
import * as Lucide from "lucide-react";
import { formatWeiDual } from "@/lib/tokenPrice";
import { fmtNum } from "../lib/formatters";
import { ACTIVITY_LABELS } from "./ActivityFigure";
import type { ActivityType } from "./ActivityFigure";

const { Clock, ShieldCheck } = Lucide;

// ─────────────────────────────────────────────────────────────────────────────
// CountdownDisplay (local copy – avoids circular import from page)
// ─────────────────────────────────────────────────────────────────────────────
function CountdownDisplay({ targetSec }: { targetSec: number }) {
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, targetSec - now);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (diff <= 0) return <span className="tabular-nums">0:00</span>;

  return (
    <span className="tabular-nums font-semibold">
      {d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusPill
// ─────────────────────────────────────────────────────────────────────────────
export function StatusPill({
  loading,
  hasJoined,
  participantStatus,
  publicLabel,
}: {
  loading: boolean;
  hasJoined: boolean;
  participantStatus: any;
  publicLabel: string;
}) {
  if (loading) return null;

  const resolvedLabel = participantStatus?.resolved?.label;
  const resolvedStage = participantStatus?.resolved?.stage;
  const label = hasJoined && resolvedLabel ? resolvedLabel : publicLabel;

  const pillFailed = label === "Challenge failed" || resolvedStage === "FAILED";
  const pillSuccess =
    label === "Challenge completed" ||
    resolvedStage === "PASSED" ||
    resolvedStage === "REWARD_EARNED" ||
    resolvedStage === "CLAIMABLE" ||
    resolvedStage === "CLAIMED";

  const dotClass = pillFailed
    ? "cd-status-line__dot--failed"
    : pillSuccess
      ? "cd-status-line__dot--success"
      : resolvedStage === "ACTIVE" || publicLabel === "In progress"
        ? "cd-status-line__dot--active"
        : resolvedStage === "NEEDS_PROOF" || resolvedStage === "NEEDS_PROOF_URGENT"
          ? "cd-status-line__dot--upcoming"
          : publicLabel === "Upcoming"
            ? "cd-status-line__dot--upcoming"
            : publicLabel === "Completed"
              ? "cd-status-line__dot--active"
              : "cd-status-line__dot--ended";

  if (!label) return null;

  return (
    <div className="cd-status-line">
      <span className={`cd-status-line__dot ${dotClass}`} />
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompetitionHero
// ─────────────────────────────────────────────────────────────────────────────
function formatScore(score: number): string {
  return Math.round(score * 100) / 100 !== Math.round(score)
    ? score.toFixed(2)
    : score.toLocaleString();
}

export function CompetitionHero({
  hasJoined,
  myRank,
  topN,
  totalParticipants,
  metricUnit,
  rankContext,
  leaderboard,
  address,
  endSec,
  isCompleted,
}: {
  hasJoined: boolean;
  myRank: { rank: number; score: number | null } | null;
  topN: number;
  totalParticipants: number;
  metricUnit: string;
  rankContext: { gapAhead: number | null; gapBehind: number | null } | null;
  leaderboard: Array<{ rank: number; subject: string; score: number | null }>;
  address: string | undefined;
  endSec?: number;
  isCompleted: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="cd-competition-hero">
      {/* Primary: Your rank */}
      {hasJoined && myRank ? (
        <div className="cd-competition-hero__rank-block">
          <div className="cd-competition-hero__position">
            <span className="cd-competition-hero__hash">#</span>
            <span className="cd-competition-hero__rank-num">{myRank.rank}</span>
            <span className="cd-competition-hero__rank-label">
              {myRank.rank <= topN ? "in the money" : `of ${totalParticipants}`}
            </span>
          </div>
          {myRank.score != null ? (
            <div className="cd-competition-hero__score">
              {formatScore(myRank.score)}{" "}
              <span className="cd-competition-hero__score-unit">{metricUnit}</span>
            </div>
          ) : (
            <div className="cd-competition-hero__score cd-competition-hero__score--pending">
              No score yet
            </div>
          )}
          {/* Gap context */}
          {rankContext ? (
            <div className="cd-competition-hero__gaps">
              {rankContext.gapAhead != null ? (
                <span className="cd-competition-hero__gap cd-competition-hero__gap--behind">
                  {formatScore(rankContext.gapAhead)} {metricUnit} behind #{myRank.rank - 1}
                </span>
              ) : null}
              {rankContext.gapBehind != null ? (
                <span className="cd-competition-hero__gap cd-competition-hero__gap--ahead">
                  +{formatScore(rankContext.gapBehind)} {metricUnit} ahead of #{myRank.rank + 1}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : hasJoined ? (
        <div className="cd-competition-hero__rank-block">
          <div className="cd-competition-hero__score cd-competition-hero__score--pending">
            Waiting for results…
          </div>
        </div>
      ) : (
        <div className="cd-competition-hero__rank-block">
          <div className="cd-competition-hero__position">
            <span className="cd-competition-hero__rank-label">Top {topN} win</span>
          </div>
          <div className="cd-competition-hero__score cd-competition-hero__score--pending">
            Join to compete
          </div>
        </div>
      )}

      {/* Time remaining */}
      {endSec && now < endSec ? (
        <div className="cd-progress-hero__time">
          <Clock size={12} style={{ opacity: 0.5 }} /> <CountdownDisplay targetSec={endSec} /> remaining
        </div>
      ) : endSec && now >= endSec && !isCompleted ? (
        <div className="cd-progress-hero__time cd-progress-hero__time--ended">Competition ended</div>
      ) : null}

      {/* Mini leaderboard: top 3 */}
      {leaderboard.length > 0 ? (
        <div className="cd-competition-hero__mini-board">
          {leaderboard.slice(0, 3).map((entry) => {
            const isMe = entry.subject.toLowerCase() === address?.toLowerCase();
            return (
              <div
                key={entry.subject}
                className={`cd-competition-hero__board-row ${isMe ? "cd-competition-hero__board-row--me" : ""}`}
              >
                <span className="cd-competition-hero__board-rank">#{entry.rank}</span>
                <span className="cd-competition-hero__board-addr">
                  {isMe ? "You" : `${entry.subject.slice(0, 6)}…${entry.subject.slice(-4)}`}
                </span>
                <span className="cd-competition-hero__board-score">
                  {entry.score != null ? `${entry.score.toLocaleString()} ${metricUnit}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalHero
// ─────────────────────────────────────────────────────────────────────────────
export function GoalHero({
  progress,
  progressPct,
  progressDiff,
  barClass,
  endSec,
  isCompleted,
  isFailed,
  isSuccess,
}: {
  progress: { currentValue: number; goalValue: number; metricLabel: string };
  progressPct: number | null;
  progressDiff: { positive: boolean; value: number } | null;
  barClass: string;
  endSec?: number;
  isCompleted: boolean;
  isFailed: boolean;
  isSuccess: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="cd-progress-hero">
      <div className="cd-progress-hero__numbers">
        <div className="cd-progress-hero__metric">
          <span className="cd-progress-hero__metric-current">{progress.currentValue.toLocaleString()}</span>
          <span className="cd-progress-hero__metric-sep"> / </span>
          <span className="cd-progress-hero__metric-goal">{progress.goalValue.toLocaleString()}</span>
          <span className="cd-progress-hero__metric-unit"> {progress.metricLabel}</span>
        </div>

        <div className="cd-progress-hero__pct-line">
          <span
            className={`cd-progress-hero__pct ${isFailed ? "cd-progress-hero__pct--failed" : (progressPct ?? 0) >= 100 ? "cd-progress-hero__pct--success" : ""}`}
          >
            {progressPct ?? 0}%
          </span>
          {progressDiff ? (
            <span
              className={`cd-progress-hero__diff ${progressDiff.positive ? "cd-progress-hero__diff--positive" : isFailed ? "cd-progress-hero__diff--failed" : "cd-progress-hero__diff--negative"}`}
            >
              {progressDiff.positive
                ? `+${progressDiff.value.toLocaleString()} above target`
                : isFailed
                  ? `${progressDiff.value.toLocaleString()} ${progress.metricLabel} short`
                  : `${progressDiff.value.toLocaleString()} ${progress.metricLabel} to go`}
            </span>
          ) : null}
        </div>

        {isFailed ? (
          <div className="cd-progress-hero__state cd-progress-hero__state--failed">Challenge failed</div>
        ) : isSuccess ? (
          <div className="cd-progress-hero__state cd-progress-hero__state--success">Challenge completed</div>
        ) : null}

        {endSec && now < endSec ? (
          <div className="cd-progress-hero__time">
            <Clock size={12} style={{ opacity: 0.5 }} /> <CountdownDisplay targetSec={endSec} /> remaining
          </div>
        ) : endSec && now >= endSec && !isCompleted ? (
          <div className="cd-progress-hero__time cd-progress-hero__time--ended">Challenge ended</div>
        ) : null}
      </div>

      <div className="cd-progress-hero__bar">
        <div className={barClass} style={{ width: `${Math.min(100, (progress.currentValue / progress.goalValue) * 100)}%` }} />
        <div className="cd-progress-hero__sheen" style={{ width: `${Math.min(100, (progress.currentValue / progress.goalValue) * 100)}%` }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TimeHero
// ─────────────────────────────────────────────────────────────────────────────
export function TimeHero({
  startSec,
  endSec,
  barClass,
  finished,
}: {
  startSec: number;
  endSec: number;
  barClass: string;
  finished: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  const total = Math.max(1, endSec - startSec);
  const elapsed = Math.min(Math.max(0, now - startSec), total);
  const pct = Math.min(100, (elapsed / total) * 100);

  return (
    <div className="cd-progress-hero">
      <div className="cd-progress-hero__bar">
        <div className={barClass} style={{ width: `${finished ? 100 : pct}%` }} />
        <div className="cd-progress-hero__sheen" style={{ width: `${finished ? 100 : pct}%` }} />
      </div>
      {now < endSec ? (
        <div className="cd-progress-hero__time">
          Ends in <CountdownDisplay targetSec={endSec} />
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickStats
// ─────────────────────────────────────────────────────────────────────────────
export function QuickStats({
  treasuryWei,
  tokenPrice,
  participantsCount,
  isCompleted,
  isCompetitive,
  competitiveTopN,
  activityType,
  category,
}: {
  treasuryWei: string | null;
  tokenPrice: number | null;
  participantsCount: number | null;
  isCompleted: boolean;
  isCompetitive: boolean;
  competitiveTopN: number;
  activityType: ActivityType | null;
  category?: string | null;
}) {
  const dual = formatWeiDual(treasuryWei, tokenPrice);
  const potLabel = dual.usd ? dual.usd : dual.lcai;

  return (
    <div className="cd-quick-stats">
      <div className="cd-quick-stat">
        <div className="cd-quick-stat__value">{potLabel}</div>
        <div className="cd-quick-stat__label">{isCompleted ? "Prize Pool" : "Reward"}</div>
      </div>
      <div className="cd-quick-stat">
        <div className="cd-quick-stat__value">{fmtNum(participantsCount ?? 0)}</div>
        <div className="cd-quick-stat__label">Participants</div>
      </div>
      {isCompetitive ? (
        <div className="cd-quick-stat">
          <div className="cd-quick-stat__value">Top {competitiveTopN}</div>
          <div className="cd-quick-stat__label">Winners</div>
        </div>
      ) : (activityType || category) ? (
        <div className="cd-quick-stat">
          <div className="cd-quick-stat__value">
            {activityType ? ACTIVITY_LABELS[activityType] : category!.charAt(0).toUpperCase() + category!.slice(1)}
          </div>
          <div className="cd-quick-stat__label">Activity</div>
        </div>
      ) : null}
      {dual.usd ? (
        <div className="cd-quick-stat">
          <div className="cd-quick-stat__value">{dual.lcai}</div>
          <div className="cd-quick-stat__label">LCAI</div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrustBadges
// ─────────────────────────────────────────────────────────────────────────────
export function TrustBadges({
  loading,
  hasEvidence,
  isFinalized,
  hasOnChain,
}: {
  loading: boolean;
  hasEvidence: boolean;
  isFinalized: boolean;
  hasOnChain: boolean;
}) {
  if (loading) return null;

  return (
    <div className="cd-trust">
      {hasEvidence ? (
        <div className="cd-trust__item">
          <ShieldCheck size={12} className="cd-trust__icon" />
          Verified automatically
        </div>
      ) : null}
      {isFinalized ? (
        <div className="cd-trust__item">
          <ShieldCheck size={12} className="cd-trust__icon" />
          Finalized on-chain
        </div>
      ) : hasOnChain ? (
        <div className="cd-trust__item">
          <ShieldCheck size={12} className="cd-trust__icon" />
          Recorded on-chain
        </div>
      ) : null}
    </div>
  );
}
