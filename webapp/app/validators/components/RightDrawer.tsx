// app/validators/components/RightDrawer.tsx
"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Cpu, Atom, PlugZap, Copy, Pin, PinOff, BadgeCheck, Star } from "lucide-react";
import type { UiModel } from "../types";
import { useToasts } from "@/lib/ui/toast";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type Props = {
  open: boolean;
  model: UiModel | null;
  height: number;
  pinned?: boolean;
  isFavorite?: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onClose: () => void;
  onPick?: (hash: `0x${string}`) => void;
  onCopyHash?: (hash: `0x${string}`) => void;
  onToggleFavorite?: (hash: `0x${string}`) => void;
};

export default function RightDrawer({
  open,
  model,
  height,
  pinned,
  isFavorite = false,
  onPin,
  onUnpin,
  onClose,
  onPick,
  onCopyHash,
  onToggleFavorite,
}: Props) {
  const { push } = useToasts();

  const handleCopy = React.useCallback(() => {
    if (!model) return;
    // clipboard action is supplied by parent (keeps concerns separated)
    onCopyHash?.(model.modelHash);
    // toast here so both drawer button & keyboard copy surface the same UX
    push("Model hash copied ✓");
  }, [model, onCopyHash, push]);

  const ctaBase =
    "inline-flex items-center justify-center gap-2 h-12 px-4 rounded-2xl text-[14px] font-medium whitespace-nowrap";

  const titleId = React.useId();
  const descId = React.useId();

  return (
    <AnimatePresence initial={false} mode="wait">
      {open && model && (
        <motion.aside
          key={model.modelHash}
          className="rounded-2xl p-4 shadow-xl"
          style={{
            height,
            overflow: "auto",
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 8%, transparent), color-mix(in oklab, #000 20%, var(--card)))",
            border: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
          }}
          initial={{ x: 18, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 18, opacity: 0 }}
          transition={{ type: "tween", duration: 0.16 }}
          role="complementary"
          aria-label="Model details"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="grid place-items-center rounded-xl size-9 bg-white/10" aria-hidden>
                {model.verifierKind === "ZK" ? <Atom size={16} /> : <Cpu size={16} />}
              </span>
              <h3 id={titleId} className="font-semibold truncate">
                {model.name}
              </h3>
              <BadgeCheck size={16} className="opacity-60 shrink-0" aria-hidden />
            </div>

            <div className="flex items-center gap-1">
              <button
                className={cx("icon-btn star", isFavorite && "is-fav")}
                title={isFavorite ? "Unfavorite" : "Favorite"}
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite?.(model.modelHash)}
              >
                <Star size={16} />
              </button>

              <button
                className="icon-btn"
                title={pinned ? "Unpin" : "Pin"}
                onClick={pinned ? onUnpin : onPin}
                aria-pressed={!!pinned}
              >
                {pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
              <button className="icon-btn" onClick={onClose} aria-label="Close details">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Info pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2" id={descId}>
            <span className="chip chip--info">{model.verifierKind}</span>
            {model.providers?.includes("steam") && (
              <span className="chip chip--info">
                <PlugZap size={12} /> Steam link
              </span>
            )}
          </div>

          {/* Hash row */}
          <div className="mt-3 text-xs mono flex items-center gap-2 opacity-80 model-card__hashrow">
            <span className="truncate" title={model.modelHash}>
              {model.modelHash}
            </span>
            <button
              type="button"
              className="copy-btn"
              onClick={handleCopy}
              aria-label="Copy model hash"
              title="Copy model hash"
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCopy()}
            >
              <Copy size={12} />
            </button>
          </div>

          {/* Notes */}
          {model.providers?.includes("steam") && (
            <ul className="mt-4 text-sm space-y-1 opacity-90">
              <li className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-[var(--warn)]" aria-hidden />
                Requires Steam link
              </li>
            </ul>
          )}
          {model.notes && <p className="mt-4 text-sm leading-relaxed opacity-90">{model.notes}</p>}

          {/* CTA */}
          {onPick && (
            <div className="mt-6">
              <button
                className={cx("btn btn-primary", ctaBase)}
                onClick={() => onPick(model.modelHash)}
                aria-label="Select model and continue"
              >
                Select &amp; Continue
              </button>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}