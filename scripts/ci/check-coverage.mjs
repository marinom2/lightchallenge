import fs from "fs";

const path = "coverage/coverage-summary.json";
if (!fs.existsSync(path)) {
  console.error("❌ coverage-summary.json not found. Did you run coverage?");
  process.exit(1);
}
const sum = JSON.parse(fs.readFileSync(path, "utf8"));

const thr = {
  statements: Number(process.env.COVERAGE_STMTS || 70),
  branches:   Number(process.env.COVERAGE_BRANCH || 40),
  functions:  Number(process.env.COVERAGE_FUNCS || 60),
  lines:      Number(process.env.COVERAGE_LINES || 70),
};

const pct = (node) => (node && typeof node.pct === "number") ? node.pct : 0;
const t = sum.total || {};
const now = {
  statements: pct(t.statements),
  branches:   pct(t.branches),
  functions:  pct(t.functions),
  lines:      pct(t.lines),
};

let ok = true;
for (const k of Object.keys(thr)) {
  const got = now[k];
  const need = thr[k];
  if (got < need) {
    console.error(`❌ Coverage threshold failed: ${k}=${got}% < ${need}%`);
    ok = false;
  } else {
    console.log(`✅ ${k}: ${got}% (>= ${need}%)`);
  }
}
process.exit(ok ? 0 : 2);