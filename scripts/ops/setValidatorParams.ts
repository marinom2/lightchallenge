import { header, info, fail, context, toWei } from "../dev/utils";

async function main() {
  header("Set Validator Params (DAO)");
  const { net, addr, signer, signerIndex, cp } = await context();

  const minStake = toWei(process.env.MIN_STAKE ?? "0.00005");
  const thresholdBps = Number(process.env.THRESHOLD_BPS ?? "5000");
  const quorumBps = Number(process.env.QUORUM_BPS ?? "300");
  const cooldown = Number(process.env.UNSTAKE_COOLDOWN ?? 259200); // 3 days

  info("Network", net);
  info("Sender ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);

  const tx = await cp.setValidatorParams(minStake, thresholdBps, quorumBps, cooldown);
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
}

main().catch(fail);