// webapp/app/challenges/create/components/steps/Step1_Intent.tsx
"use client";

import * as React from "react";
import { Dumbbell, Eye, EyeOff, Gamepad2 } from "lucide-react";
import type { Action, ChallengeFormState, ChallengeType, GameId, Visibility } from "../../state/types";
import type { FitnessKind } from "@/lib/templates";
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
            className="select-card select-card--type"
            data-selected={active ? "true" : undefined}
          >
            <div>
              <div className="select-card__label">
                {o.label}
              </div>
              {o.sub ? (
                <div className="select-card__sub">
                  {o.sub}
                </div>
              ) : null}
            </div>
            {active ? (
              <span className="select-card__check" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
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
      className="select-card select-card--type"
      data-selected={active ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="select-card__icon">
          {icon}
        </div>
        <div>
          <div className="select-card__label">{title}</div>
          <div className="select-card__sub">{subtitle}</div>
        </div>
      </div>

      {active ? (
        <span className="select-card__check" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      ) : null}
    </button>
  );
}

const GAME_OPTIONS: Array<{ value: GameId; label: string; sub: string }> = [
  { value: "dota", label: "Dota 2", sub: "Steam + OpenDota verification" },
  { value: "lol", label: "League of Legends", sub: "Riot account verification" },
  { value: "cs", label: "CS2 / FACEIT", sub: "Steam + FACEIT verification" },
];

const FITNESS_OPTIONS: Array<{ value: FitnessKind; label: string; sub: string }> = [
  { value: "walking", label: "Walking", sub: "Apple Health, Garmin, Fitbit, Google Fit" },
  { value: "running", label: "Running", sub: "Apple Health, Strava, Garmin, Fitbit, Google Fit" },
  { value: "cycling", label: "Cycling", sub: "Apple Health, Strava, Garmin, Fitbit, Google Fit" },
  { value: "hiking", label: "Hiking / Elevation", sub: "Apple Health, Strava, Garmin" },
  { value: "swimming", label: "Swimming", sub: "Apple Health, Strava, Garmin" },
  { value: "strength", label: "Strength", sub: "Apple Health, Garmin, Fitbit" },
  { value: "yoga", label: "Yoga", sub: "Apple Health, Strava, Garmin" },
  { value: "hiit", label: "HIIT / CrossFit", sub: "Apple Health, Strava, Garmin" },
  { value: "rowing", label: "Rowing", sub: "Apple Health, Strava, Garmin" },
  { value: "calories", label: "Calorie Burn", sub: "Apple Health, Garmin, Fitbit, Google Fit" },
  { value: "exercise", label: "Exercise Minutes", sub: "Apple Health, Garmin, Fitbit" },
];

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
          gameId: state.intent.gameId || "dota",
          gameMode: null,
          fitnessKind: null,
        },
      });
    }

    if (t === "FITNESS") {
      dispatch({
        type: "SET_INTENT",
        payload: {
          fitnessKind: state.intent.fitnessKind || "walking",
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
        title="What type of challenge?"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={type === "FITNESS"}
            title="Fitness"
            subtitle="Steps, running, cycling, hiking, swimming"
            icon={<Dumbbell size={18} />}
            onClick={() => setType("FITNESS")}
          />
          <TypeCard
            active={type === "GAMING"}
            title="Gaming"
            subtitle="Dota 2, League of Legends, CS2"
            icon={<Gamepad2 size={18} />}
            onClick={() => setType("GAMING")}
          />
        </div>
      </Section>

      <Section
        title="Visibility"
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
          title="Game"
        >
          <SelectCards
            value={state.intent.gameId ?? null}
            onChange={(v) =>
              dispatch({
                type: "SET_INTENT",
                payload: { gameId: v, gameMode: null },
              })
            }
            options={GAME_OPTIONS}
            columns={3}
          />

          {state.intent.gameId === "dota" ? (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                Format (optional)
              </div>
              <SelectCards
                value={state.intent.gameMode ?? null}
                onChange={(v) =>
                  dispatch({ type: "SET_INTENT", payload: { gameMode: v } })
                }
                options={[
                  { value: "1v1", label: "1v1", sub: "Duel" },
                  { value: "5v5", label: "5v5", sub: "Standard" },
                ]}
                columns={2}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {type === "FITNESS" ? (
        <Section
          title="Activity"
        >
          <SelectCards
            value={state.intent.fitnessKind ?? null}
            onChange={(v) =>
              dispatch({ type: "SET_INTENT", payload: { fitnessKind: v } })
            }
            options={FITNESS_OPTIONS}
            columns={2}
          />
        </Section>
      ) : null}

      {!type ? (
        <Callout tone="warn" title="Required">
          Choose Fitness or Gaming to continue.
        </Callout>
      ) : null}
    </div>
  );
}
