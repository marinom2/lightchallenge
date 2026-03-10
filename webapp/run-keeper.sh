#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV=production
export DOTENV_CONFIG_PATH=.env.local
exec /opt/homebrew/bin/npx tsx -r dotenv/config scripts/keeperFinalize.ts
