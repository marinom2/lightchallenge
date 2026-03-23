"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLiveBracket, type BracketMatch } from "@/lib/useLiveBracket";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Competition = {
  id: string;
  title: string;
  type: string;
  status: string;
  settings: Record<string, unknown>;
};

type EventLogEntry = {
  id: string;
  type: "match_completed" | "match_started" | "bracket_update";
  message: string;
  timestamp: Date;
  matchId?: string;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ── Components ────────────────────────────────────────────────────────────── */

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "var(--lc-radius-pill, 100px)",
        fontSize: "var(--lc-text-caption)",
        fontWeight: "var(--lc-weight-medium)" as any,
        background: connected ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
        color: connected ? "var(--lc-success)" : "var(--lc-danger)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: connected ? "var(--lc-success)" : "var(--lc-danger)",
          animation: connected ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />
      {connected ? "Live" : "Disconnected"}
    </span>
  );
}

function LiveMatchCard({ match }: { match: BracketMatch }) {
  const isLive = match.status === "in_progress";
  const isDone = match.status === "completed";

  return (
    <div
      style={{
        background: "var(--lc-bg-raised)",
        border: `1px solid ${isLive ? "var(--lc-success)" : "var(--lc-border)"}`,
        borderRadius: "var(--lc-radius-md, 8px)",
        padding: "12px 16px",
        minWidth: 220,
        position: "relative",
        boxShadow: isLive ? "0 0 12px rgba(34, 197, 94, 0.15)" : "none",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    >
      {isLive && (
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--lc-success)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      )}
      <div
        style={{
          fontSize: "var(--lc-text-micro)",
          color: "var(--lc-text-tertiary)",
          marginBottom: 8,
        }}
      >
        R{match.round} M{match.match_number} · {match.bracket_type === "grand_final" ? "Grand Final" : match.bracket_type}
      </div>

      {/* Participant A */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          color:
            isDone && match.winner === match.participant_a
              ? "var(--lc-accent)"
              : isDone && match.winner !== match.participant_a
                ? "var(--lc-text-tertiary)"
                : "var(--lc-text)",
          fontWeight: match.winner === match.participant_a ? 600 : 400,
        }}
      >
        <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
          {match.participant_a ? truncAddr(match.participant_a) : "TBD"}
        </span>
        <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
          {match.score_a ?? "-"}
        </span>
      </div>

      <div style={{ height: 1, background: "var(--lc-border)", margin: "2px 0" }} />

      {/* Participant B */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 0",
          color:
            isDone && match.winner === match.participant_b
              ? "var(--lc-accent)"
              : isDone && match.winner !== match.participant_b
                ? "var(--lc-text-tertiary)"
                : "var(--lc-text)",
          fontWeight: match.winner === match.participant_b ? 600 : 400,
        }}
      >
        <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
          {match.participant_b ? truncAddr(match.participant_b) : "TBD"}
        </span>
        <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)" }}>
          {match.score_b ?? "-"}
        </span>
      </div>
    </div>
  );
}

function EventLog({ events }: { events: EventLogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div
      ref={scrollRef}
      style={{
        background: "var(--lc-bg-inset)",
        border: "1px solid var(--lc-border)",
        borderRadius: "var(--lc-radius-md, 8px)",
        padding: "12px",
        maxHeight: 300,
        overflowY: "auto",
        fontFamily: "var(--lc-font-mono)",
        fontSize: "var(--lc-text-caption)",
      }}
    >
      {events.length === 0 ? (
        <div style={{ color: "var(--lc-text-tertiary)", textAlign: "center", padding: 24 }}>
          Waiting for match events...
        </div>
      ) : (
        events.map((ev) => (
          <div
            key={ev.id}
            style={{
              display: "flex",
              gap: 8,
              padding: "4px 0",
              borderBottom: "1px solid var(--lc-border)",
              color: "var(--lc-text-secondary)",
            }}
          >
            <span style={{ color: "var(--lc-text-tertiary)", flexShrink: 0 }}>
              {formatTime(ev.timestamp)}
            </span>
            <span
              style={{
                color:
                  ev.type === "match_completed"
                    ? "var(--lc-success)"
                    : ev.type === "match_started"
                      ? "var(--lc-info)"
                      : "var(--lc-text-secondary)",
              }}
            >
              {ev.message}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function SpectatorLivePage() {
  const params = useParams();
  const competitionId = params.id as string;
  const authFetch = useAuthFetch();
  const { matches, connected } = useLiveBracket(competitionId);
  const [comp, setComp] = useState<Competition | null>(null);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const prevMatchesRef = useRef<BracketMatch[]>([]);

  // Fetch competition info
  useEffect(() => {
    if (!competitionId) return;
    authFetch(`/api/v1/competitions/${competitionId}`).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setComp(data.competition ?? data);
      }
    });
  }, [competitionId, authFetch]);

  // Detect match changes and generate event log entries
  useEffect(() => {
    const prev = prevMatchesRef.current;
    if (prev.length === 0) {
      prevMatchesRef.current = matches;
      return;
    }

    const newEvents: EventLogEntry[] = [];

    for (const m of matches) {
      const old = prev.find((p) => p.id === m.id);
      if (!old) continue;

      if (old.status !== "completed" && m.status === "completed" && m.winner) {
        newEvents.push({
          id: `${m.id}-completed-${Date.now()}`,
          type: "match_completed",
          message: `Match R${m.round}M${m.match_number} completed: ${truncAddr(m.winner)} wins${m.score_a != null ? ` (${m.score_a}-${m.score_b})` : ""}`,
          timestamp: new Date(),
          matchId: m.id,
        });
      } else if (old.status === "pending" && m.status === "in_progress") {
        newEvents.push({
          id: `${m.id}-started-${Date.now()}`,
          type: "match_started",
          message: `Match R${m.round}M${m.match_number} is now live: ${m.participant_a ? truncAddr(m.participant_a) : "TBD"} vs ${m.participant_b ? truncAddr(m.participant_b) : "TBD"}`,
          timestamp: new Date(),
          matchId: m.id,
        });
      }
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...prev.slice(-100), ...newEvents]);
    }

    prevMatchesRef.current = matches;
  }, [matches]);

  // Split matches by status
  const liveMatches = matches.filter((m) => m.status === "in_progress");
  const upcomingMatches = matches.filter(
    (m) => m.status === "pending" && m.participant_a && m.participant_b
  );
  const completedMatches = matches
    .filter((m) => m.status === "completed")
    .sort((a, b) => {
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return bTime - aTime;
    });

  const totalMatches = matches.filter((m) => m.status !== "bye").length;
  const doneMatches = completedMatches.length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Link
            href={`/competitions/${competitionId}`}
            style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-small)", textDecoration: "none" }}
          >
            &larr; Back to competition
          </Link>
          <h1 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-heading)", margin: "4px 0 0" }}>
            {comp?.title ?? "Tournament"} — Live
          </h1>
        </div>
        <ConnectionBadge connected={connected} />
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ background: "var(--lc-bg-raised)", borderRadius: "var(--lc-radius-md, 8px)", padding: "12px 16px", border: "1px solid var(--lc-border)" }}>
          <div style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-caption)" }}>Live Matches</div>
          <div style={{ color: liveMatches.length > 0 ? "var(--lc-success)" : "var(--lc-text)", fontSize: "var(--lc-text-heading)", fontWeight: 600 }}>
            {liveMatches.length}
          </div>
        </div>
        <div style={{ background: "var(--lc-bg-raised)", borderRadius: "var(--lc-radius-md, 8px)", padding: "12px 16px", border: "1px solid var(--lc-border)" }}>
          <div style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-caption)" }}>Upcoming</div>
          <div style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-heading)", fontWeight: 600 }}>{upcomingMatches.length}</div>
        </div>
        <div style={{ background: "var(--lc-bg-raised)", borderRadius: "var(--lc-radius-md, 8px)", padding: "12px 16px", border: "1px solid var(--lc-border)" }}>
          <div style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-caption)" }}>Completed</div>
          <div style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-heading)", fontWeight: 600 }}>{doneMatches} / {totalMatches}</div>
        </div>
        <div style={{ background: "var(--lc-bg-raised)", borderRadius: "var(--lc-radius-md, 8px)", padding: "12px 16px", border: "1px solid var(--lc-border)" }}>
          <div style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-caption)" }}>Progress</div>
          <div style={{ marginTop: 4, height: 6, borderRadius: 3, background: "var(--lc-bg-inset)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${totalMatches > 0 ? (doneMatches / totalMatches) * 100 : 0}%`,
                background: "var(--lc-success)",
                borderRadius: 3,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ color: "var(--lc-success)", fontSize: "var(--lc-text-subhead)", fontWeight: 600, marginBottom: 12 }}>
            Live Now
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {liveMatches.map((m) => (
              <LiveMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming matches */}
      {upcomingMatches.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-subhead)", fontWeight: 600, marginBottom: 12 }}>
            Up Next
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {upcomingMatches.slice(0, 6).map((m) => (
              <LiveMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Event log */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-subhead)", fontWeight: 600, marginBottom: 12 }}>
          Event Log
        </h2>
        <EventLog events={events} />
      </section>

      {/* Recent results */}
      {completedMatches.length > 0 && (
        <section>
          <h2 style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-subhead)", fontWeight: 600, marginBottom: 12 }}>
            Recent Results
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {completedMatches.slice(0, 8).map((m) => (
              <LiveMatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
