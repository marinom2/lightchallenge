/**
 * Provider-agnostic fitness model hashes.
 *
 * Challenges reference these generic model IDs (e.g., "fitness.steps@1")
 * regardless of which tracking provider the user has connected.
 * All fitness adapters accept any fitness model hash — the adapter is
 * selected by the `provider` field, not the model hash.
 */

/** Set of all model hashes that represent fitness models (provider-agnostic + legacy). */
export const FITNESS_MODEL_HASHES: Set<string> = new Set([
  // Provider-agnostic models (fitness.*)
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001", // fitness.steps@1
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002", // fitness.distance@1
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003", // fitness.cycling@1
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004", // fitness.hiking@1
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005", // fitness.swimming@1
  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006", // fitness.strength@1

  // Legacy provider-specific model hashes (still accepted for backward compatibility)
  "0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e", // apple_health.steps@1
  "0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e", // strava.distance_in_window@1
  "0xd3a933d7c6528699a4b5f08c1b47ee1ff85927e63cb06ad7e35b17a478f97e65", // strava.cycling/elevation/swimming
  "0x7abfc322e4b015bd06ff99afe644c44868506d0ef39ae80a17b21813a389a1f2", // garmin.steps@1
  "0x1f0529367f707855129caa7af76a01c8ed88b22602f06433aaa7fc0a50cd1b90", // garmin.distance@1
  "0x7abfc322e4b015bdf5789ce6133c87c24d60f88ecbfb7efc65b6fb4b547ba655", // garmin.activity_duration@1
  "0xef89f75d3f5b1bb04ee42748a51dc8410c79cfdea474356ed5edb0b08e451ee9", // fitbit.steps@1
  "0x3a7a7b773abcce8dd5619d63eff68bb14d12b873ca5d2fb395aee7a5c5d89fd6", // fitbit.distance@1
  "0xef89f75d3f5b1bb08cd9ae83cb22f6ebee5c5aa4ab0cba58ad72f6f5c5f3e22f", // fitbit.activity_duration@1
  "0xe63ac4325bc9b06404dabf113dbee540064bb36aac31f54dd9ae3dad706b9484", // googlefit.steps@1
  "0x396b3817947618e5e3277256c54eae4c10def805bb207513deaa9bb30b19dd2e", // googlefit.distance@1
  "0xe63ac4325bc9b064d2e74bce3ff0b9d6e6153ef20a85025c2e5ee66d4f7c1e33", // googlefit.activity_duration@1
  "0x3e4f99b1597e7761d293466be582b73dbe1cdb2bfdf862fc3c41bfge0f121d0f", // apple_health.strength@1
]);

/** Check if a model hash represents a fitness model. */
export function isFitnessModel(hash: string): boolean {
  return FITNESS_MODEL_HASHES.has(hash.toLowerCase());
}

/** Provider-agnostic model hash lookup by model ID. */
export const FITNESS_MODEL_ID_TO_HASH: Record<string, string> = {
  "fitness.steps@1":     "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001",
  "fitness.distance@1":  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002",
  "fitness.cycling@1":   "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003",
  "fitness.hiking@1":    "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004",
  "fitness.swimming@1":  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005",
  "fitness.strength@1":  "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006",
};
