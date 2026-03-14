"use client";

import * as React from "react";
import { ExternalLink, Copy, AlertTriangle } from "lucide-react";

import type { ChallengeFormState, DerivedState } from "../../state/types";
import type { ChainPolicyHints } from "../../lib/chainRulesLoader";

import ReviewCard from "../ReviewCard";
import { Callout } from "../ui/Callout";
import { useToasts } from "@/lib/ui/toast";
import { EXPLORER_URL } from "@/lib/contracts";

type Hex = `0x${string}`;

async function copySafe(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Step4_Review(props: {
  state: ChallengeFormState;
  derived: DerivedState;
  policyHints: ChainPolicyHints | null;
  nativeBalanceFormatted?: string;
  creating: boolean;
  txHash: Hex | null;
  canCreate: boolean;
  onCreate: () => Promise<void>;
}) {
  const { push } = useToasts();

  const errors = React.useMemo(() => Object.values(props.derived.errors), [props.derived.errors]);
  const hasErrors = errors.length > 0;

  const tokenAllowBlocked =
    props.policyHints?.allowlistEnabled === true &&
    props.policyHints?.tokenAllowed === false;

  const policyIssues = [
    props.policyHints?.paused ? "Protocol is currently paused." : null,
    tokenAllowBlocked ? "Selected token is not on the allowlist." : null,
  ].filter(Boolean) as string[];

  const openTx = () => {
    if (!props.txHash) return;
    const base = EXPLORER_URL.replace(/\/$/, "");
    window.open(`${base}/tx/${props.txHash}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <ReviewCard
        state={props.state}
        derived={props.derived}
        policyHints={props.policyHints}
      />

      {hasErrors ? (
        <Callout tone="warn" title="Fix before creating">
          <ul className="mt-2 space-y-1">
            {errors.slice(0, 6).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span className="text-sm">{e}</span>
              </li>
            ))}
          </ul>
        </Callout>
      ) : policyIssues.length > 0 ? (
        <Callout tone="warn" title="Policy issue">
          {policyIssues.map((issue, i) => (
            <div key={i} className="text-sm">{issue}</div>
          ))}
        </Callout>
      ) : (
        <Callout tone="ok" title="Ready to create">
          Everything looks good. Hit Create to submit your challenge on-chain.
        </Callout>
      )}

      {/* ── Submit bar ── */}
      <div className="cw-submit-bar">
        {props.txHash ? (
          <div className="cw-submit-bar__tx">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                if (!props.txHash) return;
                const ok = await copySafe(props.txHash);
                push(ok ? "Copied" : "Could not copy");
              }}
            >
              <Copy size={14} />
              Copy tx
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={openTx}
            >
              <ExternalLink size={14} />
              Explorer
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          disabled={!props.canCreate || props.creating}
          onClick={props.onCreate}
        >
          {props.creating ? "Creating…" : "Create Challenge"}
        </button>
      </div>
    </div>
  );
}
