// scripts/exportChallenge.ts
import fs from "fs";
import { context, header, info, fmtWei, fail } from "../dev/utils";

function bps(x: bigint, b: number) { return (x * BigInt(b)) / 10_000n; }

async function main() {
  header("Export Challenge → JSON");

  const { cp, net, addr, signer } = await context();

  const idStr = process.env.CH_ID ?? "";
  const outPath = process.env.OUT ?? `snapshots/challenge-${idStr || "latest"}.json`;
  if (!/^\d+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(idStr);

  info("Network", net);
  info("Reader", await signer.getAddress());
  info("Contract", addr);
  info("Challenge", id.toString());
  info("Output", outPath);

  const ch = await cp.getChallenge(id);
  const f  = await cp.feeConfig();

  const poolS: bigint = ch.poolSuccess;
  const poolF: bigint = ch.poolFail;
  const charityBps: number = Number(ch.charityBps ?? 0);

  const calc = (success: boolean) => {
    const winners = success ? poolS : poolF;
    const losers  = success ? poolF : poolS;
    const loserCashback = bps(losers, Number(f.loserCashbackBps));
    const losersAfterCashback = losers - loserCashback;
    const charity   = bps(losersAfterCashback, charityBps);
    const dao       = bps(losersAfterCashback, Number(f.daoBps));
    const creator   = bps(losersAfterCashback, Number(f.creatorBps));
    const validators= bps(losersAfterCashback, Number(f.validatorsBps));
    const distributable = losersAfterCashback - charity - (dao + creator + validators);
    return { winners, losers, loserCashback, losersAfterCashback, charity, dao, creator, validators, distributable };
  };

  const successPreview = calc(true);
  const failPreview    = calc(false);

  const payload = {
    meta: {
      network: net,
      contract: addr,
      challengeId: id.toString(),
      exportedAt: new Date().toISOString()
    },
    challenge: {
      status: Number(ch.status),
      outcome: Number(ch.outcome),
      challenger: ch.challenger,
      currency: Number(ch.currency),
      token: ch.token,
      stake: fmtWei(ch.stake),
      proposalBond: fmtWei(ch.proposalBond),
      approvalDeadline: Number(ch.approvalDeadline),
      startTs: Number(ch.startTs),
      maxParticipants: Number(ch.maxParticipants),
      peers: ch.peers,
      peerApprovalsNeeded: Number(ch.peerApprovalsNeeded),
      peerApprovals: Number(ch.peerApprovals),
      peerRejections: Number(ch.peerRejections),
      charityBps: Number(ch.charityBps),
      charity: ch.charity,
      poolSuccess: fmtWei(ch.poolSuccess),
      poolFail: fmtWei(ch.poolFail),
      proofRequired: Boolean(ch.proofRequired),
      verifier: ch.verifier,
      proofOk: Boolean(ch.proofOk),
      participantsCount: Number(ch.participantsCount),
      yesWeight: fmtWei(ch.yesWeight),
      noWeight: fmtWei(ch.noWeight),
      partWeight: fmtWei(ch.partWeight)
    },
    feeConfig: {
      losersFeeBps: Number(f.losersFeeBps),
      daoBps: Number(f.daoBps),
      creatorBps: Number(f.creatorBps),
      validatorsBps: Number(f.validatorsBps),
      rejectFeeBps: Number(f.rejectFeeBps),
      rejectDaoBps: Number(f.rejectDaoBps),
      rejectValidatorsBps: Number(f.rejectValidatorsBps),
      loserCashbackBps: Number(f.loserCashbackBps)
    },
    whatIf: {
      success: Object.fromEntries(Object.entries(successPreview).map(([k,v]) => [k, v.toString()])),
      fail:    Object.fromEntries(Object.entries(failPreview).map(([k,v]) => [k, v.toString()]))
    }
  };

  fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n✅ Wrote ${outPath}\n`);
}

main().catch(fail);