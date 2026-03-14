// scripts/debug/_shared.ts
import { ethers, artifacts, network } from "hardhat";
import { AbiCoder, Interface } from "ethers";
import * as fs from "fs";
import * as path from "path";

export const FALLBACK_CHALLENGE_PAY = "0x98E225E40A353899bBCcD51C26246dFF64CbE85d";

export function tryLoadDeployedAddress(): string | null {
  const p = path.join(process.cwd(), "deployments", network.name, "ChallengePay.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const addr = j?.address ?? j?.ContractAddress ?? j?.challengePay ?? null;
    if (typeof addr === "string" && addr.startsWith("0x") && addr.length === 42) return addr;
  } catch {
    // ignore
  }
  return null;
}

export function pickRevertData(e: any): string | undefined {
  return e?.data ?? e?.error?.data ?? e?.info?.error?.data ?? undefined;
}

function decodeStdRevert(dataHex: string): string | null {
  if (!dataHex || dataHex === "0x") return null;

  // Error(string)
  if (dataHex.startsWith("0x08c379a0")) {
    try {
      const abi = new AbiCoder();
      const decoded = abi.decode(["string"], "0x" + dataHex.slice(10));
      return `Error(string): ${decoded[0]}`;
    } catch {
      return "Error(string): <failed to decode>";
    }
  }

  // Panic(uint256)
  if (dataHex.startsWith("0x4e487b71")) {
    try {
      const abi = new AbiCoder();
      const decoded = abi.decode(["uint256"], "0x" + dataHex.slice(10));
      return `Panic(uint256): ${decoded[0].toString()}`;
    } catch {
      return "Panic(uint256): <failed to decode>";
    }
  }

  return null;
}

export async function decodeRevert(dataHex: string | undefined) {
  if (!dataHex || dataHex === "0x") {
    console.log("decoded: <no revert data>");
    return { name: "<none>" };
  }

  console.log("revert data:", dataHex);

  const std = decodeStdRevert(dataHex);
  if (std) {
    console.log("decoded:", std);
    return { name: "std", detail: std };
  }

  const names = ["ChallengePay", "Treasury", "EventChallengeRouter"];
  for (const n of names) {
    try {
      const art = await artifacts.readArtifact(n);
      const iface = new Interface(art.abi);
      const parsed = iface.parseError(dataHex);
      console.log(`decoded custom error (${n}):`, parsed.name, parsed.args);
      return { name: parsed.name, args: parsed.args };
    } catch {
      // keep trying
    }
  }

  console.log("decoded: <unknown revert signature>");
  return { name: "<unknown>" };
}

export async function ethCallDryRun(opts: { from: string; to: string; data: string; value?: bigint }) {
  try {
    await ethers.provider.call(opts as any);
    return { ok: true as const };
  } catch (e: any) {
    const decoded = await decodeRevert(pickRevertData(e));
    return { ok: false as const, decoded, raw: e };
  }
}

export async function getChallengePayAddress(): Promise<string> {
  const addrFromFile = tryLoadDeployedAddress();
  return addrFromFile ?? process.env.CHALLENGE_PAY ?? FALLBACK_CHALLENGE_PAY;
}

export async function getChallengePayInterface(): Promise<Interface> {
  const art = await artifacts.readArtifact("ChallengePay");
  return new Interface(art.abi);
}

export async function getLastChallengeId(challengePayAddr: string): Promise<bigint> {
  const iface = await getChallengePayInterface();
  const data = iface.encodeFunctionData("nextChallengeId", []);
  const raw = await ethers.provider.call({ to: challengePayAddr, data });
  const [nextId] = new AbiCoder().decode(["uint256"], raw);
  const n = BigInt(nextId.toString());
  if (n === 0n) throw new Error("nextChallengeId() == 0");
  return n - 1n;
}

export function envBigint(name: string): bigint | null {
  const v = process.env[name];
  if (!v) return null;
  if (v.startsWith("0x")) return BigInt(v);
  return BigInt(v);
}