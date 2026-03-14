/**
 * offchain/connectors/connectorRegistry.ts
 *
 * Registry of API-based evidence connectors.
 *
 * Maps provider name → Connector implementation.
 * Used by the evidence collector worker.
 */

import type { Connector } from "./connectorTypes";
import { opendotaConnector } from "./opendotaConnector";
import { riotConnector } from "./riotConnector";
import { stravaApiConnector } from "./stravaApiConnector";
import { appleUploadConnector } from "./appleUploadConnector";
import { garminConnector } from "./garminConnector";
import { googlefitConnector } from "./googlefitConnector";
import { fitbitConnector } from "./fitbitConnector";
import { faceitConnector } from "./faceitConnector";

const registry: Map<string, Connector> = new Map([
  ["opendota",  opendotaConnector],
  ["riot",      riotConnector],
  ["strava",    stravaApiConnector],
  ["apple",     appleUploadConnector],
  ["garmin",    garminConnector],
  ["googlefit", googlefitConnector],
  ["fitbit",    fitbitConnector],
  ["faceit",    faceitConnector],
]);

/**
 * Return the connector for the given provider, or null if unsupported.
 */
export function getConnector(provider: string): Connector | null {
  return registry.get(provider) ?? null;
}

/** All registered provider names. */
export function registeredProviders(): string[] {
  return Array.from(registry.keys());
}
