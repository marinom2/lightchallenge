// webapp/lib/contracts.ts
import type { Abi, Address } from "viem";
import {
  isAddress,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from "viem";

import {
  CHAIN_ID as CHAIN_ID_ENV,
  RPC_URL as RPC_URL_ENV,
  EXPLORER_URL as EXPLORER_URL_ENV,
  CHALLENGEPAY_ADDR as CHALLENGEPAY_ENV,
  TREASURY_ADDR as TREASURY_ENV,
  AUTO_APPROVAL_STRATEGY as STRAT_ENV,
} from "@/lib/env";

import deploymentsJson from "@/public/deployments/lightchain.json";

/* ────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────── */
export type Deployments = {
  chainId: number;
  rpcUrl?: string;
  contracts: Partial<Record<string, string | undefined>>;
};

export const DEPLOYMENTS = deploymentsJson as Deployments;

/* ────────────────────────────────────────────────────────────────
   Address helpers
   ──────────────────────────────────────────────────────────────── */
export const ZERO_ADDR =
  "0x0000000000000000000000000000000000000000" as const;

export function safeAddr(a?: string | null): `0x${string}` {
  return ((a && isAddress(a as Address)) ? a : ZERO_ADDR) as `0x${string}`;
}

export function ensureNonZero(a: `0x${string}`, name = "address"): `0x${string}` {
  if (a === ZERO_ADDR) throw new Error(`Missing deployment address for ${name}`);
  return a;
}

function depAddr(name: string): Address | null {
  const raw = DEPLOYMENTS?.contracts?.[name];
  if (!raw) return null;
  if (!isAddress(raw as Address)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[deployments] "${name}" is not a valid address:`, raw);
    }
    return null;
  }
  return raw as Address;
}

/* ────────────────────────────────────────────────────────────────
   ABIs
   ──────────────────────────────────────────────────────────────── */
import ChallengePayAbiJson from "@/public/abi/ChallengePay.abi.json";
import TreasuryAbiJson from "@/public/abi/Treasury.abi.json";
import EventChallengeRouterAbiJson from "@/public/abi/EventChallengeRouter.abi.json";
import MetadataRegistryAbiJson from "@/public/abi/MetadataRegistry.abi.json";
import AutoApprovalStrategyAbiJson from "@/public/abi/AutoApprovalStrategy.abi.json";
import ERC20AbiJson from "@/public/abi/ERC20.abi.json";

type AbiLike = Abi | { abi: Abi };
const asAbi = (x: unknown): Abi =>
  Array.isArray(x) ? (x as Abi) : ((x as any)?.abi as Abi);

export const ABI: Record<string, Abi> = {
  ChallengePay: asAbi(ChallengePayAbiJson),
  Treasury: asAbi(TreasuryAbiJson),
  EventChallengeRouter: asAbi(EventChallengeRouterAbiJson),
  MetadataRegistry: asAbi(MetadataRegistryAbiJson),
  AutoApprovalStrategy: asAbi(AutoApprovalStrategyAbiJson),
  ERC20: asAbi(ERC20AbiJson),
};

export async function loadAbi(name: string): Promise<Abi> {
  const staticAbi = (ABI as Record<string, Abi | undefined>)[name];
  if (staticAbi) return staticAbi;

  const res = await fetch(`/abi/${name}.abi.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`ABI for ${name} not found at /abi/${name}.abi.json`);
  const j = await res.json();
  return asAbi(j as AbiLike);
}

/* ────────────────────────────────────────────────────────────────
   Effective chain config
   ──────────────────────────────────────────────────────────────── */
const EFFECTIVE_CHAIN_ID =
  (DEPLOYMENTS?.chainId && Number.isFinite(DEPLOYMENTS.chainId) ? DEPLOYMENTS.chainId : 0) ||
  (Number.isFinite(CHAIN_ID_ENV) && CHAIN_ID_ENV) ||
  504;

const SERVER_RPC_URL =
  DEPLOYMENTS?.rpcUrl ||
  RPC_URL_ENV ||
  "https://light-testnet-rpc.lightchain.ai";

export const RPC_URL: string =
  typeof window === "undefined" ? SERVER_RPC_URL : "/api/rpc";

export const EXPLORER_URL =
  EXPLORER_URL_ENV || "https://testnet.lightscan.app";

/* ────────────────────────────────────────────────────────────────
   Addresses
   ──────────────────────────────────────────────────────────────── */
export const ADDR = {
  ChallengePay: safeAddr(depAddr("ChallengePay")),
  Treasury: safeAddr(depAddr("Treasury")),
  EventChallengeRouter: safeAddr(depAddr("EventChallengeRouter")),
  MetadataRegistry: safeAddr(depAddr("MetadataRegistry")),
  AutoApprovalStrategy: safeAddr(depAddr("AutoApprovalStrategy")),
  ChallengeTaskRegistry: safeAddr(depAddr("ChallengeTaskRegistry")),
  ChallengePayAivmPoiVerifier: safeAddr(depAddr("ChallengePayAivmPoiVerifier")),
  AIVMInferenceV2: safeAddr(depAddr("AIVMInferenceV2")),
  TrustedForwarder: safeAddr(depAddr("TrustedForwarder")),
  Protocol: safeAddr(depAddr("Protocol")),
} as const;

export type KnownContract =
  | "ChallengePay"
  | "Treasury"
  | "EventChallengeRouter"
  | "MetadataRegistry"
  | "AutoApprovalStrategy";

export const CHALLENGEPAY_ADDR = ADDR.ChallengePay;
export const TREASURY_ADDR = ADDR.Treasury;
export const AUTO_APPROVAL_STRATEGY_ADDR = ADDR.AutoApprovalStrategy;
export const CHALLENGE_TASK_REGISTRY_ADDR = ADDR.ChallengeTaskRegistry;
export const CHALLENGEPAY_AIVM_POI_VERIFIER_ADDR = ADDR.ChallengePayAivmPoiVerifier;
export const AIVM_INFERENCE_V2_ADDR = ADDR.AIVMInferenceV2;

/* ────────────────────────────────────────────────────────────────
   Dev mismatch warnings
   ──────────────────────────────────────────────────────────────── */
if (process.env.NODE_ENV !== "production") {
  const pairs: Array<[string, string | undefined, string]> = [
    ["NEXT_PUBLIC_CHALLENGEPAY_ADDR", CHALLENGEPAY_ENV, ADDR.ChallengePay],
    ["NEXT_PUBLIC_TREASURY_ADDR", TREASURY_ENV, ADDR.Treasury],
    ["NEXT_PUBLIC_AUTO_APPROVAL_STRATEGY", STRAT_ENV, ADDR.AutoApprovalStrategy],
  ];

  for (const [key, envVal, depVal] of pairs) {
    if (!envVal) continue;
    if (envVal !== depVal && depVal !== ZERO_ADDR) {
      console.warn(
        `[env/deployments mismatch] ${key}=${envVal} but deployments has ${depVal}. ` +
          `UI uses deployments. Update .env.local or remove the var.`
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────
   viem clients
   ──────────────────────────────────────────────────────────────── */
export const publicClient = createPublicClient({
  chain: {
    id: EFFECTIVE_CHAIN_ID,
    name: "lightchain",
    nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
    blockExplorers: { default: { name: "Explorer", url: EXPLORER_URL } },
  },
  transport: http(RPC_URL),
});

export function makeWalletClient(opts: { account: Address; rpcUrl?: string }) {
  const rpc = opts.rpcUrl || (typeof window === "undefined" ? SERVER_RPC_URL : "/api/rpc");

  return createWalletClient({
    account: opts.account,
    chain: {
      id: EFFECTIVE_CHAIN_ID,
      name: "lightchain",
      nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
      blockExplorers: { default: { name: "Explorer", url: EXPLORER_URL } },
    },
    transport: http(rpc),
  });
}

/* ────────────────────────────────────────────────────────────────
   viem contract getters
   ──────────────────────────────────────────────────────────────── */
export async function getViemContract<TName extends KnownContract>(name: TName) {
  const address = ADDR[name];
  const abi = (ABI as Record<string, Abi | undefined>)[name] ?? (await loadAbi(name));
  return getContract({ address, abi, client: { public: publicClient } });
}

export async function getViemContractStrict<TName extends KnownContract>(name: TName) {
  const addr = ensureNonZero(ADDR[name], name);
  const abi = (ABI as Record<string, Abi | undefined>)[name] ?? (await loadAbi(name));
  return getContract({ address: addr, abi, client: { public: publicClient } });
}

export async function getAutoApprovalStatus() {
  if (ADDR.AutoApprovalStrategy === ZERO_ADDR) {
    return { ok: false, reason: "Strategy address is zero" };
  }

  const [paused, requireAllow, nativeAllowed] = await Promise.all([
    publicClient.readContract({
      address: ADDR.AutoApprovalStrategy,
      abi: ABI.AutoApprovalStrategy,
      functionName: "paused",
    }) as Promise<boolean>,
    publicClient.readContract({
      address: ADDR.AutoApprovalStrategy,
      abi: ABI.AutoApprovalStrategy,
      functionName: "requireCreatorAllowlist",
    }) as Promise<boolean>,
    publicClient.readContract({
      address: ADDR.AutoApprovalStrategy,
      abi: ABI.AutoApprovalStrategy,
      functionName: "allowNative",
    }) as Promise<boolean>,
  ]);

  return { ok: !paused, paused, requireAllow, nativeAllowed };
}