"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import Badge from "@/app/components/ui/Badge";

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
};

const STEPS = [
  { id: 1, name: "Type" },
  { id: 2, name: "Details" },
  { id: 3, name: "Schedule" },
  { id: 4, name: "Prizes" },
  { id: 5, name: "Review" },
];

/* ── Type Cards ────────────────────────────────────────────────────────────── */

const TYPE_OPTIONS: {
  type: CompType;
  title: string;
  description: string;
  bestFor: string;
  icon: string;
}[] = [
  {
    type: "single",
    title: "Single Challenge",
    description: "A standalone challenge with pass/fail verification. Participants submit evidence, AI verifies results.",
    bestFor: "Best for: 1v1 bets, personal goals, fitness challenges",
    icon: "01",
  },
  {
    type: "bracket",
    title: "Bracket Tournament",
    description: "Single-elimination bracket where participants face off in rounds until a champion is crowned.",
    bestFor: "Best for: esports tournaments, head-to-head competitions",
    icon: "02",
  },
  {
    type: "round_robin",
    title: "Round-Robin League",
    description: "Every participant plays against every other. Final standings determined by win/loss record and points.",
    bestFor: "Best for: leagues, season-long competitions, rankings",
    icon: "03",
  },
  {
    type: "circuit",
    title: "Circuit Series",
    description: "A series of linked challenges forming a circuit. Cumulative points across events determine the champion.",
    bestFor: "Best for: multi-event competitions, season circuits, series",
    icon: "04",
  },
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
  fontWeight: "var(--lc-weight-medium)" as any,
};

const cardStyle: React.CSSProperties = {
  padding: "var(--lc-space-5)",
  borderRadius: "var(--lc-radius-lg)",
  border: "1px solid var(--lc-border)",
  backgroundColor: "var(--lc-bg-raised)",
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CreateCompetitionPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

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
        description: form.description.trim(),
        category: form.category,
        max_participants: form.maxParticipants,
        registration_opens: form.registrationOpens,
        registration_closes: form.registrationCloses,
        starts_at: form.startsAt,
        ends_at: form.endsAt,
        prize_distribution: {
          type: form.distributionType,
          splits:
            form.distributionType === "top_n" || form.distributionType === "custom"
              ? form.splits
              : undefined,
        },
      };
      const res = await fetch("/api/v1/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      const newId = data?.id || data?.competition?.id;
      if (newId) {
        router.push(`/competitions/${newId}`);
      } else {
        router.push("/competitions");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }, [form, router]);

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

  /* ── Preset split generation for top_n ── */
  const applyPresetSplits = useCallback((n: number) => {
    let splits: number[];
    switch (n) {
      case 1:
        splits = [100];
        break;
      case 2:
        splits = [70, 30];
        break;
      case 3:
        splits = [60, 30, 10];
        break;
      case 4:
        splits = [50, 25, 15, 10];
        break;
      case 5:
        splits = [40, 25, 15, 12, 8];
        break;
      default: {
        const base = Math.floor(100 / n);
        splits = Array(n).fill(base);
        splits[0] += 100 - base * n;
        break;
      }
    }
    setForm((prev) => ({ ...prev, numWinners: n, splits }));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Competitions", href: "/competitions" },
          { label: "Create" },
        ]}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
        <h1
          style={{
            fontSize: "var(--lc-text-title)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color: "var(--lc-text)",
            letterSpacing: "var(--lc-tracking-tight)",
            lineHeight: "var(--lc-leading-tight)" as any,
            margin: 0,
          }}
        >
          Create Competition
        </h1>
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-secondary)",
            margin: 0,
          }}
        >
          Step {step} of 5 &mdash; {STEPS[step - 1].name}
        </p>
      </div>

      {/* ── Progress Bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = s.id < step;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: isDone ? "var(--lc-accent)" : "var(--lc-border)",
                    borderRadius: 1,
                    transition: "background-color var(--lc-dur-base) var(--lc-ease)",
                  }}
                />
              )}
              <button
                onClick={() => { if (isDone) setStep(s.id); }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  border: isActive
                    ? "2px solid var(--lc-accent)"
                    : isDone
                    ? "2px solid var(--lc-accent)"
                    : "1px solid var(--lc-border)",
                  backgroundColor: isDone
                    ? "var(--lc-accent)"
                    : isActive
                    ? "var(--lc-accent-muted)"
                    : "transparent",
                  color: isDone
                    ? "var(--lc-accent-text)"
                    : isActive
                    ? "var(--lc-accent)"
                    : "var(--lc-text-muted)",
                  cursor: isDone ? "pointer" : "default",
                  transition: "all var(--lc-dur-base) var(--lc-ease)",
                  flexShrink: 0,
                }}
              >
                {isDone ? <CheckIcon /> : s.id}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            padding: "var(--lc-space-3) var(--lc-space-4)",
            borderRadius: "var(--lc-radius-md)",
            backgroundColor: "var(--lc-danger-muted)",
            color: "var(--lc-danger)",
            fontSize: "var(--lc-text-small)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Step Content ────────────────────────────────────────────────────── */}
      <div style={{ minHeight: 300 }}>
        {/* Step 1: Type Selection */}
        {step === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--lc-space-4)" }}>
            {TYPE_OPTIONS.map((opt) => {
              const selected = form.type === opt.type;
              return (
                <button
                  key={opt.type}
                  onClick={() => update("type", opt.type)}
                  style={{
                    ...cardStyle,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--lc-space-3)",
                    cursor: "pointer",
                    textAlign: "left",
                    border: selected
                      ? "2px solid var(--lc-accent)"
                      : "1px solid var(--lc-border)",
                    backgroundColor: selected
                      ? "var(--lc-accent-muted)"
                      : "var(--lc-bg-raised)",
                    transition: "all var(--lc-dur-fast) var(--lc-ease)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        fontWeight: "var(--lc-weight-bold)" as any,
                        color: selected ? "var(--lc-accent)" : "var(--lc-text-muted)",
                        fontFamily: "var(--lc-font-mono)",
                      }}
                    >
                      {opt.icon}
                    </span>
                    {selected && (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          backgroundColor: "var(--lc-accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--lc-accent-text)",
                        }}
                      >
                        <CheckIcon size={12} />
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "var(--lc-text-body)",
                      fontWeight: "var(--lc-weight-semibold)" as any,
                      color: "var(--lc-text)",
                    }}
                  >
                    {opt.title}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--lc-text-caption)",
                      color: "var(--lc-text-secondary)",
                      lineHeight: "var(--lc-leading-normal)" as any,
                    }}
                  >
                    {opt.description}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--lc-text-caption)",
                      color: "var(--lc-text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    {opt.bestFor}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-5)", maxWidth: 600 }}>
            <label style={labelStyle}>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Winter Gaming Championship 2026"
                style={inputStyle}
                maxLength={120}
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

            <label style={labelStyle}>
              Category
              <select
                value={form.category}
                onChange={(e) => update("category", e.target.value as Category)}
                style={inputStyle}
              >
                <option value="gaming">Gaming</option>
                <option value="fitness">Fitness</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label style={labelStyle}>
              Max Participants
              <input
                type="number"
                value={form.maxParticipants}
                onChange={(e) => update("maxParticipants", Math.max(2, parseInt(e.target.value) || 2))}
                min={2}
                max={1024}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              {form.type === "bracket" && (
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                  For bracket tournaments, a power of 2 is recommended (8, 16, 32, 64...).
                </span>
              )}
            </label>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === 3 && (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-5)", maxWidth: 600 }}>
            <label style={labelStyle}>
              Registration Opens
              <input
                type="datetime-local"
                value={form.registrationOpens}
                onChange={(e) => update("registrationOpens", e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Registration Closes
              <input
                type="datetime-local"
                value={form.registrationCloses}
                onChange={(e) => update("registrationCloses", e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Competition Starts
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => update("startsAt", e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              Competition Ends
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => update("endsAt", e.target.value)}
                style={inputStyle}
              />
            </label>

            {/* Validation hint */}
            {form.registrationCloses && form.startsAt && new Date(form.registrationCloses) > new Date(form.startsAt) && (
              <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-warning)" }}>
                Registration should close before the competition starts.
              </span>
            )}
            {form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt) && (
              <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-danger)" }}>
                Competition must end after it starts.
              </span>
            )}
          </div>
        )}

        {/* Step 4: Prize Configuration */}
        {step === 4 && (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-5)", maxWidth: 600 }}>
            <label style={labelStyle}>
              Distribution Type
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--lc-space-3)" }}>
                {([
                  { key: "winner_takes_all", label: "Winner Takes All", desc: "100% to first place" },
                  { key: "top_n", label: "Top N Split", desc: "Split among top finishers" },
                  { key: "proportional", label: "Proportional", desc: "Based on final standings" },
                  { key: "custom", label: "Custom", desc: "Manual allocation table" },
                ] as { key: DistributionType; label: string; desc: string }[]).map((opt) => {
                  const selected = form.distributionType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        update("distributionType", opt.key);
                        if (opt.key === "top_n") {
                          applyPresetSplits(form.numWinners);
                        }
                      }}
                      style={{
                        padding: "var(--lc-space-3)",
                        borderRadius: "var(--lc-radius-md)",
                        border: selected
                          ? "2px solid var(--lc-accent)"
                          : "1px solid var(--lc-border)",
                        backgroundColor: selected
                          ? "var(--lc-accent-muted)"
                          : "var(--lc-bg-inset)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all var(--lc-dur-fast) var(--lc-ease)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--lc-text-small)",
                          fontWeight: "var(--lc-weight-medium)" as any,
                          color: selected ? "var(--lc-accent)" : "var(--lc-text)",
                        }}
                      >
                        {opt.label}
                      </div>
                      <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                        {opt.desc}
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
                          border:
                            form.numWinners === n
                              ? "2px solid var(--lc-accent)"
                              : "1px solid var(--lc-border)",
                          backgroundColor:
                            form.numWinners === n
                              ? "var(--lc-accent-muted)"
                              : "var(--lc-bg-inset)",
                          color:
                            form.numWinners === n
                              ? "var(--lc-accent)"
                              : "var(--lc-text)",
                          cursor: "pointer",
                          fontSize: "var(--lc-text-small)",
                          fontWeight: "var(--lc-weight-semibold)" as any,
                          transition: "all var(--lc-dur-fast) var(--lc-ease)",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </label>

                <SplitEditor
                  splits={form.splits}
                  onUpdate={updateSplit}
                  onRemove={removeSplitRow}
                  splitSum={splitSum}
                />
              </div>
            )}

            {/* Custom configuration */}
            {form.distributionType === "custom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                <SplitEditor
                  splits={form.splits}
                  onUpdate={updateSplit}
                  onRemove={removeSplitRow}
                  splitSum={splitSum}
                />
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
                    transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
                  }}
                >
                  + Add position
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
            {/* Summary card */}
            <div style={cardStyle}>
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  margin: "0 0 var(--lc-space-4) 0",
                }}
              >
                Review your Competition
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                {[
                  { label: "Type", value: TYPE_OPTIONS.find((t) => t.type === form.type)?.title || "--" },
                  { label: "Title", value: form.title || "--" },
                  { label: "Category", value: form.category },
                  { label: "Max Participants", value: String(form.maxParticipants) },
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
                    <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                      {row.label}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--lc-text-small)",
                        fontWeight: "var(--lc-weight-medium)" as any,
                        color: "var(--lc-text)",
                        textAlign: "right",
                        maxWidth: "60%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}

                {/* Split display for top_n / custom */}
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
                  <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", lineHeight: "var(--lc-leading-normal)" as any, whiteSpace: "pre-wrap" }}>
                    {form.description}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation Buttons ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "var(--lc-space-4)",
          borderTop: "1px solid var(--lc-border)",
        }}
      >
        <button
          onClick={back}
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
            fontWeight: "var(--lc-weight-medium)" as any,
            cursor: step === 1 ? "not-allowed" : "pointer",
            opacity: step === 1 ? 0.5 : 1,
            transition: "all var(--lc-dur-fast) var(--lc-ease)",
          }}
        >
          <ChevronLeft />
          Back
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
              fontWeight: "var(--lc-weight-medium)" as any,
              cursor: canProceed ? "pointer" : "not-allowed",
              transition: "all var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Continue
            <ChevronRight />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              padding: "10px 28px",
              borderRadius: "var(--lc-radius-md)",
              border: "none",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              transition: "all var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            {submitting ? "Creating..." : "Create Competition"}
          </button>
        )}
      </div>
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
      <span
        style={{
          fontSize: "var(--lc-text-caption)",
          color: "var(--lc-text-muted)",
          fontWeight: "var(--lc-weight-medium)" as any,
        }}
      >
        Prize Allocation (must total 100%)
      </span>
      {splits.map((pct, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
          <span
            style={{
              fontSize: "var(--lc-text-caption)",
              fontWeight: "var(--lc-weight-bold)" as any,
              color: i === 0 ? "var(--lc-warning)" : "var(--lc-text-muted)",
              minWidth: 28,
            }}
          >
            #{i + 1}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: "var(--lc-bg-inset)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(pct, 100)}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  i === 0
                    ? "var(--lc-warning)"
                    : i === 1
                    ? "var(--lc-accent)"
                    : "var(--lc-text-muted)",
                transition: "width var(--lc-dur-base) var(--lc-ease)",
              }}
            />
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
                transition: "color var(--lc-dur-fast) var(--lc-ease)",
              }}
              title="Remove"
            >
              x
            </button>
          )}
        </div>
      ))}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: "var(--lc-text-caption)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: splitSum === 100 ? "var(--lc-success)" : "var(--lc-danger)",
        }}
      >
        Total: {splitSum}%{splitSum !== 100 && " (must be 100%)"}
      </div>
    </div>
  );
}
