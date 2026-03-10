// hardhat.config.ts
import "dotenv/config";

import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-contract-sizer";
import type { HardhatUserConfig } from "hardhat/config";
import { ethers } from "ethers";

try {
  require("./scripts/verify/verify-all");
} catch {}

/* ────────────────────────────────────────────────────────────────
   ENV CONFIG
   ──────────────────────────────────────────────────────────────── */
const LIGHTCHAIN_RPC =
  process.env.LIGHTCHAIN_RPC ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://light-testnet-rpc.lightchain.ai";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 504);
const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://testnet.lightscan.app";

const ADMIN_ADDRESS = (process.env.ADMIN_ADDRESS || "").trim();
const ADMIN_PRIVATE_KEY = (process.env.ADMIN_PRIVATE_KEY || "").trim();
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();

const USE_ADMIN_KEY = (process.env.USE_ADMIN_KEY ?? "0") === "1";

function isPk(v: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

function needPk(name: string, v: string) {
  if (!v) throw new Error(`${name} is missing in .env`);
  if (!isPk(v)) throw new Error(`${name} must be 0x + 64 hex chars`);
  return v;
}

function needAddr(name: string, v: string) {
  if (!v) throw new Error(`${name} is missing in .env`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} must be a 0x address`);
  return ethers.getAddress(v);
}

// pick keys
const DEPLOYER_KEY = needPk("PRIVATE_KEY", PRIVATE_KEY);
const ADMIN_KEY = needPk("ADMIN_PRIVATE_KEY", ADMIN_PRIVATE_KEY);

// choose active signer key for this run
const ACTIVE_KEY = USE_ADMIN_KEY ? ADMIN_KEY : DEPLOYER_KEY;

// optional but HIGHLY recommended safety: if you say USE_ADMIN_KEY=1,
// ensure that key actually corresponds to ADMIN_ADDRESS
if (USE_ADMIN_KEY) {
  const adminAddr = needAddr("ADMIN_ADDRESS", ADMIN_ADDRESS);
  const derived = new ethers.Wallet(ADMIN_KEY).address;
  if (ethers.getAddress(derived) !== adminAddr) {
    throw new Error(
      [
        `USE_ADMIN_KEY=1 but ADMIN_PRIVATE_KEY does NOT match ADMIN_ADDRESS`,
        `ADMIN_ADDRESS     = ${adminAddr}`,
        `Derived from key  = ${ethers.getAddress(derived)}`,
        `Fix .env: set ADMIN_PRIVATE_KEY to the key for ADMIN_ADDRESS`,
      ].join("\n")
    );
  }
}

/* ────────────────────────────────────────────────────────────────
   HARDHAT CONFIG
   ──────────────────────────────────────────────────────────────── */
const config: HardhatUserConfig & { namedAccounts?: Record<string, any> } = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          metadata: { bytecodeHash: "none" },
          evmVersion: "istanbul",
        },
      },
      {
        version: "0.7.6",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: false,
          metadata: { bytecodeHash: "none" },
          evmVersion: "istanbul",
        },
      },
    ],
  
    overrides: {
      "contracts/PlonkVerifier.sol": {
        version: "0.7.6",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: false,
          metadata: { bytecodeHash: "none" },
          evmVersion: "istanbul",
        },
      },
  
      "contracts/ChallengePay.sol": {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          metadata: { bytecodeHash: "none" },
          evmVersion: "istanbul",
        },
      },
  
      "contracts/verifiers/ChallengePayAivmPoiVerifier.sol": {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          metadata: { bytecodeHash: "none" },
          evmVersion: "istanbul",
        },
      },
    },
  },

  networks: {
    hardhat: {},
    lightchain: {
      url: LIGHTCHAIN_RPC,
      accounts: [ACTIVE_KEY],
      chainId: CHAIN_ID,
    },
  },

  etherscan: {
    apiKey: { lightchain: "empty" },
    customChains: [
      {
        network: "lightchain",
        chainId: CHAIN_ID,
        urls: {
          apiURL: `${EXPLORER_URL}/api`,
          browserURL: EXPLORER_URL,
        },
      },
    ],
  },

  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
    strict: false,
  },

  gasReporter: {
    enabled: !!process.env.GAS_REPORT,
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || undefined,
  },

  mocha: { timeout: 60_000 },

  // hardhat-deploy convention (not used by ethers.getSigners directly)
  namedAccounts: {
    deployer: { default: 0 },
    admin: { default: 0 },
  },
};

export default config;