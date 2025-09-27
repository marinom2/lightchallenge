// scripts/deploy/01_deploy_challengepay.ts
import { artifacts, ethers, network } from "hardhat"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"

type AddressHex = `0x${string}`

type Deployments = {
  chainId: number
  rpcUrl?: string
  contracts: {
    ChallengePay: string
    DaoTreasury?: string
    ZkProofVerifier?: string
    PlonkVerifier?: string
  }
}

const OUT_DIR = join(process.cwd(), "webapp", "public", "deployments")
const ABI_DIR = join(process.cwd(), "webapp", "public", "abi")
const OUT_FILE = join(OUT_DIR, "lightchain.json")

function asAddressHex(v?: string): AddressHex | undefined {
  return v && v.startsWith("0x") && v.length === 42 ? (v as AddressHex) : undefined
}

async function ensureAbi(name: string, file: string) {
  const art = await artifacts.readArtifact(name)
  writeFileSync(join(ABI_DIR, file), JSON.stringify({ abi: art.abi }, null, 2))
  console.log("✓ wrote ABI", file)
}

async function main() {
  const signers = await ethers.getSigners()
  const deployer = signers[0]
  if (!deployer) throw new Error("No signer available (deployer)")

  const net = await ethers.provider.getNetwork()
  const chainId = Number(net.chainId)

  console.log("Network:", network.name, "chainId:", chainId)
  console.log("Deployer:", deployer.address)

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  if (!existsSync(ABI_DIR)) mkdirSync(ABI_DIR, { recursive: true })

  // Load current deployments (webapp is canonical)
  let current: Deployments | null = null
  if (existsSync(OUT_FILE)) current = JSON.parse(readFileSync(OUT_FILE, "utf8"))

  // Addresses from env or existing file
  let challengePayAddr: AddressHex | undefined = asAddressHex(current?.contracts?.ChallengePay)
  let daoTreasuryAddr: AddressHex | undefined =
    asAddressHex(process.env.ADDRESS) ?? asAddressHex(current?.contracts?.DaoTreasury)
  let zkVerifierAddr: AddressHex | undefined =
    asAddressHex(process.env.ZK_VERIFIER) ?? asAddressHex(current?.contracts?.ZkProofVerifier)
  let plonkVerifierAddr: AddressHex | undefined =
    asAddressHex(process.env.PLONK_VERIFIER) ?? asAddressHex(current?.contracts?.PlonkVerifier)

  // Validate DAO address (ChallengePay constructor)
  if (!daoTreasuryAddr) daoTreasuryAddr = deployer.address as AddressHex
  if (!daoTreasuryAddr) {
    throw new Error(`Invalid ADDRESS for constructor: ${daoTreasuryAddr}`)
  }

  // Idempotent: keep existing if code present
  async function keepIfCode(addr?: AddressHex) {
    if (!addr) return undefined
    const code = await ethers.provider.getCode(addr)
    return code && code !== "0x" ? addr : undefined
  }

  challengePayAddr = await keepIfCode(challengePayAddr)
  zkVerifierAddr = await keepIfCode(zkVerifierAddr)
  plonkVerifierAddr = await keepIfCode(plonkVerifierAddr)

  // Deploy verifiers only if not present (OPTIONAL)
  if (!zkVerifierAddr) {
    try {
      const Zk = await ethers.getContractFactory("ZkProofVerifier")
      const z = await Zk.deploy()
      await z.waitForDeployment()
      zkVerifierAddr = (await z.getAddress()) as AddressHex
      console.log("Deployed ZkProofVerifier at", zkVerifierAddr)
    } catch (e) {
      console.log("Skipped ZkProofVerifier deploy (no contract or failed):", (e as any)?.message ?? e)
    }
  }

  if (!plonkVerifierAddr) {
    try {
      const Plonk = await ethers.getContractFactory("PlonkVerifier")
      const p = await Plonk.deploy()
      await p.waitForDeployment()
      plonkVerifierAddr = (await p.getAddress()) as AddressHex
      console.log("Deployed PlonkVerifier at", plonkVerifierAddr)
    } catch (e) {
      console.log("Skipped PlonkVerifier deploy (no contract or failed):", (e as any)?.message ?? e)
    }
  }

  // Deploy ChallengePay only if not present
  if (!challengePayAddr) {
    const Factory = await ethers.getContractFactory("ChallengePay")
    const instance = await Factory.deploy(daoTreasuryAddr)
    await instance.waitForDeployment()
    challengePayAddr = (await instance.getAddress()) as AddressHex
    console.log("Deployed ChallengePay at", challengePayAddr)
  }

  // Write ABIs we have in the build
  await ensureAbi("ChallengePay", "ChallengePay.abi.json")
  try {
    await ensureAbi("ZkProofVerifier", "ZkProofVerifier.abi.json")
  } catch {}
  try {
    await ensureAbi("PlonkVerifier", "PlonkVerifier.abi.json")
  } catch {}

  // Write unified deployments
  const out: Deployments = {
    chainId,
    rpcUrl: process.env.LIGHTCHAIN_RPC || process.env.NEXT_PUBLIC_RPC_URL,
    contracts: {
      ChallengePay: challengePayAddr!,
      DaoTreasury: daoTreasuryAddr,
      ZkProofVerifier: zkVerifierAddr,
      PlonkVerifier: plonkVerifierAddr,
    },
  }
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))
  console.log("✓ wrote deployments to", OUT_FILE)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})