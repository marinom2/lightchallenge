// scripts/deploy/idempotent.ts
import { ethers, artifacts, network, run } from "hardhat"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

type AddressHex = `0x${string}`

type Deployments = {
  chainId: number
  rpcUrl?: string
  contracts: Record<string, string | undefined>
}

const OUT_DIR = join(process.cwd(), "webapp", "public", "deployments")
const ABI_DIR = join(process.cwd(), "webapp", "public", "abi")
const OUT_FILE = join(OUT_DIR, "lightchain.json")

function asAddressHex(v?: string): AddressHex | undefined {
  return v && v.startsWith("0x") && v.length === 42 ? (v as AddressHex) : undefined
}

async function codeAt(addr?: string) {
  if (!addr) return "0x"
  return ethers.provider.getCode(addr)
}

async function ensureDir(d: string) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

function readDeployments(): Deployments {
  if (!existsSync(OUT_FILE)) return { chainId: 504, contracts: {} }
  return JSON.parse(readFileSync(OUT_FILE, "utf8"))
}

function writeDeployments(d: Deployments) {
  writeFileSync(OUT_FILE, JSON.stringify(d, null, 2))
  console.log("✓ wrote", OUT_FILE)
}

async function writeAbi(name: string) {
  await ensureDir(ABI_DIR)
  const a = await artifacts.readArtifact(name)
  writeFileSync(join(ABI_DIR, `${name}.abi.json`), JSON.stringify({ abi: a.abi }, null, 2))
  console.log(`✓ ABI: ${name}`)
}

async function maybeVerify(addr: string, args: any[]) {
  try {
    if (!process.env.LIGHTSCAN_API_KEY) return
    await run("verify:verify", { address: addr, constructorArguments: args })
    console.log(`✓ verified ${addr}`)
  } catch (e: any) {
    const msg = e?.message || String(e)
    if (msg.includes("Already Verified") || msg.includes("Reason: Already Verified")) {
      console.log(`✓ already verified ${addr}`)
    } else {
      console.log(`(verify skipped) ${addr}: ${msg}`)
    }
  }
}

async function main() {
  const net = await ethers.provider.getNetwork()
  const chainId = Number(net.chainId)
  const signers = await ethers.getSigners()
  const deployer = signers[0]
  if (!deployer) throw new Error("No signer available (deployer)")
  console.log(`Network: ${network.name} (${chainId}), deployer: ${deployer.address}`)

  await ensureDir(OUT_DIR)
  const d = readDeployments()
  d.chainId = chainId

  // Normalize existing keys: prefer Treasury
  if (!d.contracts.Treasury && d.contracts.DaoTreasury) {
    d.contracts.Treasury = d.contracts.DaoTreasury
    delete d.contracts.DaoTreasury
  }

  // 1) Treasury
  {
    let addr = d.contracts.Treasury
    let need = true
    if (addr) {
      const c = await codeAt(addr)
      need = !c || c === "0x"
    }
    if (need) {
      const admin = process.env.ADMIN ?? deployer.address
      const operator = process.env.OPERATOR ?? deployer.address
      const F = await ethers.getContractFactory("Treasury")
      const i = await F.deploy(admin, operator)
      await i.waitForDeployment()
      addr = await i.getAddress()
      console.log("Treasury:", addr)
      d.contracts.Treasury = addr
      await writeAbi("Treasury")
      await maybeVerify(addr, [admin, operator])
    } else {
      console.log("Treasury: using existing", addr)
      await writeAbi("Treasury")
    }
  }

  // 2) PlonkVerifier (optional if you keep address)
  {
    let addr = d.contracts.PlonkVerifier
    let need = true
    if (addr) {
      const c = await codeAt(addr)
      need = !c || c === "0x"
    }
    if (need) {
      const F = await ethers.getContractFactory("PlonkVerifier")
      const i = await F.deploy()
      await i.waitForDeployment()
      addr = await i.getAddress()
      console.log("PlonkVerifier:", addr)
      d.contracts.PlonkVerifier = addr
      await writeAbi("PlonkVerifier")
      // scanners often fail on generated verifiers – skipping verify
    } else {
      console.log("PlonkVerifier: using existing", addr)
      await writeAbi("PlonkVerifier")
    }
  }

  // 3) ZkProofVerifier (if you have one)
  if (existsSync(join(process.cwd(), "artifacts", "contracts", "ZkProofVerifier.sol", "ZkProofVerifier.json"))) {
    let addr = d.contracts.ZkProofVerifier
    let need = true
    if (addr) {
      const c = await codeAt(addr)
      need = !c || c === "0x"
    }
    if (need) {
      const F = await ethers.getContractFactory("ZkProofVerifier")
      const i = await F.deploy()
      await i.waitForDeployment()
      addr = await i.getAddress()
      console.log("ZkProofVerifier:", addr)
      d.contracts.ZkProofVerifier = addr
      await writeAbi("ZkProofVerifier")
      await maybeVerify(addr, [])
    } else {
      console.log("ZkProofVerifier: using existing", addr)
      await writeAbi("ZkProofVerifier")
    }
  }

  // 4) ChallengePay
  {
    let addr = d.contracts.ChallengePay
    let need = true
    if (addr) {
      const c = await codeAt(addr)
      need = !c || c === "0x"
    }
    if (need) {
      const dao = d.contracts.Treasury!
      const F = await ethers.getContractFactory("ChallengePay")
      const i = await F.deploy(dao)
      await i.waitForDeployment()
      addr = await i.getAddress()
      console.log("ChallengePay:", addr)
      d.contracts.ChallengePay = addr
      await writeAbi("ChallengePay")
      await maybeVerify(addr, [dao])
    } else {
      console.log("ChallengePay: using existing", addr)
      await writeAbi("ChallengePay")
    }
  }

  writeDeployments(d)
  console.log("✓ Deploy complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})