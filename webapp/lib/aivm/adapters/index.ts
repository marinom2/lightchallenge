// Re-export types for external consumers (from types.ts — no circular import)
export type { CanonicalRecord, AdapterResult, AdapterContext, Adapter } from "./types";

// Re-export individual adapters for named imports
export { appleAdapter } from "./apple";
export { dotaAdapter } from "./dota";
export { stravaAdapter } from "./strava";
export { garminAdapter } from "./garmin";
export { lolAdapter } from "./lol";
export { googleFitAdapter } from "./googlefit";
export { fitbitAdapter } from "./fitbit";
export { cs2Adapter } from "./cs2";

// Registry — each adapter imports from ./types (not ./index), so no cycle
import { appleAdapter } from "./apple";
import { dotaAdapter } from "./dota";
import { stravaAdapter } from "./strava";
import { garminAdapter } from "./garmin";
import { lolAdapter } from "./lol";
import { googleFitAdapter } from "./googlefit";
import { fitbitAdapter } from "./fitbit";
import { cs2Adapter } from "./cs2";
import type { Adapter } from "./types";

export const adapters: Adapter[] = [
  appleAdapter,
  dotaAdapter,
  stravaAdapter,
  garminAdapter,
  lolAdapter,
  googleFitAdapter,
  fitbitAdapter,
  cs2Adapter,
];

/** All fitness adapters — used by proof submission to let users pick their tracker */
export const fitnessAdapters = adapters.filter((a) => a.category === "fitness");

/** Find adapter by name (e.g. "strava.distance_in_window") */
export function adapterByName(name: string): Adapter | undefined {
  return adapters.find((a) => a.name === name);
}
