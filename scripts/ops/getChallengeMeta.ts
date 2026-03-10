import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers } = hre;
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();


async function main() {
  console.log(`
================================================================================
Get Challenge Metadata (URI)
================================================================================
`);

  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const file = path.join("deployments", `${net}.json`);
  const dep = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const challengeContract = dep.address || dep.contract || dep.Contract || dep.contractAddress || dep["contract"] || process.env.CONTRACT;
  const registryAddr = dep.metadataRegistry || process.env.METADATA_REGISTRY;

  if (!challengeContract) throw new Error("Challenge contract address not found.");
  if (!registryAddr) throw new Error("MetadataRegistry address not found.");

  const id = BigInt(process.env.CH_ID ?? "0");

  const [reader] = await ethers.getSigners();
  console.log("Network           :", net);
  console.log("Reader            :", await reader.getAddress());
  console.log("Challenge         :", challengeContract);
  console.log("Registry          :", registryAddr);
  console.log("CH_ID             :", id.toString());

  const reg = await ethers.getContractAt("MetadataRegistry", registryAddr, reader);
  const uri = await reg.uri(challengeContract, id);
  console.log("URI               :", uri || "(unset)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});