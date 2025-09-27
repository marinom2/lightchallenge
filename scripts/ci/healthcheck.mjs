// Minimal LightChain health check (no deps)
const RPC_URL = process.env.RPC_URL;
const EXPECT_CHAIN_ID = BigInt(process.env.CHAIN_ID || 504);
const CHALLENGEPAY_ADDR = process.env.CHALLENGEPAY_ADDR;
const EXPLORER_URL = process.env.EXPLORER_URL || "";
const SLACK = process.env.SLACK_WEBHOOK_URL || "";
const nowIso = new Date().toISOString();

if (!RPC_URL) {
  console.error("RPC_URL env is required (set in Actions Variables/Secrets).");
  process.exit(2);
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} ${res.statusText}`);
  const j = await res.json();
  if (j.error) throw new Error(`RPC error: ${j.error.message || j.error.code}`);
  return j.result;
}

const hexToBigInt = (h) => BigInt(h);
const toHex = (n) => "0x" + n.toString(16);

async function main() {
  const notes = [];
  let ok = true;

  // 1) blockNumber
  let blockHex;
  try {
    blockHex = await rpc("eth_blockNumber");
    notes.push(`eth_blockNumber=${blockHex}`);
  } catch (e) {
    ok = false; notes.push(`block FAIL: ${e.message}`);
  }

  // 2) chainId
  try {
    const chainHex = await rpc("eth_chainId");
    const got = hexToBigInt(chainHex);
    if (got !== EXPECT_CHAIN_ID) {
      ok = false; notes.push(`chainId mismatch: expected ${EXPECT_CHAIN_ID}, got ${got}`);
    } else {
      notes.push(`chainId OK=${got}`);
    }
  } catch (e) {
    ok = false; notes.push(`chainId FAIL: ${e.message}`);
  }

  // 3) logs for ChallengePay (last 1000 blocks)
  if (CHALLENGEPAY_ADDR && blockHex) {
    try {
      const head = hexToBigInt(blockHex);
      const from = head > 1000n ? head - 1000n : 0n;
      const res = await rpc("eth_getLogs", [{
        address: CHALLENGEPAY_ADDR,
        fromBlock: toHex(from),
        toBlock: blockHex,
      }]);
      notes.push(`logs OK for ${CHALLENGEPAY_ADDR}: ${Array.isArray(res) ? res.length : 0} log(s)`);
    } catch (e) {
      ok = false; notes.push(`logs FAIL: ${e.message}`);
    }
  } else {
    notes.push("logs skipped (no CHALLENGEPAY_ADDR or no head).");
  }

  const summary = [
    `LightChain Healthcheck @ ${nowIso}`,
    `RPC: ${RPC_URL}`,
    EXPLORER_URL ? `Explorer: ${EXPLORER_URL}` : "",
    ...notes,
    `status=${ok ? "OK" : "FAIL"}`
  ].filter(Boolean).join("\n");

  if (SLACK) {
    try {
      await fetch(SLACK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      console.log("Slack notification sent.");
    } catch (e) {
      console.warn("Slack notify failed:", e.message);
    }
  }

  console.log("\n" + summary + "\n");
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("Healthcheck crashed:", e); process.exit(1); });
