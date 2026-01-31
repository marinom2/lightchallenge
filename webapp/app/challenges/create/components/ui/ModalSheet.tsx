// webapp/app/challenges/create/components/ui/ModalSheet.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

function getFocusable(root: HTMLElement) {
  const sel = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
  );
}

function useModalBehavior(open: boolean, panelRef: React.RefObject<HTMLElement>, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const prevActive = document.activeElement as HTMLElement | null;

    // activates your globals.css rules:
    // html[data-modal-open="1"] body overflow hidden, toasts hidden, etc.
    html.setAttribute("data-modal-open", "1");

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    const scrollBarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollBarW > 0) document.body.style.paddingRight = `${scrollBarW}px`;

    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusables = getFocusable(panelRef.current);
        if (!focusables.length) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);

      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;

      html.removeAttribute("data-modal-open");

      // Restore focus to opener
      prevActive?.focus?.();
    };
  }, [open, panelRef, onClose]);
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export function ModalSheet({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = React.useId();
  const descId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  useModalBehavior(open, panelRef, onClose);

  if (!open) return null;

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          className="modal-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* IMPORTANT: modal-panel wrapper contains the .panel as direct child */}
        <div className="modal-panel">
          <motion.div
            ref={panelRef}
            className="panel modal-shell"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? descId : undefined}
            tabIndex={-1}
            initial={{ y: 14, opacity: 0, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.99 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-header">
              <div className="min-w-0">
                <div className="text-sm font-semibold" id={titleId}>
                  {title}
                </div>
                {subtitle ? (
                  <div id={descId} className="mt-1 text-xs text-(--text-muted)">
                    {subtitle}
                  </div>
                ) : null}
              </div>

              <button className="btn btn-ghost" onClick={onClose} type="button" aria-label="Close">
                <X size={16} /> Close
              </button>
            </div>

            <div className="modal-body">{children}</div>

            {footer ? <div className="modal-footer">{footer}</div> : null}
          </motion.div>
        </div>
      </AnimatePresence>
    </Portal>
  );
}