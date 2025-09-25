const { ethers, network } = require("hardhat");
function addr(x){ return /^0x[0-9a-fA-F]{40}$/.test(x); }
async function dump(cp, id) {
  let ch;
  try { ch = await cp.getChallenge(id); } catch { ch = null; }
  if (!ch){ console.log(`getChallenge(${id}) unavailable`); return; }
  console.log(`\n== getChallenge(${id}) FULL ==`);
  console.log(ch);
  const indices = [...Array(ch.length).keys()];
  console.log("Indices present:", indices);
  const al = [];
  for (let i=0;i<ch.length;i++){
    const v = ch[i];
    if (typeof v === "string" && addr(v)) al.push({index:i, value:v});
  }
  console.log("Address-like fields (best-effort):");
  console.log(al);
}
async function main(){
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const cpAddr = process.env.CP_ADDR || dep.ChallengePay;
  const cp = await ethers.getContractAt("ChallengePay", cpAddr);

  let nextId = 0n;
  try { nextId = await cp.nextChallengeIdView(); } catch { nextId = await cp.nextChallengeId(); }
  console.log("nextChallengeId:", nextId.toString());

  await dump(cp, 0n);
  await dump(cp, 1n);

  console.log("\nNOTE:");
  console.log("- IDs look 0-based on this build. Configure the one you plan to use.");
  console.log("- Proof config is applied at submitProof(); tuple indices 23/24 often store required/verifier.");
}
main().catch((e)=>{ console.error(e); process.exit(1); });
