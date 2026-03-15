/**
 * Fitness provider definitions for the proof submission adapter picker
 * and default tracking preference.
 */

export interface FitnessProvider {
  id: string;
  name: string;
  icon: string;
  /** Adapter name prefix used by intake API `provider` param */
  adapterPrefix: string;
  fileAccept: string[];
  fileHint: string;
  instructions: string;
  /** True for providers that need mobile export (Apple Health) */
  mobilePreferred: boolean;
}

export const FITNESS_PROVIDERS: FitnessProvider[] = [
  {
    id: "apple_health",
    name: "Apple Health",
    icon: "🍎",
    adapterPrefix: "apple_health",
    fileAccept: [".zip"],
    fileHint: "ZIP export from the Health app",
    instructions:
      "On your iPhone: Health app → profile → Export All Health Data → share the ZIP here.",
    mobilePreferred: true,
  },
  {
    id: "strava",
    name: "Strava",
    icon: "🏃",
    adapterPrefix: "strava",
    fileAccept: [".json", ".csv"],
    fileHint: "Strava activity export (JSON or CSV)",
    instructions:
      "Export from Strava: Settings → My Account → Download Your Data, or connect via Linked Accounts for auto-collection.",
    mobilePreferred: false,
  },
  {
    id: "garmin",
    name: "Garmin Connect",
    icon: "⌚",
    adapterPrefix: "garmin",
    fileAccept: [".json", ".tcx", ".gpx"],
    fileHint: "Garmin daily steps JSON, TCX, or GPX export",
    instructions:
      "Export from Garmin Connect: gear icon → Account → Export Your Data, or export activities as TCX/GPX.",
    mobilePreferred: false,
  },
  {
    id: "fitbit",
    name: "Fitbit",
    icon: "📊",
    adapterPrefix: "fitbit",
    fileAccept: [".json"],
    fileHint: "Fitbit daily activity JSON",
    instructions:
      "Export from fitbit.com: Settings → Data Export → Request Data, or connect via Linked Accounts.",
    mobilePreferred: false,
  },
  {
    id: "google_fit",
    name: "Google Fit",
    icon: "🏋️",
    adapterPrefix: "googlefit",
    fileAccept: [".json"],
    fileHint: "Google Fit Takeout export JSON",
    instructions:
      "Export via Google Takeout: takeout.google.com → select Google Fit → Export once.",
    mobilePreferred: false,
  },
];

export const GAMING_PROVIDERS = [
  { id: "dota", name: "Dota 2", icon: "🎮" },
  { id: "lol", name: "League of Legends", icon: "⚔️" },
  { id: "cs2", name: "Counter-Strike 2", icon: "🔫" },
] as const;

/** Get provider by ID */
export function getFitnessProvider(id: string): FitnessProvider | undefined {
  return FITNESS_PROVIDERS.find((p) => p.id === id);
}

// ─── Tracking Preference (localStorage) ────────────────────────────────────

const PREF_KEY = "lc.tracking.fitness";
const GAME_PREF_KEY = "lc.tracking.gaming";

export function getDefaultFitnessProvider(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PREF_KEY);
}

export function setDefaultFitnessProvider(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, id);
}

export function getDefaultGamingProvider(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GAME_PREF_KEY);
}

export function setDefaultGamingProvider(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GAME_PREF_KEY, id);
}
