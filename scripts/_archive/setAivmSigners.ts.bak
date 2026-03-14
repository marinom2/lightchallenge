import hre from "hardhat";
const { ethers } = hre;

function parseAddrs(envVal: string | undefined): string[] {
  return (envVal ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => ethers.getAddress(a));
}

function pickSignerSetter(v: any) {
  // Try common variants in priority order
  const candidates: Array<{ name: string; arity: number }> = [
    { name: "addAivmSigner", arity: 1 },
    { name: "addSigner", arity: 1 },

    { name: "setAivmSigner", arity: 2 },
    { name: "setSigner", arity: 2 },
    { name: "setSignerAllowed", arity: 2 },
    { name: "setApprovedSigner", arity: 2 },
  ];

  for (const c of candidates) {
    const fn = (v as any)[c.name];
    if (typeof fn === "function") return c;
  }
  return null;
}

async function main() {
  const verifier = process.env.AIVM_VERIFIER as string;
  if (!verifier) throw new Error("Set AIVM_VERIFIER in env");

  const signers = parseAddrs(process.env.AIVM_SIGNERS);
  if (signers.length === 0) throw new Error("Set AIVM_SIGNERS=0x...,0x...");

  const [admin] = await ethers.getSigners();
  console.log("Network:", hre.network.name);
  console.log("Admin  :", await admin.getAddress());
  console.log("Verifier:", verifier);
  console.log("Signers:", signers);

  const v = await ethers.getContractAt("AivmProofVerifier", verifier, admin);

  const picked = pickSignerSetter(v);
  if (!picked) {
    console.log("\n❌ Could not find a signer setter on this contract ABI.");
    console.log("Here are ALL functions containing 'signer' in their signature:\n");
    const list = v.interface.fragments
      .filter((f: any) => f.type === "function")
      .map((f: any) => f.format())
      .filter((s: string) => s.toLowerCase().includes("signer"));
    for (const s of list) console.log("-", s);
    throw new Error("Update script with correct function name from the list above.");
  }

  console.log(`\nUsing method: ${picked.name} (arity ${picked.arity})\n`);

  for (const s of signers) {
    let tx;
    if (picked.arity === 1) {
      tx = await (v as any)[picked.name](s);
    } else {
      tx = await (v as any)[picked.name](s, true);
    }
    await tx.wait();
    console.log("✓ enabled signer:", s, "tx:", tx.hash);
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});