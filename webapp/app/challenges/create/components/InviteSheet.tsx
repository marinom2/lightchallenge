"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Wallet, UserPlus, X, Send } from "lucide-react";

type Method = "email" | "wallet" | "steam";

interface Props {
  onClose: () => void;
  onSendInvite: (method: Method, value: string) => void | Promise<void>;
}

const TABS: {
  id: Method;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}[] = [
  {
    id: "email",
    label: "Email",
    icon: <Mail size={16} />,
    placeholder: "friend@example.com",
  },
  {
    id: "wallet",
    label: "Wallet",
    icon: <Wallet size={16} />,
    placeholder: "0x...",
  },
  {
    id: "steam",
    label: "Steam ID",
    icon: <UserPlus size={16} />,
    placeholder: "7656119...",
  },
];

export function InviteSheet({ onClose, onSendInvite }: Props) {
  const [activeTab, setActiveTab] = useState<Method>("email");
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);

  const currentTab = useMemo(
    () => TABS.find((t) => t.id === activeTab),
    [activeTab]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = inputValue.trim();
    if (!v || sending) return;

    setSending(true);
    try {
      await onSendInvite(activeTab, v);
      setInputValue("");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[1500]"
        style={{
          background: "var(--lc-overlay-bg)",
          backdropFilter: "blur(18px) saturate(118%)",
          WebkitBackdropFilter: "blur(18px) saturate(118%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed inset-x-0 bottom-0 z-[1510] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
        initial={{ y: "100%" }}
        animate={{ y: "0%" }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div
          className="mx-auto w-full max-w-4xl overflow-hidden"
          style={{
            background: "var(--lc-bg-raised)",
            border: "1px solid var(--lc-border)",
            borderRadius: "var(--lc-radius-lg)",
            boxShadow: "var(--lc-shadow-lg)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b" style={{ padding: "20px 24px" }}>
            <div className="d-flex items-start justify-between" style={{ gap: 12 }}>
              <div>
                <h3 className="text-subhead font-semibold m-0">
                  Invite someone
                </h3>
                <div className="text-small color-secondary" style={{ marginTop: 4 }}>
                  Queue an invite for this challenge using email, wallet, or Steam ID.
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost rounded-full p-2"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 24px" }}>
            {/* Tab bar */}
            <div className="segmented-control w-full rounded-lg border bg-inset" style={{ gap: 8, padding: 4 }}>
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`segmented-control__btn ${active ? "segmented-control__btn--active" : ""} d-flex items-center justify-center flex-1 transition-fast`}
                    style={{
                      gap: 8,
                      padding: "10px 16px",
                      fontSize: "var(--lc-text-small)",
                      ...(active ? { boxShadow: "var(--lc-shadow-sm)" } : {}),
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Input form */}
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
              <div className="rounded-lg border bg-inset" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
                <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={currentTab?.placeholder}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      padding: "10px 14px",
                      fontSize: "var(--lc-text-small)",
                      fontFamily: "var(--lc-font-mono)",
                      color: "var(--lc-text)",
                      backgroundColor: "var(--lc-bg-raised)",
                      border: "1px solid var(--lc-border)",
                      borderRadius: "var(--lc-radius-md)",
                      outline: "none",
                    }}
                    autoFocus
                  />

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!inputValue.trim() || sending}
                    aria-label="Send invite"
                  >
                    <span className="d-inline-flex items-center" style={{ gap: 8 }}>
                      <Send size={16} />
                      {sending ? "Sending..." : "Send"}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </>
  );
}

export default InviteSheet;
