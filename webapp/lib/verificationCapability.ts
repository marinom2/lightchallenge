/**
 * webapp/lib/verificationCapability.ts
 *
 * Verification Capability Engine (VCE)
 *
 * Given challenge metadata (modelHash, modelId, category, game), the VCE
 * determines the correct proof path for a user.  It is a pure function
 * library — no React, no async, no network calls.  The async part
 * (account-binding lookup) is handled by the useProofCapability hook.
 *
 * Architecture:
 *   Challenge meta → detectSource() → SourceInfo
 *   SourceInfo + accountConnected → computePrimaryAction()
 *
 * Source types map directly to real adapter capabilities in
 * webapp/lib/aivm/adapters/*.ts.  Any model hash not present in
 * ADAPTER_MODEL_HASHES yields mode="unsupported".
 */

// ─── Source Types ─────────────────────────────────────────────────────────────

export type SourceType =
  | "apple_health"
  | "strava"
  | "garmin"
  | "fitbit"
  | "google_fit"
  | "dota"
  | "lol"
  | "cs2"
  | "unknown";

// ─── Verification Modes ───────────────────────────────────────────────────────

/**
 * mobile_upload     — Apple Health: manual ZIP export, QR handoff to iPhone preferred.
 * file_upload       — Fitness sources: desktop/mobile file upload (JSON/CSV/TCX/GPX/ZIP).
 * account_required  — Gaming: Steam or Riot binding required before any submission.
 * linked_submit     — Gaming: account connected, ready to submit match data via file/json.
 * unsupported       — No adapter exists for this challenge's model hash.
 * unknown           — Cannot determine source from available metadata.
 */
export type VerificationMode =
  | "mobile_upload"
  | "file_upload"
  | "account_required"
  | "linked_submit"
  | "unsupported"
  | "unknown";

// ─── Primary Actions ──────────────────────────────────────────────────────────

/**
 * The single best next action the user should take.
 *
 * show_qr        — Open QR modal (Apple Health mobile handoff).
 * upload_file    — Show file picker (fitness exports).
 * connect_steam  — Redirect to Steam linking.
 * connect_riot   — Redirect to Riot linking.
 * submit_match   — Account connected, show match JSON upload.
 * unsupported    — No path available; show informational state.
 */
export type PrimaryAction =
  | "show_qr"
  | "upload_file"
  | "connect_steam"
  | "connect_riot"
  | "submit_match"
  | "unsupported";

// ─── Source Info ──────────────────────────────────────────────────────────────

export interface SourceInfo {
  type: SourceType;
  name: string;
  /** Emoji icon for source badges */
  icon: string;
  mode: VerificationMode;
  adapterExists: boolean;
  /** Which platform binding is required (null = none) */
  accountPlatform: "steam" | "riot" | null;
  /** File extensions accepted by the adapter (empty = not file-based) */
  fileAccept: string[];
  /** Short label shown in upload area: "ZIP export from Apple Health" */
  fileHint: string;
  /** One-line instructions shown near the action area */
  instructions: string;
  /** True for Apple Health — QR handoff should be the default CTA */
  mobilePreferred: boolean;
}

// ─── Adapter model-hash → source mapping ─────────────────────────────────────
//
// Derived directly from webapp/lib/aivm/adapters/*.ts MODEL_HASH constants.
// Hashes not listed here have NO adapter → mode = unsupported.

const ADAPTER_HASHES: Record<string, SourceType> = {
  // ── Apple Health ──
  "0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e": "apple_health",
  // ── Garmin ──
  "0x7abfc322e4b015bd06ff99afe644c44868506d0ef39ae80a17b21813a389a1f2": "garmin",     // garmin.steps@1
  "0x1f0529367f707855129caa7af76a01c8ed88b22602f06433aaa7fc0a50cd1b90": "garmin",     // garmin.distance@1
  // ── Strava ──
  "0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e": "strava",     // strava.distance_in_window@1
  // ── Fitbit ──
  "0xef89f75d3f5b1bb04ee42748a51dc8410c79cfdea474356ed5edb0b08e451ee9": "fitbit",     // fitbit.steps@1
  "0x3a7a7b773abcce8dd5619d63eff68bb14d12b873ca5d2fb395aee7a5c5d89fd6": "fitbit",     // fitbit.distance@1
  // ── Google Fit ──
  "0xe63ac4325bc9b06404dabf113dbee540064bb36aac31f54dd9ae3dad706b9484": "google_fit", // googlefit.steps@1
  "0x396b3817947618e5e3277256c54eae4c10def805bb207513deaa9bb30b19dd2e": "google_fit", // googlefit.distance@1
  // ── Dota 2 ──
  "0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def": "dota",       // dota.private_match_1v1@1
  "0xa36667f7fba0e008bfca236bcec118fef4f7177046cbc57f093b557b41ca95e6": "dota",       // dota.private_match_5v5@1
  "0x0de4617234d3fed82c42a35ff8de9aeb1e3ed5aba0e6f4e8c0aba71cc4dff2f5": "dota",       // dota.hero_kills_window@1
  // ── League of Legends ──
  "0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3": "lol",        // lol.winrate_next_n@1
  // ── CS2 / FACEIT ──
  "0x68897197aeecd201ed61384bb4b1b07b1e14d4c3ac57ed33ebc0dd528ed551f4": "cs2",        // cs2.faceit_wins@1
};

// ─── Source metadata table ────────────────────────────────────────────────────

const SOURCE_META: Record<
  SourceType,
  Pick<
    SourceInfo,
    | "name"
    | "icon"
    | "mode"
    | "accountPlatform"
    | "fileAccept"
    | "fileHint"
    | "instructions"
    | "mobilePreferred"
  >
> = {
  apple_health: {
    name: "Apple Health",
    icon: "🍎",
    mode: "mobile_upload",
    accountPlatform: null,
    fileAccept: [".zip"],
    fileHint: "ZIP export from the Health app",
    instructions:
      'On your iPhone: open the Health app → tap your profile photo → Export All Health Data → share the ZIP to Safari or AirDrop it to your Mac and upload here. Or scan the QR code to open this page on your iPhone.',
    mobilePreferred: true,
  },
  strava: {
    name: "Strava",
    icon: "🏃",
    mode: "file_upload",
    accountPlatform: null,
    fileAccept: [".json", ".csv"],
    fileHint: "Strava activity export (JSON or CSV)",
    instructions:
      "Connect your Strava account in Settings → Linked Accounts for automatic verification. Or upload a manual export: Settings → My Account → Download Your Data → upload activities.json or activities.csv.",
    mobilePreferred: false,
  },
  garmin: {
    name: "Garmin Connect",
    icon: "⌚",
    mode: "file_upload",
    accountPlatform: null,
    fileAccept: [".json", ".tcx", ".gpx"],
    fileHint: "Garmin daily steps JSON, TCX, or GPX export",
    instructions:
      "Garmin does not offer a public API — export manually from Garmin Connect: " +
      "connect.garmin.com → gear icon → Account → Export Your Data for a JSON daily summary, " +
      "or export individual activities as TCX/GPX from the activity detail page.",
    mobilePreferred: false,
  },
  fitbit: {
    name: "Fitbit",
    icon: "📊",
    mode: "file_upload",
    accountPlatform: null,
    fileAccept: [".json"],
    fileHint: "Fitbit daily activity JSON",
    instructions:
      "Connect your Fitbit account in Settings → Linked Accounts for automatic verification. " +
      "Or export manually: fitbit.com → Settings → Data Export → Request Data. Upload the steps or activity JSON.",
    mobilePreferred: false,
  },
  google_fit: {
    name: "Google Fit",
    icon: "🏋️",
    mode: "file_upload",
    accountPlatform: null,
    fileAccept: [".json"],
    fileHint: "Google Fit Takeout export JSON",
    instructions:
      "Google shut down the Google Fit API in 2025. Export via Google Takeout: " +
      "takeout.google.com → select Google Fit → All data included → Export once. " +
      "Upload the daily activity metrics JSON file from the downloaded archive.",
    mobilePreferred: false,
  },
  dota: {
    name: "Dota 2",
    icon: "🎮",
    mode: "account_required",
    accountPlatform: "steam",
    fileAccept: [".json"],
    fileHint: "Match data JSON",
    instructions:
      "Link your Steam account so the system can verify your match history through OpenDota. Once connected, upload the match data JSON for the qualifying match.",
    mobilePreferred: false,
  },
  lol: {
    name: "League of Legends",
    icon: "⚔️",
    mode: "account_required",
    accountPlatform: "riot",
    fileAccept: [".json"],
    fileHint: "LoL match data JSON",
    instructions:
      "Link your Riot account in Settings → Linked Accounts (enter your Riot ID or PUUID). Once linked, the system automatically fetches your match history. Or upload match data JSON directly.",
    mobilePreferred: false,
  },
  cs2: {
    name: "Counter-Strike 2",
    icon: "🔫",
    mode: "account_required",
    accountPlatform: "steam",
    fileAccept: [".json"],
    fileHint: "FACEIT match data JSON",
    instructions:
      "CS2 verification uses FACEIT. Link your Steam account (which must be connected to FACEIT). " +
      "The system automatically fetches your FACEIT match history. " +
      "Note: only FACEIT matches are verified — Valve does not provide a public API for matchmaking data.",
    mobilePreferred: false,
  },
  unknown: {
    name: "Unknown source",
    icon: "⚡",
    mode: "unknown",
    accountPlatform: null,
    fileAccept: [],
    fileHint: "",
    instructions: "This challenge type is not yet recognized by the system.",
    mobilePreferred: false,
  },
};

// ─── detectSource ─────────────────────────────────────────────────────────────

export interface ChallengeMeta {
  modelHash?: string | null;
  modelId?: string | null;
  category?: string | null;
  game?: string | null;
}

/**
 * detectSource(meta) → SourceInfo
 *
 * Determines the source type and full metadata from challenge metadata.
 * Resolution order:
 *   1. modelHash exact match in ADAPTER_HASHES
 *   2. modelId prefix match (e.g. "apple_health.*")
 *   3. game string heuristic
 *   4. category heuristic
 *   5. unknown
 */
export function detectSource(meta: ChallengeMeta): SourceInfo {
  const mh = (meta.modelHash ?? "").toLowerCase();
  const mid = (meta.modelId ?? "").toLowerCase();
  const game = (meta.game ?? "").toLowerCase();
  const category = (meta.category ?? "").toLowerCase();

  // 1. Exact model hash lookup
  let sourceType: SourceType | undefined = ADAPTER_HASHES[mh] as SourceType | undefined;

  // 2. modelId prefix
  if (!sourceType) {
    if (mid.startsWith("apple_health")) sourceType = "apple_health";
    else if (mid.startsWith("strava")) sourceType = "strava";
    else if (mid.startsWith("garmin")) sourceType = "garmin";
    else if (mid.startsWith("fitbit")) sourceType = "fitbit";
    else if (mid.startsWith("googlefit") || mid.startsWith("google_fit"))
      sourceType = "google_fit";
    else if (mid.startsWith("dota")) sourceType = "dota";
    else if (mid.startsWith("lol")) sourceType = "lol";
    else if (mid.startsWith("cs2") || mid.startsWith("csgo") || mid.startsWith("counter")) sourceType = "cs2";
  }

  // 3. game heuristic
  if (!sourceType) {
    if (game.includes("dota")) sourceType = "dota";
    else if (game.includes("league") || game.includes("lol")) sourceType = "lol";
    else if (game.includes("cs2") || game.includes("csgo") || game.includes("counter-strike")) sourceType = "cs2";
  }

  // 4. category fallback
  if (!sourceType) {
    if (category === "fitness") sourceType = "apple_health"; // safest default for fitness
    else if (category === "gaming") sourceType = "unknown";
  }

  if (!sourceType) sourceType = "unknown";

  const adapterExists = mh ? mh in ADAPTER_HASHES : sourceType !== "unknown";

  // For Dota/LoL without an adapter hash, override mode to unsupported
  let meta2 = SOURCE_META[sourceType];
  let mode = meta2.mode;
  if (mh && !ADAPTER_HASHES[mh] && sourceType !== "unknown") {
    // We identified the source but no adapter handles THIS specific hash
    mode = "unsupported";
  }

  return {
    type: sourceType,
    adapterExists: adapterExists && mode !== "unsupported",
    mode,
    name: meta2.name,
    icon: meta2.icon,
    accountPlatform: meta2.accountPlatform,
    fileAccept: meta2.fileAccept,
    fileHint: meta2.fileHint,
    instructions: meta2.instructions,
    mobilePreferred: meta2.mobilePreferred,
  };
}

// ─── computePrimaryAction ────────────────────────────────────────────────────

/**
 * Given a SourceInfo and whether the required account is currently connected,
 * return the best primary action for the user.
 */
export function computePrimaryAction(
  source: SourceInfo,
  accountConnected: boolean
): PrimaryAction {
  if (!source.adapterExists || source.mode === "unsupported" || source.mode === "unknown") {
    return "unsupported";
  }
  if (source.mode === "mobile_upload") return "show_qr";
  if (source.mode === "file_upload") return "upload_file";
  if (source.mode === "account_required") {
    if (accountConnected) return "submit_match";
    return source.accountPlatform === "riot" ? "connect_riot" : "connect_steam";
  }
  if (source.mode === "linked_submit") return "submit_match";
  return "unsupported";
}

// ─── primaryActionLabel ───────────────────────────────────────────────────────

/** Human-readable label for a primary action button. */
export function primaryActionLabel(action: PrimaryAction, source: SourceInfo): string {
  switch (action) {
    case "show_qr": return "Continue on mobile";
    case "upload_file": return `Upload ${source.name} data`;
    case "connect_steam": return "Connect Steam";
    case "connect_riot": return "Connect Riot";
    case "submit_match": return "Submit match data";
    case "unsupported": return "Not supported";
  }
}

// ─── Re-export model hash map (for adapter existence checks) ──────────────────

export { ADAPTER_HASHES };
