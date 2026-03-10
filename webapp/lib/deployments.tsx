"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export type DeploymentsFile = {
  chainId: number;
  rpcUrl?: string;
  contracts: Partial<Record<string, string>>;
};

let _cache: DeploymentsFile | null = null;
let _inFlight: Promise<DeploymentsFile> | null = null;

export async function fetchDeployments(): Promise<DeploymentsFile> {
  if (_cache) return _cache;
  if (_inFlight) return _inFlight;

  _inFlight = fetch("/deployments/lightchain.json", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Failed to load deployments: ${r.status}`);
      return (await r.json()) as DeploymentsFile;
    })
    .then((j) => {
      _cache = j;
      return j;
    })
    .finally(() => {
      _inFlight = null;
    });

  return _inFlight;
}

type DeploymentsCtx = {
  deployments: DeploymentsFile | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export const DeploymentsContext = createContext<DeploymentsCtx>({
  deployments: null,
  isLoading: true,
  error: null,
  refetch: () => {},
});

export function DeploymentsProvider({ children }: React.PropsWithChildren) {
  const q = useQuery<DeploymentsFile>({
    queryKey: ["deployments", "lightchain"],
    queryFn: fetchDeployments,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const value = useMemo<DeploymentsCtx>(
    () => ({
      deployments: q.data ?? null,
      isLoading: q.isLoading,
      error: (q.error as any)?.message ?? null,
      refetch: () => void q.refetch(),
    }),
    [q.data, q.isLoading, q.error, q.refetch]
  );

  return (
    <DeploymentsContext.Provider value={value}>
      {children}
    </DeploymentsContext.Provider>
  );
}

export function useDeployments() {
  return useContext(DeploymentsContext);
}