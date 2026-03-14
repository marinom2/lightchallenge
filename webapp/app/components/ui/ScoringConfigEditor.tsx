"use client";

/**
 * ScoringConfigEditor — Visual editor for competition scoring rules.
 *
 * Features:
 *   - Win / Loss / Draw rows with +/- buttons and direct numeric input
 *   - Visual bar chart preview of relative point values
 *   - "Add Custom Rule" for arbitrary scoring categories
 *   - Presets dropdown: Standard, Simple, Extended
 *   - Readonly mode for display-only
 *   - Styled with var(--lc-*) design tokens; smooth transitions
 */

import React, { useState, useCallback, useMemo, useId } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ScoringConfig = {
  win: number;
  loss: number;
  draw: number;
  [key: string]: number;
};

type Props = {
  value: ScoringConfig;
  onChange: (config: ScoringConfig) => void;
  readonly?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Presets                                                            */
/* ------------------------------------------------------------------ */

type Preset = { label: string; config: ScoringConfig };

const PRESETS: Preset[] = [
  { label: "Standard (3/0/1)", config: { win: 3, loss: 0, draw: 1 } },
  { label: "Simple (1/0/0)", config: { win: 1, loss: 0, draw: 0 } },
  {
    label: "Extended (3/0/1, OT Win=2)",
    config: { win: 3, loss: 0, draw: 1, "OT Win": 2 },
  },
];

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CORE_KEYS = ["win", "loss", "draw"] as const;

const CORE_LABELS: Record<string, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
};

const CORE_COLORS: Record<string, string> = {
  win: "var(--lc-success)",
  loss: "var(--lc-danger)",
  draw: "var(--lc-warning)",
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ScoringRow({
  label,
  value,
  color,
  barPct,
  readonly,
  onIncrement,
  onDecrement,
  onDirectChange,
  onRemove,
}: {
  label: string;
  value: number;
  color: string;
  barPct: number;
  readonly?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  onDirectChange: (v: number) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--lc-space-3)",
        padding: "var(--lc-space-3) 0",
        transition: `all var(--lc-dur-base) var(--lc-ease)`,
      }}
    >
      {/* Label */}
      <span
        style={{
          width: 80,
          flexShrink: 0,
          fontSize: "var(--lc-text-small)",
          fontWeight: "var(--lc-weight-medium)" as any,
          color: "var(--lc-text)",
          textTransform: "capitalize",
        }}
      >
        {label}
      </span>

      {/* Controls */}
      {!readonly ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            borderRadius: "var(--lc-radius-sm)",
            border: "1px solid var(--lc-border)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onDecrement}
            aria-label={`Decrease ${label}`}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--lc-bg-raised)",
              border: "none",
              borderRight: "1px solid var(--lc-border)",
              color: "var(--lc-text-secondary)",
              fontSize: "var(--lc-text-body)",
              cursor: "pointer",
              transition: `background var(--lc-dur-fast) var(--lc-ease)`,
            }}
          >
            -
          </button>
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onDirectChange(isNaN(parsed) ? 0 : parsed);
            }}
            style={{
              width: 52,
              height: 32,
              textAlign: "center",
              background: "var(--lc-bg-inset)",
              border: "none",
              color: "var(--lc-text)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              fontFamily: "var(--lc-font-mono)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={onIncrement}
            aria-label={`Increase ${label}`}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--lc-bg-raised)",
              border: "none",
              borderLeft: "1px solid var(--lc-border)",
              color: "var(--lc-text-secondary)",
              fontSize: "var(--lc-text-body)",
              cursor: "pointer",
              transition: `background var(--lc-dur-fast) var(--lc-ease)`,
            }}
          >
            +
          </button>
        </div>
      ) : (
        <span
          style={{
            width: 52,
            textAlign: "center",
            fontFamily: "var(--lc-font-mono)",
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-semibold)" as any,
            color: "var(--lc-text)",
            flexShrink: 0,
          }}
        >
          {value}
        </span>
      )}

      {/* Bar chart */}
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: "var(--lc-radius-pill)",
          background: "var(--lc-bg-inset)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: `${barPct}%`,
            borderRadius: "var(--lc-radius-pill)",
            background: color,
            opacity: 0.7,
            transition: `width var(--lc-dur-slow) var(--lc-ease)`,
          }}
        />
      </div>

      {/* Point value */}
      <span
        style={{
          width: 28,
          textAlign: "right",
          fontSize: "var(--lc-text-caption)",
          color: "var(--lc-text-muted)",
          fontFamily: "var(--lc-font-mono)",
          flexShrink: 0,
        }}
      >
        {value}
      </span>

      {/* Remove button for custom rows */}
      {onRemove && !readonly && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          style={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--lc-danger-muted)",
            border: "1px solid transparent",
            borderRadius: "var(--lc-radius-sm)",
            color: "var(--lc-danger)",
            fontSize: "var(--lc-text-caption)",
            cursor: "pointer",
            flexShrink: 0,
            transition: `all var(--lc-dur-fast) var(--lc-ease)`,
          }}
        >
          x
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ScoringConfigEditor({
  value,
  onChange,
  readonly = false,
}: Props) {
  const instanceId = useId();
  const [newRuleName, setNewRuleName] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  // Derive custom keys (anything not in CORE_KEYS)
  const customKeys = useMemo(
    () =>
      Object.keys(value).filter(
        (k) => !(CORE_KEYS as readonly string[]).includes(k)
      ),
    [value]
  );

  // Compute max absolute value for bar chart normalization
  const maxAbs = useMemo(() => {
    const allValues = Object.values(value).map(Math.abs);
    return Math.max(1, ...allValues);
  }, [value]);

  const barPct = useCallback(
    (v: number) => (Math.abs(v) / maxAbs) * 100,
    [maxAbs]
  );

  // Custom-key color rotation
  const customColor = useCallback(
    (index: number) => {
      const palette = [
        "var(--lc-info)",
        "var(--lc-grad-3)",
        "var(--lc-warm)",
        "var(--lc-select-text)",
      ];
      return palette[index % palette.length];
    },
    []
  );

  const updateKey = useCallback(
    (key: string, v: number) => {
      onChange({ ...value, [key]: v });
    },
    [value, onChange]
  );

  const removeKey = useCallback(
    (key: string) => {
      const next = { ...value };
      delete next[key];
      onChange(next);
    },
    [value, onChange]
  );

  const addCustomRule = useCallback(() => {
    const name = newRuleName.trim();
    if (!name || name in value) return;
    onChange({ ...value, [name]: 0 });
    setNewRuleName("");
  }, [newRuleName, value, onChange]);

  const applyPreset = useCallback(
    (preset: Preset) => {
      onChange({ ...preset.config });
      setShowPresets(false);
    },
    [onChange]
  );

  return (
    <div
      style={{
        background: "var(--lc-bg-raised)",
        border: "1px solid var(--lc-border)",
        borderRadius: "var(--lc-radius-md)",
        padding: "var(--lc-space-5)",
        width: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--lc-space-4)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "var(--lc-text-subhead)",
            fontWeight: "var(--lc-weight-semibold)" as any,
            color: "var(--lc-text)",
          }}
        >
          Scoring Rules
        </h3>

        {/* Presets dropdown */}
        {!readonly && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowPresets(!showPresets)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-1)",
                padding: "var(--lc-space-1) var(--lc-space-3)",
                borderRadius: "var(--lc-radius-sm)",
                border: "1px solid var(--lc-border)",
                background: "var(--lc-bg-inset)",
                color: "var(--lc-text-secondary)",
                fontSize: "var(--lc-text-caption)",
                cursor: "pointer",
                transition: `all var(--lc-dur-fast) var(--lc-ease)`,
              }}
            >
              Presets
              <span
                style={{
                  fontSize: 10,
                  transform: showPresets ? "rotate(180deg)" : "rotate(0deg)",
                  transition: `transform var(--lc-dur-fast) var(--lc-ease)`,
                  display: "inline-block",
                }}
              >
                &#9660;
              </span>
            </button>

            {showPresets && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "var(--lc-space-1)",
                  background: "var(--lc-bg-overlay)",
                  border: "1px solid var(--lc-border-strong)",
                  borderRadius: "var(--lc-radius-sm)",
                  boxShadow: "var(--lc-shadow-lg)",
                  zIndex: 10,
                  minWidth: 200,
                  overflow: "hidden",
                }}
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "var(--lc-space-2) var(--lc-space-3)",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--lc-border)",
                      color: "var(--lc-text)",
                      fontSize: "var(--lc-text-small)",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: `background var(--lc-dur-fast) var(--lc-ease)`,
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.background =
                        "var(--lc-glass-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Core rows */}
      {CORE_KEYS.map((key) => (
        <ScoringRow
          key={key}
          label={CORE_LABELS[key]}
          value={value[key] ?? 0}
          color={CORE_COLORS[key]}
          barPct={barPct(value[key] ?? 0)}
          readonly={readonly}
          onIncrement={() => updateKey(key, (value[key] ?? 0) + 1)}
          onDecrement={() => updateKey(key, (value[key] ?? 0) - 1)}
          onDirectChange={(v) => updateKey(key, v)}
        />
      ))}

      {/* Custom rows */}
      {customKeys.map((key, i) => (
        <ScoringRow
          key={key}
          label={key}
          value={value[key] ?? 0}
          color={customColor(i)}
          barPct={barPct(value[key] ?? 0)}
          readonly={readonly}
          onIncrement={() => updateKey(key, (value[key] ?? 0) + 1)}
          onDecrement={() => updateKey(key, (value[key] ?? 0) - 1)}
          onDirectChange={(v) => updateKey(key, v)}
          onRemove={() => removeKey(key)}
        />
      ))}

      {/* Add custom rule */}
      {!readonly && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--lc-space-2)",
            marginTop: "var(--lc-space-4)",
            paddingTop: "var(--lc-space-3)",
            borderTop: "1px solid var(--lc-border)",
          }}
        >
          <input
            id={`${instanceId}-new-rule`}
            type="text"
            placeholder="Custom rule name..."
            value={newRuleName}
            onChange={(e) => setNewRuleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomRule();
              }
            }}
            style={{
              flex: 1,
              height: 32,
              padding: "0 var(--lc-space-3)",
              borderRadius: "var(--lc-radius-sm)",
              border: "1px solid var(--lc-border)",
              background: "var(--lc-bg-inset)",
              color: "var(--lc-text)",
              fontSize: "var(--lc-text-small)",
              outline: "none",
              transition: `border-color var(--lc-dur-fast) var(--lc-ease)`,
            }}
          />
          <button
            type="button"
            onClick={addCustomRule}
            disabled={!newRuleName.trim() || newRuleName.trim() in value}
            style={{
              height: 32,
              padding: "0 var(--lc-space-4)",
              borderRadius: "var(--lc-radius-sm)",
              border: "1px solid var(--lc-border-strong)",
              background:
                newRuleName.trim() && !(newRuleName.trim() in value)
                  ? "var(--lc-accent-muted)"
                  : "var(--lc-bg-inset)",
              color:
                newRuleName.trim() && !(newRuleName.trim() in value)
                  ? "var(--lc-accent)"
                  : "var(--lc-text-muted)",
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-medium)" as any,
              cursor:
                newRuleName.trim() && !(newRuleName.trim() in value)
                  ? "pointer"
                  : "not-allowed",
              flexShrink: 0,
              transition: `all var(--lc-dur-fast) var(--lc-ease)`,
            }}
          >
            + Add Rule
          </button>
        </div>
      )}
    </div>
  );
}
