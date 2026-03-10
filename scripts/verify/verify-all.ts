import hre from "hardhat";
import { task } from "hardhat/config";
import { readFileSync } from "fs";
import { join } from "path";

type Entry = { name: string; addr: string; args: any[] };

function clean(addr?: string) {
  return (addr || "").trim();
}

function isRealAddress(addr?: string) {
  const a = clean(addr);
  if (!a) return false;
  if (/^0x\.+$/.test(a)) return false; // "0x........" placeholder
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

task("verify:all", "Verify contracts from webapp/public/deployments/lightchain.json")
  .addOptionalParam("file", "Deployments json", "webapp/public/deployments/lightchain.json")
  .setAction(async (args, hre) => {
    const file = join(process.cwd(), args.file);
    const d = JSON.parse(readFileSync(file, "utf8"));
    const C: Record<string, string> = (d.contracts || {});

    // Normalize & trim everything we might read
    const Treasury             = clean(C.Treasury);
    const ChallengePay         = clean(C.ChallengePay);
    const ProtocolSafe         = clean(C.ProtocolSafe || C.Protocol); // legacy key fallback
    const ZkProofVerifier      = clean(C.ZkProofVerifier);
    const PlonkVerifier        = clean(C.PlonkVerifier);
    const AivmProofVerifier    = clean(C.AivmProofVerifier);
    const MetadataRegistry     = clean(C.MetadataRegistry);
    const EventChallengeRouter = clean(C.EventChallengeRouter);
    const PlonkAdapter         = clean(C.PlonkProofVerifierAdapter);
    const AutoApprovalStrategy = clean(C.AutoApprovalStrategy); // 👈 new

    // Useful env fallbacks (prefer deployments.json where possible)
    const env = (k: string, def = "") => clean(process.env[k] || def);

    const ADMIN_ENV             = env("ADMIN") || env("ADMIN_ADDRESS");
    const OPERATOR_ENV          = env("OPERATOR") || env("OPERATOR_ADDR");
    const TREASURY_ENV          = env("TREASURY_ADDR") || Treasury;
    const PROTOCOL_SAFE_ENV     = env("PROTOCOL_SAFE") || ProtocolSafe;
    const METADATA_OWNER_ENV    = env("METADATA_OWNER") || ADMIN_ENV;
    const AIVM_OWNER_ENV        = env("AIVM_OWNER") || ADMIN_ENV;
    const MULTISIG_OWNER_ENV    = env("MULTISIG_OWNER") || ADMIN_ENV;
    const MULTISIG_ATTESTERS    = (env("MULTISIG_ATTESTERS") || "")
                                    .split(",").map(s => s.trim()).filter(Boolean);
    const MULTISIG_THRESHOLD    = Number(env("MULTISIG_THRESHOLD") || (MULTISIG_ATTESTERS.length ? 1 : 0));
    const ENFORCE_BINDING       = (env("ENFORCE_BINDING", "true").toLowerCase() === "true");

    // Collector for straight-forward verifies (single signature)
    const entries: Entry[] = [];

    // --- Treasury — constructor varies by project ---
    if (isRealAddress(Treasury)) {
      const attempts: Entry[] = [
        ...(ADMIN_ENV && OPERATOR_ENV ? [{
          name: "Treasury", addr: Treasury, args: [ADMIN_ENV, OPERATOR_ENV],
        } as Entry] : []),
        ...(ADMIN_ENV ? [{ name: "Treasury", addr: Treasury, args: [ADMIN_ENV] } as Entry] : []),
        { name: "Treasury", addr: Treasury, args: [] },
      ];

      let verified = false;
      for (const e of attempts) {
        try {
          console.log(`→ verifying ${e.name} @ ${e.addr} with args:`, e.args);
          await hre.run("verify:verify", { address: e.addr, constructorArguments: e.args });
          console.log(`✓ verified ${e.name} @ ${e.addr}`);
          verified = true;
          break;
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (/already verified/i.test(msg)) {
            console.log(`✓ already verified ${e.name}`);
            verified = true;
            break;
          } else {
            console.log(`(retry ${e.name}) ${msg}`);
          }
        }
      }
      if (!verified) console.warn("! Could not verify Treasury with known arg shapes.");
    }

    // --- ChallengePay(treasury, protocol) ---
    if (isRealAddress(ChallengePay)) {
      const treasuryArg = TREASURY_ENV || Treasury;
      const protocolArg = PROTOCOL_SAFE_ENV || ProtocolSafe;
      entries.push({ name: "ChallengePay", addr: ChallengePay, args: [treasuryArg, protocolArg] });
    }

    // --- AutoApprovalStrategy() (no constructor args) ---
    if (isRealAddress(AutoApprovalStrategy)) {
      entries.push({ name: "AutoApprovalStrategy", addr: AutoApprovalStrategy, args: [] });
    }

    // --- ZkProofVerifier(address initialOwner) ---
    if (isRealAddress(ZkProofVerifier)) {
      const owner = METADATA_OWNER_ENV || ADMIN_ENV || "";
      entries.push({ name: "ZkProofVerifier", addr: ZkProofVerifier, args: [owner] });
    }

    // --- MetadataRegistry(address initialOwner) ---
    if (isRealAddress(MetadataRegistry)) {
      const owner = METADATA_OWNER_ENV || ADMIN_ENV || "";
      entries.push({ name: "MetadataRegistry", addr: MetadataRegistry, args: [owner] });
    }

    // --- EventChallengeRouter(address challengePay, address metadataRegistry) ---
    if (isRealAddress(EventChallengeRouter)) {
      const cp = ChallengePay || env("CHALLENGEPAY_ADDR", "");
      const mr = MetadataRegistry || env("METADATA_REGISTRY_ADDR", "");
      entries.push({ name: "EventChallengeRouter", addr: EventChallengeRouter, args: [cp, mr] });
    }

    // --- AivmProofVerifier — some projects pass an owner, some none ---
    if (isRealAddress(AivmProofVerifier)) {
      const attempts: Entry[] = [
        ...(AIVM_OWNER_ENV ? [{ name: "AivmProofVerifier", addr: AivmProofVerifier, args: [AIVM_OWNER_ENV] } as Entry] : []),
        { name: "AivmProofVerifier", addr: AivmProofVerifier, args: [] },
      ];

      let verified = false;
      for (const e of attempts) {
        try {
          console.log(`→ verifying ${e.name} @ ${e.addr} with args:`, e.args);
          await hre.run("verify:verify", { address: e.addr, constructorArguments: e.args });
          console.log(`✓ verified ${e.name} @ ${e.addr}`);
          verified = true;
          break;
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (/already verified/i.test(msg)) {
            console.log(`✓ already verified ${e.name}`);
            verified = true;
            break;
          } else {
            console.log(`(retry ${e.name}) ${msg}`);
          }
        }
      }
      if (!verified) console.warn("! Could not verify AivmProofVerifier with known arg shapes.");
    }

    // --- MultiSigProofVerifier(owner, attesters[], threshold) (optional) ---
    if (isRealAddress(C.MultiSigProofVerifier)) {
      entries.push({
        name: "MultiSigProofVerifier",
        addr: clean(C.MultiSigProofVerifier),
        args: [MULTISIG_OWNER_ENV, MULTISIG_ATTESTERS, MULTISIG_THRESHOLD],
      });
    }

    // --- PlonkVerifier() — generated, no args ---
    if (isRealAddress(PlonkVerifier)) {
      entries.push({ name: "PlonkVerifier", addr: PlonkVerifier, args: [] });
    }

    // --- PlonkProofVerifierAdapter — constructor differs by repo ---
    if (isRealAddress(PlonkAdapter)) {
      const verifierAddr = env("PA_PLONK_ADDR") || PlonkVerifier || "";
      const attempts: Entry[] = [
        { name: "PlonkProofVerifierAdapter", addr: PlonkAdapter, args: [] },
        ...(isRealAddress(verifierAddr) ? [{ name: "PlonkProofVerifierAdapter", addr: PlonkAdapter, args: [verifierAddr] } as Entry] : []),
        ...(isRealAddress(verifierAddr) ? [{ name: "PlonkProofVerifierAdapter", addr: PlonkAdapter, args: [verifierAddr, ENFORCE_BINDING] } as Entry] : []),
      ];

      let verified = false;
      for (const e of attempts) {
        try {
          console.log(`→ verifying ${e.name} @ ${e.addr} with args:`, e.args);
          await hre.run("verify:verify", { address: e.addr, constructorArguments: e.args });
          console.log(`✓ verified ${e.name} @ ${e.addr}`);
          verified = true;
          break;
        } catch (err: any) {
          const msg = err?.message || String(err);
          if (/already verified/i.test(msg)) {
            console.log(`✓ already verified ${e.name}`);
            verified = true;
            break;
          } else {
            console.log(`(retry ${e.name}) ${msg}`);
          }
        }
      }
      if (!verified) {
        console.warn("! Could not verify PlonkProofVerifierAdapter with known arg shapes. Set PA_PLONK_ADDR and/or adjust script.");
      }
    }

    // --- Verify all collected entries ---
    for (const e of entries) {
      if (!isRealAddress(e.addr)) continue;
      try {
        console.log(`→ verifying ${e.name} @ ${e.addr} with args:`, e.args);
        await hre.run("verify:verify", {
          address: e.addr,
          constructorArguments: e.args,
        });
        console.log(`✓ verified ${e.name} @ ${e.addr}`);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (/already verified/i.test(msg)) {
          console.log(`✓ already verified ${e.name}`);
        } else {
          console.log(`(skipped ${e.name}) ${msg}`);
        }
      }
    }

    if (ProtocolSafe && !isRealAddress(ProtocolSafe)) {
      console.log("Note: ProtocolSafe present but not a valid address string.");
    }
  });