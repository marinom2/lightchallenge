import * as hre from "hardhat";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

function clean(s?: string) { return (s || "").trim(); }
function isAddr(a?: string) { return /^0x[0-9a-fA-F]{40}$/.test(clean(a)); }

function strip0x(hex: string) {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function stripSolcMetadata(hex0x: string): string {
  // Solidity appends CBOR metadata and the last 2 bytes encode metadata length.
  // We strip it when it looks valid.
  const h = strip0x(hex0x).toLowerCase();
  if (h.length < 4) return "0x" + h;

  const last2bytesHex = h.slice(-4);
  const metaLen = parseInt(last2bytesHex, 16); // bytes
  if (!Number.isFinite(metaLen) || metaLen <= 0) return "0x" + h;

  const totalRemoveHexChars = metaLen * 2 + 4; // metadata bytes + length field
  if (totalRemoveHexChars <= 0 || totalRemoveHexChars > h.length) return "0x" + h;

  // Heuristic safety: metadata should be "small-ish"
  if (metaLen > 8192) return "0x" + h;

  return "0x" + h.slice(0, h.length - totalRemoveHexChars);
}

type Range = { start: number; length: number }; // byte offsets
type Candidate = {
  fq: string;              // source:contract
  bytecode0x: string;      // deployed runtime bytecode (0x...)
  mask: Range[];           // bytes to ignore when comparing (immutables + link refs)
};

function buildMaskFromRefs(
  immutableReferences: any | undefined,
  deployedLinkReferences: any | undefined
): Range[] {
  const ranges: Range[] = [];

  // immutableReferences: { <id>: [{start,length}, ...], ... }
  if (immutableReferences && typeof immutableReferences === "object") {
    for (const key of Object.keys(immutableReferences)) {
      const arr = immutableReferences[key];
      if (Array.isArray(arr)) {
        for (const r of arr) {
          if (typeof r?.start === "number" && typeof r?.length === "number") {
            ranges.push({ start: r.start, length: r.length });
          }
        }
      }
    }
  }

  // deployedLinkReferences: { <source>: { <lib>: [{start,length}, ...] } }
  if (deployedLinkReferences && typeof deployedLinkReferences === "object") {
    for (const src of Object.keys(deployedLinkReferences)) {
      const libs = deployedLinkReferences[src];
      if (!libs || typeof libs !== "object") continue;
      for (const lib of Object.keys(libs)) {
        const arr = libs[lib];
        if (Array.isArray(arr)) {
          for (const r of arr) {
            if (typeof r?.start === "number" && typeof r?.length === "number") {
              ranges.push({ start: r.start, length: r.length });
            }
          }
        }
      }
    }
  }

  return ranges;
}

function equalWithMask(a0x: string, b0x: string, mask: Range[]): boolean {
  const a = strip0x(a0x).toLowerCase();
  const b = strip0x(b0x).toLowerCase();
  if (a.length !== b.length) return false;

  // Turn mask into a fast lookup set of byte indices to ignore
  const ignore = new Uint8Array(a.length / 2);
  for (const r of mask) {
    const start = Math.max(0, r.start);
    const end = Math.min(ignore.length, start + Math.max(0, r.length));
    for (let i = start; i < end; i++) ignore[i] = 1;
  }

  for (let i = 0; i < ignore.length; i++) {
    if (ignore[i]) continue;
    const ai = a.slice(i * 2, i * 2 + 2);
    const bi = b.slice(i * 2, i * 2 + 2);
    if (ai !== bi) return false;
  }
  return true;
}

async function rpc(method: string, params: any[] = []) {
  const p: any = (hre as any).network?.provider;
  if (!p) throw new Error("No hre.network.provider (are you running via `npx hardhat run`?)");

  if (typeof p.send === "function") return p.send(method, params);
  if (typeof p.request === "function") return p.request({ method, params });

  throw new Error("Provider has neither .send nor .request");
}

async function getCode(address: string): Promise<string> {
  const code = await rpc("eth_getCode", [address, "latest"]);
  return (code || "0x").toLowerCase();
}

function loadCandidatesFromBuildInfo(): Candidate[] {
  const buildInfoDir = join(process.cwd(), "artifacts", "build-info");
  if (!existsSync(buildInfoDir)) return [];

  const files = readdirSync(buildInfoDir).filter(f => f.endsWith(".json"));
  const out: Candidate[] = [];

  for (const f of files) {
    const p = join(buildInfoDir, f);
    let j: any;
    try { j = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }

    const contracts = j?.output?.contracts;
    if (!contracts || typeof contracts !== "object") continue;

    for (const sourceName of Object.keys(contracts)) {
      const byName = contracts[sourceName];
      for (const contractName of Object.keys(byName)) {
        const c = byName[contractName];
        const evm = c?.evm;
        const deployed = evm?.deployedBytecode;

        const obj = deployed?.object;
        if (!obj || typeof obj !== "string") continue;

        const bytecode0x = ("0x" + obj).toLowerCase();
        const immRefs = deployed?.immutableReferences;
        const linkRefs = deployed?.linkReferences;

        const mask = buildMaskFromRefs(immRefs, linkRefs);
        out.push({
          fq: `${sourceName}:${contractName}`,
          bytecode0x,
          mask,
        });
      }
    }
  }

  return out;
}

async function main() {
  const chainIdHex = await rpc("eth_chainId", []);
  console.log(`\nNetwork chainId: ${parseInt(chainIdHex, 16)} (${chainIdHex})`);

  const file = join(process.cwd(), "webapp/public/deployments/lightchain.json");
  const d = JSON.parse(readFileSync(file, "utf8"));
  const C: Record<string, string> = d.contracts || {};

  const addrs = Object.entries(C).filter(([, a]) => isAddr(a));

  // Prefer build-info candidates (best matching fidelity)
  let candidates = loadCandidatesFromBuildInfo();

  if (candidates.length === 0) {
    console.log("⚠️ No artifacts/build-info found. Run: npx hardhat compile");
    process.exit(1);
  }

  for (const [key, addr] of addrs) {
    const onchain = await getCode(addr);
    const onchainStripped = stripSolcMetadata(onchain);

    console.log(`\n=== ${key} @ ${addr} ===`);
    console.log(`onchain code hex chars: ${onchain.length}`);
    console.log(`onchain (metadata stripped) hex chars: ${onchainStripped.length}`);

    if (onchain === "0x") {
      console.log(`❌ NO CODE (EOA / not deployed / wrong network)`);
      continue;
    }

    // Try matches:
    // 1) exact match after stripping metadata
    // 2) masked match after stripping metadata (immutables/link refs)
    let hit: Candidate | undefined;

    for (const c of candidates) {
      const cStripped = stripSolcMetadata(c.bytecode0x);

      if (cStripped === onchainStripped) {
        hit = c;
        break;
      }
      if (equalWithMask(cStripped, onchainStripped, c.mask)) {
        hit = c;
        break;
      }
    }

    if (hit) {
      console.log(`✅ MATCHES: ${hit.fq} (metadata stripped + masked for immutables/link refs)`);
    } else {
      console.log(`❌ NO MATCH (most likely: deployed from different commit/build, or address file is stale)`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });