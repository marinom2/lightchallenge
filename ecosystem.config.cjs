/**
 * PM2 ecosystem configuration for LightChallenge off-chain workers.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs          # start all workers
 *   pm2 start ecosystem.config.cjs --only evidence-collector
 *   pm2 logs                                 # tail all logs
 *   pm2 status                               # check worker health
 *   pm2 restart all                          # restart everything
 *   pm2 stop all && pm2 delete all           # tear down
 *
 * Prerequisites:
 *   npm install -g pm2
 *   npm install          (at repo root)
 *   webapp/.env.local    (DATABASE_URL, STRAVA_*, OAUTH_ENCRYPTION_KEY, etc.)
 *
 * See OPERATIONS.md for full documentation on each worker.
 */

module.exports = {
  apps: [
    {
      name: "evidence-collector",
      script: "npx",
      args: "tsx offchain/workers/evidenceCollector.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        EVIDENCE_COLLECTOR_POLL_MS: "300000",
        EVIDENCE_COLLECTOR_LOOKBACK_DAYS: "90",
      },
    },
    {
      name: "evidence-evaluator",
      script: "npx",
      args: "tsx offchain/workers/evidenceEvaluator.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        EVIDENCE_EVALUATOR_POLL_MS: "15000",
        EVIDENCE_EVALUATOR_BATCH: "50",
      },
    },
    {
      name: "challenge-dispatcher",
      script: "npx",
      args: "tsx offchain/dispatchers/challengeDispatcher.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "challenge-worker",
      script: "npx",
      args: "tsx offchain/workers/challengeWorker.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "aivm-indexer",
      script: "npx",
      args: "tsx offchain/indexers/aivmIndexer.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "status-indexer",
      script: "npx",
      args: "tsx offchain/indexers/statusIndexer.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "claims-indexer",
      script: "npx",
      args: "tsx offchain/indexers/claimsIndexer.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
