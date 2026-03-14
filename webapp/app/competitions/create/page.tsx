"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import Badge from "@/app/components/ui/Badge";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type CompType = "single" | "bracket" | "round_robin" | "circuit";
type Category = "gaming" | "fitness" | "custom";
type DistributionType = "winner_takes_all" | "top_n" | "proportional" | "custom";

type FormState = {
  type: CompType | null;
  title: string;
  description: string;
  category: Category;
  maxParticipants: number;
  registrationOpens: string;
  registrationCloses: string;
  startsAt: string;
  endsAt: string;
  distributionType: DistributionType;
  numWinners: number;
  splits: number[];
  rules: string;
  isPublic: boolean;
  requireCheckin: boolean;
};

const INITIAL_STATE: FormState = {
  type: null,
  title: "",
  description: "",
  category: "gaming",
  maxParticipants: 16,
  registrationOpens: "",
  registrationCloses: "",
  startsAt: "",
  endsAt: "",
  distributionType: "winner_takes_all",
  numWinners: 3,
  splits: [60, 30, 10],
  rules: "",
  isPublic: true,
  requireCheckin: false,
};

const STEPS = [
  { id: 1, name: "Type", label: "Choose Format" },
  { id: 2, name: "Details", label: "Tournament Info" },
  { id: 3, name: "Schedule", label: "Set Dates" },
  { id: 4, name: "Prizes", label: "Prize Pool" },
  { id: 5, name: "Review", label: "Confirm & Launch" },
];

/* ── Type Cards ────────────────────────────────────────────────────────────── */

const TYPE_OPTIONS: {
  type: CompType;
  title: string;
  description: string;
  bestFor: string;
  icon: string;
  emoji: string;
  playerRange: string;
  color: string;
}[] = [
  {
    type: "single",
    title: "Single Challenge",
    description: "A standalone challenge with pass/fail verification. Participants submit evidence, AI verifies results.",
    bestFor: "1v1 bets, personal goals, fitness challenges",
    icon: "01",
    emoji: "\u26A1",
    playerRange: "1-100",
    color: "#3b82f6",
  },
  {
    type: "bracket",
    title: "Bracket Tournament",
    description: "Single-elimination bracket where participants face off in rounds until a champion is crowned.",
    bestFor: "Esports tournaments, head-to-head competitions",
    icon: "02",
    emoji: "\uD83C\uDFC6",
    playerRange: "4-128",
    color: "#f59e0b",
  },
  {
    type: "round_robin",
    title: "Round-Robin League",
    description: "Every participant plays against every other. Final standings determined by win/loss record.",
    bestFor: "Leagues, season-long competitions, rankings",
    icon: "03",
    emoji: "\uD83D\uDD04",
    playerRange: "3-32",
    color: "#22c55e",
  },
  {
    type: "circuit",
    title: "Circuit Series",
    description: "A series of linked challenges forming a circuit. Cumulative points across events determine the champion.",
    bestFor: "Multi-event competitions, season circuits",
    icon: "04",
    emoji: "\uD83C\uDF10",
    playerRange: "4-256",
    color: "#a855f7",
  },
];

/* ── Category options ──────────────────────────────────────────────────────── */

const CATEGORY_OPTIONS: { value: Category; label: string; emoji: string; desc: string }[] = [
  { value: "gaming", label: "Gaming", emoji: "\uD83C\uDFAE", desc: "Esports, ranked matches, in-game achievements" },
  { value: "fitness", label: "Fitness", emoji: "\uD83C\uDFCB\uFE0F", desc: "Steps, distance, workouts, health goals" },
  { value: "custom", label: "Custom", emoji: "\u2699\uFE0F", desc: "Any other type of competition" },
];

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronLeft({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ── Shared Styles ─────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-md)",
  outline: "none",
  transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-2)",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text-secondary)",
  fontWeight: 500,
};

const cardStyle: React.CSSProperties = {
  padding: "var(--lc-space-5)",
  borderRadius: "var(--lc-radius-lg)",
  border: "1px solid var(--lc-border)",
  backgroundColor: "var(--lc-bg-raised)",
};

/* ── Quick schedule presets ─────────────────────────────────────────────────── */

function getPresetDates(preset: string): Partial<Pick<FormState, "registrationOpens" | "registrationCloses" | "startsAt" | "endsAt">> {
  const now = new Date();
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const addHours = (d: Date, n: number) => { const r = new Date(d); r.setHours(r.getHours() + n); return r; };

  switch (preset) {
    case "quick":
      return {
        registrationOpens: fmt(now),
        registrationCloses: fmt(addHours(now, 2)),
        startsAt: fmt(addHours(now, 3)),
        endsAt: fmt(addHours(now, 6)),
      };
    case "weekend":
      // Next Saturday
      const sat = new Date(now);
      sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
      sat.setHours(10, 0, 0, 0);
      return {
        registrationOpens: fmt(now),
        registrationCloses: fmt(addDays(sat, -1)),
        startsAt: fmt(sat),
        endsAt: fmt(addHours(sat, 8)),
      };
    case "week":
      return {
        registrationOpens: fmt(now),
        registrationCloses: fmt(addDays(now, 3)),
        startsAt: fmt(addDays(now, 4)),
        endsAt: fmt(addDays(now, 11)),
      };
    case "month":
      return {
        registrationOpens: fmt(now),
        registrationCloses: fmt(addDays(now, 7)),
        startsAt: fmt(addDays(now, 8)),
        endsAt: fmt(addDays(now, 38)),
      };
    default:
      return {};
  }
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CreateCompetitionPage() {
  const router = useRouter();
  const { authFetch, address } = useAuthFetch();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const selectedType = useMemo(() => TYPE_OPTIONS.find((t) => t.type === form.type), [form.type]);

  /* Validation */
  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return form.type !== null;
      case 2:
        return form.title.trim().length >= 3 && form.maxParticipants >= 2;
      case 3:
        return (
          form.registrationOpens !== "" &&
          form.registrationCloses !== "" &&
          form.startsAt !== "" &&
          form.endsAt !== ""
        );
      case 4:
        if (form.distributionType === "top_n" || form.distributionType === "custom") {
          const sum = form.splits.reduce((a, b) => a + b, 0);
          return sum === 100 && form.splits.length > 0;
        }
        return true;
      case 5:
        return true;
      default:
        return false;
    }
  }, [step, form]);

  const next = useCallback(() => {
    if (step < 5 && canProceed) setStep((s) => s + 1);
  }, [step, canProceed]);

  const back = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  /* Submit */
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        settings: {
          max_participants: form.maxParticipants,
          is_public: form.isPublic,
          require_checkin: form.requireCheckin,
        },
        rules: form.rules.trim() ? { text: form.rules.trim() } : undefined,
        registration_opens_at: form.registrationOpens ? new Date(form.registrationOpens).toISOString() : undefined,
        registration_closes_at: form.registrationCloses ? new Date(form.registrationCloses).toISOString() : undefined,
        starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        prize_config: {
          type: form.distributionType,
          splits:
            form.distributionType === "top_n" || form.distributionType === "custom"
              ? form.splits
              : undefined,
        },
      };
      const res = await authFetch("/api/v1/competitions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      setSuccess(true);
      const newId = data?.id || data?.competition?.id;
      setTimeout(() => {
        if (newId) {
          router.push(`/competitions/${newId}`);
        } else {
          router.push("/competitions");
        }
      }, 1200);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }, [form, router, authFetch]);

  /* Split helpers */
  const updateSplit = useCallback(
    (index: number, value: number) => {
      setForm((prev) => {
        const newSplits = [...prev.splits];
        newSplits[index] = value;
        return { ...prev, splits: newSplits };
      });
    },
    []
  );

  const addSplitRow = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      numWinners: prev.numWinners + 1,
      splits: [...prev.splits, 0],
    }));
  }, []);

  const removeSplitRow = useCallback((index: number) => {
    setForm((prev) => {
      const newSplits = prev.splits.filter((_, i) => i !== index);
      return {
        ...prev,
        numWinners: Math.max(1, prev.numWinners - 1),
        splits: newSplits,
      };
    });
  }, []);

  const splitSum = form.splits.reduce((a, b) => a + b, 0);

  const applyPresetSplits = useCallback((n: number) => {
    let splits: number[];
    switch (n) {
      case 1: splits = [100]; break;
      case 2: splits = [70, 30]; break;
      case 3: splits = [60, 30, 10]; break;
      case 4: splits = [50, 25, 15, 10]; break;
      case 5: splits = [40, 25, 15, 12, 8]; break;
      default: {
        const base = Math.floor(100 / n);
        splits = Array(n).fill(base);
        splits[0] += 100 - base * n;
        break;
      }
    }
    setForm((prev) => ({ ...prev, numWinners: n, splits }));
  }, []);

  /* Apply schedule preset */
  const applySchedulePreset = useCallback((preset: string) => {
    const dates = getPresetDates(preset);
    setForm((prev) => ({ ...prev, ...dates }));
  }, []);

  /* Type selection — auto-advance to step 2 */
  const selectType = useCallback((t: CompType) => {
    setForm((prev) => ({ ...prev, type: t }));
    // Auto-advance after a short delay so user sees their selection
    setTimeout(() => setStep(2), 350);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      <Breadcrumb
        items={[
          { label: "Tournaments", href: "/competitions" },
          { label: "Create" },
        ]}
      />

      {/* ── Wallet Gate ────────────────────────────────────────────────────── */}
      {!address && (
        <div style={{
          padding: "var(--lc-space-6)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--lc-space-3)",
        }}>
          <span style={{ fontSize: 32 }}>{"\uD83D\uDD12"}</span>
          <span style={{ fontSize: "var(--lc-text-subhead)", fontWeight: 600, color: "var(--lc-text)" }}>
            Connect wallet to create
          </span>
          <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", maxWidth: 400 }}>
            You need a connected wallet to create and manage tournaments. Connect your wallet to get started.
          </span>
        </div>
      )}

      {/* ── Header with selected type badge ────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
          <h1 style={{
            fontSize: "var(--lc-text-title)",
            fontWeight: 700,
            color: "var(--lc-text)",
            letterSpacing: "-0.02em",
            margin: 0,
          }}>
            Create Tournament
          </h1>
          {selectedType && step > 1 && (
            <Badge variant="tone" tone="accent" size="sm">
              {selectedType.emoji} {selectedType.title}
            </Badge>
          )}
        </div>
        {step === 1 ? (
          <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", margin: 0 }}>
            Choose the format that best fits your competition
          </p>
        ) : (
          <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", margin: 0 }}>
            Step {step} of 5 &mdash; {STEPS[step - 1].label}
          </p>
        )}
      </div>

      {/* ── Stepper (only visible after type is chosen, step > 1) ──────────── */}
      {form.type && step > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {STEPS.map((s, i) => {
            if (s.id === 1) return null; // hide type step from stepper
            const isActive = s.id === step;
            const isDone = s.id < step;
            const isFuture = s.id > step;
            return (
              <React.Fragment key={s.id}>
                {i > 1 && (
                  <div style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: isDone ? "var(--lc-select-text)" : "var(--lc-border)",
                    transition: "background-color 0.3s ease",
                  }} />
                )}
                <button
                  onClick={() => { if (isDone) setStep(s.id); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--lc-space-2)",
                    padding: "8px 16px",
                    borderRadius: "var(--lc-radius-pill)",
                    fontSize: "var(--lc-text-caption)",
                    fontWeight: isActive ? 600 : 400,
                    border: isActive
                      ? "2px solid var(--lc-select-border)"
                      : isDone
                      ? "2px solid var(--lc-select-border)"
                      : "1px solid var(--lc-border)",
                    backgroundColor: isDone
                      ? "var(--lc-select-text)"
                      : isActive
                      ? "var(--lc-select)"
                      : "transparent",
                    color: isDone
                      ? "#fff"
                      : isActive
                      ? "var(--lc-select-text)"
                      : "var(--lc-text-muted)",
                    cursor: isDone ? "pointer" : "default",
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isDone ? <CheckIcon size={12} /> : null}
                  <span>{s.name}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: "var(--lc-space-3) var(--lc-space-4)",
          borderRadius: "var(--lc-radius-md)",
          backgroundColor: "var(--lc-danger-muted)",
          color: "var(--lc-danger)",
          fontSize: "var(--lc-text-small)",
          display: "flex",
          alignItems: "center",
          gap: "var(--lc-space-2)",
        }}>
          <span style={{ flexShrink: 0 }}>{"\u26A0\uFE0F"}</span>
          {error}
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {success && (
        <div style={{
          padding: "var(--lc-space-5)",
          borderRadius: "var(--lc-radius-lg)",
          backgroundColor: "var(--lc-success-muted)",
          color: "var(--lc-success)",
          textAlign: "center",
          fontSize: "var(--lc-text-body)",
          fontWeight: 600,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--lc-space-2)",
        }}>
          <span style={{ fontSize: 40 }}>{"\uD83C\uDF89"}</span>
          Tournament created! Redirecting...
        </div>
      )}

      {/* ── Step Content ──────────────────────────────────────────────────── */}
      {!success && (
        <div style={{ minHeight: 300 }}>
          {/* ═══ Step 1: Type Selection ═══════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--lc-space-4)" }}>
              {TYPE_OPTIONS.map((opt) => {
                const selected = form.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    onClick={() => selectType(opt.type)}
                    style={{
                      ...cardStyle,
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--lc-space-3)",
                      cursor: "pointer",
                      textAlign: "left",
                      position: "relative",
                      overflow: "hidden",
                      border: selected
                        ? "2px solid var(--lc-select-border)"
                        : "1px solid var(--lc-border)",
                      backgroundColor: selected
                        ? "var(--lc-select)"
                        : "var(--lc-glass)",
                      boxShadow: selected
                        ? "0 0 0 3px var(--lc-select-ring), var(--lc-shadow-md)"
                        : "none",
                      transition: "all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-select-border)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "var(--lc-shadow-md)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                        (e.currentTarget as HTMLElement).style.backgroundColor = "var(--lc-glass-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-border)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "none";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                        (e.currentTarget as HTMLElement).style.backgroundColor = "var(--lc-glass)";
                      }
                    }}
                  >
                    {/* Top row: emoji + indicator */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                      {selected && (
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          backgroundColor: "var(--lc-select-text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                        }}>
                          <CheckIcon size={12} />
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <span style={{
                      fontSize: "var(--lc-text-body)",
                      fontWeight: 600,
                      color: "var(--lc-text)",
                    }}>
                      {opt.title}
                    </span>

                    {/* Description */}
                    <span style={{
                      fontSize: "var(--lc-text-caption)",
                      color: "var(--lc-text-secondary)",
                      lineHeight: 1.5,
                    }}>
                      {opt.description}
                    </span>

                    {/* Meta chips */}
                    <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap", marginTop: "auto" }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "var(--lc-radius-pill)",
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: `${opt.color}15`,
                        color: opt.color,
                      }}>
                        {opt.playerRange} players
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "var(--lc-radius-pill)",
                        fontSize: 11,
                        fontWeight: 500,
                        backgroundColor: "var(--lc-bg-subtle)",
                        color: "var(--lc-text-muted)",
                        fontStyle: "italic",
                      }}>
                        {opt.bestFor}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══ Step 2: Details ══════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-5)" }}>
              {/* Main info card */}
              <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-5)" }}>
                <label style={labelStyle}>
                  Tournament Name *
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="e.g. Winter Gaming Championship 2026"
                    style={inputStyle}
                    maxLength={120}
                    autoFocus
                  />
                  {form.title.length > 0 && form.title.trim().length < 3 && (
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-danger)" }}>
                      Title must be at least 3 characters.
                    </span>
                  )}
                </label>

                <label style={labelStyle}>
                  Description
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Describe the competition rules, format, and prizes..."
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                    maxLength={2000}
                  />
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", alignSelf: "flex-end" }}>
                    {form.description.length}/2000
                  </span>
                </label>
              </div>

              {/* Category picker — visual cards */}
              <div style={cardStyle}>
                <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 500, color: "var(--lc-text-secondary)", marginBottom: "var(--lc-space-3)" }}>
                  Category
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--lc-space-3)" }}>
                  {CATEGORY_OPTIONS.map((cat) => {
                    const selected = form.category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => update("category", cat.value)}
                        style={{
                          padding: "var(--lc-space-3)",
                          borderRadius: "var(--lc-radius-md)",
                          border: selected ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                          backgroundColor: selected ? "var(--lc-select)" : "var(--lc-bg-inset)",
                          boxShadow: selected ? "var(--lc-shadow-sm)" : "none",
                          cursor: "pointer",
                          textAlign: "center",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{cat.emoji}</div>
                        <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 500, color: selected ? "var(--lc-select-text)" : "var(--lc-text)" }}>
                          {cat.label}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--lc-text-muted)", marginTop: 2 }}>{cat.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Settings row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--lc-space-4)" }}>
                <div style={cardStyle}>
                  <label style={labelStyle}>
                    Max Participants
                    <input
                      type="number"
                      value={form.maxParticipants}
                      onChange={(e) => update("maxParticipants", Math.max(2, parseInt(e.target.value) || 2))}
                      min={2}
                      max={1024}
                      style={inputStyle}
                    />
                    {form.type === "bracket" && (
                      <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                        Power of 2 recommended (8, 16, 32, 64)
                      </span>
                    )}
                  </label>
                </div>

                <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                  <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 500, color: "var(--lc-text-secondary)" }}>
                    Options
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => update("isPublic", e.target.checked)}
                      style={{ accentColor: "var(--lc-accent)" }}
                    />
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text)" }}>Public tournament</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.requireCheckin}
                      onChange={(e) => update("requireCheckin", e.target.checked)}
                      style={{ accentColor: "var(--lc-accent)" }}
                    />
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text)" }}>Require check-in</span>
                  </label>
                </div>
              </div>

              {/* Optional rules */}
              <details style={cardStyle}>
                <summary style={{
                  cursor: "pointer",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: 500,
                  color: "var(--lc-text-secondary)",
                  listStyle: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-2)",
                }}>
                  <span style={{ color: "var(--lc-text-muted)", fontSize: 10 }}>{"\u25B6"}</span>
                  Custom Rules (optional)
                </summary>
                <textarea
                  value={form.rules}
                  onChange={(e) => update("rules", e.target.value)}
                  placeholder="Add any custom rules, restrictions, or requirements..."
                  rows={3}
                  style={{ ...inputStyle, marginTop: "var(--lc-space-3)", resize: "vertical" }}
                  maxLength={5000}
                />
              </details>
            </div>
          )}

          {/* ═══ Step 3: Schedule ═════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-5)" }}>
              {/* Quick presets */}
              <div style={cardStyle}>
                <div style={{ fontSize: "var(--lc-text-small)", fontWeight: 500, color: "var(--lc-text-secondary)", marginBottom: "var(--lc-space-3)" }}>
                  Quick Presets
                </div>
                <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
                  {[
                    { key: "quick", label: "\u26A1 Quick (3 hrs)", desc: "Starts in 3 hours" },
                    { key: "weekend", label: "\uD83D\uDCC5 Weekend", desc: "Next Saturday" },
                    { key: "week", label: "\uD83D\uDCC6 1 Week", desc: "Starts in 4 days" },
                    { key: "month", label: "\uD83D\uDDD3\uFE0F 1 Month", desc: "Starts in 8 days" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      onClick={() => applySchedulePreset(p.key)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "var(--lc-radius-md)",
                        border: "1px solid var(--lc-border)",
                        backgroundColor: "var(--lc-bg-inset)",
                        cursor: "pointer",
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text)",
                        transition: "all 0.15s ease",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-select-border)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--lc-shadow-sm)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
                    >
                      <div style={{ fontWeight: 500 }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: "var(--lc-text-muted)", marginTop: 2 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date inputs */}
              <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--lc-space-4)" }}>
                <label style={labelStyle}>
                  Registration Opens
                  <input type="datetime-local" value={form.registrationOpens} onChange={(e) => update("registrationOpens", e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Registration Closes
                  <input type="datetime-local" value={form.registrationCloses} onChange={(e) => update("registrationCloses", e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Competition Starts
                  <input type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Competition Ends
                  <input type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} style={inputStyle} />
                </label>
              </div>

              {/* Validation hints */}
              {form.registrationCloses && form.startsAt && new Date(form.registrationCloses) > new Date(form.startsAt) && (
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-warning)", padding: "0 var(--lc-space-2)" }}>
                  {"\u26A0\uFE0F"} Registration should close before the competition starts.
                </span>
              )}
              {form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt) && (
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-danger)", padding: "0 var(--lc-space-2)" }}>
                  {"\u26A0\uFE0F"} Competition must end after it starts.
                </span>
              )}

              {/* Timeline preview */}
              {form.registrationOpens && form.endsAt && (
                <div style={{ ...cardStyle, padding: "var(--lc-space-3) var(--lc-space-4)" }}>
                  <div style={{ fontSize: "var(--lc-text-caption)", fontWeight: 500, color: "var(--lc-text-secondary)", marginBottom: "var(--lc-space-2)" }}>
                    Timeline Preview
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 0, position: "relative", height: 40 }}>
                    {[
                      { label: "Reg Opens", date: form.registrationOpens, color: "#3b82f6" },
                      { label: "Reg Closes", date: form.registrationCloses, color: "#f59e0b" },
                      { label: "Starts", date: form.startsAt, color: "#22c55e" },
                      { label: "Ends", date: form.endsAt, color: "#ef4444" },
                    ].filter((d) => d.date).map((d, i, arr) => (
                      <React.Fragment key={d.label}>
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flex: 0,
                          zIndex: 1,
                        }}>
                          <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: d.color,
                          }} />
                          <div style={{ fontSize: 10, color: d.color, fontWeight: 500, whiteSpace: "nowrap", marginTop: 4 }}>
                            {d.label}
                          </div>
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex: 1, height: 2, backgroundColor: "var(--lc-border)" }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ Step 4: Prize Configuration ══════════════════════════════════ */}
          {step === 4 && (
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-5)" }}>
              <label style={labelStyle}>
                Distribution Type
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--lc-space-3)" }}>
                  {([
                    { key: "winner_takes_all", label: "Winner Takes All", desc: "100% to first place", emoji: "\uD83E\uDD47" },
                    { key: "top_n", label: "Top N Split", desc: "Split among top finishers", emoji: "\uD83C\uDFC5" },
                    { key: "proportional", label: "Proportional", desc: "Based on final standings", emoji: "\uD83D\uDCCA" },
                    { key: "custom", label: "Custom", desc: "Manual allocation table", emoji: "\u2699\uFE0F" },
                  ] as { key: DistributionType; label: string; desc: string; emoji: string }[]).map((opt) => {
                    const selected = form.distributionType === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => {
                          update("distributionType", opt.key);
                          if (opt.key === "top_n") applyPresetSplits(form.numWinners);
                        }}
                        style={{
                          padding: "var(--lc-space-3)",
                          borderRadius: "var(--lc-radius-md)",
                          border: selected ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                          backgroundColor: selected ? "var(--lc-select)" : "var(--lc-bg-inset)",
                          boxShadow: selected ? "var(--lc-shadow-sm)" : "none",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--lc-space-2)",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                        <div>
                          <div style={{
                            fontSize: "var(--lc-text-small)",
                            fontWeight: 500,
                            color: selected ? "var(--lc-select-text)" : "var(--lc-text)",
                          }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                            {opt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </label>

              {/* Top N configuration */}
              {form.distributionType === "top_n" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                  <label style={labelStyle}>
                    Number of Winners
                    <div style={{ display: "flex", gap: "var(--lc-space-2)" }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => applyPresetSplits(n)}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "var(--lc-radius-md)",
                            border: form.numWinners === n ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                            backgroundColor: form.numWinners === n ? "var(--lc-select)" : "var(--lc-bg-inset)",
                            color: form.numWinners === n ? "var(--lc-select-text)" : "var(--lc-text)",
                            cursor: "pointer",
                            fontSize: "var(--lc-text-small)",
                            fontWeight: 600,
                            transition: "all 0.15s ease",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </label>
                  <SplitEditor splits={form.splits} onUpdate={updateSplit} onRemove={removeSplitRow} splitSum={splitSum} />
                </div>
              )}

              {/* Custom configuration */}
              {form.distributionType === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                  <SplitEditor splits={form.splits} onUpdate={updateSplit} onRemove={removeSplitRow} splitSum={splitSum} />
                  <button
                    onClick={addSplitRow}
                    style={{
                      alignSelf: "flex-start",
                      padding: "6px 14px",
                      borderRadius: "var(--lc-radius-md)",
                      border: "1px solid var(--lc-border)",
                      backgroundColor: "transparent",
                      color: "var(--lc-text-secondary)",
                      fontSize: "var(--lc-text-caption)",
                      cursor: "pointer",
                    }}
                  >
                    + Add position
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ Step 5: Review ═══════════════════════════════════════════════ */}
          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
              <div style={cardStyle}>
                <h3 style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: 600,
                  color: "var(--lc-text)",
                  margin: "0 0 var(--lc-space-4) 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-2)",
                }}>
                  {selectedType?.emoji} Review your Tournament
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "Type", value: selectedType?.title || "--" },
                    { label: "Title", value: form.title || "--" },
                    { label: "Category", value: CATEGORY_OPTIONS.find((c) => c.value === form.category)?.label || form.category },
                    { label: "Max Participants", value: String(form.maxParticipants) },
                    { label: "Visibility", value: form.isPublic ? "Public" : "Private" },
                    { label: "Check-in", value: form.requireCheckin ? "Required" : "Not required" },
                    { label: "Registration Opens", value: form.registrationOpens ? new Date(form.registrationOpens).toLocaleString() : "--" },
                    { label: "Registration Closes", value: form.registrationCloses ? new Date(form.registrationCloses).toLocaleString() : "--" },
                    { label: "Starts", value: form.startsAt ? new Date(form.startsAt).toLocaleString() : "--" },
                    { label: "Ends", value: form.endsAt ? new Date(form.endsAt).toLocaleString() : "--" },
                    { label: "Prize Distribution", value: form.distributionType.replace(/_/g, " ") },
                  ].map((row) => (
                    <div
                      key={row.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "var(--lc-space-2) 0",
                        borderBottom: "1px solid var(--lc-border)",
                      }}
                    >
                      <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>{row.label}</span>
                      <span style={{
                        fontSize: "var(--lc-text-small)",
                        fontWeight: 500,
                        color: "var(--lc-text)",
                        textAlign: "right",
                        maxWidth: "60%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}

                  {/* Split display */}
                  {(form.distributionType === "top_n" || form.distributionType === "custom") && (
                    <div style={{ padding: "var(--lc-space-2) 0" }}>
                      <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", display: "block", marginBottom: "var(--lc-space-2)" }}>
                        Prize Splits
                      </span>
                      <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap" }}>
                        {form.splits.map((pct, i) => (
                          <Badge key={i} variant="tone" tone={i === 0 ? "warning" : i === 1 ? "accent" : "muted"} size="sm">
                            #{i + 1}: {pct}%
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {form.description && (
                  <div style={{ marginTop: "var(--lc-space-4)", padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", backgroundColor: "var(--lc-bg-inset)" }}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", display: "block", marginBottom: 4 }}>
                      Description
                    </span>
                    <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {form.description}
                    </span>
                  </div>
                )}
              </div>

              {/* Status note */}
              <div style={{
                padding: "var(--lc-space-3) var(--lc-space-4)",
                borderRadius: "var(--lc-radius-md)",
                backgroundColor: "var(--lc-info-muted)",
                fontSize: "var(--lc-text-caption)",
                color: "var(--lc-info)",
                display: "flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
              }}>
                <span>{"\u2139\uFE0F"}</span>
                Your tournament will be created in <strong>Draft</strong> status. You can publish it and open registration from the tournament page.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation Buttons ────────────────────────────────────────────── */}
      {!success && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "var(--lc-space-4)",
          borderTop: "1px solid var(--lc-border)",
        }}>
          <button
            onClick={step === 2 ? () => { setStep(1); } : back}
            disabled={step === 1}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-1)",
              padding: "10px 18px",
              borderRadius: "var(--lc-radius-md)",
              border: "1px solid var(--lc-border)",
              backgroundColor: "transparent",
              color: step === 1 ? "var(--lc-text-muted)" : "var(--lc-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: 500,
              cursor: step === 1 ? "not-allowed" : "pointer",
              opacity: step === 1 ? 0.5 : 1,
              transition: "all 0.15s ease",
            }}
          >
            <ChevronLeft />
            {step === 2 ? "Change Type" : "Back"}
          </button>

          {step < 5 ? (
            <button
              onClick={next}
              disabled={!canProceed}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-1)",
                padding: "10px 24px",
                borderRadius: "var(--lc-radius-md)",
                border: "none",
                backgroundColor: canProceed ? "var(--lc-accent)" : "var(--lc-bg-overlay)",
                color: canProceed ? "var(--lc-accent-text)" : "var(--lc-text-muted)",
                fontSize: "var(--lc-text-small)",
                fontWeight: 500,
                cursor: canProceed ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
              }}
            >
              Continue
              <ChevronRight />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !address}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "10px 28px",
                borderRadius: "var(--lc-radius-md)",
                border: "none",
                backgroundColor: submitting || !address ? "var(--lc-bg-overlay)" : "var(--lc-accent)",
                color: submitting || !address ? "var(--lc-text-muted)" : "var(--lc-accent-text)",
                fontSize: "var(--lc-text-small)",
                fontWeight: 600,
                cursor: submitting || !address ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {submitting ? "Creating..." : !address ? "Connect Wallet" : "\uD83D\uDE80 Launch Tournament"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── SplitEditor Component ─────────────────────────────────────────────────── */

function SplitEditor({
  splits,
  onUpdate,
  onRemove,
  splitSum,
}: {
  splits: number[];
  onUpdate: (index: number, value: number) => void;
  onRemove: (index: number) => void;
  splitSum: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
      <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", fontWeight: 500 }}>
        Prize Allocation (must total 100%)
      </span>
      {splits.map((pct, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
          <span style={{
            fontSize: "var(--lc-text-caption)",
            fontWeight: 700,
            color: i === 0 ? "var(--lc-warning)" : "var(--lc-text-muted)",
            minWidth: 28,
          }}>
            #{i + 1}
          </span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "var(--lc-bg-inset)", overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`,
              height: "100%",
              borderRadius: 3,
              backgroundColor: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-accent)" : "var(--lc-text-muted)",
              transition: "width 0.2s ease",
            }} />
          </div>
          <input
            type="number"
            value={pct}
            onChange={(e) => onUpdate(i, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            min={0}
            max={100}
            style={{
              width: 60,
              padding: "4px 8px",
              fontSize: "var(--lc-text-caption)",
              color: "var(--lc-text)",
              backgroundColor: "var(--lc-bg-inset)",
              border: "1px solid var(--lc-border)",
              borderRadius: "var(--lc-radius-sm)",
              textAlign: "right",
              fontFamily: "var(--lc-font-mono)",
            }}
          />
          <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>%</span>
          {splits.length > 1 && (
            <button
              onClick={() => onRemove(i)}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "1px solid var(--lc-border)",
                backgroundColor: "transparent",
                color: "var(--lc-text-muted)",
                cursor: "pointer",
                fontSize: "var(--lc-text-caption)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              title="Remove"
            >
              x
            </button>
          )}
        </div>
      ))}
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        fontSize: "var(--lc-text-caption)",
        fontWeight: 600,
        color: splitSum === 100 ? "var(--lc-success)" : "var(--lc-danger)",
      }}>
        Total: {splitSum}%{splitSum !== 100 && " (must be 100%)"}
      </div>
    </div>
  );
}
