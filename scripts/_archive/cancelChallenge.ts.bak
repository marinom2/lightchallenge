// scripts/cancelChallenge.ts
import { header, info, fail, context } from "../dev/utils";

async function main() {
  header("Cancel Challenge (creator)");
  const { net, addr, signer, signerIndex, cp } = await context();

  const id = BigInt(process.env.CH_ID ?? "0");
  info("Network", net);
  info("Caller ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  console.log(`cancelChallenge: ${id}`);

  const tx = await cp.cancelChallenge(id);
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
}

main().catch(fail);