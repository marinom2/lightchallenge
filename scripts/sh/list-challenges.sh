#!/usr/bin/env zsh
set -euo pipefail

# Render the trusted JSON output from scripts/listChallenges.ts
# and format a simple table in zsh/awk (no brittle greps).

json=$(MODE=json npx hardhat run scripts/listChallenges.ts --network lightchain)

# Header
printf "\n================ CHALLENGES ================\n"
printf "ID | STATUS     | OUTCOME | ApprovalDeadline (UTC)     | startTs (UTC)            | Pools (S/F)\n"
printf "--------------------------------------------\n"

# If empty array, just close table
if [[ "$json" == "[]" ]]; then
  printf "============================================\n"
  exit 0
fi

# Print each row
echo "$json" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
for (const ch of data) {
  const pad = (s, n)=> (s+" ".repeat(n)).slice(0, n);
  const id = String(ch.id).padStart(2," ");
  const status  = pad(ch.status, 9);
  const outcome = pad(ch.outcome, 6);
  const adISO   = ch.approvalDeadlineISO || "-";
  const stISO   = ch.startTsISO || "-";
  const sWei = ch.poolSuccessWei || "0";
  const fWei = ch.poolFailWei    || "0";
  console.log(`${id} | ${status}  | ${outcome} | ${adISO.padEnd(26)} | ${stISO.padEnd(26)} | ${sWei} / ${fWei}`);
}
'

printf "============================================\n"