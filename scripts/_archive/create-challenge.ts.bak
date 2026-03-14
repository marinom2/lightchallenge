import { ethers } from "ethers";
import * as fs from "node:fs";
import { join } from "node:path";
import "dotenv/config";

function loadAbi() {
  const candidates = [
    join(process.cwd(), "webapp", "public", "abi", "ChallengePay.abi.json"),
    join(process.cwd(), "public", "abi", "ChallengePay.abi.json"),
    join(process.cwd(), "artifacts", "contracts", "ChallengePay.sol", "ChallengePay.json"),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.abi)) return json.abi;
  }

  throw new Error("Could not find ChallengePay ABI.");
}

async function main() {
  const RPC_URL =
    process.env.LIGHTCHAIN_RPC ||
    process.env.RPC_URL ||
    "https://light-testnet-rpc.lightchain.ai";

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing");

  const CHALLENGE_PAY = "0xEF52411a2f13DbE3BBB60A8474808D4d4F7F4CA2";
  const STRATEGY = "0x7ab646195C4a1be878Da2eDe1929E42BFAD0c1DE";
  const VERIFIER = "0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0";

  const abi = loadAbi();
  const iface = new ethers.Interface(abi);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) throw new Error("Could not read latest block");
  const chainNow = Number(latestBlock.timestamp);

  const approvalDeadline = chainNow + 3600; // 60 min
  const startTs = chainNow + 7200;          // 120 min
  const duration = 7200;                    // 2h
  const proofDeadlineTs = startTs + duration + 7200; // bigger safety buffer

  const stakeAmount = ethers.parseEther("0.1");
  const proposalBond = ethers.parseEther("0.2");
  const value = stakeAmount + proposalBond;

  const payload = {
    kind: 3,
    currency: 0,
    token: ethers.ZeroAddress,
    stakeAmount,
    proposalBond,
    approvalDeadline,
    startTs,
    duration,
    maxParticipants: 0,
    peers: [] as string[],
    peerApprovalsNeeded: 0,
    peerDeadlineTs: 0,
    charityBps: 0,
    charity: ethers.ZeroAddress,
    verifier: VERIFIER,
    proofDeadlineTs,
    externalId: ethers.keccak256(
      ethers.toUtf8Bytes(`debug-${Date.now()}-${Math.random()}`)
    ),
    leadTime: 3600,
    fastTrackData: "0x",
    strategy: STRATEGY,
    strategyData: "0x",
  };

  const data = iface.encodeFunctionData("createChallenge", [payload]);

  const txReq = {
    to: CHALLENGE_PAY,
    from: wallet.address,
    data,
    value,
  };

  console.log("RPC:", RPC_URL);
  console.log("Signer:", wallet.address);
  console.log("Chain now:", chainNow);
  console.log("Selector:", data.slice(0, 10));
  console.log("Calldata length:", data.length);

  console.log("\nSimulating...");
  await provider.call(txReq);
  console.log("Simulation OK");

  console.log("\nEstimating gas...");
  const estimatedGas = await provider.estimateGas(txReq);
  const gasLimit = (estimatedGas * 120n) / 100n;
  console.log("Estimated gas:", estimatedGas.toString());
  console.log("Gas limit:", gasLimit.toString());
  console.log("approval window sec:", approvalDeadline - chainNow);
  console.log("lead time sec:", startTs - chainNow);
  console.log("proof window after end sec:", proofDeadlineTs - (startTs + duration));

  const network = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(wallet.address, "pending");

  // Force LEGACY tx for this custom chain test
  const gasPrice = 1_000_000_000n; // 1 gwei

  const unsignedTx = {
    to: CHALLENGE_PAY,
    nonce,
    chainId: Number(network.chainId),
    type: 0,
    gasPrice,
    gasLimit,
    value,
    data,
  };

  console.log("\nSigning legacy tx...");
  const signedTx = await wallet.signTransaction(unsignedTx);

  console.log("Broadcasting...");
  const sent = await provider.broadcastTransaction(signedTx);
  console.log("Tx hash:", sent.hash);

  const onchainTx = await provider.getTransaction(sent.hash);
  console.log("On-chain tx data selector:", onchainTx?.data?.slice(0, 10));
  console.log("On-chain tx type:", onchainTx?.type);

  const receipt = await sent.wait();
  console.log("Receipt status:", receipt?.status);
  console.log("Gas used:", receipt?.gasUsed?.toString());

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction mined but reverted");
  }

  console.log("\nSUCCESS");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});