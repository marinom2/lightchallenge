# Contributing to LightChallenge

Thank you for your interest in contributing to LightChallenge.

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL (Neon or local)
- Git

### Setup

```bash
git clone <repo-url>
cd lightchallenge
npm install
cd webapp && npm install && cd ..
cp .env.example webapp/.env.local
# Fill in webapp/.env.local with your configuration (see .env.example for reference)
```

### Development Commands

```bash
# Compile contracts
npx hardhat compile

# Run contract tests
npx hardhat test

# TypeScript type checking
npx tsc --noEmit                         # root (offchain/scripts)
cd webapp && npx tsc --noEmit            # webapp

# Run database migrations
npx tsx db/migrate.ts

# Start webapp (development)
cd webapp && npm run dev

# Start off-chain workers (each in separate terminal)
npx tsx offchain/workers/evidenceCollector.ts
npx tsx offchain/workers/evidenceEvaluator.ts
npx tsx offchain/dispatchers/challengeDispatcher.ts
npx tsx offchain/workers/challengeWorker.ts
npx tsx offchain/indexers/aivmIndexer.ts
npx tsx offchain/indexers/claimsIndexer.ts
npx tsx offchain/indexers/statusIndexer.ts
```

## Project Structure

```
contracts/          Solidity smart contracts
offchain/           TypeScript off-chain services
webapp/             Next.js 14 full-stack app
  app/api/          Server-side API routes
  lib/              Shared utilities
db/                 PostgreSQL migrations
scripts/            Deploy, admin, and ops scripts
test/               Hardhat contract tests
docs/               Additional documentation
```

## Code Guidelines

### Smart Contracts
- Solidity 0.8.24, OpenZeppelin v5.4.0
- Use custom errors (not require strings)
- All funds flow through Treasury (ChallengePay holds zero)
- Add tests for every state change

### TypeScript
- Strict mode enabled
- Use `pg` Pool for DB connections; import `sslConfig` from `offchain/db/sslConfig`
- Use `offchain/db/pool.ts` for shared pool instance
- Use expression-based `ON CONFLICT` for upserts (not named constraints)

### API Routes
- Authenticate state-mutating endpoints via `webapp/lib/auth.ts`
- Sanitize error responses (never leak `e.message`)
- Cap unbounded parameters

### Testing
- Contract tests: Hardhat + ethers v6 + chai
- Use `loadFixture` for test isolation
- Test both success paths and revert conditions

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass:
   - `npx hardhat compile` (no errors)
   - `npx hardhat test` (all passing)
   - `npx tsc --noEmit` (root + webapp, no errors)
4. Write clear commit messages
5. Open a PR with:
   - Summary of changes
   - Test plan
   - Any breaking changes noted

## Architecture Rules

1. Keep responsibilities separated by layer (contract / offchain worker / API / frontend)
2. Do not place business logic in API routes if it belongs in offchain services
3. Do not duplicate evaluation logic
4. Prefer DB-backed state over file/JSON state
5. Keep AIVM + PoI as the primary validation path
6. Archive legacy code instead of maintaining parallel paths
