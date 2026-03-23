"use client";

/**
 * Competition Lobby Page
 *
 * Pre-match lobby for tournament participants. Shows upcoming/current match,
 * opponent info, match ID submission form, and series progress.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import Badge from "@/app/components/ui/Badge";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type BracketMatch = {
  id: string;
  round: number;
  position: number;
  match_number: number;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: string;
  scheduled_at: string | null;
  bracket_type: string;
  series?: {
    format: string;
    score_a: number;
    score_b: number;
    status: string;
  } | null;
};

type Competition = {
  id: string;
  title: string;
  status: string;
  category: string;
};

type VerificationResult = {
  outcome: "win" | "loss" | "draw" | "pending";
  stats?: Record<string, unknown>;
  error?: string;
};

const PLATFORMS = [
  { id: "dota2", label: "Dota 2" },
  { id: "lol", label: "League of Legends" },
  { id: "cs2", label: "CS2" },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatCountdown(targetIso: string | null): string {
  if (!targetIso) return "--";
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "Now";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function CompetitionLobbyPage() {
  const params = useParams();
  const id = params.id as string;
  const { address, isConnected } = useAccount();
  const { authFetch } = useAuthFetch();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Match ID submission state */
  const [platform, setPlatform] = useState<PlatformId>("dota2");
  const [externalMatchId, setExternalMatchId] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /* Countdown tick */
  const [, setTick] = useState(0);

  /* ── Fetch data ──────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compRes, bracketRes] = await Promise.all([
        authFetch(`/api/v1/competitions/${id}`),
        authFetch(`/api/v1/competitions/${id}/bracket`),
      ]);
      if (!compRes.ok) throw new Error(`Failed to load competition (${compRes.status})`);
      if (!bracketRes.ok) throw new Error(`Failed to load bracket (${bracketRes.status})`);
      const compData = await compRes.json();
      const bracketData = await bracketRes.json();
      setCompetition(compData.competition || compData);
      setMatches(bracketData.matches || bracketData.bracket || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Countdown timer */
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  /* ── Find current match ──────────────────────────────────────── */

  const myMatch = useMemo(() => {
    if (!address || matches.length === 0) return null;
    const addr = address.toLowerCase();
    // Prefer pending/in_progress matches, fall back to most recent
    const active = matches.find(
      (m) =>
        (m.status === "pending" || m.status === "in_progress") &&
        (m.participant_a?.toLowerCase() === addr || m.participant_b?.toLowerCase() === addr),
    );
    if (active) return active;
    // Fall back to last completed
    return [...matches]
      .reverse()
      .find(
        (m) =>
          m.participant_a?.toLowerCase() === addr || m.participant_b?.toLowerCase() === addr,
      ) || null;
  }, [address, matches]);

  const opponent = useMemo(() => {
    if (!myMatch || !address) return null;
    const addr = address.toLowerCase();
    if (myMatch.participant_a?.toLowerCase() === addr) return myMatch.participant_b;
    return myMatch.participant_a;
  }, [myMatch, address]);

  const isPending = myMatch?.status === "pending" || myMatch?.status === "in_progress";

  /* ── Submit match ID ─────────────────────────────────────────── */

  const handleSubmitMatch = useCallback(async () => {
    if (!externalMatchId.trim()) {
      setSubmitFeedback({ type: "error", message: "Enter a match ID." });
      return;
    }
    setSubmitLoading(true);
    setSubmitFeedback(null);
    setVerification(null);
    try {
      const res = await authFetch("/api/v1/evidence/submit-match", {
        method: "POST",
        body: JSON.stringify({
          match_id: externalMatchId.trim(),
          platform,
          wallet: address,
          challenge_id: id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Submission failed (${res.status})`);
      }
      const data = await res.json();
      setVerification(data.result || data);
      setSubmitFeedback({ type: "success", message: "Match ID submitted and verified." });
    } catch (err: unknown) {
      setSubmitFeedback({ type: "error", message: err instanceof Error ? err.message : "Submission failed." });
    } finally {
      setSubmitLoading(false);
    }
  }, [authFetch, externalMatchId, platform, address, id]);

  /* ── Loading / Error ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={pageContainer}>
        <div style={cardStyle}>
          <div style={shimmerBlock} />
          <div style={{ ...shimmerBlock, width: "60%", height: 20 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageContainer}>
        <div style={cardStyle}>
          <p style={{ color: "var(--lc-danger)" }}>{error}</p>
          <Link href={`/competitions/${id}`} style={linkStyle}>Back to competition</Link>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div style={pageContainer}>
        <div style={cardStyle}>
          <div style={connectPrompt}>
            <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-body)" }}>
              Connect your wallet to view your match lobby.
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div style={pageContainer}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-4)" }}>
        <Link href={`/competitions/${id}`} style={linkStyle}>
          {competition?.title || "Competition"}
        </Link>
        <span style={{ color: "var(--lc-text-muted)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)" }}>Lobby</span>
      </div>

      {!myMatch ? (
        /* No match found */
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "var(--lc-space-10) 0" }}>
            <p style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-body)" }}>
              No upcoming match found for your wallet.
            </p>
            <Link href={`/competitions/${id}/register`} style={{ ...linkStyle, marginTop: "var(--lc-space-3)", display: "inline-block" }}>
              Register for this competition
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Match info card */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--lc-space-3)" }}>
              <h2 style={headingStyle}>
                Round {myMatch.round} &middot; Match #{myMatch.match_number || myMatch.position}
              </h2>
              <Badge
                variant="tone"
                tone={myMatch.status === "completed" ? "success" : myMatch.status === "in_progress" ? "warning" : "info"}
                size="md"
                dot
              >
                {myMatch.status}
              </Badge>
            </div>

            {/* Matchup */}
            <div style={matchupContainer}>
              <div style={matchupPlayer}>
                <span style={matchupLabel}>You</span>
                <span style={matchupAddr}>{address ? truncAddr(address) : "--"}</span>
              </div>
              <div style={matchupVs}>
                <span style={{ fontSize: "var(--lc-text-heading)", fontWeight: 700, color: "var(--lc-text-muted)" }}>
                  VS
                </span>
                {isPending && myMatch.scheduled_at && (
                  <div style={countdownBox}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Starts in
                    </span>
                    <span style={{ fontSize: "var(--lc-text-subhead)", fontWeight: 700, color: "var(--lc-text)" }}>
                      {formatCountdown(myMatch.scheduled_at)}
                    </span>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)" }}>
                      {formatDateTime(myMatch.scheduled_at)}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ ...matchupPlayer, textAlign: "right" }}>
                <span style={matchupLabel}>Opponent</span>
                <span style={matchupAddr}>{opponent ? truncAddr(opponent) : "TBD"}</span>
              </div>
            </div>

            {/* Series info */}
            {myMatch.series && (
              <div style={seriesBar}>
                <Badge variant="tone" tone="info" size="sm">
                  {myMatch.series.format}
                </Badge>
                <span style={{ fontSize: "var(--lc-text-body)", fontWeight: 700, color: "var(--lc-text)" }}>
                  {myMatch.series.score_a} - {myMatch.series.score_b}
                </span>
                <Badge
                  variant="tone"
                  tone={myMatch.series.status === "completed" ? "success" : "warning"}
                  size="sm"
                  dot
                >
                  {myMatch.series.status}
                </Badge>
              </div>
            )}
          </div>

          {/* Submit Match ID */}
          <div style={{ ...cardStyle, marginTop: "var(--lc-space-4)" }}>
            <h3 style={{ ...headingStyle, fontSize: "var(--lc-text-subhead)" }}>Submit Match ID</h3>
            <p style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)", margin: "var(--lc-space-1) 0 var(--lc-space-4)" }}>
              Enter your external match ID for automated result verification.
            </p>

            {/* Platform selector */}
            <div style={{ marginBottom: "var(--lc-space-3)" }}>
              <label style={fieldLabel}>Platform</label>
              <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    style={{
                      padding: "var(--lc-space-2) var(--lc-space-4)",
                      borderRadius: "var(--lc-radius-sm)",
                      border: `1px solid ${platform === p.id ? "var(--lc-select-border)" : "var(--lc-border)"}`,
                      backgroundColor: platform === p.id ? "var(--lc-select)" : "transparent",
                      color: platform === p.id ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
                      fontSize: "var(--lc-text-small)",
                      fontWeight: platform === p.id ? 600 : 400,
                      cursor: "pointer",
                      transition: "all var(--lc-dur-base) var(--lc-ease)",
                      minHeight: "var(--lc-touch-sm)",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match ID input */}
            <div style={{ marginBottom: "var(--lc-space-4)" }}>
              <label style={fieldLabel}>Match ID</label>
              <input
                type="text"
                value={externalMatchId}
                onChange={(e) => setExternalMatchId(e.target.value)}
                placeholder="e.g. 7890123456"
                style={textInput}
              />
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmitMatch}
              disabled={submitLoading || !externalMatchId.trim()}
              style={{
                ...btnPrimary,
                opacity: submitLoading || !externalMatchId.trim() ? 0.5 : 1,
                cursor: submitLoading || !externalMatchId.trim() ? "not-allowed" : "pointer",
              }}
            >
              {submitLoading ? "Verifying..." : "Submit for Verification"}
            </button>

            {/* Feedback */}
            {submitFeedback && (
              <div
                style={{
                  marginTop: "var(--lc-space-3)",
                  padding: "var(--lc-space-3) var(--lc-space-4)",
                  borderRadius: "var(--lc-radius-sm)",
                  backgroundColor: submitFeedback.type === "success" ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
                  color: submitFeedback.type === "success" ? "var(--lc-success)" : "var(--lc-danger)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: 500,
                }}
              >
                {submitFeedback.message}
              </div>
            )}

            {/* Verification result */}
            {verification && (
              <div style={verificationCard}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
                  <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>Result:</span>
                  <Badge
                    variant="tone"
                    tone={verification.outcome === "win" ? "success" : verification.outcome === "loss" ? "danger" : verification.outcome === "draw" ? "warning" : "muted"}
                    size="md"
                    dot
                  >
                    {verification.outcome.toUpperCase()}
                  </Badge>
                </div>
                {verification.stats && Object.keys(verification.stats).length > 0 && (
                  <div style={statsGrid}>
                    {Object.entries(verification.stats).map(([key, value]) => (
                      <div key={key} style={statItem}>
                        <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)", textTransform: "capitalize" }}>
                          {key.replace(/_/g, " ")}
                        </span>
                        <span style={{ fontSize: "var(--lc-text-body)", fontWeight: 600, color: "var(--lc-text)" }}>
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat placeholder + report link */}
          <div style={{ ...cardStyle, marginTop: "var(--lc-space-4)" }}>
            <h3 style={{ ...headingStyle, fontSize: "var(--lc-text-subhead)" }}>Match Chat</h3>
            <div style={chatPlaceholder}>
              <span style={{ fontSize: "var(--lc-text-body)", color: "var(--lc-text-tertiary)" }}>
                In-match chat coming soon.
              </span>
            </div>

            {isPending && (
              <div style={{ marginTop: "var(--lc-space-4)", borderTop: "1px solid var(--lc-border)", paddingTop: "var(--lc-space-4)" }}>
                <Link
                  href={`/competitions/${id}`}
                  style={{
                    ...linkStyle,
                    fontSize: "var(--lc-text-body)",
                  }}
                >
                  View full bracket and report results
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const pageContainer: React.CSSProperties = {
  maxWidth: "var(--lc-content-narrow)",
  margin: "0 auto",
  padding: "var(--lc-space-6) var(--lc-space-4)",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--lc-bg-raised)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-md)",
  padding: "var(--lc-space-6)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "var(--lc-text-heading)",
  fontWeight: 600,
  color: "var(--lc-text)",
  margin: 0,
};

const linkStyle: React.CSSProperties = {
  color: "var(--lc-select-text)",
  fontSize: "var(--lc-text-small)",
  textDecoration: "none",
};

const connectPrompt: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--lc-space-10)",
  border: "1px dashed var(--lc-border-strong)",
  borderRadius: "var(--lc-radius-sm)",
};

const matchupContainer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--lc-space-4)",
  padding: "var(--lc-space-5)",
  marginTop: "var(--lc-space-4)",
  backgroundColor: "var(--lc-bg-inset)",
  borderRadius: "var(--lc-radius-sm)",
  flexWrap: "wrap",
  justifyContent: "center",
};

const matchupPlayer: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-1)",
};

const matchupLabel: React.CSSProperties = {
  fontSize: "var(--lc-text-caption)",
  color: "var(--lc-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 500,
};

const matchupAddr: React.CSSProperties = {
  fontFamily: "var(--lc-font-mono)",
  fontSize: "var(--lc-text-body)",
  color: "var(--lc-text)",
  fontWeight: 500,
};

const matchupVs: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--lc-space-2)",
  flexShrink: 0,
};

const countdownBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
};

const seriesBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--lc-space-4)",
  padding: "var(--lc-space-3)",
  marginTop: "var(--lc-space-3)",
  backgroundColor: "var(--lc-bg-overlay)",
  borderRadius: "var(--lc-radius-xs)",
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text-secondary)",
  marginBottom: "var(--lc-space-2)",
  fontWeight: 500,
};

const textInput: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  height: "var(--lc-touch-md)",
  padding: "0 var(--lc-space-3)",
  fontSize: "var(--lc-text-body)",
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-sm)",
  outline: "none",
  transition: "border-color var(--lc-dur-base) var(--lc-ease)",
};

const btnPrimary: React.CSSProperties = {
  padding: "var(--lc-space-3) var(--lc-space-6)",
  borderRadius: "var(--lc-radius-sm)",
  border: "none",
  backgroundColor: "var(--lc-accent)",
  color: "var(--lc-accent-text)",
  fontSize: "var(--lc-text-body)",
  fontWeight: 600,
  minHeight: "var(--lc-touch-md)",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
};

const verificationCard: React.CSSProperties = {
  marginTop: "var(--lc-space-4)",
  padding: "var(--lc-space-4)",
  backgroundColor: "var(--lc-bg-inset)",
  borderRadius: "var(--lc-radius-sm)",
  border: "1px solid var(--lc-border)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-3)",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
  gap: "var(--lc-space-3)",
  marginTop: "var(--lc-space-2)",
};

const statItem: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const chatPlaceholder: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--lc-space-10)",
  marginTop: "var(--lc-space-3)",
  border: "1px dashed var(--lc-border)",
  borderRadius: "var(--lc-radius-sm)",
  backgroundColor: "var(--lc-bg-inset)",
};

const shimmerBlock: React.CSSProperties = {
  height: 28,
  width: "80%",
  borderRadius: "var(--lc-radius-xs)",
  backgroundColor: "var(--lc-bg-overlay)",
  animation: "lc-shimmer 1.5s infinite",
  backgroundSize: "200% 100%",
  backgroundImage: "linear-gradient(90deg, var(--lc-bg-overlay) 25%, var(--lc-bg-inset) 50%, var(--lc-bg-overlay) 75%)",
  marginBottom: "var(--lc-space-3)",
};
