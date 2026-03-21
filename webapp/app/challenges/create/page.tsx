"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, useBalance, useWalletClient } from "wagmi";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import ClientOnly from "./components/ClientOnly";
import { Toasts, useToasts } from "@/lib/ui/toast";
import { buildAuthHeaders } from "@/lib/authHeaders";

import { InviteSheet } from "./components/InviteSheet";
import SuccessSheet from "./components/SuccessSheet";

import Step1_Intent from "./components/steps/Step1_Intent";
import Step2_Essentials from "./components/steps/Step2_Essentials";
import Step3_Options from "./components/steps/Step3_Options";
import Step4_Review from "./components/steps/Step4_Review";

import { useCreateChallenge } from "./hooks/useCreateChallenge";
import { useChainPolicyHints } from "./hooks/useChainPolicyHints";

const STEPS = [
  { id: 1 as const, name: "Type" },
  { id: 2 as const, name: "Details" },
  { id: 3 as const, name: "Settings" },
  { id: 4 as const, name: "Review" },
];

type Method = "email" | "wallet" | "steam";

export default function CreateChallengePage() {
  return (
    <ClientOnly fallback={<div className="py-8" />}>
      <CreatePageInner />
      <Toasts />
    </ClientOnly>
  );
}

function CreatePageInner() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { push } = useToasts();

  const {
    state,
    dispatch,
    ui,
    derived,
    next,
    back,
    goTo,
    submit,
    allowSubmit,
    reset,
  } = useCreateChallenge();

  const { data: nativeBal } = useBalance({
    address,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [successOpen, setSuccessOpen] = React.useState(false);
  const prevSuccessRef = React.useRef(false);

  const tokenAddr =
    state.money.currency.type === "ERC20"
      ? state.money.currency.address ?? null
      : null;

  const policy = useChainPolicyHints({
    currencyType: state.money.currency.type === "ERC20" ? "ERC20" : "NATIVE",
    token: tokenAddr,
  });

  React.useEffect(() => {
    if (!prevSuccessRef.current && ui.success && ui.txHash) {
      setSuccessOpen(true);
    }
    prevSuccessRef.current = ui.success;
  }, [ui.success, ui.txHash]);

  const step1Ok =
    !derived.errors["intent.type"] &&
    (state.intent.type !== "GAMING" || !derived.errors["intent.gameId"]);

  const step2Ok =
    step1Ok &&
    !derived.errors["essentials.title"] &&
    !derived.errors["money.total"] &&
    !derived.errors["money.currency.address"] &&
    !derived.errors["timeline.joinCloses"] &&
    !derived.errors["timeline.starts"] &&
    !derived.errors["timeline.ends"] &&
    !derived.errors["timeline.order"] &&
    !derived.errors["timeline.order2"] &&
    !derived.errors["timeline.proofDeadline"] &&
    !derived.errors["timeline.proofDeadline2"];

  const step3Ok =
    step2Ok &&
    !derived.errors["verification.verifier"];

  const canNavigateTo = React.useCallback(
    (stepId: number) => {
      if (policy.paused) {
        return {
          ok: false as const,
          reason: "Challenge creation is paused on-chain.",
        };
      }

      if (stepId <= 1) return { ok: true as const };
      if (!step1Ok) return { ok: false as const, reason: "Choose the challenge type first." };
      if (stepId === 2) return { ok: true as const };

      if (!step2Ok) {
        return { ok: false as const, reason: "Fill in the details first." };
      }
      if (stepId === 3) return { ok: true as const };

      if (!step3Ok) {
        return { ok: false as const, reason: "Configure settings first." };
      }
      return { ok: true as const };
    },
    [policy.paused, step1Ok, step2Ok, step3Ok]
  );

  const isFinal = ui.step === 4;
  const hasCreatedChallenge = ui.challengeId != null;

  const handleInvite = React.useCallback(
    async (method: Method, value: string) => {
      if (!ui.challengeId) {
        push("Challenge ID is missing. Create the challenge first.");
        return;
      }
      if (!walletClient) {
        push("Connect wallet to send invites.");
        return;
      }

      const authHeaders = await buildAuthHeaders(walletClient);
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          challengeId: ui.challengeId,
          method,
          value,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        push(data?.error || "Failed to create invite.");
        return;
      }

      push(`Invite queued: ${method} · ${value}`);
      setInviteOpen(false);
    },
    [ui.challengeId, walletClient, push]
  );

  const cta = React.useMemo(() => {
    if (!address) {
      return {
        text: "Connect Wallet",
        disabled: false,
        loading: false,
        title: "Connect your wallet to create a challenge.",
        onClick: () => push("Connect your wallet to continue."),
      };
    }

    if (!isFinal) {
      return {
        text: "Continue",
        disabled: ui.isSubmitting,
        loading: false,
        title: undefined as string | undefined,
        onClick: () => {
          const want = ui.step + 1;
          const g = canNavigateTo(want);
          if (!g.ok) return push(g.reason || "Complete the required fields first.");
          next();
        },
      };
    }

    const disabled =
      ui.isSubmitting || !allowSubmit || policy.loading || policy.paused;

    const title = policy.paused
      ? "Challenge creation is paused on-chain."
      : !allowSubmit
      ? "Fix the remaining issues before creating."
      : policy.loading
      ? "Syncing chain policy…"
      : undefined;

    return {
      text: "Create Challenge",
      disabled,
      loading: ui.isSubmitting,
      title,
      onClick: async () => {
        if (policy.paused) return push("Challenge creation is paused on-chain.");
        if (!allowSubmit) return push("Fix the highlighted issues before creating.");
        await submit();
      },
    };
  }, [
    address,
    isFinal,
    ui.isSubmitting,
    ui.step,
    allowSubmit,
    policy.loading,
    policy.paused,
    push,
    canNavigateTo,
    next,
    submit,
  ]);

  const stepReady = [step1Ok, step2Ok, step3Ok, allowSubmit];

  return (
    <>
      {/* ── Alerts ── */}
      {policy.error ? (
        <div className="cw-alert cw-alert--warn">{policy.error}</div>
      ) : null}
      {policy.paused ? (
        <div className="cw-alert cw-alert--warn">Challenge creation is currently paused on-chain.</div>
      ) : null}
      {ui.error ? (
        <div className="cw-alert cw-alert--error">{ui.error}</div>
      ) : null}

      {/* ── Header ── */}
      <div className="cw-header">
        <div className="cw-header__top">
          <div>
            <h1 className="cw-header__title">Create Challenge</h1>
            <p className="cw-header__sub">
              Step {ui.step} of 4 — {STEPS.find((s) => s.id === ui.step)?.name}
              {policy.loading ? <span className="cw-header__sync"> · syncing…</span> : null}
            </p>
          </div>

          <div className="cw-header__actions">
            {hasCreatedChallenge ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setInviteOpen(true)}
                disabled={ui.isSubmitting}
              >
                Invite
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-primary"
              disabled={cta.disabled}
              onClick={cta.onClick}
              title={cta.title}
            >
              {cta.loading ? "Processing…" : cta.text}
            </button>
          </div>
        </div>

        {/* ── Progress ── */}
        <div className="cw-progress">
          {STEPS.map((step, i) => {
            const active = step.id === ui.step;
            const done = step.id < ui.step;
            const ready = stepReady[i];

            return (
              <button
                key={step.id}
                type="button"
                className={`cw-progress__step ${active ? "is-active" : ""} ${done ? "is-done" : ""}`}
                onClick={() => {
                  if (ui.isSubmitting) return;
                  const g = canNavigateTo(step.id);
                  if (!g.ok) return push(g.reason || "Complete the previous section.");
                  goTo(step.id as any);
                }}
                aria-current={active ? "step" : undefined}
              >
                <span className="cw-progress__dot">
                  {done && ready ? <Check size={12} strokeWidth={3} /> : <span>{i + 1}</span>}
                </span>
                <span className="cw-progress__label">{step.name}</span>
              </button>
            );
          })}

          {/* Progress bar */}
          <div className="cw-progress__bar" aria-hidden>
            <div
              className="cw-progress__fill"
              style={{ width: `${((ui.step - 1) / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Step Content ── */}
      <div className="cw-body">
        <AnimatePresence mode="wait">
          {ui.step === 1 && (
            <motion.div
              key="step1"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Step1_Intent state={state} dispatch={dispatch} />
            </motion.div>
          )}

          {ui.step === 2 && (
            <motion.div
              key="step2"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Step2_Essentials
                state={state}
                dispatch={dispatch}
                nativeBalanceFormatted={nativeBal?.formatted}
                onComplete={next}
              />
            </motion.div>
          )}

          {ui.step === 3 && (
            <motion.div
              key="step3"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Step3_Options state={state} dispatch={dispatch} />
            </motion.div>
          )}

          {ui.step === 4 && (
            <motion.div
              key="step4"
              initial={{ x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Step4_Review
                state={state}
                derived={derived}
                policyHints={policy.hints}
                nativeBalanceFormatted={nativeBal?.formatted}
                creating={ui.isSubmitting}
                txHash={ui.txHash}
                canCreate={!!address && allowSubmit && !policy.paused}
                onCreate={submit}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom Nav (desktop) ── */}
        <div className="cw-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={back}
            disabled={ui.isSubmitting || ui.step === 1}
          >
            Back
          </button>

          <span className="cw-footer__hint">
            {policy.hints?.chainNow ? `Chain time: ${policy.hints.chainNow}` : null}
          </span>
        </div>
      </div>

      {/* ── Mobile Bottom Bar ── */}
      <div className="cw-mobile-bar">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={back}
          disabled={ui.isSubmitting || ui.step === 1}
        >
          Back
        </button>

        <button
          type="button"
          className="btn btn-primary"
          disabled={cta.disabled}
          onClick={cta.onClick}
          title={cta.title}
        >
          {cta.loading ? "Processing…" : cta.text}
        </button>
      </div>

      <AnimatePresence>
        {successOpen && ui.txHash ? (
          <SuccessSheet
          open={successOpen}
          txHash={ui.txHash}
          challengeId={ui.challengeId}
          summary={{
            title: state.essentials.title || "Untitled challenge",
            type:
              state.intent.type === "FITNESS"
                ? `FITNESS · ${state.intent.fitnessKind ?? ""}`.trim()
                : `GAMING · ${state.intent.gameId ?? ""} ${state.intent.gameMode ?? ""}`.trim(),
            visibility: state.intent.visibility,
            verification:
              state.verification.mode === "AIVM"
                ? "Lightchain AIVM + PoI"
                : (state.verification.mode ?? "Lightchain AIVM + PoI"),
            totalDeposit: `${derived.totalDepositFormatted} ${state.money.currency.symbol ?? "LCAI"}`,
            schedule: {
              joinCloses: state.timeline.joinCloses?.toLocaleString() ?? "—",
              starts: state.timeline.starts?.toLocaleString() ?? "—",
              ends: state.timeline.ends?.toLocaleString() ?? "—",
              proofDeadline: state.timeline.proofDeadline?.toLocaleString() ?? "—",
            },
          }}
          onClose={() => {
            setSuccessOpen(false);
            reset();
            goTo(1);
          }}
          onInvite={ui.challengeId ? () => setInviteOpen(true) : undefined}
          onViewChallenge={
            ui.challengeId ? () => router.push(`/challenge/${ui.challengeId}`) : undefined
          }
        />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {inviteOpen ? (
          <InviteSheet
            onClose={() => setInviteOpen(false)}
            onSendInvite={handleInvite}
          />
        ) : null}
      </AnimatePresence>

      {/* Spacer for mobile bottom bar */}
      <div className="lg:hidden h-24" />
    </>
  );
}
