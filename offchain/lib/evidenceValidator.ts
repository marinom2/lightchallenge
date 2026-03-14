/**
 * offchain/lib/evidenceValidator.ts
 *
 * Source-aware evidence validation layer.
 *
 * Before an uploaded file reaches the adapter, this module performs structural
 * validation: file type, size, shape, and basic content checks.  It ensures
 * "upload file" is NOT "upload anything" — each source has specific expectations.
 *
 * Usage:
 *   const result = validateEvidence(provider, file, fileName);
 *   if (!result.valid) return { error: result.reason };
 *
 * This module is pure TypeScript — no React, no DB, no network calls.
 */

export interface ValidationResult {
  valid: boolean;
  /** Human-readable reason for rejection (null when valid). */
  reason: string | null;
  /** Detected file format for logging/metadata. */
  detectedFormat: string | null;
  /** Extracted metadata (record count hint, date range, etc.). */
  metadata: Record<string, unknown>;
  /** Confidence level: high = structured data parsed, medium = format matches, low = best-effort */
  confidence: "high" | "medium" | "low";
}

/** Maximum file size per provider (bytes). */
const MAX_FILE_SIZES: Record<string, number> = {
  apple:    500 * 1024 * 1024,  // 500 MB (Health export ZIPs can be large)
  strava:    50 * 1024 * 1024,  // 50 MB
  garmin:    50 * 1024 * 1024,  // 50 MB
  fitbit:    50 * 1024 * 1024,  // 50 MB
  googlefit: 50 * 1024 * 1024,  // 50 MB
  opendota:  10 * 1024 * 1024,  // 10 MB (JSON match data)
  riot:      10 * 1024 * 1024,  // 10 MB
  steam:     10 * 1024 * 1024,  // 10 MB
  manual:   100 * 1024 * 1024,  // 100 MB
};

/** Allowed file extensions per provider (lowercase, with dot). */
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  apple:    [".zip"],
  strava:   [".json", ".csv"],
  garmin:   [".json", ".tcx", ".gpx"],
  fitbit:   [".json"],
  googlefit:[".json"],
  opendota: [".json"],
  riot:     [".json"],
  steam:    [".json"],
  manual:   [".json", ".csv", ".zip", ".xml", ".txt"],
};

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function fail(reason: string, format?: string): ValidationResult {
  return { valid: false, reason, detectedFormat: format ?? null, metadata: {}, confidence: "low" };
}

function ok(format: string, metadata: Record<string, unknown>, confidence: ValidationResult["confidence"] = "high"): ValidationResult {
  return { valid: true, reason: null, detectedFormat: format, metadata, confidence };
}

// ─── Per-provider validators ─────────────────────────────────────────────────

function validateApple(buf: Buffer, fileName: string): ValidationResult {
  // Must be a ZIP file (magic bytes: PK\x03\x04)
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return fail("File is not a valid ZIP archive. Export your data from the iPhone Health app as a ZIP file.");
  }
  // Check for export.xml presence (scan for the filename in ZIP central directory)
  const text = buf.toString("latin1");
  if (!text.includes("export.xml")) {
    return fail(
      "ZIP does not contain export.xml. Make sure you exported from Apple Health: " +
      "open Health → tap your profile → Export All Health Data."
    );
  }
  return ok("apple_health_zip", { estimatedSize: buf.length }, "high");
}

function validateStrava(buf: Buffer, fileName: string): ValidationResult {
  const ext = fileExt(fileName);
  const text = buf.toString("utf8").trim();

  if (ext === ".csv") {
    const firstLine = text.split("\n")[0] ?? "";
    // Strava CSV exports have headers like: Activity ID, Activity Date, Activity Name, ...
    const hasHeaders = /activity/i.test(firstLine) || /distance/i.test(firstLine) || /duration/i.test(firstLine);
    if (!hasHeaders) {
      return fail("CSV does not appear to be a Strava export. Expected headers like 'Activity ID', 'Activity Date', 'Distance'.");
    }
    const lineCount = text.split("\n").length - 1;
    return ok("strava_csv", { lineCount }, "medium");
  }

  if (ext === ".json") {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return fail("Invalid JSON file. Expected Strava activities export (JSON array).");
    }
    // Strava JSON: array of activities OR { activities: [...] }
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.activities) ? parsed.activities : null);
    if (!arr) {
      return fail("JSON is not an array of activities. Expected Strava export format: [{...}, ...] or {activities: [...]}.");
    }
    if (arr.length === 0) {
      return fail("Activities array is empty. No activity data to verify.");
    }
    // Check first record has expected Strava fields
    const first = arr[0];
    const hasStravaFields = first.distance !== undefined || first.type !== undefined ||
      first.start_date !== undefined || first.name !== undefined || first.moving_time !== undefined;
    if (!hasStravaFields) {
      return fail(
        "JSON records don't look like Strava activities. Expected fields: distance, type, start_date, moving_time. " +
        "Download your activities from Strava: Settings → My Account → Download Your Data."
      );
    }
    return ok("strava_json", { activityCount: arr.length }, "high");
  }

  return fail(`Unsupported file type '${ext}'. Strava accepts .json or .csv exports.`);
}

function validateGarmin(buf: Buffer, fileName: string): ValidationResult {
  const ext = fileExt(fileName);
  const text = buf.toString("utf8").trim();

  if (ext === ".tcx") {
    if (!text.includes("<TrainingCenterDatabase")) {
      return fail("File is not a valid TCX (Training Center XML). Expected <TrainingCenterDatabase> root element.");
    }
    const lapCount = (text.match(/<Lap/g) || []).length;
    const tpCount = (text.match(/<Trackpoint>/g) || []).length;
    return ok("garmin_tcx", { lapCount, trackpointCount: tpCount }, "high");
  }

  if (ext === ".gpx") {
    if (!text.includes("<gpx")) {
      return fail("File is not a valid GPX. Expected <gpx> root element.");
    }
    const trkptCount = (text.match(/<trkpt/g) || []).length;
    return ok("garmin_gpx", { trackpointCount: trkptCount }, "high");
  }

  if (ext === ".json") {
    let parsed: any;
    try { parsed = JSON.parse(text); } catch {
      return fail("Invalid JSON file. Expected Garmin daily steps export.");
    }
    if (!Array.isArray(parsed)) {
      return fail("JSON is not an array. Expected Garmin daily steps format: [{date: '...', steps: N}, ...].");
    }
    if (parsed.length === 0) {
      return fail("JSON array is empty. No step data to verify.");
    }
    const first = parsed[0];
    if (!first.date && !first.calendarDate) {
      return fail("JSON records missing 'date' field. Expected Garmin format: [{date: 'YYYY-MM-DD', steps: N}, ...].");
    }
    return ok("garmin_steps_json", { dayCount: parsed.length }, "high");
  }

  return fail(`Unsupported file type '${ext}'. Garmin accepts .tcx, .gpx, or .json (daily steps).`);
}

function validateFitbit(buf: Buffer, fileName: string): ValidationResult {
  const text = buf.toString("utf8").trim();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch {
    return fail("Invalid JSON file. Expected Fitbit activity export.");
  }

  // Shape 1: [{dateTime, value}] — daily steps
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.dateTime === "string") {
    return ok("fitbit_daily_steps", { dayCount: parsed.length }, "high");
  }

  // Shape 2: [{startTime, duration, distance}] — activity log
  if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.startTime || parsed[0]?.startDate)) {
    return ok("fitbit_activities", { activityCount: parsed.length }, "high");
  }

  // Shape 3: {steps: [...], activities: [...]} — combined export
  if (parsed?.steps || parsed?.activities) {
    const stepCount = Array.isArray(parsed.steps) ? parsed.steps.length : 0;
    const actCount = Array.isArray(parsed.activities) ? parsed.activities.length : 0;
    if (stepCount + actCount === 0) {
      return fail("Fitbit export contains empty steps and activities arrays.");
    }
    return ok("fitbit_combined", { stepDays: stepCount, activityCount: actCount }, "high");
  }

  if (Array.isArray(parsed) && parsed.length === 0) {
    return fail("JSON array is empty. No Fitbit data to verify.");
  }

  return fail(
    "JSON does not match expected Fitbit format. Expected one of: " +
    "[{dateTime, value}] (daily steps), [{startTime, duration, distance}] (activities), or {steps: [...], activities: [...]}."
  );
}

function validateGoogleFit(buf: Buffer, fileName: string): ValidationResult {
  const text = buf.toString("utf8").trim();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch {
    return fail("Invalid JSON file. Expected Google Fit Takeout export.");
  }

  // Google Fit Takeout: {bucket: [{dataset: [{point: [...]}]}]} or flat {point: [...]} or [point, ...]
  let pointCount = 0;

  if (Array.isArray(parsed?.bucket)) {
    for (const b of parsed.bucket) {
      for (const ds of b.dataset || []) {
        pointCount += (ds.point || []).length;
      }
    }
    if (pointCount === 0) {
      return fail("Google Fit bucket/dataset structure found but contains no data points.");
    }
    return ok("googlefit_bucket", { pointCount }, "high");
  }

  if (Array.isArray(parsed?.point)) {
    pointCount = parsed.point.length;
    if (pointCount === 0) {
      return fail("Google Fit points array is empty.");
    }
    return ok("googlefit_points", { pointCount }, "high");
  }

  if (Array.isArray(parsed)) {
    // Flat array of points
    if (parsed.length === 0) {
      return fail("JSON array is empty. No Google Fit data to verify.");
    }
    const first = parsed[0];
    if (first.startTimeNanos || first.startTime || first.dataTypeName) {
      return ok("googlefit_flat_points", { pointCount: parsed.length }, "high");
    }
    return fail(
      "JSON array does not look like Google Fit data. Expected fields: startTimeNanos or startTime or dataTypeName."
    );
  }

  return fail(
    "JSON does not match Google Fit Takeout format. Expected bucket/dataset/point structure or flat points array. " +
    "Export via Google Takeout: takeout.google.com → select Google Fit → All data included."
  );
}

function validateGamingJson(buf: Buffer, fileName: string, provider: string): ValidationResult {
  const text = buf.toString("utf8").trim();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch {
    return fail(`Invalid JSON file. Expected ${provider} match data.`);
  }

  // Accept: {matches: [...]} or {puuid, matches} or [{match_id, ...}]
  const arr = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed?.matches) ? parsed.matches
    : null;

  if (!arr) {
    return fail(`JSON must be an array of matches or {matches: [...]}. Got ${typeof parsed}.`);
  }
  if (arr.length === 0) {
    return fail("Matches array is empty. No match data to verify.");
  }

  const first = arr[0];
  const hasMatchFields =
    first.match_id !== undefined || first.matchId !== undefined ||
    first.game_creation !== undefined || first.start_time !== undefined ||
    first.result_for_player !== undefined || first.win !== undefined ||
    first.kills !== undefined;

  if (!hasMatchFields) {
    return fail(
      `Records don't look like ${provider} match data. Expected fields like match_id, kills, win, result_for_player.`
    );
  }

  return ok(`${provider}_match_json`, { matchCount: arr.length }, "high");
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Validate an uploaded evidence file for a specific provider.
 *
 * @param provider  Canonical provider string (e.g. "strava", "apple", "garmin")
 * @param file      File buffer
 * @param fileName  Original file name (for extension detection)
 * @returns         ValidationResult with valid/reason/metadata
 */
export function validateEvidence(
  provider: string,
  file: Buffer,
  fileName: string
): ValidationResult {
  const p = provider.toLowerCase();

  // 1. Size check
  const maxSize = MAX_FILE_SIZES[p] ?? MAX_FILE_SIZES.manual!;
  if (file.length > maxSize) {
    return fail(`File too large (${(file.length / 1024 / 1024).toFixed(1)} MB). Maximum for ${p}: ${(maxSize / 1024 / 1024).toFixed(0)} MB.`);
  }
  if (file.length === 0) {
    return fail("File is empty.");
  }

  // 2. Extension check
  const ext = fileExt(fileName);
  const allowed = ALLOWED_EXTENSIONS[p] ?? ALLOWED_EXTENSIONS.manual!;
  if (ext && !allowed.includes(ext)) {
    return fail(`File type '${ext}' not accepted for ${p}. Accepted: ${allowed.join(", ")}.`);
  }

  // 3. Provider-specific structural validation
  switch (p) {
    case "apple":    return validateApple(file, fileName);
    case "strava":   return validateStrava(file, fileName);
    case "garmin":   return validateGarmin(file, fileName);
    case "fitbit":   return validateFitbit(file, fileName);
    case "googlefit": return validateGoogleFit(file, fileName);
    case "opendota": return validateGamingJson(file, fileName, "dota2");
    case "riot":     return validateGamingJson(file, fileName, "lol");
    case "steam":    return validateGamingJson(file, fileName, "steam");
    case "faceit":   return validateGamingJson(file, fileName, "cs2");
    default:
      // Unknown provider — accept with low confidence
      return ok("unknown", { size: file.length }, "low");
  }
}

/**
 * Get accepted file types for a provider (for client-side hints).
 */
export function acceptedFileTypes(provider: string): string[] {
  return ALLOWED_EXTENSIONS[provider.toLowerCase()] ?? ALLOWED_EXTENSIONS.manual!;
}

/**
 * Get maximum file size for a provider in bytes.
 */
export function maxFileSize(provider: string): number {
  return MAX_FILE_SIZES[provider.toLowerCase()] ?? MAX_FILE_SIZES.manual!;
}
