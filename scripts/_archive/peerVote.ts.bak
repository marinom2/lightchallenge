// scripts/ops/peerVote.ts
//
// Submit a peer vote (true=pass / false=fail) after startTs on Approved challenges.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> PASS=true|false \
//   npx hardhat run scripts/ops/peerVote.ts --network <net>
import hre from "hardhat";
const { ethers, network } = hre;
import { context, header, info, fail } from "../dev/utils";

function toBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  throw new Error(`PASS must be true|false (got: ${v})`);
}

async function main() {
  header("Peer Vote");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const pass = toBool(process.env.PASS);

  const me = await signer.getAddress();
  info("Network", net || network.name);
  info("Peer", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  const latest = await ethers.provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));
  const ch = await cp.getChallenge(id);

  if (Number(ch.status) !== 1) throw new Error("Challenge must be Approved to accept peer votes.");
  if (now < Number(ch.startTs)) throw new Error("Peer voting only after startTs.");

  // Check assignment
  const peers: string[] = ch.peers as any;
  const assigned = peers.map(p => p.toLowerCase()).includes(me.toLowerCase());
  if (!assigned) {
    console.log("⚠️ You are not a designated peer on this challenge.");
  }

  console.log("Submitting peerVote:", { pass });
  const tx = await cp.peerVote(id, pass);
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);

  const ch2 = await cp.getChallenge(id);
  console.log("peerApprovals:", Number(ch2.peerApprovals), "peerRejections:", Number(ch2.peerRejections));
  console.log("\n✅ Peer vote sent.");
}

main().catch(fail);