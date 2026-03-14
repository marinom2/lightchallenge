/**
 * webapp/lib/registryWriter.ts
 *
 * Server-side module for writing metadata URIs to MetadataRegistry on-chain.
 * Used by the POST /api/challenges route after DB upsert.
 *
 * Signer: METADATA_REGISTRY_KEY env var (falls back to ADMIN_KEY).
 * Write policy: ownerSet() is write-once; AlreadySet revert is treated as success.
 *
 * This module is SERVER-ONLY. Do not import from client components.
 */

import { createWalletClient, createPublicClient, http } from "viem";
import type { Hex, Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { lightchain, RPC_URL as LIGHTCHAIN_RPC } from "./lightchain";
import { ABI, ADDR, ZERO_ADDR } from "./contracts";

// ─── Config ──────────────────────────────────────────────────────────────────

const REGISTRY_KEY =
  process.env.METADATA_REGISTRY_KEY || process.env.ADMIN_KEY || "";

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");

// RPC: prefer server-side env, then lightchain module default
const SERVER_RPC =
  process.env.RPC_URL ||
  process.env.LIGHTCHAIN_RPC ||
  process.env.LIGHTCHAIN_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  LIGHTCHAIN_RPC;

// ─── Types ───────────────────────────────────────────────────────────────────

export type RegistryWriteResult = {
  success: boolean;
  txHash?: string;
  error?: string;
  /** true if the URI was already set on-chain (write-once idempotent) */
  alreadySet?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return (
    !!REGISTRY_KEY &&
    ADDR.MetadataRegistry !== ZERO_ADDR &&
    ADDR.ChallengePay !== ZERO_ADDR
  );
}

/** Build the canonical metadata URI for a challenge. */
export function buildMetadataUri(challengeId: bigint | string | number): string {
  return `${BASE_URL}/api/challenges/meta/${String(challengeId)}`;
}

// ─── Core writer ─────────────────────────────────────────────────────────────

/**
 * Attempt to write a metadata URI to MetadataRegistry via ownerSet().
 *
 * If the URI is already set on-chain (AlreadySet revert), returns success=true
 * with alreadySet=true — the write-once invariant is preserved.
 *
 * Returns immediately with success=false if signer or addresses are not configured.
 */
export async function writeRegistryUri(
  challengeId: bigint | string | number,
  uri?: string
): Promise<RegistryWriteResult> {
  if (!isConfigured()) {
    return {
      success: false,
      error: "Registry writer not configured (METADATA_REGISTRY_KEY + addresses required)",
    };
  }

  if (!BASE_URL && !uri) {
    return {
      success: false,
      error: "NEXT_PUBLIC_BASE_URL not set and no explicit URI provided",
    };
  }

  const metadataUri = uri || buildMetadataUri(challengeId);

  try {
    const account = privateKeyToAccount(REGISTRY_KEY as Hex);

    const walletClient = createWalletClient({
      account,
      chain: lightchain,
      transport: http(SERVER_RPC),
    });

    const txHash = await walletClient.writeContract({
      address: ADDR.MetadataRegistry as `0x${string}`,
      abi: ABI.MetadataRegistry as Abi,
      functionName: "ownerSet",
      args: [ADDR.ChallengePay as `0x${string}`, BigInt(challengeId), metadataUri],
    });

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain: lightchain,
      transport: http(SERVER_RPC),
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { success: true, txHash };
  } catch (e: any) {
    const msg: string = e?.shortMessage || e?.message || String(e);

    // AlreadySet revert = URI was written before. This is success.
    if (msg.includes("AlreadySet")) {
      return { success: true, alreadySet: true };
    }

    return { success: false, error: msg };
  }
}

/**
 * Check if a URI is already set on-chain for a challenge.
 * Returns the URI string (empty = not set).
 */
export async function readRegistryUri(
  challengeId: bigint | string | number
): Promise<string> {
  if (ADDR.MetadataRegistry === ZERO_ADDR || ADDR.ChallengePay === ZERO_ADDR) {
    return "";
  }

  try {
    const publicClient = createPublicClient({
      chain: lightchain,
      transport: http(SERVER_RPC),
    });

    const result = await publicClient.readContract({
      address: ADDR.MetadataRegistry as `0x${string}`,
      abi: ABI.MetadataRegistry as Abi,
      functionName: "uri",
      args: [ADDR.ChallengePay as `0x${string}`, BigInt(challengeId)],
    });

    return (result as string) || "";
  } catch {
    return "";
  }
}

/** Returns true if the registry writer is configured and can attempt writes. */
export function isRegistryWriterConfigured(): boolean {
  return isConfigured() && !!BASE_URL;
}
