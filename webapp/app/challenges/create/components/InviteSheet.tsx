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
          background:
            "radial-gradient(circle at top, rgba(25,32,68,0.24), transparent 38%), rgba(3,6,18,0.84)",
          backdropFilter: "blur(18px) saturate(118%)",
          WebkitBackdropFilter: "blur(18px) saturate(118%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        className="fixed inset-x-0 bottom-0 z-[1510] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
        initial={{ y: "100%" }}
        animate={{ y: "0%" }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div
          className="mx-auto w-full max-w-4xl overflow-hidden rounded-[30px] border"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,12,24,0.988), rgba(10,14,28,0.996))",
            borderColor: "rgba(255,255,255,0.10)",
            boxShadow:
              "0 30px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="border-b px-5 py-5 sm:px-6"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-white">
                  Invite someone
                </h3>
                <div className="mt-1 text-sm text-white/70">
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

          <div className="px-5 py-5 sm:px-6">
            <div
              className="rounded-[20px] border p-1"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <div className="flex items-center gap-2">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className="relative flex-1 rounded-[16px] px-4 py-3 text-sm font-medium transition"
                      style={{
                        color: active ? "white" : "rgba(255,255,255,0.65)",
                      }}
                    >
                      {active ? (
                        <motion.div
                          layoutId="invite-tab-highlight"
                          className="absolute inset-0 rounded-[16px]"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.05))",
                            border: "1px solid rgba(255,255,255,0.10)",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                          }}
                        />
                      ) : null}

                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {tab.icon} {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5">
              <div
                className="rounded-[22px] border p-3"
                style={{
                  borderColor: "rgba(255,255,255,0.08)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))",
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={currentTab?.placeholder}
                    className="input flex-1 font-mono text-sm"
                    autoFocus
                  />

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!inputValue.trim() || sending}
                    aria-label="Send invite"
                  >
                    <span className="inline-flex items-center gap-2">
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