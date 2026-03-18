// app/proofs/hooks/useProofCapability.ts
//
// React hook that wraps the VCE engine with async account-binding checks.
// Returns a fully-resolved ProofCapability object for a given challenge.
"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  detectSource,
  computePrimaryAction,
  primaryActionLabel,
  initAdapterHashes,
  type SourceInfo,
  type PrimaryAction,
  type ChallengeMeta,
} from "@/lib/verificationCapability";

export interface ProofCapability extends SourceInfo {
  accountConnected: boolean;
  accountHandle: string | null;
  accountPlatformId: string | null;
  accountLoading: boolean;
  primaryAction: PrimaryAction;
  primaryLabel: string;
  /** True when the provider is OAuth-linked (e.g. Strava) for auto-collection */
  oauthLinked: boolean;
}

interface Options {
  /** Skip account check if false. Default true. */
  checkAccount?: boolean;
}

// Module-level flag — init adapter hashes from model registry once per page load
let _vceInitialized = false;

export function useProofCapability(
  meta: ChallengeMeta | null | undefined,
  opts: Options = {}
): ProofCapability {
  const { checkAccount = true } = opts;
  const { address, isConnected } = useAccount();

  // Initialize VCE adapter hashes from model registry (once per page load)
  const [vceReady, setVceReady] = useState(_vceInitialized);
  useEffect(() => {
    if (_vceInitialized) return;
    fetch("/api/admin/models", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const models = j?.models ?? [];
        if (models.length > 0) initAdapterHashes(models);
        _vceInitialized = true;
        setVceReady(true);
      })
      .catch(() => { _vceInitialized = true; setVceReady(true); });
  }, []);

  const source = meta ? detectSource(meta) : detectSource({});

  const [accountConnected, setAccountConnected] = useState(false);
  const [accountHandle, setAccountHandle] = useState<string | null>(null);
  const [accountPlatformId, setAccountPlatformId] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [oauthLinked, setOauthLinked] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Check identity_bindings for gaming platforms (steam, riot)
  useEffect(() => {
    if (!checkAccount || !source.accountPlatform || !isConnected || !address) {
      setAccountConnected(false);
      setAccountHandle(null);
      setAccountPlatformId(null);
      setAccountLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAccountLoading(true);

    fetch(
      `/api/linked-accounts?wallet=${encodeURIComponent(address)}&platform=${source.accountPlatform}`,
      { cache: "no-store", signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((j) => {
        const b = j?.binding ?? null;
        setAccountConnected(!!b);
        setAccountHandle(b?.handle ?? null);
        setAccountPlatformId(b?.platformId ?? null);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setAccountConnected(false);
        setAccountHandle(null);
        setAccountPlatformId(null);
      })
      .finally(() => setAccountLoading(false));

    return () => ctrl.abort();
  }, [checkAccount, source.accountPlatform, isConnected, address]);

  // Check linked_accounts for OAuth providers — auto-collection indicator
  const OAUTH_SOURCE_PROVIDERS: Record<string, string> = { strava: "strava", fitbit: "fitbit" };
  const oauthProvider = OAUTH_SOURCE_PROVIDERS[source.type] ?? null;

  useEffect(() => {
    if (!oauthProvider || !isConnected || !address) {
      setOauthLinked(false);
      return;
    }
    fetch(`/api/accounts/link?subject=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const accounts = j?.accounts ?? [];
        setOauthLinked(accounts.some((a: any) => a.provider === oauthProvider));
      })
      .catch(() => setOauthLinked(false));
  }, [oauthProvider, isConnected, address]);

  const action = computePrimaryAction(source, accountConnected);

  return {
    ...source,
    accountConnected,
    accountHandle,
    accountPlatformId,
    accountLoading,
    primaryAction: action,
    primaryLabel: primaryActionLabel(action, source),
    oauthLinked,
  };
}
