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
    {
      name: "progress-sync",
      script: "npx",
      args: "tsx offchain/workers/progressSyncWorker.ts",
      cwd: __dirname,
      restart_delay: 5000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PROGRESS_SYNC_POLL_MS: "900000",
        PROGRESS_SYNC_BATCH: "50",
      },
    },
    {
      // TESTNET ONLY: simulates Lightchain AIVM workers + validators.
      // On production, remove AIVM_SIMULATOR_ENABLED — the worker exits immediately.
      name: "aivm-simulator",
      script: "npx",
      args: "tsx offchain/workers/aivmTestnetSimulator.ts",
      cwd: __dirname,
      restart_delay: 10000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        AIVM_SIMULATOR_ENABLED: "true",
        AIVM_SIMULATOR_POLL_MS: "10000",
      },
    },
    {
      name: "auto-cancel",
      script: "npx",
      args: "tsx offchain/workers/autoCancelWorker.ts",
      cwd: __dirname,
      restart_delay: 10000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTO_CANCEL_POLL_MS: "60000",
      },
    },
    {
      name: "auto-distribute",
      script: "npx",
      args: "tsx offchain/workers/autoDistributeWorker.ts",
      cwd: __dirname,
      restart_delay: 10000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTO_DISTRIBUTE_POLL_MS: "30000",
      },
    },
  ],
};
