import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import fs from "fs";
import path from "path";

function load(p: string) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {}; }
function save(p: string, data: any) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

async function main() {
  const [deployer] = await ethers.getSigners();

  const OWNER = process.env.MSIG_OWNER ?? await deployer.getAddress();
  const LIST  = (process.env.MSIG_ATTESTERS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
  const THR   = Number(process.env.MSIG_THRESHOLD ?? "1");

  const F = await ethers.getContractFactory("MultiSigProofVerifier");
  const v = await F.deploy(OWNER, LIST, THR);
  await v.waitForDeployment();

  const addr = await v.getAddress();
  console.log("Network :", network.name);
  console.log("Owner   :", OWNER);
  console.log("Attesters:", LIST);
  console.log("Threshold:", THR);
  console.log("Verifier :", addr);

  const out = path.join("deployments", `${network.name}.json`);
  const prev = load(out);
  prev.multiSigVerifier = addr;
  save(out, prev);
}

main().catch((e)=>{ console.error(e); process.exit(1); });