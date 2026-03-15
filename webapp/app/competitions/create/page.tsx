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
    <div className="stack-6 mx-auto" style={{ maxWidth: 800 }}>
      <Breadcrumb
        items={[
          { label: "Tournaments", href: "/competitions" },
          { label: "Create" },
        ]}
      />

      {/* ── Wallet Gate ────────────────────────────────────────────────────── */}
      {!address && (
        <div className="p-6 rounded-lg border bg-raised text-center flex-col-center gap-3">
          <span style={{ fontSize: 32 }}>{"\uD83D\uDD12"}</span>
          <span className="text-subhead font-semibold color-primary">
            Connect wallet to create
          </span>
          <span className="text-small color-secondary" style={{ maxWidth: 400 }}>
            You need a connected wallet to create and manage tournaments. Connect your wallet to get started.
          </span>
        </div>
      )}

      {/* ── Header with selected type badge ────────────────────────────────── */}
      <div className="stack-2">
        <div className="row-3">
          <h1 className="text-title font-bold color-primary m-0" style={{ letterSpacing: "-0.02em" }}>
            Create Tournament
          </h1>
          {selectedType && step > 1 && (
            <Badge variant="tone" tone="accent" size="sm">
              {selectedType.emoji} {selectedType.title}
            </Badge>
          )}
        </div>
        {step === 1 ? (
          <p className="text-small color-secondary m-0">
            Choose the format that best fits your competition
          </p>
        ) : (
          <p className="text-small color-secondary m-0">
            Step {step} of 5 &mdash; {STEPS[step - 1].label}
          </p>
        )}
      </div>

      {/* ── Stepper (only visible after type is chosen, step > 1) ──────────── */}
      {form.type && step > 1 && (
        <div className="d-flex items-center gap-0">
          {STEPS.map((s, i) => {
            if (s.id === 1) return null; // hide type step from stepper
            const isActive = s.id === step;
            const isDone = s.id < step;
            const isFuture = s.id > step;
            return (
              <React.Fragment key={s.id}>
                {i > 1 && (
                  <div
                    className="flex-1 transition-base"
                    style={{
                      height: 2,
                      backgroundColor: isDone ? "var(--lc-select-text)" : "var(--lc-border)",
                    }}
                  />
                )}
                <button
                  onClick={() => { if (isDone) setStep(s.id); }}
                  className="d-flex row-2 rounded-pill text-caption shrink-0 text-nowrap"
                  style={{
                    padding: "8px 16px",
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
        <div className="alert-banner alert-banner--error row-2 text-small">
          <span className="shrink-0">{"\u26A0\uFE0F"}</span>
          {error}
        </div>
      )}

      {/* ── Success ───────────────────────────────────────────────────────── */}
      {success && (
        <div className="p-5 rounded-lg bg-success-muted color-success text-center text-body font-semibold flex-col-center gap-2">
          <span style={{ fontSize: 40 }}>{"\uD83C\uDF89"}</span>
          Tournament created! Redirecting...
        </div>
      )}

      {/* ── Step Content ──────────────────────────────────────────────────── */}
      {!success && (
        <div style={{ minHeight: 300 }}>
          {/* Step 1: Type Selection */}
          {step === 1 && (
            <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {TYPE_OPTIONS.map((opt) => {
                const selected = form.type === opt.type;
                return (
                  <button
                    key={opt.type}
                    onClick={() => selectType(opt.type)}
                    className="stack-3 p-5 rounded-lg cursor-pointer text-left relative overflow-hidden"
                    style={{
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
                    <div className="flex-between">
                      <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                      {selected && (
                        <div
                          className="d-flex items-center justify-center rounded-circle"
                          style={{
                            width: 22,
                            height: 22,
                            backgroundColor: "var(--lc-select-text)",
                            color: "#fff",
                          }}
                        >
                          <CheckIcon size={12} />
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <span className="text-body font-semibold color-primary">
                      {opt.title}
                    </span>

                    {/* Description */}
                    <span className="text-caption color-secondary" style={{ lineHeight: 1.5 }}>
                      {opt.description}
                    </span>

                    {/* Meta chips */}
                    <div className="row-2 flex-wrap" style={{ marginTop: "auto" }}>
                      <span
                        className="rounded-pill font-medium"
                        style={{
                          padding: "2px 8px",
                          fontSize: 11,
                          backgroundColor: `${opt.color}15`,
                          color: opt.color,
                        }}
                      >
                        {opt.playerRange} players
                      </span>
                      <span
                        className="rounded-pill font-medium color-muted"
                        style={{
                          padding: "2px 8px",
                          fontSize: 11,
                          backgroundColor: "var(--lc-bg-subtle)",
                          fontStyle: "italic",
                        }}
                      >
                        {opt.bestFor}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <div className="stack-5">
              {/* Main info card */}
              <div className="stack-5 p-5 rounded-lg border bg-raised">
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
                    <span className="text-caption color-danger">
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
                  <span className="text-caption color-muted self-end">
                    {form.description.length}/2000
                  </span>
                </label>
              </div>

              {/* Category picker -- visual cards */}
              <div className="p-5 rounded-lg border bg-raised">
                <div className="text-small font-medium color-secondary mb-3">
                  Category
                </div>
                <div className="d-grid gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {CATEGORY_OPTIONS.map((cat) => {
                    const selected = form.category === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => update("category", cat.value)}
                        className="p-3 rounded-md text-center cursor-pointer transition-fast"
                        style={{
                          border: selected ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                          backgroundColor: selected ? "var(--lc-select)" : "var(--lc-bg-inset)",
                          boxShadow: selected ? "var(--lc-shadow-sm)" : "none",
                        }}
                      >
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{cat.emoji}</div>
                        <div
                          className="text-small font-medium"
                          style={{ color: selected ? "var(--lc-select-text)" : "var(--lc-text)" }}
                        >
                          {cat.label}
                        </div>
                        <div className="color-muted" style={{ fontSize: 11, marginTop: 2 }}>{cat.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Settings row */}
              <div className="d-grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="p-5 rounded-lg border bg-raised">
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
                      <span className="text-caption color-muted">
                        Power of 2 recommended (8, 16, 32, 64)
                      </span>
                    )}
                  </label>
                </div>

                <div className="stack-3 p-5 rounded-lg border bg-raised">
                  <div className="text-small font-medium color-secondary">
                    Options
                  </div>
                  <label className="row-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(e) => update("isPublic", e.target.checked)}
                      style={{ accentColor: "var(--lc-select-text)" }}
                    />
                    <span className="text-caption color-primary">Public tournament</span>
                  </label>
                  <label className="row-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requireCheckin}
                      onChange={(e) => update("requireCheckin", e.target.checked)}
                      style={{ accentColor: "var(--lc-select-text)" }}
                    />
                    <span className="text-caption color-primary">Require check-in</span>
                  </label>
                </div>
              </div>

              {/* Optional rules */}
              <details className="p-5 rounded-lg border bg-raised">
                <summary className="cursor-pointer text-small font-medium color-secondary row-2" style={{ listStyle: "none" }}>
                  <span className="color-muted" style={{ fontSize: 10 }}>{"\u25B6"}</span>
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

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div className="stack-5">
              {/* Quick presets */}
              <div className="p-5 rounded-lg border bg-raised">
                <div className="text-small font-medium color-secondary mb-3">
                  Quick Presets
                </div>
                <div className="row-2 flex-wrap">
                  {[
                    { key: "quick", label: "\u26A1 Quick (3 hrs)", desc: "Starts in 3 hours" },
                    { key: "weekend", label: "\uD83D\uDCC5 Weekend", desc: "Next Saturday" },
                    { key: "week", label: "\uD83D\uDCC6 1 Week", desc: "Starts in 4 days" },
                    { key: "month", label: "\uD83D\uDDD3\uFE0F 1 Month", desc: "Starts in 8 days" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      onClick={() => applySchedulePreset(p.key)}
                      className="rounded-md border bg-inset cursor-pointer text-caption color-primary text-left transition-fast"
                      style={{ padding: "8px 16px" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-select-border)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--lc-shadow-sm)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--lc-border)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="color-muted" style={{ fontSize: 11, marginTop: 2 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date inputs */}
              <div className="d-grid gap-4 p-5 rounded-lg border bg-raised" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
                <span className="text-caption color-warning px-2">
                  {"\u26A0\uFE0F"} Registration should close before the competition starts.
                </span>
              )}
              {form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt) && (
                <span className="text-caption color-danger px-2">
                  {"\u26A0\uFE0F"} Competition must end after it starts.
                </span>
              )}

              {/* Timeline preview */}
              {form.registrationOpens && form.endsAt && (
                <div className="p-5 rounded-lg border bg-raised" style={{ padding: "var(--lc-space-3) var(--lc-space-4)" }}>
                  <div className="text-caption font-medium color-secondary mb-2">
                    Timeline Preview
                  </div>
                  <div className="d-flex items-center gap-0 relative" style={{ height: 40 }}>
                    {[
                      { label: "Reg Opens", date: form.registrationOpens, color: "#3b82f6" },
                      { label: "Reg Closes", date: form.registrationCloses, color: "#f59e0b" },
                      { label: "Starts", date: form.startsAt, color: "#22c55e" },
                      { label: "Ends", date: form.endsAt, color: "#ef4444" },
                    ].filter((d) => d.date).map((d, i, arr) => (
                      <React.Fragment key={d.label}>
                        <div className="flex-col items-center" style={{ flex: 0, zIndex: 1, display: "flex" }}>
                          <div
                            className="rounded-circle"
                            style={{
                              width: 10,
                              height: 10,
                              backgroundColor: d.color,
                            }}
                          />
                          <div className="font-medium text-nowrap" style={{ fontSize: 10, color: d.color, marginTop: 4 }}>
                            {d.label}
                          </div>
                        </div>
                        {i < arr.length - 1 && (
                          <div className="flex-1" style={{ height: 2, backgroundColor: "var(--lc-border)" }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Prize Configuration */}
          {step === 4 && (
            <div className="stack-5 p-5 rounded-lg border bg-raised">
              <label style={labelStyle}>
                Distribution Type
                <div className="d-grid gap-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
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
                        className="row-2 p-3 rounded-md cursor-pointer text-left transition-fast"
                        style={{
                          border: selected ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                          backgroundColor: selected ? "var(--lc-select)" : "var(--lc-bg-inset)",
                          boxShadow: selected ? "var(--lc-shadow-sm)" : "none",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                        <div>
                          <div
                            className="text-small font-medium"
                            style={{ color: selected ? "var(--lc-select-text)" : "var(--lc-text)" }}
                          >
                            {opt.label}
                          </div>
                          <div className="text-caption color-muted" style={{ marginTop: 2 }}>
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
                <div className="stack-3">
                  <label style={labelStyle}>
                    Number of Winners
                    <div className="d-flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => applyPresetSplits(n)}
                          className="rounded-md text-small cursor-pointer transition-fast"
                          style={{
                            width: 40,
                            height: 40,
                            border: form.numWinners === n ? "2px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                            backgroundColor: form.numWinners === n ? "var(--lc-select)" : "var(--lc-bg-inset)",
                            color: form.numWinners === n ? "var(--lc-select-text)" : "var(--lc-text)",
                            fontWeight: 600,
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
                <div className="stack-3">
                  <SplitEditor splits={form.splits} onUpdate={updateSplit} onRemove={removeSplitRow} splitSum={splitSum} />
                  <button
                    onClick={addSplitRow}
                    className="self-start rounded-md border bg-transparent color-secondary text-caption cursor-pointer"
                    style={{ padding: "6px 14px" }}
                  >
                    + Add position
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="stack-4">
              <div className="p-5 rounded-lg border bg-raised">
                <h3 className="text-subhead font-semibold color-primary m-0 mb-4 row-2">
                  {selectedType?.emoji} Review your Tournament
                </h3>

                <div className="flex-col" style={{ gap: 0 }}>
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
                      className="flex-between border-b py-2"
                      style={{ alignItems: "baseline" }}
                    >
                      <span className="text-small color-secondary">{row.label}</span>
                      <span
                        className="text-small font-medium color-primary text-right text-ellipsis"
                        style={{ maxWidth: "60%" }}
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}

                  {/* Split display */}
                  {(form.distributionType === "top_n" || form.distributionType === "custom") && (
                    <div className="py-2">
                      <span className="text-small color-secondary d-block mb-2">
                        Prize Splits
                      </span>
                      <div className="row-2 flex-wrap">
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
                  <div className="mt-4 p-3 rounded-md bg-inset">
                    <span className="text-caption color-muted d-block" style={{ marginBottom: 4 }}>
                      Description
                    </span>
                    <span className="text-small color-secondary" style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {form.description}
                    </span>
                  </div>
                )}
              </div>

              {/* Status note */}
              <div className="alert-banner alert-banner--info row-2 text-caption">
                <span>{"\u2139\uFE0F"}</span>
                Your tournament will be created in <strong>Draft</strong> status. You can publish it and open registration from the tournament page.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Navigation Buttons ────────────────────────────────────────────── */}
      {!success && (
        <div className="flex-between pt-4 border-t">
          <button
            onClick={step === 2 ? () => { setStep(1); } : back}
            disabled={step === 1}
            className="d-inline-flex row-1 rounded-md border text-small transition-fast"
            style={{
              padding: "10px 18px",
              backgroundColor: "transparent",
              color: step === 1 ? "var(--lc-text-muted)" : "var(--lc-text)",
              fontWeight: 500,
              cursor: step === 1 ? "not-allowed" : "pointer",
              opacity: step === 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeft />
            {step === 2 ? "Change Type" : "Back"}
          </button>

          {step < 5 ? (
            <button
              onClick={next}
              disabled={!canProceed}
              className="d-inline-flex row-1 rounded-md border-none text-small transition-fast"
              style={{
                padding: "10px 24px",
                backgroundColor: canProceed ? "var(--lc-accent)" : "var(--lc-bg-overlay)",
                color: canProceed ? "var(--lc-accent-text)" : "var(--lc-text-muted)",
                fontWeight: 500,
                cursor: canProceed ? "pointer" : "not-allowed",
              }}
            >
              Continue
              <ChevronRight />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || !address}
              className="d-inline-flex row-2 rounded-md border-none text-small font-semibold transition-fast"
              style={{
                padding: "10px 28px",
                backgroundColor: submitting || !address ? "var(--lc-bg-overlay)" : "var(--lc-accent)",
                color: submitting || !address ? "var(--lc-text-muted)" : "var(--lc-accent-text)",
                cursor: submitting || !address ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
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
    <div className="stack-2">
      <span className="text-caption color-muted font-medium">
        Prize Allocation (must total 100%)
      </span>
      {splits.map((pct, i) => (
        <div key={i} className="row-2">
          <span
            className="text-caption font-bold"
            style={{
              color: i === 0 ? "var(--lc-warning)" : "var(--lc-text-muted)",
              minWidth: 28,
            }}
          >
            #{i + 1}
          </span>
          <div className="flex-1 overflow-hidden" style={{ height: 6, borderRadius: 3, backgroundColor: "var(--lc-bg-inset)" }}>
            <div
              className="transition-fast"
              style={{
                width: `${Math.min(pct, 100)}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-accent)" : "var(--lc-text-muted)",
              }}
            />
          </div>
          <input
            type="number"
            value={pct}
            onChange={(e) => onUpdate(i, Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            min={0}
            max={100}
            className="text-caption color-primary bg-inset border rounded-sm text-right"
            style={{
              width: 60,
              padding: "4px 8px",
              fontFamily: "var(--lc-font-mono)",
            }}
          />
          <span className="text-caption color-muted">%</span>
          {splits.length > 1 && (
            <button
              onClick={() => onRemove(i)}
              className="d-flex items-center justify-center rounded-circle border bg-transparent color-muted cursor-pointer text-caption shrink-0"
              style={{ width: 24, height: 24 }}
              title="Remove"
            >
              x
            </button>
          )}
        </div>
      ))}
      <div
        className="d-flex justify-end text-caption font-semibold"
        style={{ color: splitSum === 100 ? "var(--lc-success)" : "var(--lc-danger)" }}
      >
        Total: {splitSum}%{splitSum !== 100 && " (must be 100%)"}
      </div>
    </div>
  );
}
