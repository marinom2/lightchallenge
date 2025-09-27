import { config as dotenv } from "dotenv"
dotenv()

import "@nomicfoundation/hardhat-toolbox"

// keep hardhat-deploy optional (you installed it, but this is harmless)
let hasDeploy = false
try { require("hardhat-deploy"); hasDeploy = true } catch {}

import type { HardhatUserConfig } from "hardhat/config"
try { require("./scripts/verify/verify-all") } catch {}

const LIGHTCHAIN_RPC =
  process.env.LIGHTCHAIN_RPC ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://light-testnet-rpc.lightchain.ai"

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001"

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 504)

const config: HardhatUserConfig & { namedAccounts?: Record<string, any> } = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true, // ← enable IR globally to fix “stack too deep”
    },
  },
  networks: {
    hardhat: {},
    lightchain: {
      url: LIGHTCHAIN_RPC,
      accounts: [PRIVATE_KEY],
      chainId: CHAIN_ID,
    },
  },
  etherscan: {
    // IMPORTANT: use the literal 'empty', not an empty string.
    apiKey: { lightchain: 'empty' },
    customChains: [
      {
        // MUST match your Hardhat network name ('lightchain')
        network: 'lightchain',
        chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 504),
        urls: {
          // per Lightscan’s docs/screenshot
          apiURL: 'https://testnet.lightscan.app/api',
          browserURL: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://testnet.lightscan.app',
        },
      },
    ],
  },
  gasReporter: {
    enabled: !!process.env.GAS_REPORT,
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || undefined,
  },
}

if (hasDeploy) config.namedAccounts = { deployer: { default: 0 } }

export default config