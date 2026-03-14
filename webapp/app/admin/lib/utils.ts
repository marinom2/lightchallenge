import type { Address } from "viem";
import { getAddress, isAddress, keccak256, toBytes } from "viem";
import { ADDR } from "@/lib/contracts";

export const ZERO: Address = "0x0000000000000000000000000000000000000000";

export const OPERATOR_ROLE = keccak256(toBytes("OPERATOR_ROLE"));
export const SWEEPER_ROLE = keccak256(toBytes("SWEEPER_ROLE"));

export const AUTO_POI_VERIFIER: string | undefined = ADDR.ChallengePayAivmPoiVerifier;

export const addrRegex = /^0x[a-fA-F0-9]{40}$/;
export const bytes32Regex = /^0x[0-9a-fA-F]{64}$/;

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const okAddr = (a?: string) => {
  try { return a && isAddress(a) ? getAddress(a) : undefined; } catch { return undefined; }
};

export const toBigintOrZero = (v: string) => {
  try { return BigInt(v || "0"); } catch { return 0n; }
};

export const cn = (...x: (string | false | undefined)[]) => x.filter(Boolean).join(" ");

export function aivmHashFromId(id: string): `0x${string}` {
  return keccak256(toBytes(id.trim())) as `0x${string}`;
}

export const pretty = (o: any) => { try { return JSON.stringify(o, null, 2); } catch { return ""; } };

export const parseJSON = <T = any>(s: string): T | null => { try { return JSON.parse(s) as T; } catch { return null; } };
