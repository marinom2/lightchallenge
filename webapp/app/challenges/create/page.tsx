"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount, useBalance } from "wagmi";
import { useRouter } from "next/navigation";

import ClientOnly from "./components/ClientOnly";
import { Toasts, useToasts } from "@/lib/ui/toast";
import Breadcrumb from "@/app/components/ui/Breadcrumb";

import { Stepper } from "./components/Stepper";
import { InviteSheet } from "./components/InviteSheet";
import SuccessSheet from "./components/SuccessSheet";

import Step1_Intent from "./components/steps/Step1_Intent";
import Step2_Essentials from "./components/steps/Step2_Essentials";
import Step3_Options from "./components/steps/Step3_Options";
import Step4_Review from "./components/steps/Step4_Review";

import { useCreateChallenge } from "./hooks/useCreateChallenge";
import { useChainPolicyHints } from "./hooks/useChainPolicyHints";

const STEPS = [
  { id: 1 as const, name: "Intent" },
  { id: 2 as const, name: "Essentials" },
  { id: 3 as const, name: "Options" },
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
      if (!step1Ok) return { ok: false as const, reason: "Complete Intent first." };
      if (stepId === 2) return { ok: true as const };

      if (!step2Ok) {
        return { ok: false as const, reason: "Complete Essentials first." };
      }
      if (stepId === 3) return { ok: true as const };

      if (!step3Ok) {
        return { ok: false as const, reason: "Complete Options first." };
      }
      return { ok: true as const };
    },
    [policy.paused, step1Ok, step2Ok, step3Ok]
  );

  const getBadge = React.useCallback(
    (stepId: number) => {
      if (stepId === 1) {
        return step1Ok
          ? { text: "Ready", tone: "ok" as const }
          : { text: "Required", tone: "warn" as const };
      }

      if (stepId === 2) {
        if (!step1Ok) return { text: "Locked", tone: "muted" as const };
        return step2Ok
          ? { text: "Ready", tone: "ok" as const }
          : { text: "In progress", tone: "pending" as const };
      }

      if (stepId === 3) {
        if (!step2Ok) return { text: "Locked", tone: "muted" as const };
        return step3Ok
          ? { text: "Ready", tone: "ok" as const }
          : { text: "Required", tone: "warn" as const };
      }

      if (stepId === 4) {
        if (!step3Ok) return { text: "Locked", tone: "muted" as const };
        return allowSubmit
          ? { text: "Ready", tone: "ok" as const }
          : { text: "Check", tone: "pending" as const };
      }

      return null;
    },
    [step1Ok, step2Ok, step3Ok, allowSubmit]
  );

  const isFinal = ui.step === 4;
  const hasCreatedChallenge = ui.challengeId != null;

  const handleInvite = React.useCallback(
    async (method: Method, value: string) => {
      if (!ui.challengeId) {
        push("Challenge ID is missing. Create the challenge first.");
        return;
      }

      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    [ui.challengeId, push]
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

  return (
    <>
      <div style={{ marginBottom: "var(--lc-space-4)" }}>
        <Breadcrumb items={[{ label: "Create", href: "/challenges/create" }, { label: `Step ${ui.step}` }]} />
      </div>

      {policy.error ? (
        <div role="alert" style={{ marginTop: "var(--lc-space-4)" }}>
          <div style={{ padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", border: "1px solid var(--lc-warning)", backgroundColor: "var(--lc-warning-muted)", fontSize: "var(--lc-text-small)", color: "var(--lc-text)" }}>
            Chain policy: {policy.error}
          </div>
        </div>
      ) : null}

      {policy.paused ? (
        <div role="alert" style={{ marginTop: "var(--lc-space-4)" }}>
          <div style={{ padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", border: "1px solid var(--lc-warning)", backgroundColor: "var(--lc-warning-muted)", fontSize: "var(--lc-text-small)", color: "var(--lc-text)" }}>
            Chain policy: challenge creation is currently paused on-chain.
          </div>
        </div>
      ) : null}

      {ui.error ? (
        <div role="alert" style={{ marginTop: "var(--lc-space-4)" }}>
          <div style={{ padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", border: "1px solid var(--lc-error)", backgroundColor: "var(--lc-error-muted)", fontSize: "var(--lc-text-small)", color: "var(--lc-text)" }}>
            {ui.error}
          </div>
        </div>
      ) : null}

      <div className="sticky top-[calc(var(--navbar-top)+env(safe-area-inset-top,0px))] z-20 create-stepper">
        <div className="section">
          <div className="create-stepper__inner">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div style={{ fontSize: "var(--lc-text-caption)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--lc-text-muted)" }}>
                  Step {ui.step} / 4
                  {policy.loading ? (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>· syncing policy…</span>
                  ) : null}
                </div>

                <div className="font-semibold truncate flex items-center gap-2">
                  <span>{STEPS.find((s) => s.id === ui.step)?.name}</span>
                  {getBadge(ui.step)?.text ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: "var(--lc-weight-semibold)" as any,
                        padding: "2px 8px",
                        borderRadius: "var(--lc-radius-pill)",
                        border: "1px solid",
                        borderColor:
                          getBadge(ui.step)?.tone === "ok"
                            ? "var(--lc-success)"
                            : getBadge(ui.step)?.tone === "warn"
                            ? "var(--lc-warning)"
                            : "var(--lc-border)",
                        backgroundColor:
                          getBadge(ui.step)?.tone === "ok"
                            ? "var(--lc-success-muted)"
                            : getBadge(ui.step)?.tone === "warn"
                            ? "var(--lc-warning-muted)"
                            : "var(--lc-bg-inset)",
                        color:
                          getBadge(ui.step)?.tone === "ok"
                            ? "var(--lc-success)"
                            : getBadge(ui.step)?.tone === "warn"
                            ? "var(--lc-warning)"
                            : "var(--lc-text-muted)",
                      }}
                    >
                      {getBadge(ui.step)?.text}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasCreatedChallenge ? (
                  <button
                    type="button"
                    className="btn btn-ghost hidden sm:inline-flex"
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

            <div className="mt-4">
              <Stepper
                steps={STEPS}
                currentStep={ui.step}
                getBadge={getBadge}
                canNavigateTo={canNavigateTo}
                onStepClick={(id) => {
                  if (ui.isSubmitting) return;
                  const g = canNavigateTo(id);
                  if (!g.ok) {
                    return push(g.reason || "Complete the previous section to continue.");
                  }
                  goTo(id as any);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 create-page">
        <div className="section">
          <div className="pt-2">
            <AnimatePresence mode="wait">
              {ui.step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                >
                  <Step1_Intent state={state} dispatch={dispatch} />
                </motion.div>
              )}

              {ui.step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                >
                  <Step2_Essentials
                    state={state}
                    dispatch={dispatch}
                    nativeBalanceFormatted={nativeBal?.formatted}
                  />
                </motion.div>
              )}

              {ui.step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                >
                  <Step3_Options state={state} dispatch={dispatch} />
                </motion.div>
              )}

              {ui.step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
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

            <div className="mt-6 hidden sm:flex items-center justify-between">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={back}
                disabled={ui.isSubmitting || ui.step === 1}
              >
                Back
              </button>

              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {policy.hints?.chainNow ? `Chain time: ${policy.hints.chainNow}` : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 p-3">
        <div className="section">
          <div className="create-stepper__inner">
            <div className="flex items-center justify-between gap-2">
              {hasCreatedChallenge ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setInviteOpen(true)}
                  disabled={ui.isSubmitting}
                >
                  Invite
                </button>
              ) : <div />}

              <button
                type="button"
                className="btn btn-primary min-w-40"
                disabled={cta.disabled}
                onClick={cta.onClick}
                title={cta.title}
              >
                {cta.loading ? "Processing…" : cta.text}
              </button>
            </div>
          </div>
        </div>
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

      <div className="lg:hidden h-24" />
    </>
  );
}