"use client";

import { useEffect, useState } from "react";

type Health = {
  status: string;
  rpc: boolean;
  db: boolean;
  blockNumber: string;
  blockAge: number;
};

export default function NetworkStatus() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const poll = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  const color = !health
    ? "var(--text-muted)"
    : health.status === "healthy"
      ? "#22c55e"
      : health.status === "degraded"
        ? "#f59e0b"
        : "#ef4444";

  const label = !health
    ? "..."
    : health.status === "healthy"
      ? "Testnet"
      : health.status === "degraded"
        ? "Degraded"
        : "Offline";

  const title = health
    ? `Block ${health.blockNumber} (${health.blockAge}s ago)\nRPC: ${health.rpc ? "OK" : "Down"} | DB: ${health.db ? "OK" : "Down"}`
    : "Checking network...";

  return (
    <div
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        opacity: 0.85,
        cursor: "default",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          flexShrink: 0,
          boxShadow: health?.status === "healthy" ? `0 0 6px ${color}` : "none",
        }}
      />
      <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
    </div>
  );
}
