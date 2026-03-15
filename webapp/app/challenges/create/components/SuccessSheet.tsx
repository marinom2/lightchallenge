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
        borderColor: copied ? "var(--lc-success-border, rgba(120,255,180,0.24))" : "var(--lc-border)",
        background: copied ? "var(--lc-success-bg, rgba(120,255,180,0.10))" : "var(--lc-bg-inset)",
        color: "var(--lc-text)",
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
    <div className="rounded-lg border p-4 bg-inset shadow-sm">
      <div className="row-2 label-text" style={{ fontSize: "11px", letterSpacing: "0.14em" }}>
        {icon}
        <span>{label}</span>
      </div>

      <div className="d-flex items-start justify-between" style={{ marginTop: 8, gap: 12 }}>
        <div
          className="min-w-0"
          style={{
            color: "var(--lc-text)",
            fontFamily: mono ? "var(--lc-font-mono)" : "inherit",
            fontSize: mono ? "var(--lc-text-small)" : "var(--lc-text-body)",
            fontWeight: mono ? 400 : 600,
            wordBreak: mono ? "break-all" : undefined,
          }}
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
        <div className="d-flex justify-end" style={{ marginTop: 12 }}>
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
    <div className="d-flex items-center justify-between" style={{ gap: 12, fontSize: "var(--lc-text-body)" }}>
      <span className="color-muted">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
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
            className="fixed inset-0 z-1400"
            style={{
              background: "var(--lc-overlay-bg)",
              backdropFilter: "blur(18px) saturate(118%)",
              WebkitBackdropFilter: "blur(18px) saturate(118%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="fixed inset-x-0 bottom-0 z-1410 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div
              className="mx-auto w-full max-w-[1240px] overflow-hidden"
              style={{
                background: "var(--lc-bg-raised)",
                border: "1px solid var(--lc-border)",
                borderRadius: "var(--lc-radius-lg)",
                boxShadow: "var(--lc-shadow-lg)",
              }}
            >
              {/* Header */}
              <div className="border-b" style={{ padding: "20px 24px" }}>
                <div className="d-flex items-start" style={{ gap: 16 }}>
                  <div className="circle-icon shrink-0 border bg-inset shadow-sm"
                    style={{ width: 48, height: 48, display: "grid", placeItems: "center", color: "var(--lc-select-text)" }}>

                    <CheckCircle2 size={22} />
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold" style={{ fontSize: "1.55rem", letterSpacing: "-0.03em" }}>
                      Challenge created
                    </div>
                    <div className="color-secondary" style={{ marginTop: 4, fontSize: "var(--lc-text-body)" }}>

                      Your transaction was confirmed on-chain.
                      {challengeId != null
                        ? ` Challenge #${challengeId} is now live and ready to share.`
                        : ""}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: "20px 24px" }}>
                <div className="d-grid lg:grid-cols-[1.3fr_1fr]" style={{ gap: 16 }}>
                  {/* Left column */}
                  <div className="d-grid" style={{ gap: 16 }}>
                    <div className="d-grid sm:grid-cols-3" style={{ gap: 16 }}>
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

                    {/* Title / Type card */}
                    <div className="rounded-lg border bg-inset shadow-sm" style={{ padding: 20 }}>
                      <div className="label-text" style={{ fontSize: "11px", letterSpacing: "0.14em" }}>
                        Title
                      </div>

                      <div className="font-semibold" style={{ marginTop: 8, fontSize: "1.08rem", letterSpacing: "-0.02em" }}>
                        {summary?.title || "Untitled challenge"}
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <div className="row-2 label-text" style={{ fontSize: "11px", letterSpacing: "0.14em" }}>
                          <Sparkles size={13} />
                          <span>Type</span>
                        </div>
                        <div className="font-semibold" style={{ marginTop: 8, fontSize: "var(--lc-text-body)" }}>
                          {typePrimary}
                        </div>
                        {typeSecondary ? (
                          <div className="color-secondary" style={{ marginTop: 4, fontSize: "var(--lc-text-body)" }}>
                            {typeSecondary}
                          </div>
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

                  {/* Right column — Schedule */}
                  <div className="rounded-lg border p-4 bg-inset shadow-sm">
                    <div className="row-2 label-text" style={{ marginBottom: 12, fontSize: "11px", letterSpacing: "0.14em" }}>
                      <CalendarClock size={13} />
                      <span>Schedule snapshot</span>
                    </div>

                    <div className="flex-col" style={{ display: "flex", gap: 10 }}>
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

                {/* Action buttons */}
                <div className="d-flex flex-wrap items-center border-t" style={{ marginTop: 24, gap: 10, paddingTop: 20 }}>

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
