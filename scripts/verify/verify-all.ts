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

    // Active contracts
    const Treasury             = clean(C.Treasury);
    const ChallengePay         = clean(C.ChallengePay);
    const ProtocolSafe         = clean(C.ProtocolSafe || C.Protocol);
    const MetadataRegistry     = clean(C.MetadataRegistry);
    const EventChallengeRouter = clean(C.EventChallengeRouter);

    const env = (k: string, def = "") => clean(process.env[k] || def);

    const ADMIN_ENV             = env("ADMIN") || env("ADMIN_ADDRESS");
    const OPERATOR_ENV          = env("OPERATOR") || env("OPERATOR_ADDR");
    const TREASURY_ENV          = env("TREASURY_ADDR") || Treasury;
    const PROTOCOL_SAFE_ENV     = env("PROTOCOL_SAFE") || ProtocolSafe;
    const METADATA_OWNER_ENV    = env("METADATA_OWNER") || ADMIN_ENV;

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
