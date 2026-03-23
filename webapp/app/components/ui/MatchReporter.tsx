"use client";

/**
 * MatchReporter — Match result reporting for tournament organizers/admins.
 *
 * Two modes:
 *   1. Simple: score input + winner selector (no series)
 *   2. Series: game-by-game reporting grid with per-game winner + optional external match ID
 */

import React, { useState, useCallback } from "react";
import Badge from "@/app/components/ui/Badge";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Game = {
  game_number: number;
  winner: string | null;
  status: string;
  match_id_ext: string | null;
};

type Series = {
  id: string;
  format: string;
  score_a: number;
  score_b: number;
  status: string;
  games: Game[];
};

type Match = {
  participant_a: string | null;
  participant_b: string | null;
  status: string;
  round: number;
  match_number: number;
  bracket_type: string;
};

export type MatchReporterProps = {
  competitionId: string;
  matchId: string;
  match: Match;
  series?: Series | null;
  onResult?: (result: { winner: string }) => void;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function MatchReporter({
  competitionId,
  matchId,
  match,
  series,
  onResult,
}: MatchReporterProps) {
  const { authFetch } = useAuthFetch();

  /* Simple mode state */
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);

  /* Series mode state */
  const [gameWinners, setGameWinners] = useState<Record<number, string>>({});
  const [gameMatchIds, setGameMatchIds] = useState<Record<number, string>>({});
  const [submittingGame, setSubmittingGame] = useState<number | null>(null);

  /* Shared state */
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const pA = match.participant_a;
  const pB = match.participant_b;

  /* ── Simple submit ────────────────────────────────────────────── */

  const submitSimple = useCallback(async () => {
    if (!winner) {
      setFeedback({ type: "error", message: "Select a winner before submitting." });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await authFetch(
        `/api/v1/competitions/${competitionId}/matches/${matchId}/result`,
        {
          method: "POST",
          body: JSON.stringify({ winner, score_a: scoreA, score_b: scoreB }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setFeedback({ type: "success", message: "Result submitted." });
      onResult?.({ winner });
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  }, [authFetch, competitionId, matchId, winner, scoreA, scoreB, onResult]);

  /* ── Series game submit ───────────────────────────────────────── */

  const submitGame = useCallback(
    async (gameNumber: number) => {
      const gWinner = gameWinners[gameNumber];
      if (!gWinner) {
        setFeedback({ type: "error", message: `Select a winner for Game ${gameNumber}.` });
        return;
      }
      setSubmittingGame(gameNumber);
      setFeedback(null);
      try {
        const res = await authFetch(
          `/api/v1/competitions/${competitionId}/matches/${matchId}/series`,
          {
            method: "POST",
            body: JSON.stringify({
              game_number: gameNumber,
              winner: gWinner,
              match_id_ext: gameMatchIds[gameNumber] || null,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        setFeedback({ type: "success", message: `Game ${gameNumber} result recorded.` });
        if (onResult) onResult({ winner: gWinner });
      } catch (err: unknown) {
        setFeedback({ type: "error", message: err instanceof Error ? err.message : "Submission failed." });
      } finally {
        setSubmittingGame(null);
      }
    },
    [authFetch, competitionId, matchId, gameWinners, gameMatchIds, onResult],
  );

  /* ── Render: Series mode ──────────────────────────────────────── */

  if (series) {
    return (
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--lc-space-3)" }}>
          <h3 style={headingStyle}>
            Round {match.round} &middot; Match {match.match_number}
          </h3>
          <Badge variant="tone" tone="info" size="md">
            {series.format}
          </Badge>
        </div>

        {/* Series score */}
        <div style={seriesScoreContainer}>
          <div style={seriesPlayerCol}>
            <span style={seriesPlayerName}>{pA ? truncAddr(pA) : "TBD"}</span>
          </div>
          <div style={seriesScoreCenter}>
            <span style={seriesScoreNum}>{series.score_a}</span>
            <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-heading)", padding: "0 var(--lc-space-2)" }}>&ndash;</span>
            <span style={seriesScoreNum}>{series.score_b}</span>
          </div>
          <div style={{ ...seriesPlayerCol, textAlign: "right" }}>
            <span style={seriesPlayerName}>{pB ? truncAddr(pB) : "TBD"}</span>
          </div>
        </div>

        {/* Game grid */}
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Game</th>
                <th style={thStyle}>Winner</th>
                <th style={thStyle}>Match ID (ext)</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {series.games.map((game) => {
                const isPending = game.status === "pending";
                const isCompleted = game.status === "completed";
                return (
                  <tr key={game.game_number}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 as number }}>#{game.game_number}</span>
                    </td>

                    {/* Winner selector */}
                    <td style={tdStyle}>
                      {isCompleted ? (
                        <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)", color: "var(--lc-success)" }}>
                          {game.winner ? truncAddr(game.winner) : "--"}
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: "var(--lc-space-3)" }}>
                          {pA && (
                            <label style={radioLabel}>
                              <input
                                type="radio"
                                name={`game-winner-${game.game_number}`}
                                checked={gameWinners[game.game_number] === pA}
                                onChange={() => setGameWinners((prev) => ({ ...prev, [game.game_number]: pA }))}
                                style={{ accentColor: "var(--lc-accent)" }}
                              />
                              <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
                                {truncAddr(pA)}
                              </span>
                            </label>
                          )}
                          {pB && (
                            <label style={radioLabel}>
                              <input
                                type="radio"
                                name={`game-winner-${game.game_number}`}
                                checked={gameWinners[game.game_number] === pB}
                                onChange={() => setGameWinners((prev) => ({ ...prev, [game.game_number]: pB }))}
                                style={{ accentColor: "var(--lc-accent)" }}
                              />
                              <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
                                {truncAddr(pB)}
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                    </td>

                    {/* External match ID */}
                    <td style={tdStyle}>
                      {isCompleted ? (
                        <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)" }}>
                          {game.match_id_ext || "--"}
                        </span>
                      ) : (
                        <input
                          type="text"
                          placeholder="Optional"
                          value={gameMatchIds[game.game_number] || ""}
                          onChange={(e) => setGameMatchIds((prev) => ({ ...prev, [game.game_number]: e.target.value }))}
                          style={inputStyle}
                        />
                      )}
                    </td>

                    {/* Status */}
                    <td style={tdStyle}>
                      <Badge
                        variant="tone"
                        tone={isCompleted ? "success" : isPending ? "muted" : "warning"}
                        size="sm"
                        dot
                      >
                        {game.status}
                      </Badge>
                    </td>

                    {/* Action */}
                    <td style={tdStyle}>
                      {isPending && (
                        <button
                          onClick={() => submitGame(game.game_number)}
                          disabled={submittingGame === game.game_number || !gameWinners[game.game_number]}
                          style={{
                            ...btnPrimary,
                            opacity: submittingGame === game.game_number || !gameWinners[game.game_number] ? 0.5 : 1,
                            cursor: submittingGame === game.game_number || !gameWinners[game.game_number] ? "not-allowed" : "pointer",
                          }}
                        >
                          {submittingGame === game.game_number ? "Saving..." : "Report Game"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Feedback */}
        {feedback && <FeedbackBar type={feedback.type} message={feedback.message} />}
      </div>
    );
  }

  /* ── Render: Simple mode ──────────────────────────────────────── */

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>
        Round {match.round} &middot; Match {match.match_number}
      </h3>

      {/* Score inputs */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-4)", justifyContent: "center", flexWrap: "wrap" }}>
        {/* Player A */}
        <div style={playerScoreCol}>
          <span style={playerLabel}>{pA ? truncAddr(pA) : "TBD"}</span>
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(Math.max(0, parseInt(e.target.value) || 0))}
            style={scoreInput}
          />
        </div>

        <span style={{ fontSize: "var(--lc-text-heading)", color: "var(--lc-text-muted)", fontWeight: 700 }}>vs</span>

        {/* Player B */}
        <div style={playerScoreCol}>
          <span style={playerLabel}>{pB ? truncAddr(pB) : "TBD"}</span>
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(Math.max(0, parseInt(e.target.value) || 0))}
            style={scoreInput}
          />
        </div>
      </div>

      {/* Winner selector */}
      <div style={{ marginTop: "var(--lc-space-4)" }}>
        <label style={{ display: "block", color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)", marginBottom: "var(--lc-space-2)" }}>
          Winner
        </label>
        <div style={{ display: "flex", gap: "var(--lc-space-3)" }}>
          {pA && (
            <button
              onClick={() => setWinner(pA)}
              style={{
                ...winnerBtn,
                borderColor: winner === pA ? "var(--lc-success)" : "var(--lc-border)",
                backgroundColor: winner === pA ? "var(--lc-success-muted)" : "transparent",
                color: winner === pA ? "var(--lc-success)" : "var(--lc-text)",
              }}
            >
              {truncAddr(pA)}
            </button>
          )}
          {pB && (
            <button
              onClick={() => setWinner(pB)}
              style={{
                ...winnerBtn,
                borderColor: winner === pB ? "var(--lc-success)" : "var(--lc-border)",
                backgroundColor: winner === pB ? "var(--lc-success-muted)" : "transparent",
                color: winner === pB ? "var(--lc-success)" : "var(--lc-text)",
              }}
            >
              {truncAddr(pB)}
            </button>
          )}
        </div>
      </div>

      {/* Submit */}
      <div style={{ marginTop: "var(--lc-space-6)", display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
        <button
          onClick={submitSimple}
          disabled={submitting || !winner}
          style={{
            ...btnPrimary,
            opacity: submitting || !winner ? 0.5 : 1,
            cursor: submitting || !winner ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit Result"}
        </button>
      </div>

      {/* Feedback */}
      {feedback && <FeedbackBar type={feedback.type} message={feedback.message} />}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function FeedbackBar({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <div
      style={{
        marginTop: "var(--lc-space-4)",
        padding: "var(--lc-space-3) var(--lc-space-4)",
        borderRadius: "var(--lc-radius-sm)",
        backgroundColor: type === "success" ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
        color: type === "success" ? "var(--lc-success)" : "var(--lc-danger)",
        fontSize: "var(--lc-text-small)",
        fontWeight: 500,
      }}
    >
      {message}
    </div>
  );
}

/* ── Shared styles ─────────────────────────────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  backgroundColor: "var(--lc-bg-raised)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-md)",
  padding: "var(--lc-space-6)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-4)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "var(--lc-text-subhead)",
  fontWeight: 600,
  color: "var(--lc-text)",
  margin: 0,
};

const playerScoreCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--lc-space-2)",
};

const playerLabel: React.CSSProperties = {
  fontFamily: "var(--lc-font-mono)",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text-secondary)",
};

const scoreInput: React.CSSProperties = {
  width: 72,
  height: "var(--lc-touch-md)",
  textAlign: "center",
  fontSize: "var(--lc-text-heading)",
  fontWeight: 700,
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-sm)",
  outline: "none",
};

const winnerBtn: React.CSSProperties = {
  padding: "var(--lc-space-2) var(--lc-space-4)",
  borderRadius: "var(--lc-radius-sm)",
  border: "1px solid var(--lc-border)",
  fontFamily: "var(--lc-font-mono)",
  fontSize: "var(--lc-text-small)",
  cursor: "pointer",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
  background: "transparent",
};

const btnPrimary: React.CSSProperties = {
  padding: "var(--lc-space-2) var(--lc-space-5)",
  borderRadius: "var(--lc-radius-sm)",
  border: "none",
  backgroundColor: "var(--lc-accent)",
  color: "var(--lc-accent-text)",
  fontSize: "var(--lc-text-small)",
  fontWeight: 600,
  transition: "all var(--lc-dur-base) var(--lc-ease)",
  minHeight: "var(--lc-touch-md)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 160,
  height: 32,
  padding: "0 var(--lc-space-2)",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-xs)",
  outline: "none",
};

const radioLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--lc-space-1)",
  cursor: "pointer",
};

/* ── Table styles ──────────────────────────────────────────────────────────── */

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--lc-text-small)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--lc-space-2) var(--lc-space-3)",
  color: "var(--lc-text-tertiary)",
  fontWeight: 500,
  fontSize: "var(--lc-text-caption)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--lc-border)",
};

const tdStyle: React.CSSProperties = {
  padding: "var(--lc-space-3)",
  borderBottom: "1px solid var(--lc-border)",
  verticalAlign: "middle",
};

/* ── Series score styles ───────────────────────────────────────────────────── */

const seriesScoreContainer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--lc-space-4)",
  padding: "var(--lc-space-4)",
  backgroundColor: "var(--lc-bg-inset)",
  borderRadius: "var(--lc-radius-sm)",
};

const seriesPlayerCol: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const seriesPlayerName: React.CSSProperties = {
  fontFamily: "var(--lc-font-mono)",
  fontSize: "var(--lc-text-body)",
  color: "var(--lc-text)",
  fontWeight: 500,
};

const seriesScoreCenter: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const seriesScoreNum: React.CSSProperties = {
  fontSize: "var(--lc-text-title)",
  fontWeight: 700,
  color: "var(--lc-text)",
  minWidth: 32,
  textAlign: "center",
};
