"use client";

import * as React from "react";
import type { ChainPolicyHints } from "../lib/chainRulesLoader";
import type { ChallengeFormState, DerivedState } from "../state/types";

import { Section } from "./ui/Section";
import { ADDR } from "@/lib/contracts";
import { formatAddress } from "../lib/utils";
import { getTemplateById } from "@/lib/templates";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
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

function fullOrDash(v?: string | null) {
  return v && String(v).trim() ? String(v) : "—";
}

function formatBool(v: boolean | null | undefined) {
  if (v == null) return "—";
  return v ? "YES" : "NO";
}

function verificationModeLabel(state: ChallengeFormState) {
  const mode = state.verification.mode;

  if (mode === "AIVM") {
    const kind =
      state.intent.type === "FITNESS"
        ? state.intent.fitnessKind
        : state.intent.gameId;

    if (kind) return `AIVM · ${String(kind)}`;
    return "AIVM";
  }

  if (mode === "PLONK") return "PLONK";
  if (mode === "ZK") return "ZK";

  return mode ?? "—";
}

export default function ReviewCard(props: {
  state: ChallengeFormState;
  derived: DerivedState;
  policyHints: ChainPolicyHints | null;
}) {
  const s = props.state;
  const p = props.policyHints;

  const currency = labelCurrency(s);
  const stake = s.money.stake || "0";
  const deposit = `${props.derived.totalDepositFormatted} ${currency}`;

  const challengePay = ADDR.ChallengePay;
  const treasury = ADDR.Treasury;
  const verifier = props.derived.verifier ?? s.verification.verifier ?? null;

  const mode = s.verification.mode;
  const isAivm = mode === "AIVM";

  const templateId = isAivm
    ? s.aivmForm?.templateId ?? s.verification.templateId ?? null
    : null;

  const template = templateId ? getTemplateById(templateId) : null;

  const templateParams =
    isAivm && template
      ? template.fields
          .filter((f) => f.kind !== "readonly")
          .map((f) => ({
            key: f.key,
            label: f.label,
            value: s.aivmForm?.[f.key],
          }))
      : [];

  return (
    <Section
      title="Review"
      subtitle="Confirm the real configuration before submitting the transaction."
    >
      <div className="panel p-4" style={{ borderColor: "var(--border)" }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-(--text-muted)">Title</div>
            <div className="mt-1 text-sm font-semibold">
              {s.essentials.title || "—"}
            </div>

            {s.essentials.description ? (
              <div className="mt-2 whitespace-pre-wrap text-xs text-(--text-muted)">
                {s.essentials.description}
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Type</div>
            <div className="mt-1 text-sm font-semibold">
              {s.intent.type ?? "—"}

              {s.intent.type === "GAMING" ? (
                <span className="ml-2 text-xs text-(--text-muted)">
                  · {(s.intent.gameId ?? "").toUpperCase()} {s.intent.gameMode ?? ""}
                </span>
              ) : null}

              {s.intent.type === "FITNESS" ? (
                <span className="ml-2 text-xs text-(--text-muted)">
                  · {s.intent.fitnessKind ?? ""}
                </span>
              ) : null}
            </div>

            <div className="mt-2 text-xs text-(--text-muted)">Visibility</div>
            <div className="mt-1 text-sm font-semibold">{s.intent.visibility}</div>
          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Schedule</div>
            <div className="mt-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Join closes</span>
                <span className="font-mono">{fmtDate(s.timeline.joinCloses)}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Starts</span>
                <span className="font-mono">{fmtDate(s.timeline.starts)}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Ends</span>
                <span className="font-mono">{fmtDate(s.timeline.ends)}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Proof deadline</span>
                <span className="font-mono">{fmtDate(s.timeline.proofDeadline)}</span>
              </div>

            </div>
          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Funds</div>
            <div className="mt-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Currency</span>
                <span className="font-mono">{currency}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Stake</span>
                <span className="font-mono">
                  {stake} {currency}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Deposit</span>
                <span className="font-mono font-semibold">{deposit}</span>
              </div>

              {s.money.currency.type === "ERC20" ? (
                <div className="mt-2 text-xs text-(--text-muted)">
                  Token: {fullOrDash(s.money.currency.address ?? null)}
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Verification</div>
            <div className="mt-1 text-sm font-semibold">
              {verificationModeLabel(s)}
            </div>

            {isAivm ? (
              <>
                <div className="mt-2 text-xs text-(--text-muted)">Template</div>
                <div className="mt-1 text-sm font-semibold">
                  {fullOrDash(template?.name ?? templateId)}
                </div>

                <div className="mt-2 text-xs text-(--text-muted)">Model ID</div>
                <div className="mt-1 break-all font-mono text-xs">
                  {fullOrDash(s.verification.modelId ?? null)}
                </div>
              </>
            ) : null}

            <div className="mt-2 text-xs text-(--text-muted)">Verifier</div>
            <div className="mt-1 break-all font-mono text-xs">
              {fullOrDash(verifier as string | null)}
            </div>

            {isAivm && templateParams.length > 0 ? (
              <>
                <div className="mt-3 text-xs text-(--text-muted)">
                  Template params
                </div>
                <div className="mt-1 space-y-1">
                  {templateParams.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-(--text-muted)">{row.label}</span>
                      <span className="font-mono">
                        {fullOrDash(row.value as string | null)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Contracts</div>
            <div className="mt-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">ChallengePay</span>
                <span className="font-mono" title={challengePay}>
                  {formatAddress(challengePay)}
                </span>
              </div>
              <div className="mt-1 break-all text-xs text-(--text-muted)">
                {challengePay}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Treasury</span>
                <span className="font-mono" title={treasury}>
                  {formatAddress(treasury)}
                </span>
              </div>
              <div className="mt-1 break-all text-xs text-(--text-muted)">
                {treasury}
              </div>

            </div>
          </div>

          <div>
            <div className="text-xs text-(--text-muted)">Policy</div>
            <div className="mt-1 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Protocol paused</span>
                <span className="font-mono">{formatBool(p?.paused)}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Min lead</span>
                <span className="font-mono">{p ? `${p.minLeadSec}s` : "—"}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Max lead</span>
                <span className="font-mono">
                  {p?.maxLeadSec != null ? `${p.maxLeadSec}s` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-muted)">Allowlist</span>
                <span className="font-mono">
                  {p?.allowlistEnabled ? "ON" : "OFF"}
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}