// scripts/admin/deployTreasury.ts
import { ethers, artifacts } from "hardhat"
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"

type AddressHex = `0x${string}`

const OUT_DIR = join(process.cwd(), "webapp", "public", "deployments")
const ABI_DIR = join(process.cwd(), "webapp", "public", "abi")
const OUT_FILE = join(OUT_DIR, "lightchain.json")

function asAddressHex(v: string | undefined, fallback: AddressHex): AddressHex {
  if (v && v.startsWith("0x") && v.length === 42) return v as AddressHex
  return fallback
}

async function main() {
  const signers = await ethers.getSigners()
  const deployer = signers[0]
  if (!deployer) throw new Error("No signer available (deployer)")

  const admin: AddressHex = asAddressHex(process.env.ADMIN, deployer.address as AddressHex)
  const operator: AddressHex = asAddressHex(process.env.OPERATOR, deployer.address as AddressHex)

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  if (!existsSync(ABI_DIR)) mkdirSync(ABI_DIR, { recursive: true })

  const Factory = await ethers.getContractFactory("Treasury")
  const t = await Factory.deploy(admin, operator)
  await t.waitForDeployment()
  const addr = (await t.getAddress()) as AddressHex
  console.log("Treasury deployed:", addr)

  // ABI
  const art = await artifacts.readArtifact("Treasury")
  writeFileSync(join(ABI_DIR, "Treasury.abi.json"), JSON.stringify({ abi: art.abi }, null, 2))

  // Update deployments (write "Treasury")
  const cur = existsSync(OUT_FILE)
    ? JSON.parse(readFileSync(OUT_FILE, "utf8"))
    : { chainId: 504, contracts: {} as Record<string, string> }
  cur.contracts = { ...(cur.contracts || {}), Treasury: addr }
  writeFileSync(OUT_FILE, JSON.stringify(cur, null, 2))
  console.log("✓ updated", OUT_FILE)

  console.log("\nNext:")
  console.log(`export ADDRESS=${addr}`)
  console.log("npm run export:abis   # or re-run your idempotent deploy to wire ChallengePay envs")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})