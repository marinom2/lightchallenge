// scripts/admin/roles.ts
import { ethers, network } from "hardhat"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

export type Deployments = {
  chainId: number
  rpcUrl?: string
  contracts: {
    ChallengePay?: string
    Treasury?: string
    DaoTreasury?: string
    ZkProofVerifier?: string
    PlonkVerifier?: string
  }
}

/** Type-safe, reusable role ids */
export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash as `0x${string}`
export const OPERATOR_ROLE = ethers.id("OPERATOR_ROLE") as `0x${string}`

/* --------------------- Args & ENV helpers --------------------- */
const argv = process.argv.slice(2)


/** true/false flag (no value) */
function hasFlag(name: string, alias?: string): boolean {
  const keys = [`--${name}`]
  if (alias) keys.push(`-${alias}`)
  return argv.some((a) => keys.includes(a))
}

/** string value flag (returns only string or undefined) */
function getStrFlag(name: string, alias?: string): string | undefined {
    const keys = [`--${name}`]
    if (alias) keys.push(`-${alias}`)
    for (const [i, arg] of argv.entries()) {
      if (keys.includes(arg)) {
        const nxt = argv[i + 1]
        if (typeof nxt !== "string" || nxt.startsWith("--")) return undefined
        return nxt
      }
    }
    return undefined
  }

/** ENV as string (default to empty unless caller wants undefined) */
function envStr(name: string, def = ""): string {
  const v = process.env[name]
  return typeof v === "string" ? v : def
}

function isHex32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s)
}

/** Accepts common names, a 32-byte hex, or hashes arbitrary string */
export function roleToId(input?: string): `0x${string}` {
  const s = (input ?? "").trim()
  if (!s) return DEFAULT_ADMIN_ROLE
  if (isHex32(s)) return s as `0x${string}`

  const norm = s.toLowerCase()
  if (norm === "default_admin_role" || norm === "admin" || norm === "default_admin") {
    return DEFAULT_ADMIN_ROLE
  }
  if (norm === "operator_role" || norm === "operator") {
    return OPERATOR_ROLE
  }
  // Generic: hash whatever the user passed
  return ethers.id(s) as `0x${string}`
}

function loadTreasuryAddrFromDeployments(): string | undefined {
  const file = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json")
  if (!existsSync(file)) return undefined
  const d = JSON.parse(readFileSync(file, "utf8")) as Deployments
  return d.contracts?.Treasury || d.contracts?.DaoTreasury
}

async function getTreasuryInstance(addr?: string) {
  const treasury = addr || loadTreasuryAddrFromDeployments()
  if (!treasury) {
    throw new Error(
      "Treasury address not provided. Pass --treasury <addr> or ensure webapp/public/deployments/lightchain.json has { contracts: { Treasury: <addr> } }."
    )
  }
  return ethers.getContractAt("Treasury", treasury)
}

/**
 * Lists current holders of a role by replaying RoleGranted/RoleRevoked.
 * Uses fixed event signatures for topic hashes (no nullable fragments).
 */
async function listHoldersForRole(
  treasuryAddr: string,
  roleId: `0x${string}`,
  fromBlock?: number | bigint
) {
  const iface = new ethers.Interface([
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  ])

  // Canonical topics
  const topicGranted = ethers.id("RoleGranted(bytes32,address,address)")
  const topicRevoked = ethers.id("RoleRevoked(bytes32,address,address)")

  const provider = ethers.provider
  const filterGranted = {
    address: treasuryAddr,
    topics: [topicGranted, roleId] as string[],
    fromBlock: fromBlock ?? 0n,
    toBlock: "latest" as const,
  }
  const filterRevoked = {
    address: treasuryAddr,
    topics: [topicRevoked, roleId] as string[],
    fromBlock: fromBlock ?? 0n,
    toBlock: "latest" as const,
  }

  const [granted, revoked] = await Promise.all([
    provider.getLogs(filterGranted),
    provider.getLogs(filterRevoked),
  ])

  const set = new Set<string>()

  for (const lg of granted) {
    try {
      const parsed = iface.parseLog({ data: lg.data, topics: lg.topics })
      const acct = parsed?.args?.account as string | undefined
      if (acct) set.add(ethers.getAddress(acct))
    } catch {
      /* ignore */
    }
  }
  for (const lg of revoked) {
    try {
      const parsed = iface.parseLog({ data: lg.data, topics: lg.topics })
      const acct = parsed?.args?.account as string | undefined
      if (acct) set.delete(ethers.getAddress(acct))
    } catch {
      /* ignore */
    }
  }

  return Array.from(set)
}

function prettyRoleName(roleArg?: string, roleId?: string) {
  if (!roleArg || roleArg.toLowerCase().startsWith("default")) return "DEFAULT_ADMIN_ROLE"
  if (roleArg.toLowerCase().startsWith("operator")) return "OPERATOR_ROLE"
  if (roleId && isHex32(roleId)) return roleArg || roleId
  return roleArg || "DEFAULT_ADMIN_ROLE"
}

async function main() {
  // Action from ENV (wins) or CLI flags
  const ACTION: string | undefined =
    envStr("ACTION", "") ||
    (hasFlag("list") ? "list" : undefined) ||
    (hasFlag("grant") ? "grant" : undefined) ||
    (hasFlag("revoke") ? "revoke" : undefined) ||
    (hasFlag("renounce") ? "renounce" : undefined) ||
    (hasFlag("check") ? "check" : undefined)

  const roleArg = envStr("ROLE", "") || getStrFlag("role")
  const targetArg = envStr("TARGET", "") || getStrFlag("target")
  const treasuryArg = envStr("TREASURY", "") || getStrFlag("treasury")
  const fromBlockArg = envStr("FROM", "") || getStrFlag("from")

  const roleId = roleToId(roleArg || undefined)
  const tr = await getTreasuryInstance(treasuryArg || undefined)
  const treasuryAddr = await tr.getAddress()

  console.log(`Network: ${network.name}`)
  console.log(`Treasury: ${treasuryAddr}`)
  console.log(`Role: ${prettyRoleName(roleArg || undefined, roleId)} (${roleId})`)

  switch (ACTION) {
    case "list": {
      const fromBlock = fromBlockArg ? BigInt(fromBlockArg) : 0n
      console.log(`Listing holders since block ${fromBlock}...`)
      const holders = await listHoldersForRole(treasuryAddr, roleId, fromBlock)
      if (!holders.length) {
        console.log("No current holders detected from event history.")
      } else {
        for (const h of holders) console.log(`- ${h}`)
      }
      break
    }

    case "grant": {
      if (!targetArg) throw new Error("Missing --target <address> (or TARGET env)")
      const target = ethers.getAddress(targetArg)
      console.log(`Granting ${prettyRoleName(roleArg || undefined, roleId)} to ${target}...`)
      const tx = await tr.grantRole(roleId, target)
      await tx.wait()
      console.log(`✓ Granted. Tx: ${tx.hash}`)
      break
    }

    case "revoke": {
      if (!targetArg) throw new Error("Missing --target <address> (or TARGET env)")
      const target = ethers.getAddress(targetArg)
      console.log(`Revoking ${prettyRoleName(roleArg || undefined, roleId)} from ${target}...`)
      const tx = await tr.revokeRole(roleId, target)
      await tx.wait()
      console.log(`✓ Revoked. Tx: ${tx.hash}`)
      break
    }

    case "renounce": {
      const signers = await ethers.getSigners()
      if (!signers.length) throw new Error("No signer available. Configure PRIVATE_KEY in your .env.")
      const signer = signers[0]!
      const who = ethers.getAddress(targetArg || signer.address)
      if (who.toLowerCase() !== signer.address.toLowerCase()) {
        console.warn(
          `Warning: renounceRole can only be called by the account itself. Using signer ${signer.address}.`
        )
      }
      console.log(`Renouncing ${prettyRoleName(roleArg || undefined, roleId)} for ${signer.address}...`)
      const tx = await tr.renounceRole(roleId, signer.address)
      await tx.wait()
      console.log(`✓ Renounced. Tx: ${tx.hash}`)
      break
    }

    case "check": {
      if (!targetArg) throw new Error("Missing --target <address> (or TARGET env)")
      const target = ethers.getAddress(targetArg)
      const has = await tr.hasRole(roleId, target)
      console.log(`${target} has ${prettyRoleName(roleArg || undefined, roleId)}? ${has ? "YES" : "NO"}`)
      const adminOfRole = await tr.getRoleAdmin(roleId)
      console.log(`Admin of this role: ${adminOfRole}`)
      break
    }

    default: {
      console.log(
        [
          "",
          "Usage:",
          "  # With CLI flags",
          "  npx hardhat run scripts/admin/roles.ts --network lightchain --list   --role <ROLE> [--treasury <addr>] [--from <block>]",
          "  npx hardhat run scripts/admin/roles.ts --network lightchain --check  --role <ROLE> --target <address> [--treasury <addr>]",
          "  npx hardhat run scripts/admin/roles.ts --network lightchain --grant  --role <ROLE> --target <address> [--treasury <addr>]",
          "  npx hardhat run scripts/admin/roles.ts --network lightchain --revoke --role <ROLE> --target <address> [--treasury <addr>]",
          "  npx hardhat run scripts/admin/roles.ts --network lightchain --renounce --role <ROLE> [--treasury <addr>] [--target <me>]",
          "",
          "  # Or with ENV vars",
          "  ACTION=list ROLE=operator npm run roles",
          "  ACTION=grant ROLE=operator TARGET=0x1234... npm run roles",
          "  ACTION=revoke ROLE=operator TARGET=0x1234... npm run roles",
          "  ACTION=check ROLE=operator TARGET=0x1234... npm run roles",
          "  ACTION=renounce ROLE=admin npm run roles",
        ].join("\n")
      )
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}