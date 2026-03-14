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
          <div
            style={{
              borderBottom: "1px solid var(--lc-border)",
              padding: "20px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: 600,
                  color: "var(--lc-text)",
                  margin: 0,
                }}>
                  Invite someone
                </h3>
                <div style={{
                  marginTop: 4,
                  fontSize: "var(--lc-text-small)",
                  color: "var(--lc-text-secondary)",
                }}>
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
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: 4,
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-inset)",
              }}
            >
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: "var(--lc-radius-md)",
                      fontSize: "var(--lc-text-small)",
                      fontWeight: 500,
                      color: active ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
                      backgroundColor: active ? "var(--lc-select)" : "transparent",
                      border: active ? "1px solid var(--lc-select-border)" : "1px solid transparent",
                      boxShadow: active ? "var(--lc-shadow-sm)" : "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Input form */}
            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 12,
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-inset)",
                }}
              >
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
