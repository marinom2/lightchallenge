"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Spotlight({
  onChoose,
  placeholder = "Search…",
}: {
  onChoose: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const hotkey = (isMac && e.metaKey && e.key.toLowerCase() === "k") || (!isMac && e.ctrlKey && e.key.toLowerCase() === "k");
      if (hotkey) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accept = () => {
    onChoose(value.trim());
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-start md:place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(6px)" }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-2xl p-3"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 6%, transparent), color-mix(in oklab, #000 18%, var(--card)))",
              border: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
              boxShadow: "0 10px 40px rgba(0,0,0,.35)",
            }}
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              className="input h-12 w-full"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") accept();
              }}
            />
            <div className="mt-2 text-xs opacity-70">
              Tip: type <span className="mono">#123</span> to jump to an id, paste <span className="mono">0x…</span> to filter by creator, or
              any text to match titles.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}