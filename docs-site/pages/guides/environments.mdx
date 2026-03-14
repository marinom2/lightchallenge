# Environments

LightChallenge supports three environments: **Local**, **UAT**, and **Production**.

## Domain Architecture

| Environment | App | Docs | Explorer |
|-------------|-----|------|----------|
| **Local** | `localhost:3000` | — | — |
| **UAT** | `uat.lightchallenge.app` | `uat.docs.lightchallenge.app` | [testnet.lightscan.app](https://testnet.lightscan.app) |
| **Production** | `app.lightchallenge.app` | `docs.lightchallenge.app` | TBD |

## Chain Configuration

| Environment | Chain | Chain ID | RPC |
|-------------|-------|----------|-----|
| Local | Lightchain Testnet | 504 | `https://light-testnet-rpc.lightchain.ai` |
| UAT | Lightchain Testnet | 504 | `https://light-testnet-rpc.lightchain.ai` |
| Production | Lightchain Mainnet | TBD | TBD |

## Database

Each environment uses a separate PostgreSQL database (Neon):

| Environment | Variable | Notes |
|-------------|----------|-------|
| Local | `DATABASE_URL` in `webapp/.env.local` | Developer's local or Neon branch |
| UAT | `DATABASE_URL` in Vercel (Preview) | Shared UAT database |
| Production | `DATABASE_URL` in Vercel (Production) | Production database (separate Neon project) |

## Key Environment Variables That Differ

| Variable | Local | UAT | Production |
|----------|-------|-----|------------|
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | `https://uat.lightchallenge.app` | `https://app.lightchallenge.app` |
| `DATABASE_URL` | Local/dev DB | UAT Neon DB | Production Neon DB |
| `LCAI_WORKER_PK` | Dev wallet | UAT operator wallet | Production operator wallet |
| `LCAI_FINALIZE_PK` | Dev wallet | UAT operator wallet | Production operator wallet |
| `NEXT_PUBLIC_CHAIN_ID` | `504` | `504` | TBD (mainnet) |

## Vercel Configuration

Single Vercel project (`lightchallenge`) with environment-scoped variables:

- **Preview deployments** → UAT environment variables
- **Production deployments** → Production environment variables
- Root directory: `webapp`
- Framework: Next.js
- GitHub auto-deploy: `main` branch

## iOS Collector

| Environment | Server URL | Default |
|-------------|-----------|---------|
| Local | `http://<MAC_IP>:3000` | No |
| UAT | `https://uat.lightchallenge.app` | Yes (testnet phase) |
| Production | `https://app.lightchallenge.app` | Yes (mainnet phase) |

The iOS app defaults to UAT during the testnet phase. Users can switch environments in the app UI.

## Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/marinom2/lightchallenge.git
cd lightchallenge
npm install
cd webapp && npm install && cd ..

# 2. Configure environment
cp .env.example webapp/.env.local
# Edit webapp/.env.local with your DATABASE_URL and keys

# 3. Run database migrations
npx tsx db/migrate.ts

# 4. Start the webapp
cd webapp && npm run dev

# 5. Start workers (separate terminals)
npx tsx offchain/workers/evidenceEvaluator.ts
npx tsx offchain/workers/challengeDispatcher.ts
npx tsx offchain/workers/challengeWorker.ts
npx tsx offchain/indexers/aivmIndexer.ts
```

## Contract Addresses (Testnet — UAT)

| Contract | Address |
|----------|---------|
| ChallengePay | `0xBeA3b508a5Ce2E6C8462108f42c732Da7454c5cb` |
| EventChallengeRouter | `0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D` |
| Treasury | `0xe84c197614d4fAAE1CdA8d6067fFe43befD9e961` |
| MetadataRegistry | `0xe9bAA8c04cd77d06A736fc987cC13348DfF0bfAb` |
| TrustedForwarder | `0xedF522094Ce3F497BEAA9f730d15a7dd554CaB4d` |
| ChallengeTaskRegistry | `0x0e079C693Bd177Fa31baab70EfCD5b9D625c355E` |
| ChallengePayAivmPoiVerifier | `0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123` |
