// webapp/app/challenges/create/components/steps/Step1_Intent.tsx
"use client";

import * as React from "react";
import { Dumbbell, Eye, EyeOff, Gamepad2 } from "lucide-react";
import type { Action, ChallengeFormState, ChallengeType, Visibility } from "../../state/types";
import { Section } from "../ui/Section";
import { Callout } from "../ui/Callout";

function SelectCards<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
}: {
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; sub?: string }>;
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns:
          columns === 1
            ? "1fr"
            : columns === 2
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(3, minmax(0, 1fr))",
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="rounded-2xl border px-4 py-3 text-left transition"
            style={{
              borderColor: active
                ? "color-mix(in oklab, var(--accent) 55%, var(--border))"
                : "var(--border)",
              background: active
                ? "color-mix(in oklab, var(--accent) 10%, var(--surface))"
                : "color-mix(in oklab, var(--surface) 96%, transparent)",
              boxShadow: active
                ? "0 0 0 1px color-mix(in oklab, var(--accent) 18%, transparent) inset"
                : "none",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {o.label}
            </div>
            {o.sub ? (
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {o.sub}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function TypeCard({
  active,
  title,
  subtitle,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-3xl border p-4 text-left transition"
      style={{
        borderColor: active
          ? "color-mix(in oklab, var(--accent) 55%, var(--border))"
          : "var(--border)",
        background: active
          ? "color-mix(in oklab, var(--accent) 10%, var(--surface))"
          : "color-mix(in oklab, var(--surface) 96%, transparent)",
        boxShadow: active
          ? "0 0 0 1px color-mix(in oklab, var(--accent) 18%, transparent) inset"
          : "none",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-2xl border"
            style={{ borderColor: "var(--border)" }}
          >
            {icon}
          </div>
          <div>
            <div className="text-base font-semibold" style={{ color: "var(--text)" }}>
              {title}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </div>
          </div>
        </div>

        {active ? (
          <div
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "color-mix(in oklab, var(--accent) 55%, var(--border))",
              background: "color-mix(in oklab, var(--accent) 10%, var(--surface))",
              color: "var(--text)",
            }}
          >
            Selected
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function Step1_Intent({
  state,
  dispatch,
}: {
  state: ChallengeFormState;
  dispatch: React.Dispatch<Action>;
}) {
  const type = state.intent.type;

  const setType = (t: ChallengeType) => {
    dispatch({ type: "SET_INTENT", payload: { type: t } });

    if (t === "GAMING") {
      dispatch({
        type: "SET_INTENT",
        payload: {
          gameId: "dota",
          gameMode: "5v5",
          fitnessKind: null,
        },
      });
    }

    if (t === "FITNESS") {
      dispatch({
        type: "SET_INTENT",
        payload: {
          fitnessKind:
            state.intent.fitnessKind === "running" ? "running" : "steps",
          gameId: null,
          gameMode: null,
        },
      });
    }
  };

  const setVisibility = (v: Visibility) => {
    dispatch({ type: "SET_INTENT", payload: { visibility: v } });
  };

  return (
    <div className="space-y-5">
      <Section
        title="Pick what you’re creating"
        subtitle="Only challenge kinds currently supported on-chain are shown here."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={type === "GAMING"}
            title="Gaming"
            subtitle="Objective match-based outcomes"
            icon={<Gamepad2 size={18} />}
            onClick={() => setType("GAMING")}
          />
          <TypeCard
            active={type === "FITNESS"}
            title="Fitness"
            subtitle="Objective measurable goals"
            icon={<Dumbbell size={18} />}
            onClick={() => setType("FITNESS")}
          />
        </div>
      </Section>

      <Section
        title="Visibility"
        subtitle="Public challenges appear in discovery. Private challenges are share-link only."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={state.intent.visibility === "PUBLIC"}
            title="Public"
            subtitle="Discoverable + shareable"
            icon={<Eye size={18} />}
            onClick={() => setVisibility("PUBLIC")}
          />
          <TypeCard
            active={state.intent.visibility === "PRIVATE"}
            title="Private"
            subtitle="Share-link only"
            icon={<EyeOff size={18} />}
            onClick={() => setVisibility("PRIVATE")}
          />
        </div>
      </Section>

      {type === "GAMING" ? (
        <Section
          title="Game settings"
          subtitle="Choose the supported game and format."
        >
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Game
              </div>
              <SelectCards<"dota">
                value={(state.intent.gameId as "dota" | null | undefined) ?? null}
                onChange={(v) =>
                  dispatch({
                    type: "SET_INTENT",
                    payload: { gameId: v, gameMode: state.intent.gameMode ?? "5v5" },
                  })
                }
                options={[{ value: "dota", label: "Dota", sub: "Currently supported" }]}
                columns={1}
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Mode
              </div>
              <SelectCards<"1v1" | "5v5">
                value={(state.intent.gameMode as "1v1" | "5v5" | null | undefined) ?? null}
                onChange={(v) =>
                  dispatch({
                    type: "SET_INTENT",
                    payload: { gameMode: v },
                  })
                }
                options={[
                  { value: "1v1", label: "1v1", sub: "Fast duel" },
                  { value: "5v5", label: "5v5", sub: "Standard match" },
                ]}
                columns={2}
              />
            </div>
          </div>
        </Section>
      ) : null}

      {type === "FITNESS" ? (
        <Section
          title="Fitness settings"
          subtitle="Choose the supported fitness challenge type."
        >
          <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Type
            </div>
            <SelectCards<"steps" | "running">
              value={(state.intent.fitnessKind as "steps" | "running" | null | undefined) ?? null}
              onChange={(v) =>
                dispatch({
                  type: "SET_INTENT",
                  payload: { fitnessKind: v },
                })
              }
              options={[
                { value: "steps", label: "Steps", sub: "Daily step goal" },
                { value: "running", label: "Running", sub: "Distance target" },
              ]}
              columns={2}
            />
          </div>
        </Section>
      ) : null}

      {!type ? (
        <Callout tone="warn" title="Required">
          Choose Gaming or Fitness to unlock the rest of the flow.
        </Callout>
      ) : null}

      <Callout tone="ok" title="Currently supported">
        Create Challenge currently supports <strong>Steps</strong>, <strong>Running</strong>, and{" "}
        <strong>Dota</strong> on-chain.
      </Callout>
    </div>
  );
}