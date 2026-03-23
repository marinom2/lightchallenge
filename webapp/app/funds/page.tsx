// webapp/app/funds/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";

import Breadcrumb from "@/app/components/ui/Breadcrumb";
import EmptyState from "@/app/components/ui/EmptyState";
import ConnectWalletGate from "@/app/components/ui/ConnectWalletGate";
import { EXPLORER_URL } from "@/lib/contracts";

/* ── Types ───────────────────────────────────────────────────────────── */

type Summary = {
  totalEarned: string;
  totalRefunded: string;
  totalStaked: string;
  netProfit: string;
  breakdown: Record<string, { totalWei: string; count: number }>;
};

type Transaction = {
  challengeId: string;
  challengeTitle: string | null;
  claimType: string;
  amountWei: string;
  txHash: string | null;
  claimedAt: string;
  source: string;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  read: boolean;
  created_at: string;
};

type FundsData = {
  summary: Summary;
  transactions: Transaction[];
  notifications: Notification[];
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

const SYMBOL = process.env.NEXT_PUBLIC_NATIVE_SYMBOL || "LCAI";

function formatWei(weiStr: string): string {
  const n = Number(weiStr) / 1e18;
  if (n === 0) return "0";
  if (Math.abs(n) < 0.001) return n.toExponential(2);
  return n.toFixed(4);
}

function short(hash: string) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function claimLabel(type: string): string {
  switch (type) {
    case "principal": return "Winner Payout";
    case "cashback": return "Loser Cashback";
    case "treasury_eth": return "Refund";
    default: return type;
  }
}

function claimChip(type: string): string {
  switch (type) {
    case "principal": return "chip--ok";
    case "cashback": return "chip--warn";
    case "treasury_eth": return "chip--info";
    default: return "";
  }
}

/* ── Component ──────────────────────────────────────────────────────── */

export default function FundsPage() {
  const { address } = useAccount();
  const [data, setData] = useState<FundsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFunds = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/me/funds?address=${address}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } catch (e) {
      console.error("Failed to fetch funds", e);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  // Mark notifications as read
  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/me/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    fetchFunds();
  }, [fetchFunds]);

  return (
    <ConnectWalletGate>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Breadcrumb items={[
          { label: "Home", href: "/" },
          { label: "My Funds" },
        ]} />

        <h1 className="text-2xl font-bold mt-4 mb-6">My Funds</h1>

        {loading && !data ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : !data ? (
          <EmptyState
            title="No funds data"
            description="Connect your wallet to see your funds overview."
          />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <SummaryCard
                label="Total Earned"
                value={`${formatWei(data.summary.totalEarned)} ${SYMBOL}`}
                variant="success"
              />
              <SummaryCard
                label="Total Staked"
                value={`${formatWei(data.summary.totalStaked)} ${SYMBOL}`}
                variant="neutral"
              />
              <SummaryCard
                label="Total Refunded"
                value={`${formatWei(data.summary.totalRefunded)} ${SYMBOL}`}
                variant="info"
              />
              <SummaryCard
                label="Net Profit"
                value={`${formatWei(data.summary.netProfit)} ${SYMBOL}`}
                variant={Number(data.summary.netProfit) >= 0 ? "success" : "danger"}
              />
            </div>

            {/* Notifications */}
            {data.notifications.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold mb-3">Recent Notifications</h2>
                <div className="space-y-2">
                  {data.notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 rounded-lg border ${
                        n.read ? "border-gray-700 bg-gray-800/50" : "border-green-700 bg-green-900/20"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-400 mt-1">{n.body}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{timeAgo(n.created_at)}</span>
                          {!n.read && (
                            <button
                              className="text-xs text-green-400 hover:text-green-300"
                              onClick={() => markRead([n.id])}
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      {n.data?.txHash && (
                        <a
                          href={`${EXPLORER_URL}/tx/${n.data.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline mt-1 inline-block"
                        >
                          View transaction
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Transaction History */}
            <section>
              <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
              {data.transactions.length === 0 ? (
                <EmptyState
                  title="No transactions yet"
                  description="Your claim and distribution history will appear here."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="pb-2 pr-4">Challenge</th>
                        <th className="pb-2 pr-4">Type</th>
                        <th className="pb-2 pr-4 text-right">Amount</th>
                        <th className="pb-2 pr-4">Tx</th>
                        <th className="pb-2">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((tx, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-2 pr-4">
                            <Link
                              href={`/challenge/${tx.challengeId}`}
                              className="text-blue-400 hover:underline"
                            >
                              {tx.challengeTitle || `#${tx.challengeId}`}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`chip ${claimChip(tx.claimType)}`}>
                              {claimLabel(tx.claimType)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {formatWei(tx.amountWei)} {SYMBOL}
                          </td>
                          <td className="py-2 pr-4">
                            {tx.txHash ? (
                              <a
                                href={`${EXPLORER_URL}/tx/${tx.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline font-mono text-xs"
                              >
                                {short(tx.txHash)}
                              </a>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="py-2 text-gray-400 text-xs">
                            {timeAgo(tx.claimedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ConnectWalletGate>
  );
}

/* ── Summary Card ─────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "success" | "danger" | "info" | "neutral";
}) {
  const colorMap = {
    success: "border-green-700 bg-green-900/20 text-green-400",
    danger: "border-red-700 bg-red-900/20 text-red-400",
    info: "border-blue-700 bg-blue-900/20 text-blue-400",
    neutral: "border-gray-700 bg-gray-800/50 text-gray-300",
  };

  return (
    <div className={`p-4 rounded-lg border ${colorMap[variant]}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
