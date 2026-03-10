"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ExternalLink,
  UserPlus,
  Sparkles,
  PlusCircle,
  CalendarClock,
  Wallet,
  ShieldCheck,
  Hash,
  Copy,
  Check,
} from "lucide-react";

type Hex = `0x${string}`;

type SuccessSummary = {
  title: string;
  type: string;
  visibility?: string | null;
  verification: string;
  totalDeposit: string;
  schedule: {
    joinCloses?: string | null;
    starts?: string | null;
    ends?: string | null;
    proofDeadline?: string | null;
  };
};

type Props = {
  open: boolean;
  txHash: Hex;
  challengeId?: number;
  summary?: SuccessSummary;
  onClose: () => void;
  onInvite?: () => void;
  onViewChallenge?: () => void;
};

function splitTypeParts(type?: string) {
  const raw = String(type || "").trim();
  if (!raw) return { primary: "—", secondary: "" };

  const parts = raw
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean);

  return {
    primary: parts[0] || raw,
    secondary: parts.slice(1).join(" • "),
  };
}

function useCopyState() {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const copy = React.useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1400);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copiedKey, copy };
}

function IconCopyButton({
  copied,
  onClick,
  ariaLabel,
}: {
  copied: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={copied ? "Copied" : "Copy"}
      className="inline-grid h-9 w-9 place-items-center rounded-full border transition"
      style={{
        borderColor: copied ? "rgba(120,255,180,0.24)" : "rgba(255,255,255,0.12)",
        background: copied ? "rgba(120,255,180,0.10)" : "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.88)",
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

function InfoCard({
  icon,
  label,
  value,
  mono = false,
  copyValue,
  copied,
  onCopy,
  valueCopyInline = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyValue?: string | null;
  copied?: boolean;
  onCopy?: () => void;
  valueCopyInline?: boolean;
}) {
  return (
    <div
      className="rounded-[22px] border px-4 py-4"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.040), rgba(255,255,255,0.022))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
        {icon}
        <span>{label}</span>
      </div>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div
          className={`min-w-0 text-white ${
            mono ? "font-mono text-xs break-all" : "text-sm font-semibold"
          }`}
        >
          {value}
        </div>

        {copyValue && onCopy && valueCopyInline ? (
          <IconCopyButton
            copied={!!copied}
            onClick={onCopy}
            ariaLabel={`Copy ${label}`}
          />
        ) : null}
      </div>

      {copyValue && onCopy && !valueCopyInline ? (
        <div className="mt-3 flex justify-end">
          <IconCopyButton
            copied={!!copied}
            onClick={onCopy}
            ariaLabel={`Copy ${label}`}
          />
        </div>
      ) : null}
    </div>
  );
}

function ScheduleRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-white/52">{label}</span>
      <span className="text-right font-medium text-white/90">{value || "—"}</span>
    </div>
  );
}

export function SuccessSheet({
  open,
  txHash,
  challengeId,
  summary,
  onClose,
  onInvite,
  onViewChallenge,
}: Props) {
  const { copiedKey, copy } = useCopyState();

  const openExplorer = React.useCallback(() => {
    try {
      const base = (
        process.env.NEXT_PUBLIC_EXPLORER_TX_BASE_URL ||
        "https://testnet.lightscan.app"
      ).replace(/\/$/, "");

      window.open(`${base}/tx/${txHash}`, "_blank", "noopener,noreferrer");
    } catch {
      // noop
    }
  }, [txHash]);

  const typeParts = splitTypeParts(summary?.type);
  const visibilityText = summary?.visibility ? String(summary.visibility) : "";
  const typePrimary = typeParts.primary;
  const typeSecondary = [typeParts.secondary, visibilityText]
    .filter(Boolean)
    .join(" • ");

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[1400]"
            style={{
              background:
                "radial-gradient(circle at top, rgba(24,34,76,0.22), transparent 34%), rgba(3,6,18,0.86)",
              backdropFilter: "blur(18px) saturate(118%)",
              WebkitBackdropFilter: "blur(18px) saturate(118%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="fixed inset-x-0 bottom-0 z-[1410] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div
              className="mx-auto w-full max-w-[1240px] overflow-hidden rounded-[34px] border"
              style={{
                background:
                  "linear-gradient(180deg, rgba(7,11,24,0.992), rgba(10,14,28,0.998))",
                borderColor: "rgba(255,255,255,0.10)",
                boxShadow:
                  "0 34px 100px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div
                className="border-b px-5 py-5 sm:px-7 sm:py-6"
                style={{ borderColor: "rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border"
                    style={{
                      borderColor: "rgba(255,255,255,0.10)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    <CheckCircle2 size={22} />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[1.55rem] font-semibold tracking-[-0.03em] text-white">
                      Challenge created
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      Your transaction was confirmed on-chain.
                      {challengeId != null
                        ? ` Challenge #${challengeId} is now live and ready to share.`
                        : ""}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-7 sm:py-6">
                <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                  <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {challengeId != null ? (
                        <InfoCard
                          icon={<Hash size={13} />}
                          label="Challenge ID"
                          value={`#${challengeId}`}
                          copyValue={String(challengeId)}
                          copied={copiedKey === "challengeId"}
                          onCopy={() => void copy("challengeId", String(challengeId))}
                          valueCopyInline
                        />
                      ) : null}

                      <InfoCard
                        icon={<Wallet size={13} />}
                        label="Total deposit"
                        value={summary?.totalDeposit || "—"}
                      />

                      <InfoCard
                        icon={<ShieldCheck size={13} />}
                        label="Verification"
                        value={summary?.verification || "—"}
                      />
                    </div>

                    <div
                      className="rounded-[24px] border px-5 py-5"
                      style={{
                        borderColor: "rgba(255,255,255,0.08)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.040), rgba(255,255,255,0.022))",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                      }}
                    >
                      <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                        Title
                      </div>

                      <div className="mt-2 text-[1.08rem] font-semibold tracking-[-0.02em] text-white">
                        {summary?.title || "Untitled challenge"}
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
                          <Sparkles size={13} />
                          <span>Type</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {typePrimary}
                        </div>
                        {typeSecondary ? (
                          <div className="mt-1 text-sm text-white/62">{typeSecondary}</div>
                        ) : null}
                      </div>
                    </div>

                    <InfoCard
                      icon={<Copy size={13} />}
                      label="Transaction hash"
                      value={txHash}
                      mono
                      copyValue={txHash}
                      copied={copiedKey === "txHash"}
                      onCopy={() => void copy("txHash", txHash)}
                    />
                  </div>

                  <div
                    className="rounded-[24px] border p-4"
                    style={{
                      borderColor: "rgba(255,255,255,0.08)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.040), rgba(255,255,255,0.022))",
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
                      <CalendarClock size={13} />
                      <span>Schedule snapshot</span>
                    </div>

                    <div className="space-y-2.5">
                      <ScheduleRow
                        label="Join closes"
                        value={summary?.schedule.joinCloses}
                      />
                      <ScheduleRow
                        label="Starts"
                        value={summary?.schedule.starts}
                      />
                      <ScheduleRow
                        label="Ends"
                        value={summary?.schedule.ends}
                      />
                      <ScheduleRow
                        label="Proof deadline"
                        value={summary?.schedule.proofDeadline}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="mt-6 flex flex-wrap items-center gap-2.5 border-t pt-5"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                >
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openExplorer}
                  >
                    <ExternalLink size={16} />
                    <span>Open tx explorer</span>
                  </button>

                  {onViewChallenge ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={onViewChallenge}
                    >
                      <Sparkles size={16} />
                      <span>View challenge</span>
                    </button>
                  ) : null}

                  {onInvite ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={onInvite}
                    >
                      <UserPlus size={16} />
                      <span>Invite people</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onClose}
                  >
                    <PlusCircle size={16} />
                    <span>Create another</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export default SuccessSheet;