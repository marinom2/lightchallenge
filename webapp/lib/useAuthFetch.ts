/**
 * webapp/lib/useAuthFetch.ts
 *
 * Shared auth utilities for v1 API calls from the frontend.
 * Automatically includes wallet address header when connected.
 */

"use client";

import { useAccount } from "wagmi";
import { useCallback } from "react";

/**
 * Returns a fetch wrapper that auto-injects x-lc-address header
 * when the user's wallet is connected.
 */
export function useAuthFetch() {
  const { address } = useAccount();

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
        headers.set("Content-Type", "application/json");
      }
      if (address) {
        headers.set("x-lc-address", address);
      }
      return fetch(url, { ...init, headers });
    },
    [address],
  );

  return { authFetch, address };
}

/**
 * Simple auth headers object for use outside React hooks.
 */
export function authHeaders(address: string | undefined): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (address) h["x-lc-address"] = address;
  return h;
}
