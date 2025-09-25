import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/checkBalance.ts
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import fs from "fs";
import path from "path";
import { header, info, fail, NATIVE_SYMBOL } from "../dev/utils";

type Snap = {
  network: string;
  blockNumber: number;
  blockTime: number; // epoch seconds
  balances: Record<string, string>; // addr -> wei string
};

function fmt(nWei: bigint) {
  return `${ethers.formatEther(nWei)} ${NATIVE_SYMBOL}`;
}
function loadSnap(p: string): Snap | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function saveSnap(p: string, s: Snap) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2));
}

async function main() {
  header("Check Native Balances (+ snapshot & diff)");

  // Inputs
  const addrs = (process.env.ADDRS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const accounts = await ethers.getSigners();
  if (addrs.length === 0) {
    // default: first 3 signers
    addrs.push(...(await Promise.all(accounts.slice(0, 3).map((a: any) => a.getAddress()))));
  }

  // Snapshot path & mode
  const net = network.name;
  const snapPath = process.env.SNAP ?? `snapshots/balances-${net}.json`;
  const mode = (process.env.MODE ?? "").toLowerCase(); // "save" | "diff" | ""
  const SAVE = process.env.SAVE === "1" || mode === "save";
  const DIFF = process.env.DIFF === "1" || mode === "diff";

  // Chain context
  const blk = await ethers.provider.getBlock("latest");
  const blockNumber = blk?.number ?? 0;
  const blockTime = Number(blk?.timestamp ?? Math.floor(Date.now() / 1000));

  info("Network", net);
  info("Block", `${blockNumber}`);
  info("Time", new Date(blockTime * 1000).toISOString());
  info("Addresses", addrs.length);

  // Current balances
  const now: Record<string, string> = {};
  for (const a of addrs) {
    const bal = await ethers.provider.getBalance(a);
    now[a] = bal.toString();
  }

  // Load previous snapshot (if any)
  const prev = loadSnap(snapPath);

  // Print table
  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
  const head =
    "Address                                      Current Balance".padEnd(58) +
    (prev ? "   Δ (since last snap)" : "");
  console.log("\n" + head);
  console.log("-".repeat(head.length));

  let anyDiff = false;
  for (const a of addrs) {
    const curWei = BigInt(now[a]);
    let line = `${a}   ${pad(fmt(curWei), 24)}`;
    if (prev && prev.balances[a]) {
      const oldWei = BigInt(prev.balances[a]);
      const delta = curWei - oldWei;
      if (delta !== 0n) anyDiff = true;
      const sign = delta > 0n ? "+" : delta < 0n ? "−" : " ";
      const abs = delta >= 0n ? delta : -delta;
      line += `   ${sign}${fmt(abs)}`;
    } else if (prev) {
      line += "   (new addr)";
    }
    console.log(line);
  }

  // Save snapshot if asked (or first time)
  if (SAVE || !prev) {
    const snap: Snap = {
      network: net,
      blockNumber,
      blockTime,
      balances: now,
    };
    saveSnap(snapPath, snap);
    console.log(`\n✅ Snapshot saved → ${snapPath}`);
  } else {
    console.log(`\nℹ️  Snapshot NOT saved (set SAVE=1 or MODE=save to write ${snapPath}).`);
  }

  if (prev && !anyDiff) {
    console.log("ℹ️  No balance changes vs previous snapshot.");
  }
}

main().catch(fail);