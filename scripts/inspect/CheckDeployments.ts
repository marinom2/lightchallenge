/* scripts/inspect/CheckDeployments.ts */

import { ethers, artifacts, network } from "hardhat"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

type Deployments = {
  chainId: number
  rpcUrl?: string
  contracts: Record<string, string | undefined>
}

// If some addresses are EOAs by design, whitelist here (but for you, Treasury should be a contract)
const EOA_ALLOWED = new Set<string>([])

async function main() {
  const net = await ethers.provider.getNetwork()
  const chainId = Number(net.chainId)
  console.log(`Network: ${network.name} (chainId ${chainId})`)

  const deployFile = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json")
  if (!existsSync(deployFile)) {
    console.log("❌ No webapp/public/deployments/lightchain.json found.")
    process.exit(1)
  }
  const deployments = JSON.parse(readFileSync(deployFile, "utf8")) as Deployments

  // Accept either key; prefer "Treasury"
  const contracts = { ...deployments.contracts }
  if (contracts.Treasury == null && contracts.DaoTreasury != null) {
    contracts.Treasury = contracts.DaoTreasury
  }

  const entries = Object.entries(contracts || {})

  console.log("\nDeployed addresses (code present?):")
  for (const [name, addr] of entries) {
    if (!addr) {
      console.log(`- ${name}: (no address) → NOT DEPLOYED`)
      continue
    }
    const code = await ethers.provider.getCode(addr)
    const hasCode = code && code !== "0x"
    const ok = hasCode || EOA_ALLOWED.has(name)
    console.log(`- ${name}: ${addr} → ${ok ? "OK" : "MISSING CODE (re-deploy)"}`)
  }

  const contractsToCare = ["ChallengePay", "ZkProofVerifier", "PlonkVerifier", "Treasury"]
  console.log("\nArtifacts present:")
  for (const c of contractsToCare) {
    try { await artifacts.readArtifact(c); console.log(`- ${c}: ✓ artifact found`) }
    catch { console.log(`- ${c}: ✗ artifact NOT found (did you compile?)`) }
  }

  console.log("\nNext steps:")
  console.log("- Ensure 'Treasury' shows OK (has bytecode).")
  console.log("- If your deployments still contain 'DaoTreasury', re-run your treasury deploy to write the 'Treasury' key.")
}

main().catch((e) => { console.error(e); process.exit(1) })