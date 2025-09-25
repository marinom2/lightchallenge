import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";
import {
  MultiSigProofVerifier__factory,
  ChallengePay__factory,
} from "../typechain-types";

// Mirror the Solidity struct layout/ordering exactly
type Attestation = {
  challengeId: bigint;
  subject: string;
  periodStart: bigint;  // uint64
  periodEnd: bigint;    // uint64
  ruleKind: number;     // uint8
  minDaily: number;     // uint32
  datasetHash: string;  // bytes32
  pass: boolean;
  chainId: bigint;      // uint256
  verifier: string;     // address
};

// keccak256("Attestation(uint256,address,uint64,uint64,uint8,uint32,bytes32,bool,uint256,address)")
const TYPEHASH =
  "0x3b94011e0cfe69b0a03951dca1e445e2ea0292a290a59e7e1a04e1f2a8b615b3";

function attHash(a: Attestation): string {
  return keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "bytes32",
        "uint256",
        "address",
        "uint64",
        "uint64",
        "uint8",
        "uint32",
        "bytes32",
        "bool",
        "uint256",
        "address",
      ],
      [
        TYPEHASH,
        a.challengeId,
        a.subject,
        a.periodStart,
        a.periodEnd,
        a.ruleKind,
        a.minDaily,
        a.datasetHash,
        a.pass,
        a.chainId,
        a.verifier,
      ]
    )
  );
}

// Sign the RAW struct hash; signMessage adds the EIP-191 prefix,
// which matches the contract's _toEthSigned() step.
async function signAttestation(att: Attestation, signer: any): Promise<string> {
  const h = attHash(att);
  return signer.signMessage(ethers.getBytes(h));
}

// Deploy contracts and create a challenge with safe timings.
// IMPORTANT: the challenge is created by `challenger`, so att.subject must equal challenger.address.
async function setupWithGoodTimes() {
  const [deployer, dao, att1, att2, challenger] = await ethers.getSigners();

  // Deploy ChallengePay
  const cp = await new ChallengePay__factory(deployer).deploy(dao.address);
  await cp.waitForDeployment();

  // approvalLeadTime and safe timing
  const lead = await cp.approvalLeadTime();
  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);

  const startTs = now + lead + 3600n;       // start 1 hour after lead time
  const approvalDeadline = startTs - 1800n; // deadline 30 min before start

  // Deploy MultiSig verifier with 2 attesters, threshold = 2
  const V = new MultiSigProofVerifier__factory(deployer);
  const v = await V.deploy(deployer.address, [att1.address, att2.address], 2);
  await v.waitForDeployment();

  // Stake one validator (deployer) and loosen params so one approval flips to Approved
  const minStake = await cp.minValidatorStake();
  await cp.stakeValidator({ value: minStake });
  await cp.setValidatorParams(
    await cp.minValidatorStake(),
    1, // approvalThresholdBps
    1, // quorumBps
    await cp.unstakeCooldownSec()
  );

  // Create a challenge that requires proof and uses our verifier
  const stakeAmt = ethers.parseEther("0.001");
  const bondAmt  = ethers.parseEther("0.0005");

  // 🔴 Create challenge AS THE CHALLENGER so att.subject matches c.challenger
  const createTx = await cp.connect(challenger).createChallenge({
    kind: 1,
    currency: 0, // NATIVE
    token: ethers.ZeroAddress,
    stakeAmount: stakeAmt,
    proposalBond: bondAmt,
    approvalDeadline: approvalDeadline,
    startTs: startTs,
    maxParticipants: 10,
    peers: [],
    peerApprovalsNeeded: 0,
    charityBps: 0,
    charity: ethers.ZeroAddress,
    proofRequired: true,
    verifier: await v.getAddress(),
  }, { value: stakeAmt + bondAmt });
  await createTx.wait();

  const id = (await cp.nextChallengeIdView()) - 1n;

  // Approve to reach Status.Approved
  await cp.approveChallenge(id, true);
  expect((await cp.getChallenge(id)).status).to.eq(1); // Approved

  return { cp, v, id, challenger, att1, att2 };
}

function toTuple(att: Attestation): any[] {
  // positional array in exact struct order
  return [
    att.challengeId,
    att.subject,
    att.periodStart,
    att.periodEnd,
    att.ruleKind,
    att.minDaily,
    att.datasetHash,
    att.pass,
    att.chainId,
    att.verifier,
  ];
}

describe("MultiSigProofVerifier + ChallengePay", () => {
  it("2-of-2 signatures allow finalize success", async () => {
    const { cp, v, id, challenger, att1, att2 } = await setupWithGoodTimes();

    // move after start
    const start = (await cp.getChallenge(id)).startTs;
    const nowTs = (await ethers.provider.getBlock("latest"))!.timestamp;
    const delta = Number(start) - nowTs + 1;
    if (delta > 0) await ethers.provider.send("evm_increaseTime", [delta]);
    await ethers.provider.send("evm_mine", []);

    const att: Attestation = {
      challengeId: id,
      subject: challenger.address, // MUST equal c.challenger
      periodStart: 0n,
      periodEnd: 0n,
      ruleKind: 1,
      minDaily: 10000,
      datasetHash: keccak256(toUtf8Bytes("example-dataset")),
      pass: true,
      chainId: BigInt((await ethers.provider.getNetwork()).chainId),
      verifier: await v.getAddress(), // MUST equal c.verifier
    };

    const sig1 = await signAttestation(att, att1);
    const sig2 = await signAttestation(att, att2);

    const attTuple = toTuple(att);
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint256,address,uint64,uint64,uint8,uint32,bytes32,bool,uint256,address)", "bytes[]"],
      [attTuple, [sig1, sig2]]
    );

    await cp.submitProof(id, proof);
    await expect(cp.finalize(id)).to.emit(cp, "Finalized");
  });

  it("insufficient signatures keeps finalize blocked", async () => {
    const { cp, v, id, challenger, att1 } = await setupWithGoodTimes();

    // move after start
    const start = (await cp.getChallenge(id)).startTs;
    const nowTs = (await ethers.provider.getBlock("latest"))!.timestamp;
    const delta = Number(start) - nowTs + 1;
    if (delta > 0) await ethers.provider.send("evm_increaseTime", [delta]);
    await ethers.provider.send("evm_mine", []);

    const att: Attestation = {
      challengeId: id,
      subject: challenger.address, // MUST equal c.challenger
      periodStart: 0n,
      periodEnd: 0n,
      ruleKind: 1,
      minDaily: 10000,
      datasetHash: keccak256(toUtf8Bytes("example-dataset")),
      pass: true,
      chainId: BigInt((await ethers.provider.getNetwork()).chainId),
      verifier: await v.getAddress(),
    };

    const sigOnlyOne = await signAttestation(att, att1);

    const attTuple = toTuple(att);
    const proof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint256,address,uint64,uint64,uint8,uint32,bytes32,bool,uint256,address)", "bytes[]"],
      [attTuple, [sigOnlyOne]]
    );

    await cp.submitProof(id, proof);
    await expect(cp.finalize(id)).to.be.revertedWithCustomError(cp, "ProofRequired");
  });
});