#!/usr/bin/env zsh
set -euo pipefail

NET="${NET:-lightchain}"
INTERVAL="${INTERVAL:-10}"

echo "👀 Watching for new challenges on $NET every $INTERVAL sec (Ctrl+C to stop)…"

lastPrinted="-1"

get_json() {
  MODE=json npx hardhat run scripts/listChallenges.ts --network "$NET"
}

while true; do
  json="$(get_json 2>/dev/null || true)"
  if [[ -n "$json" && "$json" != "[]" ]]; then
    # Find max id
    maxId=$(echo "$json" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));console.log(d.reduce((m,x)=>Math.max(m,x.id),-1));' || echo "-1")
    # Print any new ones between (lastPrinted, maxId]
    if [[ "$maxId" -gt "$lastPrinted" ]]; then
      echo "$json" | node -e '
        const fs=require("fs");
        const d=JSON.parse(fs.readFileSync(0,"utf8"));
        const last=Number(process.env.LAST||"-1");
        const rows=d.filter(x=>x.id>last).sort((a,b)=>a.id-b.id);
        for(const ch of rows){
          console.log(`➕ New #${ch.id} | ${ch.status} | AD: ${ch.approvalDeadlineISO||"-"} | startTs: ${ch.startTsISO||"-"}`);
        }
      ' LAST="$lastPrinted"
      lastPrinted="$maxId"
    fi
  fi
  sleep "$INTERVAL"
done