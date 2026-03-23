"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_HISTORY = 20;

const SUGGESTIONS = [
  "How do I create a challenge?",
  "How do tournaments work?",
  "How to connect Strava?",
  "What is LCAI?",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

let msgCounter = 0;
function nextId(): string {
  return `msg-${++msgCounter}-${Date.now()}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = { id: nextId(), role: "user", content: trimmed };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      setInput("");
      setLoading(true);

      try {
        // Build history for the API (exclude the new message)
        const history = messages.slice(-(MAX_HISTORY - 1)).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Try to get wallet address from a known header pattern
        // The API route reads x-lc-address; we pass it from localStorage if available
        let address = "anonymous";
        try {
          const stored = localStorage.getItem("lc-connected-address");
          if (stored) address = stored;
        } catch {
          // ignore
        }

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-lc-address": address,
          },
          body: JSON.stringify({ message: trimmed, history }),
        });

        const data = await res.json();

        if (!res.ok) {
          const errText = data.error || `Error ${res.status}`;
          setMessages((prev) => {
            const next = [
              ...prev,
              { id: nextId(), role: "assistant" as const, content: errText },
            ];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
        } else {
          setMessages((prev) => {
            const next = [
              ...prev,
              { id: nextId(), role: "assistant" as const, content: data.reply },
            ];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
        }
      } catch {
        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: nextId(),
              role: "assistant" as const,
              content: "Sorry, something went wrong. Please try again.",
            },
          ];
          return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Collapsed button ──────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI Chat"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--lc-accent, #6366f1)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </button>
    );
  }

  // ─── Expanded chat panel ───────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        width: 400,
        maxWidth: "calc(100vw - 32px)",
        height: 500,
        maxHeight: "calc(100dvh - 48px)",
        borderRadius: "var(--lc-radius-md, 12px)",
        background: "var(--lc-bg, #0a0b14)",
        border: "1px solid var(--lc-border, #23263a)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--lc-border, #23263a)",
          background: "var(--lc-bg-raised, #12131f)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lc-accent, #6366f1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "var(--lc-text, #e2e4ed)",
            }}
          >
            LightChallenge AI
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          style={{
            background: "none",
            border: "none",
            color: "var(--lc-text-muted, #8b8fa3)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Message area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && !loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
            }}
          >
            <div
              style={{
                color: "var(--lc-text-muted, #8b8fa3)",
                fontSize: 13,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Ask me anything about LightChallenge
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "center",
                maxWidth: 320,
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: "var(--lc-bg-raised, #12131f)",
                    border: "1px solid var(--lc-border, #23263a)",
                    borderRadius: "var(--lc-radius-md, 8px)",
                    color: "var(--lc-text, #e2e4ed)",
                    fontSize: 12,
                    padding: "8px 12px",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--lc-accent, #6366f1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--lc-border, #23263a)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius:
                  msg.role === "user"
                    ? "12px 12px 2px 12px"
                    : "12px 12px 12px 2px",
                background:
                  msg.role === "user"
                    ? "var(--lc-accent, #6366f1)"
                    : "var(--lc-bg-raised, #12131f)",
                color:
                  msg.role === "user"
                    ? "#fff"
                    : "var(--lc-text, #e2e4ed)",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border:
                  msg.role === "assistant"
                    ? "1px solid var(--lc-border, #23263a)"
                    : "none",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px 12px 12px 2px",
                background: "var(--lc-bg-raised, #12131f)",
                border: "1px solid var(--lc-border, #23263a)",
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--lc-text-muted, #8b8fa3)",
                    display: "inline-block",
                    animation: `lcChatBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
              <style>{`
                @keyframes lcChatBounce {
                  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                  30% { transform: translateY(-4px); opacity: 1; }
                }
              `}</style>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Disclaimer */}
      <div
        style={{
          padding: "4px 16px",
          fontSize: 10,
          color: "var(--lc-text-muted, #8b8fa3)",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        AI-generated &mdash; may not be 100% accurate
      </div>

      {/* Input area */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding: "8px 12px 12px",
          borderTop: "1px solid var(--lc-border, #23263a)",
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            background: "var(--lc-bg-raised, #12131f)",
            border: "1px solid var(--lc-border, #23263a)",
            borderRadius: "var(--lc-radius-md, 8px)",
            color: "var(--lc-text, #e2e4ed)",
            fontSize: 13,
            padding: "8px 12px",
            outline: "none",
            fontFamily: "inherit",
            maxHeight: 80,
            lineHeight: 1.4,
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLTextAreaElement).style.borderColor =
              "var(--lc-accent, #6366f1)";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLTextAreaElement).style.borderColor =
              "var(--lc-border, #23263a)";
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--lc-radius-md, 8px)",
            background:
              loading || !input.trim()
                ? "var(--lc-border, #23263a)"
                : "var(--lc-accent, #6366f1)",
            color: "#fff",
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
