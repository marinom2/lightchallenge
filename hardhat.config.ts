process.env.TS_NODE_PROJECT = "tsconfig.hardhat.json";

import * as dotenv from "dotenv";
dotenv.config();

import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import { HardhatUserConfig } from "hardhat/types"; // use 'hardhat/types' for VS Code

const HEX64 = /^0x[0-9a-fA-F]{64}$/;

function collectAccounts(): string[] {
  const out: string[] = [];
  const keys: string[] = [];

  if (process.env.PRIVATE_KEY) keys.push(process.env.PRIVATE_KEY.trim());
  for (const [k, v] of Object.entries(process.env)) {
    if (/^PK\d+$/.test(k) && typeof v === "string" && v.trim()) keys.push(v.trim());
  }

  for (const k of keys) {
    if (!HEX64.test(k)) {
      console.error(
        `\n✖ Invalid PRIVATE KEY format detected (${k.slice(0, 12)}…)\n` +
          `  Expected 0x + 64 hex chars. Offending key skipped.\n`
      );
      continue;
    }
    out.push(k);
  }
  return out;
}

const LIGHTCHAIN_RPC = (process.env.LIGHTCHAIN_RPC || "https://light-testnet-rpc.lightchain.ai").trim();
const CHAIN_ID = Number(process.env.LIGHTCHAIN_CHAIN_ID || 504);
const LOCAL_RPC = (process.env.LOCALHOST_RPC || "http://127.0.0.1:8545").trim();

const accounts = collectAccounts();
if (!accounts.length) {
  console.warn("\n⚠ No private keys found. Set PRIVATE_KEY=0x... (and optionally PK1, PK2, ...) in .env\n");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    lightchain: { url: LIGHTCHAIN_RPC, chainId: CHAIN_ID, accounts },
    localhost: { url: LOCAL_RPC, accounts },
  },
  gasReporter: {
    enabled: !!process.env.GAS_REPORT,
    currency: "USD",
    coinmarketcap: process.env.CMC_API_KEY || undefined,
  },
  etherscan: {
    apiKey: { lightchain: "empty" },
    customChains: [
      {
        network: "lightchain",
        chainId: CHAIN_ID,
        urls: {
          apiURL: "https://testnet.lightscan.app/api",
          browserURL: "https://testnet.lightscan.app",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
  mocha: { timeout: 180000 },
};

export default config;