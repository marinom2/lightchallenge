"use client";

import * as React from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import type { Abi, Hex } from "viem";
import { ABI, ADDR } from "@/lib/contracts";

/* ── Types ────────────────────────────────────────────────────────────────── */

export type ToastKind = "info" | "ok" | "bad";
export type ToastMsg = { kind: ToastKind; text: string } | null;

interface AdminContextValue {
  adminKey: string;
  setAdminKey: (key: string) => void;
  toast: ToastMsg;
  push: (text: string, kind?: ToastKind) => void;
  busy: string | null;
  setBusy: (msg: string | null) => void;
  waitReceipt: (hash: Hex) => Promise<void>;
  cpWrite: (fn: string, args: any[], successMsg: string) => Promise<void>;
  treasuryWrite: (fn: string, args: any[], successMsg: string) => Promise<void>;
}

const Ctx = React.createContext<AdminContextValue | null>(null);

/* ── Provider ─────────────────────────────────────────────────────────────── */

const ADMIN_KEY_STORAGE = "lc.admin.key";

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [adminKey, setAdminKeyState] = React.useState("");
  const [toast, setToast] = React.useState<ToastMsg>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // Hydrate admin key from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(ADMIN_KEY_STORAGE);
      if (stored) setAdminKeyState(stored);
    } catch {}
  }, []);

  const setAdminKey = React.useCallback((key: string) => {
    setAdminKeyState(key);
    try { localStorage.setItem(ADMIN_KEY_STORAGE, key); } catch {}
  }, []);

  const push = React.useCallback((text: string, kind: ToastKind = "info") => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const waitReceipt = React.useCallback(async (hash: Hex) => {
    if (!pc) return;
    setBusy("Waiting for confirmation…");
    await pc.waitForTransactionReceipt({ hash });
    setBusy(null);
  }, [pc]);

  const contractWrite = React.useCallback(
    async (address: `0x${string}`, abi: Abi, fn: string, args: any[], successMsg: string) => {
      try {
        setBusy("Sending transaction…");
        const tx = await writeContractAsync({
          address,
          abi,
          functionName: fn as any,
          args,
        });
        await waitReceipt(tx);
        push(successMsg, "ok");
      } catch (e: any) {
        setBusy(null);
        push(e?.shortMessage || e?.message || "Transaction failed", "bad");
      }
    },
    [writeContractAsync, waitReceipt, push]
  );

  const cpWrite = React.useCallback(
    (fn: string, args: any[], successMsg: string) =>
      contractWrite(ADDR.ChallengePay, ABI.ChallengePay as Abi, fn, args, successMsg),
    [contractWrite]
  );

  const treasuryWrite = React.useCallback(
    (fn: string, args: any[], successMsg: string) =>
      contractWrite(ADDR.Treasury, ABI.Treasury as Abi, fn, args, successMsg),
    [contractWrite]
  );

  const value = React.useMemo<AdminContextValue>(
    () => ({ adminKey, setAdminKey, toast, push, busy, setBusy, waitReceipt, cpWrite, treasuryWrite }),
    [adminKey, setAdminKey, toast, push, busy, setBusy, waitReceipt, cpWrite, treasuryWrite]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useAdmin(): AdminContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
