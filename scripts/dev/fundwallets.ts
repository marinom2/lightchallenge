// scripts/dev/fundwallets.ts
import hre from "hardhat";
import fs from "fs";
import pLimit from "p-limit";
import {
  NonceManager,
  formatEther,
  parseEther,
  parseUnits,
  getAddress,
} from "ethers";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────
type FundResult = {
  to: string;
  skipped?: boolean;
  oldBal?: bigint;
  newBal?: bigint;
  tx?: string;
  block?: number;
  fee?: bigint;
  error?: string;
};

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function header(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}
const fmt = (v: bigint) => formatEther(v);

function printSkip(to: string, oldBal: bigint, skipMin: bigint | null) {
  if (skipMin) {
    console.log(`→ ${to}\n   Skipped (bal=${fmt(oldBal)} LCAI ≥ ${fmt(skipMin)} LCAI)`);
  } else {
    console.log(`→ ${to}\n   Skipped`);
  }
}

async function getInitialFee() {
  const fd = await hre.ethers.provider.getFeeData();
  // If chain supports EIP-1559, return maxFeePerGas + maxPriorityFeePerGas
  if (fd.maxFeePerGas && fd.maxPriorityFeePerGas) {
    return {
      type: "1559" as const,
      maxFeePerGas: fd.maxFeePerGas,
      maxPriorityFeePerGas: fd.maxPriorityFeePerGas,
    };
  }
  // Legacy fallback
  return { type: "legacy" as const, gasPrice: fd.gasPrice ?? 0n };
}

function bumpFee(
  fee:
    | { type: "1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
    | { type: "legacy"; gasPrice: bigint },
  factor: number
) {
  const bump = (x: bigint) => BigInt(Math.ceil(Number(x) * factor));
  if (fee.type === "1559") {
    return {
      type: "1559" as const,
      maxFeePerGas: bump(fee.maxFeePerGas),
      maxPriorityFeePerGas: bump(fee.maxPriorityFeePerGas),
    };
  }
  return { type: "legacy" as const, gasPrice: bump(fee.gasPrice) };
}

function feeFieldsFrom(
  fee:
    | { type: "1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
    | { type: "legacy"; gasPrice: bigint }
) {
  return fee.type === "1559"
    ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas }
    : { gasPrice: fee.gasPrice };
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  header("Fund Wallets");

  const file = process.env.WALLETS_FILE ?? "scripts/dev/wallets.json";
  const amountEth = process.env.AMOUNT ?? "0.01";
  const DRY = process.env.DRY === "1";

  // Safe defaults: serialize by default; you may raise it.
  const CONCURRENCY = Number(process.env.CONCURRENCY ?? "1");
  const SKIP_MIN: bigint | null = process.env.MIN_TARGET_BAL
    ? parseEther(process.env.MIN_TARGET_BAL)
    : null;

  // Optional explicit gas override (gwei). If provided, we start from this.
  const GAS_GWEI_STR = process.env.GAS_GWEI; // e.g. "2"
  const PRIO_GWEI_STR = process.env.PRIORITY_GWEI || GAS_GWEI_STR;

  const [senderRaw] = await hre.ethers.getSigners();
  // Serialize nonces to avoid replacement/underpriced noise
  const sender = new NonceManager(senderRaw);
  const senderAddr = await sender.getAddress();

  const list: Array<{ address: string }> = JSON.parse(fs.readFileSync(file, "utf8"));
  const targets = Array.from(new Set(list.map((w) => getAddress(w.address))));

  console.log("Network            :", hre.network.name);
  console.log("Funder             :", senderAddr);
  console.log("Per-wallet amount  :", amountEth, "LCAI");
  if (SKIP_MIN) console.log("Skip if bal ≥      :", fmt(SKIP_MIN), "LCAI");
  console.log("Targets (unique)   :", targets.length);
  console.log("Concurrency        :", CONCURRENCY);
  console.log("Gas override       :", GAS_GWEI_STR ? `${GAS_GWEI_STR} gwei` : "(auto)");

  const value: bigint = parseEther(amountEth.toString());
  const balBefore: bigint = await hre.ethers.provider.getBalance(senderAddr);
  console.log("\nSender balance     :", fmt(balBefore), "LCAI");
  if (DRY) console.log("⚠️  DRY RUN (no transactions will be sent)");

  // Seed fee settings
  const startFee =
    GAS_GWEI_STR
      ? (PRIO_GWEI_STR
          ? {
              type: "1559" as const,
              maxFeePerGas: parseUnits(GAS_GWEI_STR, "gwei"),
              maxPriorityFeePerGas: parseUnits(PRIO_GWEI_STR, "gwei"),
            }
          : {
              type: "1559" as const,
              maxFeePerGas: parseUnits(GAS_GWEI_STR, "gwei"),
              maxPriorityFeePerGas: parseUnits(GAS_GWEI_STR, "gwei"),
            })
      : await getInitialFee();

  // per-target worker
  const worker = async (to: string): Promise<FundResult> => {
    const res: FundResult = { to };
    try {
      const oldBal = await hre.ethers.provider.getBalance(to);

      if (SKIP_MIN && oldBal >= SKIP_MIN) {
        res.skipped = true;
        res.oldBal = oldBal;
        res.newBal = oldBal;
        return res;
      }

      if (DRY) {
        res.oldBal = oldBal;
        res.newBal = oldBal + value;
        return res;
      }

      // retry quietly: bump fee 20% per attempt (up to 5 tries)
      let fee = startFee;
      let tx, rec: any;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          tx = await sender.sendTransaction({ to, value, ...feeFieldsFrom(fee) });
          rec = await tx.wait();
          break;
        } catch (err: any) {
          const msg = String(err?.message || err);
          // silently bump for common fee/nonce situations, then retry
          if (/underpriced|replacement transaction|fee too low|base fee exceeds/i.test(msg)) {
            fee = bumpFee(fee, 1.2);
            continue;
          }
          // anything else, bubble out
          throw err;
        }
      }

      if (!tx || !rec) throw new Error("unable to send after retries");

      res.tx = tx.hash;
      res.block = rec.blockNumber ?? undefined;
      res.oldBal = oldBal;
      res.newBal = await hre.ethers.provider.getBalance(to);

      const gasUsed: bigint = rec.gasUsed ?? 0n;
      const effPrice: bigint = rec.effectiveGasPrice ?? rec.gasPrice ?? 0n;
      res.fee = gasUsed * effPrice;

      return res;
    } catch (e: any) {
      res.error = e?.message || String(e);
      return res;
    }
  };

  const limit = pLimit(CONCURRENCY);
  const results: FundResult[] = await Promise.all(
    targets.map((to) => limit(() => worker(to)))
  );

  // summary
  let totalTransfer: bigint = 0n;
  let totalFees: bigint = 0n;

  for (const r of results) {
    if (r.error) {
      // Single concise error line (no noisy RPC wording)
      console.error(`→ ${r.to}\n   ❌ transfer failed`);
      continue;
    }
    if (r.skipped) {
      printSkip(r.to, r.oldBal ?? 0n, SKIP_MIN);
      continue;
    }
    const oldBal = r.oldBal ?? 0n;
    const newBal = r.newBal ?? oldBal;
    const delta = newBal - oldBal;
    totalTransfer += delta;
    totalFees += r.fee ?? 0n;

    console.log(
      `→ ${r.to}\n` +
        `   Old: ${fmt(oldBal)} LCAI → New: ${fmt(newBal)} LCAI${r.tx ? ` (tx ${r.tx})` : ""}`
    );
  }

  const balAfter: bigint = DRY ? balBefore : await hre.ethers.provider.getBalance(senderAddr);
  console.log("\n" + "—".repeat(72));
  console.log("Summary:");
  console.log("  Transfers total  :", fmt(totalTransfer), "LCAI");
  console.log("  Gas fees total   :", fmt(totalFees), "LCAI");
  console.log(`  Funder balance   : ${fmt(balBefore)} → ${fmt(balAfter)} LCAI`);
  if (!DRY) {
    const actualSpend = balBefore - balAfter;
    console.log("  Actual spend     :", fmt(actualSpend), "LCAI");
  }
  console.log("✅ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});