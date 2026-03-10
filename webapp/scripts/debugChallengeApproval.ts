
import { ABI, ADDR, publicClient } from "../lib/contracts";
import type { Address } from "viem";

const STATUS_LABEL = ["Pending", "Approved", "Rejected", "Finalized"] as const;

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: tsx scripts/debugChallengeApproval.ts <id>");
  const id = BigInt(raw);

  const c: any = await publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getChallenge",
    args: [id],
  });

  const statusNum = Number(c.status ?? c[2]);
  const statusLabel = STATUS_LABEL[statusNum] ?? `Unknown(${statusNum})`;

  console.log("--- Challenge ---");
  console.log("id         :", String(c.id ?? c[0] ?? id));
  console.log("status     :", statusNum, `(${statusLabel})`);
  console.log("startTs    :", String(c.startTs ?? c[10]));
  console.log("duration   :", String(c.duration ?? c[11]));
  const curr = Number(c.currency ?? c[5]);
  console.log("currency   :", curr, curr === 0 ? "(native)" : "(erc20)");
  console.log("token      :", String(c.token ?? c[6]));
  console.log("creator    :", String(c.challenger ?? c[4]));

  // Strategy addr: prefer env, else deployments/env wiring
  const stratAddr = (process.env.NEXT_PUBLIC_AUTO_APPROVAL_STRATEGY || ADDR.AutoApprovalStrategy) as Address;

  const [paused, allowNative, minLeadTime, maxDuration] = await Promise.all([
    publicClient.readContract({ abi: ABI.AutoApprovalStrategy, address: stratAddr, functionName: "paused" }) as Promise<boolean>,
    publicClient.readContract({ abi: ABI.AutoApprovalStrategy, address: stratAddr, functionName: "allowNative" }) as Promise<boolean>,
    publicClient.readContract({ abi: ABI.AutoApprovalStrategy, address: stratAddr, functionName: "minLeadTime" }) as Promise<bigint>,
    publicClient.readContract({ abi: ABI.AutoApprovalStrategy, address: stratAddr, functionName: "maxDuration" }) as Promise<bigint>,
  ]);

  const [globalPaused, useAllowlist, minLead, maxLead] = await Promise.all([
    publicClient.readContract({ abi: ABI.ChallengePay, address: ADDR.ChallengePay as Address, functionName: "globalPaused" }) as Promise<boolean>,
    publicClient.readContract({ abi: ABI.ChallengePay, address: ADDR.ChallengePay as Address, functionName: "useTokenAllowlist" }) as Promise<boolean>,
    publicClient.readContract({ abi: ABI.ChallengePay, address: ADDR.ChallengePay as Address, functionName: "minLeadTime" }) as Promise<bigint>,
    publicClient.readContract({ abi: ABI.ChallengePay, address: ADDR.ChallengePay as Address, functionName: "maxLeadTime" }) as Promise<bigint>,
  ]);

  console.log("\n--- ChallengePay knobs ---");
  console.log("globalPaused  :", globalPaused);
  console.log("useAllowlist  :", useAllowlist);
  console.log("minLeadTime   :", Number(minLead), "sec");
  console.log("maxLeadTime   :", Number(maxLead), "sec");

  // Ask the strategy what it would do for this config
  const [_allow, _autoApprove] = await publicClient.readContract({
    abi: ABI.AutoApprovalStrategy,
    address: stratAddr,
    functionName: "onCreate",
    args: [
      BigInt(c.id ?? c[0] ?? id),
      (c.challenger ?? c[4]) as Address,
      (c.token ?? c[6]) as Address,
      Number(c.currency ?? c[5]),
      BigInt(c.startTs ?? c[10]),
      BigInt(c.duration ?? c[11]),
      "0x",
    ],
  }) as unknown as [boolean, boolean];

  console.log("\n--- Strategy ---");
  console.log("address     :", stratAddr);
  console.log("paused      :", paused);
  console.log("allowNative :", allowNative);
  console.log("minLead     :", Number(minLeadTime), "sec");
  console.log("maxDuration :", Number(maxDuration), "sec");
  console.log("allow       :", _allow);
  console.log("autoApprove :", _autoApprove);

  if (paused) {
    console.log("\nReason: Strategy is paused → challenges remain Pending.");
  } else if (!_allow) {
    console.log("\nReason: Strategy would reject this config (token/currency/lead/duration rule).");
  } else if (!_autoApprove) {
    console.log("\nReason: Strategy allows but does NOT auto-approve → challenge stays Pending until a validator approves.");
  } else {
    console.log("\nStrategy indicates it should auto-approve. If still Pending, check event listeners/keepers.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });