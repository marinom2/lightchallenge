"use client";

/**
 * Competition Registration Page
 *
 * Displays competition info and allows wallet-connected users to register,
 * view their registration status, and see the participant list.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import Badge from "@/app/components/ui/Badge";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Competition = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  category: string;
  max_participants: number | null;
  prize_config: {
    type?: string;
    pool?: string;
  };
  registration_opens_at: string;
  registration_closes_at: string;
  starts_at: string;
  ends_at: string;
  participant_count: number;
};

type Registration = {
  participant: string;
  registered_at: string;
  status: string;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function getRegistrationStatus(comp: Competition): { label: string; tone: "success" | "danger" | "muted" } {
  if (comp.status === "canceled") return { label: "Closed", tone: "muted" };
  if (comp.status !== "registration" && comp.status !== "draft") return { label: "Closed", tone: "muted" };
  if (comp.max_participants && comp.participant_count >= comp.max_participants) return { label: "Full", tone: "danger" };
  const now = new Date();
  if (comp.registration_closes_at && new Date(comp.registration_closes_at) < now) return { label: "Closed", tone: "muted" };
  if (comp.registration_opens_at && new Date(comp.registration_opens_at) > now) return { label: "Closed", tone: "muted" };
  return { label: "Open", tone: "success" };
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function CompetitionRegisterPage() {
  const params = useParams();
  const id = params.id as string;
  const { address, isConnected } = useAccount();
  const { authFetch } = useAuthFetch();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /* ── Fetch data ──────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}`);
      if (!res.ok) throw new Error(`Failed to load competition (${res.status})`);
      const data = await res.json();
      setCompetition(data.competition || data);
      setRegistrations(data.registrations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Registration status ─────────────────────────────────────── */

  const myReg = registrations.find(
    (r) => address && r.participant.toLowerCase() === address.toLowerCase(),
  );
  const isRegistered = !!myReg;

  /* ── Actions ─────────────────────────────────────────────────── */

  const handleRegister = useCallback(async () => {
    if (!address) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}/register`, {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Registration failed (${res.status})`);
      }
      setFeedback({ type: "success", message: "Successfully registered!" });
      fetchData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Registration failed." });
    } finally {
      setActionLoading(false);
    }
  }, [authFetch, address, id, fetchData]);

  const handleWithdraw = useCallback(async () => {
    if (!address) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}/register`, {
        method: "DELETE",
        body: JSON.stringify({ wallet: address }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Withdrawal failed (${res.status})`);
      }
      setFeedback({ type: "success", message: "Registration withdrawn." });
      fetchData();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Withdrawal failed." });
    } finally {
      setActionLoading(false);
    }
  }, [authFetch, address, id, fetchData]);

  /* ── Loading / Error ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={pageContainer}>
        <div style={cardStyle}>
          <div style={shimmerBlock} />
          <div style={{ ...shimmerBlock, width: "60%", height: 20 }} />
          <div style={{ ...shimmerBlock, width: "40%", height: 20 }} />
        </div>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div style={pageContainer}>
        <div style={cardStyle}>
          <p style={{ color: "var(--lc-danger)", fontSize: "var(--lc-text-body)" }}>
            {error || "Competition not found."}
          </p>
          <Link href="/competitions" style={linkStyle}>
            Back to competitions
          </Link>
        </div>
      </div>
    );
  }

  const regStatus = getRegistrationStatus(competition);
  const spotsText = competition.max_participants
    ? `${competition.participant_count} / ${competition.max_participants}`
    : `${competition.participant_count} registered`;

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div style={pageContainer}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-4)" }}>
        <Link href={`/competitions/${id}`} style={linkStyle}>
          {competition.title}
        </Link>
        <span style={{ color: "var(--lc-text-muted)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)" }}>Register</span>
      </div>

      {/* Competition info card */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--lc-space-3)" }}>
          <div>
            <h1 style={titleStyle}>{competition.title}</h1>
            {competition.description && (
              <p style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-body)", margin: "var(--lc-space-2) 0 0", maxWidth: 560 }}>
                {competition.description}
              </p>
            )}
          </div>
          <Badge variant="tone" tone={regStatus.tone} size="md" dot>
            {regStatus.label}
          </Badge>
        </div>

        {/* Info grid */}
        <div style={infoGrid}>
          <InfoItem label="Type" value={competition.type} />
          <InfoItem label="Category" value={competition.category} />
          <InfoItem label="Prize Pool" value={competition.prize_config?.pool || "--"} />
          <InfoItem label="Participants" value={spotsText} />
          <InfoItem label="Registration Opens" value={formatDate(competition.registration_opens_at)} />
          <InfoItem label="Registration Closes" value={formatDate(competition.registration_closes_at)} />
          <InfoItem label="Starts" value={formatDate(competition.starts_at)} />
          <InfoItem label="Ends" value={formatDate(competition.ends_at)} />
        </div>

        {/* Action area */}
        <div style={{ borderTop: "1px solid var(--lc-border)", paddingTop: "var(--lc-space-5)", marginTop: "var(--lc-space-2)" }}>
          {!isConnected ? (
            <div style={connectPrompt}>
              <span style={{ fontSize: "var(--lc-text-body)", color: "var(--lc-text-secondary)" }}>
                Connect your wallet to register for this competition.
              </span>
            </div>
          ) : isRegistered ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
              <Badge variant="tone" tone="success" size="md" dot>
                Registered
              </Badge>
              <button
                onClick={handleWithdraw}
                disabled={actionLoading}
                style={{
                  ...btnOutline,
                  opacity: actionLoading ? 0.5 : 1,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                }}
              >
                {actionLoading ? "Processing..." : "Withdraw Registration"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleRegister}
              disabled={actionLoading || regStatus.label !== "Open"}
              style={{
                ...btnPrimary,
                opacity: actionLoading || regStatus.label !== "Open" ? 0.5 : 1,
                cursor: actionLoading || regStatus.label !== "Open" ? "not-allowed" : "pointer",
              }}
            >
              {actionLoading ? "Registering..." : "Register"}
            </button>
          )}

          {/* Feedback */}
          {feedback && (
            <div
              style={{
                marginTop: "var(--lc-space-3)",
                padding: "var(--lc-space-3) var(--lc-space-4)",
                borderRadius: "var(--lc-radius-sm)",
                backgroundColor: feedback.type === "success" ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
                color: feedback.type === "success" ? "var(--lc-success)" : "var(--lc-danger)",
                fontSize: "var(--lc-text-small)",
                fontWeight: 500,
              }}
            >
              {feedback.message}
            </div>
          )}
        </div>
      </div>

      {/* Participant list */}
      <div style={{ ...cardStyle, marginTop: "var(--lc-space-4)" }}>
        <h2 style={{ fontSize: "var(--lc-text-heading)", fontWeight: 600, color: "var(--lc-text)", margin: 0 }}>
          Participants ({registrations.length})
        </h2>

        {registrations.length === 0 ? (
          <p style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-body)", marginTop: "var(--lc-space-3)" }}>
            No participants registered yet.
          </p>
        ) : (
          <div style={{ marginTop: "var(--lc-space-3)", display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
            {registrations.map((reg) => {
              const isMe = address && reg.participant.toLowerCase() === address.toLowerCase();
              return (
                <div
                  key={reg.participant}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--lc-space-2) var(--lc-space-3)",
                    borderRadius: "var(--lc-radius-xs)",
                    backgroundColor: isMe ? "var(--lc-select)" : "transparent",
                    transition: "background-color var(--lc-dur-base) var(--lc-ease)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
                    <span
                      style={{
                        fontFamily: "var(--lc-font-mono)",
                        fontSize: "var(--lc-text-small)",
                        color: isMe ? "var(--lc-select-text)" : "var(--lc-text)",
                        fontWeight: isMe ? 600 : 400,
                      }}
                    >
                      {truncAddr(reg.participant)}
                    </span>
                    {isMe && (
                      <Badge variant="tone" tone="info" size="sm">You</Badge>
                    )}
                  </div>
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)" }}>
                    {formatDate(reg.registered_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--lc-text-body)", color: "var(--lc-text)", fontWeight: 500 }}>
        {value}
      </span>
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

const titleStyle: React.CSSProperties = {
  fontSize: "var(--lc-text-heading)",
  fontWeight: 700,
  color: "var(--lc-text)",
  margin: 0,
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "var(--lc-space-4)",
  marginTop: "var(--lc-space-5)",
};

const connectPrompt: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--lc-space-6)",
  border: "1px dashed var(--lc-border-strong)",
  borderRadius: "var(--lc-radius-sm)",
  textAlign: "center",
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

const btnOutline: React.CSSProperties = {
  padding: "var(--lc-space-2) var(--lc-space-4)",
  borderRadius: "var(--lc-radius-sm)",
  border: "1px solid var(--lc-border-strong)",
  backgroundColor: "transparent",
  color: "var(--lc-text-secondary)",
  fontSize: "var(--lc-text-small)",
  fontWeight: 500,
  minHeight: "var(--lc-touch-md)",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--lc-select-text)",
  fontSize: "var(--lc-text-small)",
  textDecoration: "none",
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
