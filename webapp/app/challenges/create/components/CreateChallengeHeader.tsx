// webapp/app/challenges/create/components/CreateChallengeHeader.tsx
"use client";

import * as React from "react";
import type { Address } from "viem";
import { formatAddress } from "../lib/utils";

export function CreateChallengeHeader({
  address,
  nativeBalance,
}: {
  address?: Address;
  nativeBalance?: { formatted: string; symbol?: string };
}) {
  const balanceText =
    nativeBalance?.formatted != null
      ? `${Number(nativeBalance.formatted).toFixed(2)} ${nativeBalance.symbol ?? ""}`.trim()
      : null;

  return (
    <div className="rounded-[28px] border px-6 py-8 sm:px-8 sm:py-10" style={{ borderColor: "var(--border)" }}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div
            className="text-xs uppercase tracking-[0.22em]"
            style={{ color: "var(--text-muted)" }}
          >
            Builder
          </div>

          <h1
            className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ color: "var(--text)" }}
          >
            Create a Challenge
          </h1>

          <p
            className="mt-4 max-w-3xl text-lg leading-8"
            style={{ color: "var(--text-muted)" }}
          >
            Define intent, stake funds, set the timeline, and publish. Validators verify proofs and
            the contract finalizes on-chain.
          </p>
        </div>

        <div className="justify-self-start lg:justify-self-end">
          <div
            className="rounded-3xl border px-5 py-4"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in oklab, var(--surface) 96%, transparent)",
              minWidth: 260,
            }}
          >
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Wallet
            </div>

            <div className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>
              {address ? formatAddress(address) : "Not connected"}
            </div>

            <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {balanceText ?? "Connect wallet to continue"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}