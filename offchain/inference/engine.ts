import fs from "node:fs";
import { evaluate, Rule, Activity, Verdict } from "./metrics";

export function loadJson<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function run(rulePath: string, activitiesPath: string): Verdict {
  const rule = loadJson<Rule>(rulePath);
  const data = loadJson<{athlete: {address: string}, activities: Activity[]}>(activitiesPath);
  const verdict = evaluate(rule, data.activities);
  return verdict;
}
