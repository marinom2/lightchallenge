"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useToasts } from "@/lib/ui/toast";

type Step = { id: number; name: string };

export type StepBadgeTone = "ok" | "warn" | "muted" | "pending";

export type StepBadge =
  | { text: string; tone?: StepBadgeTone; ariaLabel?: string }
  | null
  | undefined;

interface Props {
  steps: Step[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
  ariaLabel?: string;
  canNavigateTo?: (stepId: number) => { ok: boolean; reason?: string };
  getBadge?: (stepId: number) => StepBadge;
}

export function Stepper({
  steps,
  currentStep,
  onStepClick,
  ariaLabel,
  canNavigateTo,
  getBadge,
}: Props) {
  const reduce = useReducedMotion();
  const { push } = useToasts();

  const itemsRef = React.useRef<Array<HTMLButtonElement | null>>([]);

  const currentIdx = React.useMemo(() => {
    const idx = steps.findIndex((s) => s.id === currentStep);
    return idx >= 0 ? idx : 0;
  }, [steps, currentStep]);

  React.useEffect(() => {
    itemsRef.current.forEach((btn, i) => {
      if (!btn) return;
      btn.tabIndex = i === currentIdx ? 0 : -1;
    });
  }, [currentIdx]);

  const guardFor = React.useCallback(
    (stepId: number) => {
      if (stepId === currentStep) return { ok: true as const };
      return canNavigateTo?.(stepId) ?? { ok: true as const };
    },
    [canNavigateTo, currentStep]
  );

  const announceBlocked = React.useCallback(
    (stepId: number) => {
      const guard = guardFor(stepId);
      if (!guard.ok) {
        push(guard.reason || "Complete the previous section to continue.");
        return false;
      }
      return true;
    },
    [guardFor, push]
  );

  const tryGoStepId = React.useCallback(
    (stepId: number) => {
      const ok = announceBlocked(stepId);
      if (!ok) return false;
      onStepClick(stepId);
      return true;
    },
    [announceBlocked, onStepClick]
  );

  const focusIndex = React.useCallback((idx: number) => {
    const target = itemsRef.current[idx];
    target?.focus();
  }, []);

  const goIndex = React.useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, steps.length - 1));
      const target = steps[clamped];
      if (!target) return;
      const ok = tryGoStepId(target.id);
      if (ok) focusIndex(clamped);
    },
    [focusIndex, steps, tryGoStepId]
  );

  return (
    <nav aria-label={ariaLabel ?? "Challenge creation progress"} className="w-full">
      <ol
        role="list"
        className="stepper"
        style={{ ["--count" as any]: String(steps.length) }}
      >
        {steps.map((step, i) => {
          const active = i === currentIdx;
          const done = i < currentIdx;
          const last = i === steps.length - 1;

          const guard = guardFor(step.id);
          const blocked = !guard.ok;
          const badge = getBadge?.(step.id);

          const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goIndex(i + 1);
              return;
            }

            if (e.key === "ArrowLeft") {
              e.preventDefault();
              goIndex(i - 1);
              return;
            }

            if (e.key === "Home") {
              e.preventDefault();
              goIndex(0);
              return;
            }

            if (e.key === "End") {
              e.preventDefault();
              goIndex(steps.length - 1);
              return;
            }

            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              tryGoStepId(step.id);
            }
          };

          return (
            <li key={step.id} className="stepper-step">
              {!last ? (
                <div className="stepper-seg" aria-hidden="true">
                  <div className="stepper-line" />
                  <motion.div
                    className="stepper-line stepper-line--fill"
                    initial={false}
                    animate={{ scaleX: done ? 1 : 0 }}
                    transition={{
                      duration: reduce ? 0 : 0.34,
                      ease: "easeOut",
                    }}
                    data-progress={done ? "true" : "false"}
                  />
                </div>
              ) : null}

              <button
                ref={(node) => {
                  itemsRef.current[i] = node;
                }}
                type="button"
                className={`stepper-btn ${blocked ? "is-blocked" : ""}`}
                data-active={active ? "true" : "false"}
                data-done={done ? "true" : "false"}
                aria-current={active ? "step" : undefined}
                aria-disabled={blocked ? "true" : undefined}
                aria-label={`Step ${i + 1} of ${steps.length}: ${step.name}`}
                title={blocked ? guard.reason || "Locked" : step.name}
                onClick={() => {
                  tryGoStepId(step.id);
                }}
                onKeyDown={onKeyDown}
              >
                <span
                  className="stepper-dot"
                  data-active={active ? "true" : "false"}
                  data-done={done ? "true" : "false"}
                  aria-hidden="true"
                />
                <span className="stepper-num" aria-hidden="true">
                  {i + 1}
                </span>
              </button>

              <div className="stepper-label">
                <span
                  className="stepper-label__text"
                  data-active={active ? "true" : "false"}
                  data-done={done ? "true" : "false"}
                >
                  {step.name}
                </span>

                {badge?.text ? (
                  <span
                    className="stepper-badge"
                    data-tone={badge.tone ?? "muted"}
                    aria-label={badge.ariaLabel ?? badge.text}
                  >
                    {badge.text}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Stepper;