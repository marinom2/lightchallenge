"use client";

import * as React from "react";
import { isAddress } from "viem";
import { ChevronDown, Coins, Tags, ArrowRight } from "lucide-react";

import type {
  Action,
  ChallengeFormState,
  CurrencyState,
} from "../../state/types";
import { Field } from "../ui/Field";
import MoneyInput from "../MoneyInput";
import TimelineWheel from "../inputs/TimelineWheel";

type CardKey = "basics" | "tags" | "schedule" | "funds";

const CARD_NUMBERS: Record<CardKey, number> = {
  basics: 1,
  tags: 2,
  schedule: 3,
  funds: 4,
};

function splitTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function fmt(d?: Date | null) {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  state: ChallengeFormState;
  dispatch: React.Dispatch<Action>;
  nativeBalanceFormatted?: string;
  onComplete?: () => void;
};

type BuilderCardProps = {
  step: number;
  title: string;
  subtitle: string;
  done: boolean;
  active: boolean;
  summary?: React.ReactNode;
  onExpand: () => void;
  onDone?: () => void;
  children: React.ReactNode;
};

function BuilderCard({
  step,
  title,
  subtitle,
  done,
  active,
  summary,
  onExpand,
  onDone,
  children,
}: BuilderCardProps) {
  if (!active) {
    return (
      <button
        type="button"
        className={`builder-card builder-card--collapsed w-full${done ? " builder-card--done" : ""}`}
        onClick={onExpand}
      >
        <div className="builder-card__row">
          <div className={`builder-card__ring${done ? " builder-card__ring--done" : ""}`}>
            {step}
          </div>
          <div className="builder-card__meta">
            <div className="builder-card__label">{title}</div>
            <div className="builder-card__text">
              {done ? summary : subtitle}
            </div>
          </div>
          <span className="builder-card__chevron">
            <ChevronDown size={16} />
          </span>
        </div>
      </button>
    );
  }

  return (
    <section className="builder-card builder-card--expanded" aria-label={title}>
      <div className="builder-card__head">
        <div className="builder-card__head-row">
          <div className={`builder-card__ring builder-card__ring--active`}>
            {step}
          </div>
          <div>
            <h3 className="builder-card__title">{title}</h3>
            <p className="builder-card__subtitle">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="builder-card__body">
        {children}

        {onDone ? (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              className="builder-card__continue"
              onClick={onDone}
              aria-label={`Continue from ${title}`}
            >
              Continue
              <ArrowRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function Step2_Essentials({
  state,
  dispatch,
  nativeBalanceFormatted,
  onComplete,
}: Props) {
  const [tagDraft, setTagDraft] = React.useState(state.essentials.tags.join(", "));
  const [activeCard, setActiveCard] = React.useState<CardKey>("basics");

  React.useEffect(() => {
    setTagDraft(state.essentials.tags.join(", "));
  }, [state.essentials.tags]);

  const currency = state.money.currency;

  const setCurrency = React.useCallback(
    (next: CurrencyState) => {
      dispatch({ type: "SET_CURRENCY", payload: next });
    },
    [dispatch]
  );

  const applyTags = React.useCallback(() => {
    dispatch({
      type: "SET_ESSENTIALS",
      payload: { tags: splitTags(tagDraft) },
    });
  }, [dispatch, tagDraft]);

  const basicsDone =
    state.essentials.title.trim().length > 0 &&
    state.essentials.description.trim().length > 0;

  const tagsDone = state.essentials.tags.length > 0;

  const scheduleDone =
    !!state.timeline.joinCloses &&
    !!state.timeline.starts &&
    !!state.timeline.ends &&
    !!state.timeline.proofDeadline &&
    state.timeline.joinCloses < state.timeline.starts &&
    state.timeline.starts < state.timeline.ends &&
    state.timeline.ends <= state.timeline.proofDeadline;

  const fundsDone =
    Number(state.money.stake || "0") > 0 &&
    (currency.type === "NATIVE" ||
      isAddress(String(currency.address || "")));

  const cards: CardKey[] = ["basics", "tags", "schedule", "funds"];

  const goNext = React.useCallback((current: CardKey) => {
    const index = cards.indexOf(current);
    const next = cards[index + 1];
    if (next) setActiveCard(next);
  }, []);

  return (
    <div className="space-y-4">
      <BuilderCard
        step={CARD_NUMBERS.basics}
        title="Title & description"
        subtitle="What are participants competing to do?"
        done={basicsDone}
        active={activeCard === "basics"}
        onExpand={() => setActiveCard("basics")}
        onDone={basicsDone ? () => goNext("basics") : undefined}
        summary={
          <div className="space-y-1">
            <div className="font-medium text-(--text)">
              {state.essentials.title || "Untitled"}
            </div>
            <div className="line-clamp-2">
              {state.essentials.description || "No description yet."}
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Title" hint="Keep it short and specific.">
            <input
              className="input"
              value={state.essentials.title}
              onChange={(e) =>
                dispatch({
                  type: "SET_ESSENTIALS",
                  payload: { title: e.target.value },
                })
              }
              placeholder={
                state.intent.type === "GAMING"
                  ? "Dota 5v5 — First to 2 wins"
                  : "10k steps every day"
              }
            />
          </Field>

          <Field
            label="Description"
            hint="Optional. Add rules or context."
          >
            <textarea
              className="input"
              rows={4}
              value={state.essentials.description}
              onChange={(e) =>
                dispatch({
                  type: "SET_ESSENTIALS",
                  payload: { description: e.target.value },
                })
              }
              placeholder="Keep it objective. Example: Winner is the team that wins the match on official match history."
            />
          </Field>
        </div>
      </BuilderCard>

      <BuilderCard
        step={CARD_NUMBERS.tags}
        title="Tags"
        subtitle="Help others find your challenge."
        done={tagsDone}
        active={activeCard === "tags"}
        onExpand={() => setActiveCard("tags")}
        onDone={tagsDone ? () => goNext("tags") : undefined}
        summary={
          state.essentials.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {state.essentials.tags.map((tag) => (
                <span key={tag} className="chip select-none">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            "No tags set."
          )
        }
      >
        <Field label="Tags" hint="Comma-separated, up to 8.">
          <div className="flex items-center gap-2">
            <input
              className="input"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={applyTags}
              placeholder="dota, gaming, bo3"
            />
            <button
              type="button"
              className="chip"
              onClick={applyTags}
              title="Apply tags"
              aria-label="Apply tags"
            >
              <Tags size={16} />
            </button>
          </div>

          {state.essentials.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {state.essentials.tags.map((tag) => (
                <span key={tag} className="chip select-none">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </Field>
      </BuilderCard>

      <BuilderCard
        step={CARD_NUMBERS.schedule}
        title="Schedule"
        subtitle="When does the challenge start and end?"
        done={scheduleDone}
        active={activeCard === "schedule"}
        onExpand={() => setActiveCard("schedule")}
        summary={
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            <div><span className="text-(--text-muted)">Join closes:</span> {fmt(state.timeline.joinCloses)}</div>
            <div><span className="text-(--text-muted)">Starts:</span> {fmt(state.timeline.starts)}</div>
            <div><span className="text-(--text-muted)">Ends:</span> {fmt(state.timeline.ends)}</div>
            <div><span className="text-(--text-muted)">Proof deadline:</span> {fmt(state.timeline.proofDeadline)}</div>
          </div>
        }
      >
        <TimelineWheel
          embedded
          value={{
            joinCloses: state.timeline.joinCloses,
            starts: state.timeline.starts,
            ends: state.timeline.ends,
            proofDeadline: state.timeline.proofDeadline,
          }}
          onChange={(next) =>
            dispatch({
              type: "SET_TIMELINE",
              payload: {
                joinCloses: next.joinCloses ?? null,
                starts: next.starts ?? null,
                ends: next.ends ?? null,
                proofDeadline: next.proofDeadline ?? null,
              },
            })
          }
          onDone={() => {
            if (scheduleDone) goNext("schedule");
          }}
        />
      </BuilderCard>

      <BuilderCard
        step={CARD_NUMBERS.funds}
        title="Stake"
        subtitle="How much are you putting up?"
        done={fundsDone}
        active={activeCard === "funds"}
        onExpand={() => setActiveCard("funds")}
        onDone={fundsDone ? onComplete : undefined}
        summary={
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            <div><span className="text-(--text-muted)">Currency:</span> {currency.type}</div>
            <div><span className="text-(--text-muted)">Stake:</span> {state.money.stake || "0"} {currency.symbol ?? ""}</div>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Currency">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`chip ${currency.type === "NATIVE" ? "chip--on" : ""}`}
                onClick={() => setCurrency({ type: "NATIVE" })}
              >
                Native
              </button>

              <button
                type="button"
                className={`chip ${currency.type === "ERC20" ? "chip--on" : ""}`}
                onClick={() => setCurrency({ type: "ERC20", address: null })}
              >
                ERC20
              </button>
            </div>
          </Field>

          {currency.type === "ERC20" ? (
            <Field label="Token address" hint="Paste the ERC20 contract address.">
              <input
                className="input font-mono"
                value={currency.address ?? ""}
                onChange={(e) =>
                  setCurrency({
                    ...currency,
                    address: (e.target.value || null) as any,
                  })
                }
                placeholder="0x…"
              />
            </Field>
          ) : null}

          <MoneyInput
            label="Stake amount"
            value={state.money.stake}
            onChange={(v) =>
              dispatch({ type: "SET_MONEY", payload: { stake: v } })
            }
            symbol={currency.symbol ?? ""}
            balanceFormatted={
              currency.type === "NATIVE" ? nativeBalanceFormatted : undefined
            }
          />

          <div className="flex items-center gap-2 text-xs text-(--text-muted)">
            <Coins size={14} />
            <span>Held in Treasury until challenge resolves.</span>
          </div>
        </div>
      </BuilderCard>

      <div className="flex items-center justify-center gap-2 pt-1">
        {cards.map((card) => {
          const active = activeCard === card;
          return (
            <button
              key={card}
              type="button"
              aria-label={`Open ${card}`}
              onClick={() => setActiveCard(card)}
              className="h-2.5 rounded-full transition-all"
              style={{
                width: active ? 28 : 10,
                background: active
                  ? "linear-gradient(90deg, var(--grad-2), var(--grad-1))"
                  : "color-mix(in oklab, var(--border) 85%, transparent)",
                boxShadow: active
                  ? "0 0 0 4px color-mix(in oklab, var(--grad-2) 16%, transparent)"
                  : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}