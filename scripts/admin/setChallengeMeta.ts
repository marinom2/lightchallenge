import "@nomicfoundation/hardhat-ethers";
import * as hre from "hardhat";
const { ethers, network } = hre;
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log(`
================================================================================
Set Challenge Metadata (URI)
================================================================================
`);

  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const file = path.join("deployments", `${net}.json`);
  const dep = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const challengeContract = dep.address || dep.contract || dep.Contract || dep.contractAddress || dep["contract"] || process.env.CONTRACT;
  const registryAddr = dep.metadataRegistry || process.env.METADATA_REGISTRY;

  if (!challengeContract) throw new Error("Challenge contract address not found (deploy first or set CONTRACT env).");
  if (!registryAddr) throw new Error("MetadataRegistry address not found (deployRegistry first or set METADATA_REGISTRY).");

  const id = BigInt(process.env.CH_ID ?? "0");
  const uri = process.env.URI ?? "";
  if (!uri) throw new Error("Provide URI=<metadata-uri>");

  const [signer] = await ethers.getSigners();
  console.log("Network           :", net);
  console.log("Sender            :", await signer.getAddress());
  console.log("Challenge         :", challengeContract);
  console.log("Registry          :", registryAddr);
  console.log("CH_ID             :", id.toString());
  console.log("URI               :", uri);

  const reg = await ethers.getContractAt("MetadataRegistry", registryAddr, signer);

  // Try challengerSet first (friendly permission). If it reverts, fall back to ownerSet.
  try {
    const tx = await reg.challengerSet(challengeContract, id, uri);
    const rec = await tx.wait();
    console.log("Mode              : challengerSet");
    console.log("Tx                :", tx.hash);
    console.log("Block             :", rec?.blockNumber);
  } catch (e) {
    console.log("challengerSet failed — trying ownerSet (requires registry owner) …");
    const tx = await reg.ownerSet(challengeContract, id, uri);
    const rec = await tx.wait();
    console.log("Mode              : ownerSet");
    console.log("Tx                :", tx.hash);
    console.log("Block             :", rec?.blockNumber);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});