"use client";

import * as React from "react";
import { ShieldCheck, Calendar, Coins, Tag } from "lucide-react";
import type { ChainPolicyHints } from "../lib/chainRulesLoader";
import type { ChallengeFormState, DerivedState } from "../state/types";

import { getTemplateById, buildAutoDescription } from "@/lib/templates";

function fmtDate(d: Date | null) {
  if (!d) return "Not set";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function labelCurrency(state: ChallengeFormState) {
  if (state.money.currency.type === "NATIVE") {
    return state.money.currency.symbol ?? "LCAI";
  }
  return state.money.currency.symbol ?? "ERC20";
}

function typeLabel(state: ChallengeFormState) {
  if (state.intent.type === "FITNESS") {
    const kind = state.intent.fitnessKind;
    return kind
      ? `Fitness · ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
      : "Fitness";
  }
  if (state.intent.type === "GAMING") {
    const game = state.intent.gameId;
    const mode = state.intent.gameMode;
    const parts = [game?.toUpperCase()];
    if (mode) parts.push(mode);
    return `Gaming · ${parts.filter(Boolean).join(" ")}`;
  }
  return state.intent.type ?? "Not set";
}

export default function ReviewCard(props: {
  state: ChallengeFormState;
  derived: DerivedState;
  policyHints: ChainPolicyHints | null;
}) {
  const s = props.state;
  const currency = labelCurrency(s);
  const stake = s.money.stake || "0";
  const deposit = `${props.derived.totalDepositFormatted} ${currency}`;

  const isAivm = s.verification.mode === "AIVM";
  const templateId = isAivm
    ? s.aivmForm?.templateId ?? s.verification.templateId ?? null
    : null;
  const template = templateId ? getTemplateById(templateId) : null;

  const templateParams =
    isAivm && template
      ? template.fields
          .filter((f) => f.kind !== "readonly")
          .map((f) => ({
            label: f.label,
            value: s.aivmForm?.[f.key],
          }))
          .filter((r) => r.value != null && r.value !== "")
      : [];

  return (
    <div className="cw-review">
      {/* ── Title & Type ── */}
      <div className="cw-review__hero">
        <h2 className="cw-review__title">
          {s.essentials.title || "Untitled challenge"}
        </h2>
        {(() => {
          const desc = buildAutoDescription(s) || s.essentials.description;
          return desc ? <p className="cw-review__desc">{desc}</p> : null;
        })()}
        <div className="cw-review__chips">
          <span className="chip">
            <Tag size={12} />
            {typeLabel(s)}
          </span>
          <span className="chip">{s.intent.visibility}</span>
        </div>
      </div>

      {/* ── Schedule ── */}
      <div className="cw-review__block">
        <div className="cw-review__block-head">
          <Calendar size={14} />
          <span>Schedule</span>
        </div>
        <div className="cw-review__schedule">
          <div className="cw-review__row">
            <span>Join closes</span>
            <span>{fmtDate(s.timeline.joinCloses)}</span>
          </div>
          <div className="cw-review__row">
            <span>Starts</span>
            <span>{fmtDate(s.timeline.starts)}</span>
          </div>
          <div className="cw-review__row">
            <span>Ends</span>
            <span>{fmtDate(s.timeline.ends)}</span>
          </div>
          <div className="cw-review__row">
            <span>Proof deadline</span>
            <span>{fmtDate(s.timeline.proofDeadline)}</span>
          </div>
        </div>
      </div>

      {/* ── Stake ── */}
      <div className="cw-review__block">
        <div className="cw-review__block-head">
          <Coins size={14} />
          <span>Stake</span>
        </div>
        <div className="cw-review__funds">
          <div className="cw-review__row">
            <span>Your stake</span>
            <span className="font-semibold">{stake} {currency}</span>
          </div>
          <div className="cw-review__row">
            <span>Total deposit</span>
            <span className="font-semibold">{deposit}</span>
          </div>
        </div>
      </div>

      {/* ── Verification ── */}
      <div className="cw-review__block">
        <div className="cw-review__block-head">
          <ShieldCheck size={14} />
          <span>Verification</span>
        </div>
        <div className="cw-review__verification">
          <div className="cw-review__row">
            <span>Method</span>
            <span className="font-semibold">Lightchain AIVM + PoI</span>
          </div>
          {template ? (
            <div className="cw-review__row">
              <span>Template</span>
              <span className="font-semibold">{template.name}</span>
            </div>
          ) : null}
          {templateParams.map((row) => (
            <div key={row.label} className="cw-review__row">
              <span>{row.label}</span>
              <span>{String(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
