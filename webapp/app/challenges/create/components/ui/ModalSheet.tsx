"use client";

import * as React from "react";
import { X } from "lucide-react";

function useLockBodyScroll(open: boolean) {
  React.useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;

    // prevent layout shift from scrollbar disappearance
    const scrollBarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollBarW > 0) document.body.style.paddingRight = `${scrollBarW}px`;

    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);
}

export function ModalSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useLockBodyScroll(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        {/* pointer-events are disabled on modal-panel in globals.css */}
        <div className="panel modal-shell" style={{ pointerEvents: "auto", width: "min(720px, 100%)" }}>
          <div className="panel-header flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{title}</div>
            </div>
            <button type="button" className="chip" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="modal-body">{children}</div>

          {footer ? <div className="modal-footer">{footer}</div> : null}
        </div>
      </div>
    </>
  );
}