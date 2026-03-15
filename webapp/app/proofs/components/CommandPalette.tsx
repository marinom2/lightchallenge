// app/proofs/components/CommandPalette.tsx
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Star, Copy } from "lucide-react";
import type { UiModel } from "../types";
import { useToasts } from "@/lib/ui/toast";

type Props = {
  open: boolean;
  models: UiModel[];
  favorites?: Set<string>;
  onClose: () => void;
  onSelect: (hash: `0x${string}`) => void;
  onToggleFavorite?: (hash: `0x${string}`) => void;
  onCopyHash?: (hash: `0x${string}`) => void; // parent does the actual clipboard write
};

export default function CommandPalette({
  open,
  models,
  favorites,
  onClose,
  onSelect,
  onToggleFavorite,
  onCopyHash,
}: Props) {
  const { push } = useToasts();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [q, setQ] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // page scroll lock
  React.useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, mounted]);

  // focus input on open
  React.useEffect(() => {
    if (!open) return;
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = React.useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = !t
      ? models
      : models.filter(
          (m) =>
            m.name.toLowerCase().includes(t) ||
            m.modelHash.toLowerCase().includes(t) ||
            (m.providers || []).some((p) => p.toLowerCase().includes(t))
        );
    const favs = favorites ?? new Set<string>();
    const sorted = [...list].sort((a, b) => {
      const af = favs.has(a.modelHash);
      const bf = favs.has(b.modelHash);
      return Number(bf) - Number(af) || a.name.localeCompare(b.name);
    });
    return sorted.slice(0, 80);
  }, [q, models, favorites]);

  // keep cursor in bounds
  React.useEffect(() => {
    if (!open) return;
    setCursor((c) => Math.min(c, Math.max(0, filtered.length - 1)));
  }, [filtered.length, open]);

  // keyboard shortcuts (only copy shows toast)
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") e.preventDefault();
      if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, Math.max(0, filtered.length - 1)));
      if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));

      const cur = filtered[cursor];
      if (!cur) return;

      if (e.key === "Enter") { onSelect(cur.modelHash); onClose(); }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); onToggleFavorite?.(cur.modelHash); }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        onCopyHash?.(cur.modelHash);
        push("Model hash copied ✓");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cursor, filtered, onClose, onSelect, onToggleFavorite, onCopyHash, push]);

  if (!mounted || !open) return null;
  const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-140 bg-black/45 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        className="fixed z-141 inset-x-0 top-[10dvh] mx-auto w-[min(92vw,800px)] rounded-2xl overflow-hidden"
        style={{ background: "var(--card-elev)", border: "1px solid var(--border)" }}
        initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Command palette"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-(--border)">
          <Search size={16} />
          <input
            ref={inputRef}
            autoFocus
            className="input py-2! flex-1"
            placeholder="Search models…  (↑/↓ move, Enter select, ⌘F fav, ⌘C copy hash)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <ul className="max-h-[60vh] overflow-auto" role="listbox" aria-label="Search results">
          {filtered.map((m, i) => {
            const fav = favorites?.has(m.modelHash) ?? false;
            return (
              <li key={m.modelHash} role="option" aria-selected={cursor === i}>
                <div className={cx("w-full flex items-center gap-2 px-4 py-3", i === cursor ? "bg-white/5" : "hover:bg-white/5")}>
                  <button
                    className="flex-1 text-left"
                    aria-selected={cursor === i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => { onSelect(m.modelHash); onClose(); }}
                  >
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-xs text-(--text-muted) mono">{m.modelHash}</div>
                  </button>

                  {/* Copy hash */}
                  <button
                    className="icon-btn"
                    title="Copy model hash (⌘/Ctrl+C)"
                    aria-label="Copy model hash"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyHash?.(m.modelHash);
                      push("Model hash copied ✓");
                    }}
                  >
                    <Copy size={16} />
                  </button>

                  {/* Favorite toggle */}
                  <button
                    className={cx("icon-btn star", fav && "is-fav")}
                    title={fav ? "Unfavorite" : "Favorite"}
                    aria-pressed={fav}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(m.modelHash); }}
                  >
                    <Star size={16} />
                  </button>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-(--text-muted)">No matches.</li>
          )}
        </ul>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}