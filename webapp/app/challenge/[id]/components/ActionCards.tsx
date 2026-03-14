"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { GlassIcon } from "@/app/components/ui/GlassIcon";
import { normalizeDecimalInput } from "../lib/utils";
import { formatLCAI } from "../lib/formatters";

export function PrimaryActionCard({
  action,
  busy,
}: {
  action: {
    kind:
      | "claims"
      | "finalize"
      | "join"
      | "proofs"
      | "vote"
      | "waiting"
      | "done"
      | "active"
      | "upcoming"
      | "neutral";
    title: string;
    desc: string;
    cta: string;
    icon: LucideIcon;
    disabled?: boolean;
    disabledReason?: string;
    onClick?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  };
  busy: null | "join" | "finalize" | "claimAll";
}) {
  const Icon = action.icon;

  const isBusy =
    (action.kind === "claims" && busy === "claimAll") ||
    (action.kind === "finalize" && busy === "finalize");

  const primaryDisabled = Boolean(action.disabled) || isBusy;

  const disabledReason =
    (isBusy && "A transaction is already in progress.") ||
    action.disabledReason ||
    (action.disabled ? "This action is not available right now." : "");

  const reasonId = React.useId();

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="min-w-0 flex items-start gap-2">
          <span className="subpanel__icon">
            <GlassIcon icon={Icon} size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{action.title}</div>
            <div className="text-xs text-(--text-muted) mt-0.5">{action.desc}</div>
          </div>
        </div>
      </div>

      <div className="panel-body">
        {action.kind === "join" ? (
          <div className="space-y-2">
            <div className="text-sm text-(--text-muted)">Use the "Join" card below to commit an amount.</div>
            {disabledReason ? <div className="text-xs text-(--text-muted)">{disabledReason}</div> : null}
          </div>
        ) : action.kind === "vote" ? (
          <div className="space-y-2">
            <div className="text-sm text-(--text-muted)">If you're eligible, the voting panel below will be available.</div>
            {disabledReason ? <div className="text-xs text-(--text-muted)">{disabledReason}</div> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                className="btn btn-primary focus-visible:ring-2 focus-visible:ring-white/25"
                disabled={primaryDisabled}
                onClick={action.onClick}
                aria-busy={isBusy ? "true" : "false"}
                aria-describedby={disabledReason ? reasonId : undefined}
                title={disabledReason || undefined}
              >
                {action.cta}
                {isBusy ? <span className="btn__spinner" aria-hidden /> : null}
              </button>

              {action.secondaryLabel && action.onSecondary ? (
                <button className="btn btn-ghost" onClick={action.onSecondary} disabled={primaryDisabled}>
                  {action.secondaryLabel}
                </button>
              ) : null}
            </div>

            {disabledReason && primaryDisabled ? (
              <div id={reasonId} className="text-xs text-(--text-muted)">
                {disabledReason}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function JoinCard({
  hasJoined,
  canInitialJoin,
  canTopUp,
  tokenFromChain,
  myJoinedTotalWei,
  busy,
  disabledReason,
  onJoin,
}: {
  hasJoined: boolean;
  canInitialJoin: boolean;
  canTopUp: boolean;
  tokenFromChain: any;
  myJoinedTotalWei: bigint | null;
  busy: null | "join" | "finalize" | "claimAll";
  disabledReason?: string;
  onJoin: (amount: string) => Promise<void> | void;
}) {
  const [joinAmt, setJoinAmt] = React.useState<string>("0.10");

  const bump = (n: number) => {
    const v = Number(normalizeDecimalInput(joinAmt || "0"));
    const next = Math.max(0, v + n);
    setJoinAmt(next.toFixed(2));
  };

  const disabled = busy !== null;
  const joinBlocked = disabled || (!hasJoined ? !canInitialJoin : !canTopUp);
  const joinReason = joinBlocked ? (disabledReason || "Joining is unavailable.") : "";
  const joinReasonId = "join-disabled-reason";
  const amtNum = Number(normalizeDecimalInput(joinAmt || "0"));
  const isClose = (a: number) => Number.isFinite(amtNum) && Math.abs(amtNum - a) < 0.001;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{hasJoined ? "Top up commitment" : "Join"}</div>
          <div className="text-xs text-(--text-muted)">
            {hasJoined ? "Increase your commitment before the join window closes." : "Commit stake to enter the challenge."}
          </div>
        </div>
      </div>

      <div className="panel-body">
        {typeof myJoinedTotalWei === "bigint" ? (
          <div className="mb-3 text-xs text-(--text-muted)">
            You've joined with <span className="font-semibold">{formatLCAI(myJoinedTotalWei.toString())}</span>.
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Amount"
            value={joinAmt}
            onChange={(e) => setJoinAmt(e.target.value)}
            autoComplete="off"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            disabled={disabled}
            aria-describedby={joinReason ? joinReasonId : undefined}
          />
          <button
            className="btn btn-primary"
            disabled={disabled || (!hasJoined ? !canInitialJoin : !canTopUp)}
            onClick={() => onJoin(joinAmt)}
            aria-busy={busy === "join" ? "true" : "false"}
            title={joinReason || undefined}
          >
            {busy === "join" ? (hasJoined ? "Topping up…" : "Joining…") : hasJoined ? "Top up" : "Join"}
            {busy === "join" ? <span className="btn__spinner" aria-hidden /> : null}
          </button>
        </div>

        {joinReason ? (
          <div id={joinReasonId} className="mt-2 text-xs text-(--text-muted)">
            {joinReason}
          </div>
        ) : null}

        <div className="mt-3 stepper">
          {[
            { label: "0.10", val: "0.10" },
            { label: "0.50", val: "0.50" },
            { label: "1.00", val: "1.00" },
          ].map(({ label, val }) => (
            <button
              key={val}
              type="button"
              className="stepper__btn"
              aria-pressed={isClose(Number(val))}
              onClick={() => setJoinAmt(val)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}

          <button type="button" className="stepper__btn" onClick={() => bump(0.1)} disabled={disabled} title="Add 0.10">
            +0.10
          </button>

          <button type="button" className="stepper__btn" onClick={() => bump(0.5)} disabled={disabled} title="Add 0.50">
            +0.50
          </button>
        </div>

        {!hasJoined && !canInitialJoin ? (
          <div className="mt-3 text-xs text-(--text-muted)">Joining is closed (status / window).</div>
        ) : null}
        {hasJoined && !canTopUp ? (
          <div className="mt-3 text-xs text-(--text-muted)">Top-ups are closed (status / window).</div>
        ) : null}
      </div>
    </div>
  );
}
