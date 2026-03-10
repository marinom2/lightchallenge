// scripts/admin/acceptAdmin.ts
import * as hre from "hardhat";

function fmt(a: string) {
  const x = hre.ethers.getAddress(a);
  return `${x.slice(0, 6)}…${x.slice(-4)} (${x})`;
}

async function main() {
  const { ethers, network } = hre;

  const cpAddr =
    process.env.CHALLENGEPAY_ADDR ||
    process.env.CP_ADDR ||
    process.env.CHALLENGE_PAY ||
    process.env.CHALLENGEPAY;

  if (!cpAddr) throw new Error("Set CHALLENGEPAY_ADDR=0x...");

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available");
  const signerAddr = ethers.getAddress(await signer.getAddress());

  console.log(`Network: ${network.name}`);
  console.log(`Signer : ${fmt(signerAddr)}`);
  console.log(`CP     : ${cpAddr}\n`);

  const cp = await ethers.getContractAt("ChallengePay", cpAddr, signer);

  const admin = await cp.admin();
  let pending: string;
  try {
    pending = await (cp as any).pendingAdmin();
  } catch {
    throw new Error("This contract does not expose pendingAdmin(). acceptAdmin may not be applicable.");
  }

  console.log(`admin()       : ${fmt(admin)}`);
  console.log(`pendingAdmin(): ${fmt(pending)}\n`);

  if (pending === ethers.ZeroAddress) {
    console.log("✅ No pending admin. Nothing to accept.\n");
    return;
  }

  if (ethers.getAddress(pending) !== signerAddr) {
    console.log("❌ Signer is NOT the pending admin, so acceptAdmin will revert.");
    console.log(`   Pending admin : ${fmt(pending)}`);
    console.log(`   Your signer   : ${fmt(signerAddr)}\n`);
    console.log(
      "✅ Fix: run with the pending admin key.\n" +
        "   Example:\n" +
        `     export CHALLENGEPAY_ADDR=${cpAddr}\n` +
        `     USE_ADMIN_KEY=1 YES=1 npx hardhat run scripts/admin/acceptAdmin.ts --network ${network.name}\n`
    );
    process.exit(2);
  }

  // Prefer acceptAdmin if it exists
  const candidates = ["acceptAdmin", "claimAdmin", "acceptOwnership", "claimOwnership"];
  let picked: string | null = null;
  for (const name of candidates) {
    if (typeof (cp as any)[name] === "function") {
      picked = name;
      break;
    }
  }
  if (!picked) throw new Error(`No accept/claim method found. Tried: ${candidates.join(", ")}`);

  console.log(`Using: ${picked}()\n`);

  const tx = await (cp as any)[picked]();
  console.log(`⏳ Tx: ${tx.hash}`);
  const rec = await tx.wait();
  console.log(`✅ Mined: block ${rec.blockNumber}`);

  console.log(`admin() now   : ${fmt(await cp.admin())}`);
  console.log(`pendingAdmin(): ${fmt(await (cp as any).pendingAdmin())}\n`);
}

main().catch((e) => {
  console.error("\nERROR:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});