// scripts/ops/finalize.ts
//
// Finalize a challenge. Explains common revert causes (peers/proof/deadlines).
// Optional polling mode (POLL=1) to wait until finalize is allowed.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> \
//   npx hardhat run scripts/ops/finalize.ts --network <net>
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import { context, header, info, fail } from "../dev/utils";

function fmt(n: bigint | number) {
  const b = typeof n === "bigint" ? n : BigInt(n);
  return ethers.formatUnits(b, 18);
}
const iso = (s: number | bigint) => new Date(Number(s) * 1000).toISOString();

async function tryFinalize(cp: any, id: bigint) {
  const tx = await cp.finalize(id);
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);

  const s2 = await cp.getSnapshot(id);
  if (s2.set) {
    console.log("\nSnapshot set ✓");
    console.log("  success:", s2.success);
    console.log("  winnersPool:", fmt(s2.winnersPool));
    console.log("  losersPool :", fmt(s2.losersPool));
    console.log("  validatorsAmt:", fmt(s2.validatorsAmt));
    console.log("  perValidatorAmt:", fmt(s2.perValidatorAmt));
  } else {
    console.log("\nNo snapshot (reject path). Refunds & fees handled immediately.");
  }
  console.log("\n✅ Finalize complete.");
}

async function main() {
  header("Finalize Challenge");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const me = await signer.getAddress();
  info("Network", net || network.name);
  info("Sender", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  const latest = await ethers.provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));

  const ch = await cp.getChallenge(id);
  console.log("status:", Number(ch.status), "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("outcome:", Number(ch.outcome), "(0=None,1=Success,2=Fail)");
  console.log("approvalDeadline:", Number(ch.approvalDeadline), "now:", now, `(${iso(now)})`);
  console.log("startTs:", Number(ch.startTs), `(${iso(Number(ch.startTs))})`);

  // Helpful hints before sending
  if (Number(ch.status) === 0 && now <= Number(ch.approvalDeadline)) {
    console.log("\nℹ️ Pending before approvalDeadline — finalize will REVERT (BeforeDeadline).\n");
  }
  if (Number(ch.status) === 1) {
    // Approved → check peers/proof
    const peerNeeded = Number(ch.peerApprovalsNeeded);
    if (peerNeeded > 0) {
      const peerCount = Number(ch.peerApprovals);
      console.log(`peer approvals: ${peerCount} / ${peerNeeded}`);
      if (peerCount < peerNeeded) console.log("⚠️ PeersNotMet likely if you finalize now.");
    }
    if (ch.proofRequired) {
      console.log("proofRequired: true");
      // getSnapshot is only after finalize; rely on c.proofOk
      if (!ch.proofOk) console.log("Note: Proof not verified yet — finalize will REVERT (ProofRequired).");
    }
  }

  if (String(process.env.POLL || "0") !== "1") {
    // one-shot finalize (original behavior)
    try {
      await tryFinalize(cp, id);
    } catch (e: any) {
      const m = (e?.error?.message || e?.message || "").toLowerCase();
      console.log("\n❌ Finalize reverted.");
      if (m.includes("beforedeadline")) console.log("- Still before approvalDeadline for a Pending challenge.");
      if (m.includes("peersnotmet")) console.log("- Not enough peer approvals.");
      if (m.includes("proofrequired")) console.log("- Proof is required and not yet verified.");
      if (m.includes("pausedorcanceled")) console.log("- Challenge is paused or canceled.");
      console.log("\nDetails:", e?.message || e);
    }
    return;
  }

  // POLLING MODE
  const SLEEP_MS = Number(process.env.SLEEP_MS ?? "5000");
  const MAX_MINUTES = Number(process.env.MAX_MINUTES ?? "180");
  const t0 = Date.now();

  console.log(`\n⏳ Polling until finalize is allowed (every ${SLEEP_MS}ms, max ${MAX_MINUTES}m)…`);

  for (;;) {
    const now2 = Number((await ethers.provider.getBlock("latest"))!.timestamp);
    const c = await cp.getChallenge(id);

    const statusName = ["Pending","Approved","Rejected","Finalized"][Number(c.status)] || String(c.status);
    console.log(
      `now=${now2} (${iso(now2)}) | status=${statusName} | ` +
      `approvalDeadline=${c.approvalDeadline} (${iso(Number(c.approvalDeadline))}) | ` +
      `startTs=${c.startTs} (${iso(Number(c.startTs))}) | proofRequired=${c.proofRequired} | proofOk=${c.proofOk}`
    );

    const can =
      now2 >= Number(c.approvalDeadline) &&
      now2 >= Number(c.startTs) &&
      (!c.proofRequired || c.proofOk);

    if (can) {
      try {
        await tryFinalize(cp, id);
        break;
      } catch (e: any) {
        console.log("Finalize attempt reverted, will retry…", e?.message || e);
      }
    }

    if ((Date.now() - t0) / 60000 > MAX_MINUTES) {
      throw new Error(`Gave up after ${MAX_MINUTES} minutes`);
    }
    await new Promise(res => setTimeout(res, SLEEP_MS));
  }
}

main().catch(fail);