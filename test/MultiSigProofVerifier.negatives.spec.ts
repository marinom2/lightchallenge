import { expect } from "chai";
import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";
import { MultiSigProofVerifier__factory } from "../typechain-types";
import {
  Attestation,
  attestationHash,
  buildProof,
} from "../scripts/lib/attestation";

// Small helper: sign the attestation hash with the given signer
async function signAtt(a: Attestation, signer: any): Promise<string> {
  return signer.signMessage(ethers.getBytes(attestationHash(a)));
}

describe("MultiSigProofVerifier – negative paths", () => {
  it("verify() returns false for various invalid cases", async () => {
    const [deployer, att1, att2, nonAttester, subject, rando] = await ethers.getSigners();

    // Deploy 2-of-2 verifier with att1 & att2
    const V = new MultiSigProofVerifier__factory(deployer);
    const v = await V.deploy(deployer.address, [att1.address, att2.address], 2);
    await v.waitForDeployment();
    const verifierAddr = await v.getAddress();

    // Base attestation (valid)
    const base: Attestation = {
      challengeId: 42n,
      subject: subject.address,
      periodStart: 0,
      periodEnd: 0,
      ruleKind: 1,
      minDaily: 10000,
      datasetHash: keccak256(toUtf8Bytes("dataset-ok")),
      pass: true,
      chainId: BigInt((await ethers.provider.getNetwork()).chainId),
      verifier: verifierAddr,
    };

    // Happy signatures (for later tampering)
    const sig1 = await signAtt(base, att1);
    const sig2 = await signAtt(base, att2);
    const proofOK = buildProof(base, [sig1, sig2]);
    expect(await v.verify(base.challengeId, base.subject, proofOK)).to.eq(true);

    // 1) wrong chainId
    const wrongChain = { ...base, chainId: base.chainId + 1n };
    const proofWrongChain = buildProof(wrongChain, [sig1, sig2]); // signatures don't match struct
    expect(await v.verify(base.challengeId, base.subject, proofWrongChain)).to.eq(false);

    // 2) wrong verifier
    const wrongVerifier = { ...base, verifier: rando.address };
    const proofWrongVerifier = buildProof(wrongVerifier, [sig1, sig2]);
    expect(await v.verify(base.challengeId, base.subject, proofWrongVerifier)).to.eq(false);

    // 3) pass=false
    const failPass = { ...base, pass: false };
    const sig1FailPass = await signAtt(failPass, att1);
    const sig2FailPass = await signAtt(failPass, att2);
    const proofFailPass = buildProof(failPass, [sig1FailPass, sig2FailPass]);
    expect(await v.verify(base.challengeId, base.subject, proofFailPass)).to.eq(false);

    // 4) one non-attester signature
    const sigBad = await signAtt(base, nonAttester);
    const proofNonAttester = buildProof(base, [sig1, sigBad]); // only 1 valid signer (need 2)
    expect(await v.verify(base.challengeId, base.subject, proofNonAttester)).to.eq(false);

    // 5) duplicate signatures (same attester twice) – should count once
    const proofDup = buildProof(base, [sig1, sig1]); // only 1 unique signer
    expect(await v.verify(base.challengeId, base.subject, proofDup)).to.eq(false);

    // 6) wrong subject
    const wrongSubj = { ...base, subject: rando.address };
    const sig1WrongSubj = await signAtt(wrongSubj, att1);
    const sig2WrongSubj = await signAtt(wrongSubj, att2);
    const proofWrongSubj = buildProof(wrongSubj, [sig1WrongSubj, sig2WrongSubj]);
    expect(await v.verify(base.challengeId, base.subject, proofWrongSubj)).to.eq(false);

    // 7) wrong challengeId
    const wrongId = { ...base, challengeId: base.challengeId + 1n };
    const sig1WrongId = await signAtt(wrongId, att1);
    const sig2WrongId = await signAtt(wrongId, att2);
    const proofWrongId = buildProof(wrongId, [sig1WrongId, sig2WrongId]);
    expect(await v.verify(base.challengeId, base.subject, proofWrongId)).to.eq(false);

    // 8) tamper data after signatures (digest mismatch)
    const tampered = { ...base, datasetHash: keccak256(toUtf8Bytes("tampered")) };
    const proofTampered = buildProof(tampered, [sig1, sig2]); // sigs for base, struct = tampered
    expect(await v.verify(base.challengeId, base.subject, proofTampered)).to.eq(false);
  });
});