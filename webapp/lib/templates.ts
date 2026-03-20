// webapp/lib/templates.ts
import type { ChallengeFormState } from "@/app/challenges/create/state/types";

/** Shared UI option type */
export type SelectOption = { value: string; label: string };

/** Context passed by the UI renderer (so lib doesn't import hooks) */
export type TemplateRenderCtx = {
  /** Provided by Step2 via useDotaHeroes() */
  dotaHeroes?: SelectOption[];
};

/** Declarative field descriptors the Basics UI renders */
export type TemplateField =
  | {
      kind: "number";
      key: string;
      label: string;
      min?: number;
      step?: number;
      default?: number;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      /** Either static options … */
      options:
        | SelectOption[]
        /** …or a function that can use form state + external data (ctx) */
        | ((state: ChallengeFormState, ctx?: TemplateRenderCtx) => SelectOption[]);
      default?: string;
    }
  | { kind: "text"; key: string; label: string; default?: string }
  | {
      kind: "readonly";
      key: string;
      label: string;
      value: string | ((state: ChallengeFormState) => string | number);
    };

/** Supported kinds across Fitness & Gaming */
export type FitnessKind = "walking" | "running" | "cycling" | "hiking" | "swimming" | "strength" | "yoga" | "hiit" | "rowing" | "calories" | "exercise";
export type GameId = "dota" | "lol" | "cs";

/** A template line item used by the renderer */
export type Template = {
  id: string;
  name: string;
  hint?: string;
  kind: FitnessKind | GameId; // ✅ ensures compatibility with filters/buildParams
  /** Which model verifies it (must match public/models/models.json) */
  modelId: string;
  /** Fields to render in Basics */
  fields: TemplateField[];
  /** Build model params from UI + timeline */
  paramsBuilder: (args: { state: ChallengeFormState }) => Record<string, any>;
  /**
   * Build the evaluator rule object from UI state.
   * Returns a plain JSON-serialisable Rule (fitness) or GamingRule (gaming)
   * that is stored as proof.params.rule during challenge creation.
   * Evaluators check this path first (Phase 13+ canonical).
   */
  ruleBuilder?: (args: { state: ChallengeFormState }) => Record<string, unknown> | null;
};

/** A plain serializable template (no functions) — used by runtime/admin JSON */
export type TemplatePlain = Omit<Template, "paramsBuilder" | "ruleBuilder">;

/* Utility */
const ts = (d?: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

/**
 * IMPORTANT:
 * Templates must keep working even if the create-state schema evolves.
 * We read template params from a tolerant "aivmForm" bucket.
 * If in the future you move these values, change only this helper.
 */
const aivm = (state: ChallengeFormState) => (state as any).aivmForm ?? {};

/** ISO string or empty-string fallback for rule period fields */
const isoOrNow = (d?: Date | null) => d?.toISOString() ?? new Date().toISOString();

/** Browser timezone string e.g. "America/New_York" */
const localTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/* -------------------------------------------------------------------------- */
/*                                  FITNESS                                   */
/* -------------------------------------------------------------------------- */

const FITNESS_WALKING_DAILY: Template = {
  id: "walking_daily",
  kind: "walking",
  name: "Walking • Every day",
  hint: "Complete X steps each day for N days.",
  modelId: "fitness.steps@1",
  fields: [
    { kind: "number", key: "minSteps", label: "Min steps/day", min: 100, step: 100, default: 8000 },
    { kind: "number", key: "days", label: "Days", min: 1, step: 1, default: 7 },
  ],
  paramsBuilder: ({ state }) => ({
    days: Number(aivm(state).days ?? 7),
    minSteps: Number(aivm(state).minSteps ?? 8000),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "walking",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    dailyTarget: {
      consecutiveDays: Number(aivm(state).days ?? 7),
      conditions: [
        { metric: "steps_count", op: ">=", value: Number(aivm(state).minSteps ?? 8000) },
      ],
    },
  }),
};

const FITNESS_WALKING_DISTANCE: Template = {
  id: "walking_distance",
  kind: "walking",
  name: "Walking — Distance Target",
  hint: "Accumulate walking distance within the challenge window.",
  modelId: "fitness.walking@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 0.5, step: 0.5, default: 5 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 5) * 1000),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "walk",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "walking_km", op: ">=", value: Number(aivm(state).distanceKm ?? 5) },
    ],
  }),
};

const FITNESS_RUNNING_DISTANCE_WINDOW: Template = {
  id: "running_window",
  kind: "running",
  name: "Running • Distance in window",
  hint: "Run at least X km between Start and End.",
  modelId: "fitness.distance@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 1, step: 0.5, default: 5 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 5) * 1000),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "run",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "distance_km", op: ">=", value: Number(aivm(state).distanceKm ?? 5) },
    ],
    antiCheat: { minGpsContinuity: 0.6, maxTeleportJumps: 3 },
  }),
};

const FITNESS_CYCLING_DISTANCE_WINDOW: Template = {
  id: "cycling_window",
  kind: "cycling",
  name: "Cycling • Distance in window",
  hint: "Ride at least X km between Start and End.",
  modelId: "fitness.cycling@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 5, step: 1, default: 20 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 20) * 1000),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "cycle",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "distance_km", op: ">=", value: Number(aivm(state).distanceKm ?? 20) },
    ],
    antiCheat: { minGpsContinuity: 0.5, maxTeleportJumps: 5 },
  }),
};

const FITNESS_HIKING_ELEVATION_WINDOW: Template = {
  id: "hiking_elev_gain_window",
  kind: "hiking",
  name: "Hiking • Elevation gain",
  hint: "Accumulate at least X meters of elevation between Start and End.",
  modelId: "fitness.hiking@1",
  fields: [{ kind: "number", key: "elevGainM", label: "Elevation gain (m)", min: 100, step: 50, default: 1000 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_elev_gain_m: Math.round(Number(aivm(state).elevGainM ?? 1000)),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "hike",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "elev_gain_m", op: ">=", value: Number(aivm(state).elevGainM ?? 1000) },
    ],
  }),
};

const FITNESS_SWIMMING_LAPS_WINDOW: Template = {
  id: "swimming_laps_window",
  kind: "swimming",
  name: "Swimming • Laps in window",
  hint: "Swim at least X laps between Start and End.",
  modelId: "fitness.swimming@1",
  fields: [{ kind: "number", key: "laps", label: "Laps", min: 10, step: 5, default: 40 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    laps: Math.round(Number(aivm(state).laps ?? 40)),
  }),
  // Laps don't map to a standard Activity metric; use period + type filter only.
  // Any swim recorded in the window satisfies the structural rule.
  ruleBuilder: ({ state }) => ({
    challengeType: "swim",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
  }),
};

const FITNESS_STRENGTH_WORKOUTS: Template = {
  id: "strength_workouts",
  kind: "strength",
  name: "Strength — Workout Sessions",
  hint: "Complete X strength training sessions in the challenge window.",
  modelId: "fitness.strength@1",
  fields: [
    { kind: "number", key: "sessions", label: "Sessions", min: 1, step: 1, default: 5 },
  ],
  paramsBuilder: ({ state }) => ({
    minSessions: Number(aivm(state).sessions ?? 5),
    types: "strength",
  }),
  ruleBuilder: ({ state }) => {
    const sessions = Number(aivm(state).sessions ?? 5);
    return {
      challengeType: "strength",
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
        timezone: localTz(),
      },
      conditions: [
        { metric: "strength_sessions", op: ">=", value: sessions },
      ],
    };
  },
};

const FITNESS_WALKING_COMPETITIVE: Template = {
  id: "walking_competitive",
  kind: "walking",
  name: "Walking Competition",
  hint: "Compete: whoever accumulates the most steps wins.",
  modelId: "fitness.steps@1",
  fields: [
    { kind: "number", key: "topN", label: "Number of winners", min: 1, step: 1, default: 1 },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    topN: Number(aivm(state).topN ?? 1),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "walking",
    mode: "competitive",
    competitiveMetric: "steps_count",
    topN: Number(aivm(state).topN ?? 1),
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
  }),
};

const FITNESS_DISTANCE_COMPETITIVE: Template = {
  id: "distance_competitive",
  kind: "running",
  name: "Distance Competition",
  hint: "Compete: whoever covers the most distance wins.",
  modelId: "fitness.distance@1",
  fields: [
    {
      kind: "select",
      key: "activityType",
      label: "Activity type",
      options: [
        { value: "run", label: "Running" },
        { value: "walk", label: "Walking" },
        { value: "cycle", label: "Cycling" },
      ],
      default: "run",
    },
    { kind: "number", key: "topN", label: "Number of winners", min: 1, step: 1, default: 1 },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    topN: Number(aivm(state).topN ?? 1),
  }),
  ruleBuilder: ({ state }) => {
    const actType = String(aivm(state).activityType ?? "run");
    return {
      challengeType: actType === "cycle" ? "cycle" : actType === "walk" ? "walk" : "run",
      mode: "competitive",
      competitiveMetric: "distance_km",
      topN: Number(aivm(state).topN ?? 1),
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
        timezone: localTz(),
      },
    };
  },
};


const FITNESS_YOGA_DURATION: Template = {
  id: "yoga_duration",
  kind: "yoga",
  name: "Yoga — Duration Target",
  hint: "Accumulate yoga practice time within the challenge window.",
  modelId: "fitness.yoga@1",
  fields: [{ kind: "number", key: "durationMin", label: "Target minutes", min: 10, step: 10, default: 60 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_duration_min: Number(aivm(state).durationMin ?? 60),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "yoga",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "yoga_min", op: ">=", value: Number(aivm(state).durationMin ?? 60) },
    ],
  }),
};

const FITNESS_HIIT_SESSIONS: Template = {
  id: "hiit_sessions",
  kind: "hiit",
  name: "HIIT — Session Time",
  hint: "Accumulate HIIT / CrossFit training time.",
  modelId: "fitness.hiit@1",
  fields: [{ kind: "number", key: "durationMin", label: "Target minutes", min: 10, step: 10, default: 60 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_duration_min: Number(aivm(state).durationMin ?? 60),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "hiit",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "hiit_min", op: ">=", value: Number(aivm(state).durationMin ?? 60) },
    ],
  }),
};

const FITNESS_ROWING_DISTANCE: Template = {
  id: "rowing_distance",
  kind: "rowing",
  name: "Rowing — Distance Target",
  hint: "Accumulate rowing distance within the challenge window.",
  modelId: "fitness.rowing@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 0.5, step: 0.5, default: 5 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 5) * 1000),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "rowing",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "rowing_km", op: ">=", value: Number(aivm(state).distanceKm ?? 5) },
    ],
  }),
};

const FITNESS_CALORIE_BURN: Template = {
  id: "calorie_burn",
  kind: "calories",
  name: "Calorie Burn Target",
  hint: "Burn a target amount of active calories.",
  modelId: "fitness.calories@1",
  fields: [{ kind: "number", key: "calories", label: "Target calories (kcal)", min: 100, step: 100, default: 500 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_calories: Number(aivm(state).calories ?? 500),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "calories",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "calories", op: ">=", value: Number(aivm(state).calories ?? 500) },
    ],
  }),
};

const FITNESS_EXERCISE_TIME: Template = {
  id: "exercise_time",
  kind: "exercise",
  name: "Exercise Minutes Target",
  hint: "Accumulate exercise ring minutes from any activity.",
  modelId: "fitness.exercise@1",
  fields: [{ kind: "number", key: "minutes", label: "Target minutes", min: 10, step: 10, default: 150 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_minutes: Number(aivm(state).minutes ?? 150),
  }),
  ruleBuilder: ({ state }) => ({
    challengeType: "exercise_time",
    period: {
      start: isoOrNow(state.timeline.starts),
      end: isoOrNow(state.timeline.ends),
      timezone: localTz(),
    },
    conditions: [
      { metric: "exercise_time", op: ">=", value: Number(aivm(state).minutes ?? 150) },
    ],
  }),
};

const FITNESS_DURATION_THRESHOLD: Template = {
  id: "duration_threshold",
  kind: "running",
  name: "Active Minutes Threshold",
  hint: "Accumulate at least X active minutes between Start and End.",
  modelId: "fitness.distance@1",
  fields: [
    { kind: "number", key: "durationMin", label: "Target minutes", min: 10, step: 5, default: 60 },
    {
      kind: "select",
      key: "activityType",
      label: "Activity type",
      options: [
        { value: "run", label: "Running" },
        { value: "walk", label: "Walking" },
        { value: "cycle", label: "Cycling" },
        { value: "swim", label: "Swimming" },
      ],
      default: "run",
    },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_duration_min: Number(aivm(state).durationMin ?? 60),
  }),
  ruleBuilder: ({ state }) => {
    const actType = String(aivm(state).activityType ?? "run");
    const typeMap: Record<string, string> = { run: "run", walk: "walk", cycle: "cycle", swim: "swim" };
    return {
      challengeType: typeMap[actType] ?? "run",
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
        timezone: localTz(),
      },
      conditions: [
        { metric: "duration_min", op: ">=", value: Number(aivm(state).durationMin ?? 60) },
      ],
    };
  },
};

/** Fitness registry (code-side defaults) */
const FITNESS: Template[] = [
  FITNESS_WALKING_DAILY,
  FITNESS_WALKING_DISTANCE,
  FITNESS_RUNNING_DISTANCE_WINDOW,
  FITNESS_CYCLING_DISTANCE_WINDOW,
  FITNESS_HIKING_ELEVATION_WINDOW,
  FITNESS_SWIMMING_LAPS_WINDOW,
  FITNESS_STRENGTH_WORKOUTS,
  FITNESS_YOGA_DURATION,
  FITNESS_HIIT_SESSIONS,
  FITNESS_ROWING_DISTANCE,
  FITNESS_CALORIE_BURN,
  FITNESS_EXERCISE_TIME,
  FITNESS_WALKING_COMPETITIVE,
  FITNESS_DISTANCE_COMPETITIVE,
  FITNESS_DURATION_THRESHOLD,
];

/* -------------------------------------------------------------------------- */
/*                                   DOTA                                     */
/* -------------------------------------------------------------------------- */
/** Note: options use ctx.dotaHeroes injected by the React component */
const DOTA_KILLS_COMPETITIVE: Template = {
  id: "dota_kills_competitive",
  kind: "dota",
  name: "Dota 2 Kills Competition",
  hint: "Compete: most total kills in ranked matches wins.",
  modelId: "dota.hero_kills_window@1",
  fields: [
    { kind: "number", key: "topN", label: "Number of winners", min: 1, step: 1, default: 1 },
    { kind: "text", key: "rankedOnly", label: "Ranked only? (true/false)", default: "true" },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    topN: Number(aivm(state).topN ?? 1),
  }),
  ruleBuilder: ({ state }) => {
    const rankedOnly = String(aivm(state).rankedOnly ?? "true") === "true";
    return {
      mode: "competitive",
      competitiveMetric: "kills",
      topN: Number(aivm(state).topN ?? 1),
      ...(rankedOnly && { rankedOnly: true }),
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
      },
    };
  },
};

const DOTA_WIN_STREAK: Template = {
  id: "dota_win_streak",
  kind: "dota",
  name: "Win Streak Challenge",
  hint: "Achieve a win streak of N consecutive wins.",
  modelId: "dota.private_match_1v1@1",
  fields: [
    { kind: "number", key: "streakLength", label: "Streak length", min: 2, step: 1, default: 3 },
    { kind: "text", key: "rankedOnly", label: "Ranked only? (true/false)", default: "false" },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    streakLength: Number(aivm(state).streakLength ?? 3),
  }),
  ruleBuilder: ({ state }) => {
    const rankedOnly = String(aivm(state).rankedOnly ?? "false") === "true";
    return {
      streakLength: Number(aivm(state).streakLength ?? 3),
      ...(rankedOnly && { rankedOnly: true }),
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
      },
    };
  },
};

const DOTA_MATCH_WINS: Template = {
  id: "dota_match_wins",
  kind: "dota",
  name: "Match Wins",
  hint: "Win at least X Dota 2 matches between Start and End.",
  modelId: "dota.private_match_5v5@1",
  fields: [
    { kind: "number", key: "minWins", label: "Target wins", min: 1, step: 1, default: 5 },
    {
      kind: "select", key: "rankedOnly", label: "Ranked only",
      options: [{ value: "false", label: "No — all matches" }, { value: "true", label: "Yes — ranked only" }],
      default: "false",
    },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    minWins: Number(aivm(state).minWins ?? 5),
  }),
  ruleBuilder: ({ state }) => {
    const rankedOnly = String(aivm(state).rankedOnly ?? "false") === "true";
    return {
      minWins: Number(aivm(state).minWins ?? 5),
      ...(rankedOnly && { rankedOnly: true }),
      period: { start: isoOrNow(state.timeline.starts), end: isoOrNow(state.timeline.ends) },
    };
  },
};

const DOTA: Template[] = [
  DOTA_MATCH_WINS,
  {
    id: "dota_hero_kills_window",
    kind: "dota",
    name: "Hero Kills in Window",
    hint: "Make at least X total kills with the chosen hero between Start and End.",
    modelId: "dota.hero_kills_window@1",
    fields: [
      { kind: "select", key: "hero", label: "Hero", options: (_s, ctx) => ctx?.dotaHeroes ?? [] },
      { kind: "number", key: "minKills", label: "Total kills required", min: 1, step: 1, default: 50 },
      { kind: "text", key: "rankedOnly", label: "Ranked only? (true/false)", default: "true" },
    ],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      hero: String(aivm(state).hero ?? ""),
      minKills: Number(aivm(state).minKills ?? 50),
      rankedOnly: String(aivm(state).rankedOnly ?? "true"),
    }),
    ruleBuilder: ({ state }) => {
      const hero = String(aivm(state).hero ?? "");
      const rankedOnly = String(aivm(state).rankedOnly ?? "true") === "true";
      return {
        minWins: 1,
        ...(hero && { hero }),
        ...(rankedOnly && { rankedOnly: true }),
        period: {
          start: isoOrNow(state.timeline.starts),
          end: isoOrNow(state.timeline.ends),
        },
      };
    },
  },
  {
    id: "dota_private_1v1",
    kind: "dota",
    name: "Private Match 1v1",
    modelId: "dota.private_match_1v1@1",
    fields: [
      { kind: "number", key: "minMatches", label: "Min matches", min: 1, step: 1, default: 1 },
      { kind: "number", key: "minWins", label: "Min wins", min: 0, step: 1, default: 1 },
    ],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      minMatches: Number(aivm(state).minMatches ?? 1),
      minWins: Number(aivm(state).minWins ?? 1),
    }),
    ruleBuilder: ({ state }) => ({
      minWins: Number(aivm(state).minWins ?? 1),
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
      },
    }),
  },
  {
    id: "dota_private_5v5",
    kind: "dota",
    name: "Private Match 5v5",
    modelId: "dota.private_match_5v5@1",
    fields: [
      { kind: "number", key: "minMatches", label: "Min matches", min: 1, step: 1, default: 1 },
      { kind: "number", key: "minWins", label: "Min wins", min: 0, step: 1, default: 1 },
    ],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      minMatches: Number(aivm(state).minMatches ?? 1),
      minWins: Number(aivm(state).minWins ?? 1),
    }),
    ruleBuilder: ({ state }) => ({
      minWins: Number(aivm(state).minWins ?? 1),
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
      },
    }),
  },
  DOTA_KILLS_COMPETITIVE,
  DOTA_WIN_STREAK,
];

/* -------------------------------------------------------------------------- */
/*                                    LOL                                     */
/* -------------------------------------------------------------------------- */
const LOL_MATCH_WINS: Template = {
  id: "lol_match_wins",
  kind: "lol",
  name: "LoL Match Wins",
  hint: "Win at least X League of Legends matches between Start and End.",
  modelId: "lol.winrate_next_n@1",
  fields: [
    { kind: "number", key: "minWins", label: "Target wins", min: 1, step: 1, default: 10 },
    {
      kind: "select", key: "queue", label: "Queue type",
      options: [
        { value: "ranked", label: "Ranked" },
        { value: "flex", label: "Flex" },
        { value: "aram", label: "ARAM" },
        { value: "any", label: "Any queue" },
      ],
      default: "ranked",
    },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    minWins: Number(aivm(state).minWins ?? 10),
  }),
  ruleBuilder: ({ state }) => {
    const queue = String(aivm(state).queue ?? "ranked").toLowerCase();
    return {
      minWins: Number(aivm(state).minWins ?? 10),
      ...(queue !== "any" && queue !== "aram" && { rankedOnly: queue === "ranked" }),
      period: { start: isoOrNow(state.timeline.starts), end: isoOrNow(state.timeline.ends) },
    };
  },
};

const LOL: Template[] = [
  LOL_MATCH_WINS,
  {
    id: "lol_winrate_next_n",
    kind: "lol",
    name: "Win Rate • Next N",
    hint: "Target win rate across your next N matches.",
    modelId: "lol.winrate_next_n@1",
    fields: [
      { kind: "number", key: "matches", label: "Next N matches", min: 1, step: 1, default: 20 },
      { kind: "text", key: "queue", label: "Queue (ranked/flex/aram)", default: "ranked" },
    ],
    paramsBuilder: ({ state }) => ({
      matches: Number(aivm(state).matches ?? 20),
      queue: String(aivm(state).queue ?? "ranked"),
    }),
    ruleBuilder: ({ state }) => {
      const queue = String(aivm(state).queue ?? "ranked").toLowerCase();
      return {
        minWins: Math.ceil(Number(aivm(state).matches ?? 20) / 2),
        ...(queue !== "aram" && { rankedOnly: queue === "ranked" }),
        period: {
          start: isoOrNow(state.timeline.starts),
          end: isoOrNow(state.timeline.ends),
        },
      };
    },
  },
  {
    id: "lol_kills_competitive",
    kind: "lol",
    name: "LoL Kills Competition",
    hint: "Compete: most total kills in ranked matches wins.",
    modelId: "lol.winrate_next_n@1",
    fields: [
      { kind: "number", key: "topN", label: "Number of winners", min: 1, step: 1, default: 1 },
    ],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      topN: Number(aivm(state).topN ?? 1),
    }),
    ruleBuilder: ({ state }) => ({
      mode: "competitive",
      competitiveMetric: "kills",
      topN: Number(aivm(state).topN ?? 1),
      rankedOnly: true,
      period: {
        start: isoOrNow(state.timeline.starts),
        end: isoOrNow(state.timeline.ends),
      },
    }),
  },
];

/* -------------------------------------------------------------------------- */
/*                                     CS                                     */
/* -------------------------------------------------------------------------- */
const CS2_KILLS_COMPETITIVE: Template = {
  id: "cs2_kills_competitive",
  kind: "cs",
  name: "CS2 Kills Competition",
  hint: "Compete: most total FACEIT kills wins.",
  modelId: "cs2.faceit_wins@1",
  fields: [
    { kind: "number", key: "topN", label: "Number of winners", min: 1, step: 1, default: 1 },
  ],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    topN: Number(aivm(state).topN ?? 1),
  }),
  ruleBuilder: ({ state }) => ({
    mode: "competitive",
    competitiveMetric: "kills",
    topN: Number(aivm(state).topN ?? 1),
    period: { start: isoOrNow(state.timeline.starts), end: isoOrNow(state.timeline.ends) },
  }),
};

const CS: Template[] = [
  CS2_KILLS_COMPETITIVE,
  {
    id: "cs2_faceit_wins",
    kind: "cs",
    name: "CS2 • FACEIT Wins",
    hint: "Win at least X FACEIT matches between Start and End. Requires Steam + FACEIT account.",
    modelId: "cs2.faceit_wins@1",
    fields: [
      { kind: "number", key: "minWins", label: "Target wins", min: 1, step: 1, default: 5 },
      {
        kind: "select",
        key: "rankedOnly",
        label: "Ranked only",
        options: [
          { value: "false", label: "No — all matches" },
          { value: "true", label: "Yes — ranked only" },
        ],
        default: "false",
      },
    ],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      minWins: Number(aivm(state).minWins ?? 5),
    }),
    ruleBuilder: ({ state }) => {
      const rankedOnly = String(aivm(state).rankedOnly ?? "false") === "true";
      return {
        minWins: Number(aivm(state).minWins ?? 5),
        ...(rankedOnly && { rankedOnly: true }),
        period: {
          start: isoOrNow(state.timeline.starts),
          end: isoOrNow(state.timeline.ends),
        },
      };
    },
  },
];

/* -------------------------------------------------------------------------- */
/*                               REGISTRY / API                               */
/* -------------------------------------------------------------------------- */

/** All code-side templates in one list (used by Step1 discovery) */
// CS2 uses FACEIT API (Valve provides no public matchmaking API).
// Only FACEIT matches are verified — honest limitation documented in VCE instructions.
const ALL: Template[] = [...FITNESS, ...DOTA, ...LOL, ...CS];

/** Export for Step1: discover kinds/games from code templates */
export function getAllCodeTemplates(): Template[] {
  return ALL;
}

/**
 * Enhanced, mode-aware filtering for Step 2 and dynamic template selection.
 * - Filters by category first (FITNESS or GAMING)
 * - For gaming: filters by gameId (e.g. dota/lol/cs)
 * - Then narrows down by gameMode if provided (1v1 / 5v5 etc.)
 */
export function getTemplatesForIntent(intent: {
  type: "FITNESS" | "GAMING";
  gameId?: GameId;
  gameMode?: string | null;
  fitnessKind?: FitnessKind;
}) {
  const { type, gameId, gameMode, fitnessKind } = intent;

  if (type === "FITNESS") {
    return fitnessKind ? FITNESS.filter((t) => t.kind === fitnessKind) : FITNESS;
  }

  if (type === "GAMING") {
    let templates: Template[] = [];
    switch (gameId) {
      case "dota":
        templates = DOTA;
        break;
      case "lol":
        templates = LOL;
        break;
      case "cs":
      default:
        templates = CS;
        break;
    }

    if (gameMode) {
      const mk = gameMode.toLowerCase();
      const isMode1v1 = mk.includes("1v1");
      const isMode5v5 = mk.includes("5v5");

      return templates.filter((tpl) => {
        const id = tpl.id.toLowerCase();
        const name = tpl.name.toLowerCase();
        const isTpl1v1 = id.includes("1v1") || name.includes("1v1");
        const isTpl5v5 = id.includes("5v5") || name.includes("5v5");

        // Exclude only the opposite mode; keep generic templates
        if (isMode1v1) return !isTpl5v5;
        if (isMode5v5) return !isTpl1v1;
        return true;
      });
    }

    return templates;
  }

  return [];
}

/** Optional: direct lookup by ID */
export function getTemplateById(id?: string | null) {
  return ALL.find((t) => t.id === id);
}

/** Optional helper: turn a full Template into a plain JSON-able snapshot */
export const toPlain = (t: Template): TemplatePlain => ({
  id: t.id,
  name: t.name,
  hint: t.hint,
  kind: t.kind,
  modelId: t.modelId,
  fields: t.fields,
});

/**
 * Build a standardized, user-friendly description from the selected template,
 * form fields, and timeline. Called at create-time so users never need to
 * write descriptions manually.
 */
export function buildAutoDescription(state: ChallengeFormState): string {
  const templateId =
    (state as any).aivmForm?.templateId ??
    state.verification?.templateId ??
    null;
  const template = templateId ? getTemplateById(templateId) : null;
  if (!template) return "";

  const form = (state as any).aivmForm ?? {};
  const starts = state.timeline.starts;
  const ends = state.timeline.ends;
  const durationDays =
    starts && ends
      ? Math.max(1, Math.round((ends.getTime() - starts.getTime()) / 86400000))
      : 7;
  const dur = durationDays === 1 ? "1 day" : `${durationDays} days`;

  const fmtNum = (n: number) => n.toLocaleString("en-US");
  const fmtKm = (km: number) =>
    km === Math.round(km) ? `${km} km` : `${km.toFixed(1)} km`;

  switch (template.id) {
    case "walking_daily":
    case "steps_daily": {
      const steps = Number(form.minSteps ?? 8000);
      const days = Number(form.days ?? 7);
      return `Walk at least ${fmtNum(steps)} steps every day for ${days} consecutive days.`;
    }
    case "walking_distance": {
      const km = Number(form.distanceKm ?? 5);
      return `Walk at least ${fmtKm(km)} total within ${dur}.`;
    }
    case "walking_competitive":
    case "steps_competitive": {
      const topN = Number(form.topN ?? 3);
      return `Compete for the highest step count over ${dur}. Top ${topN} win.`;
    }
    case "distance_competitive": {
      const topN = Number(form.topN ?? 1);
      const act = String(form.activityType ?? "run");
      const actLabel = act === "walk" ? "walking" : act === "cycle" ? "cycling" : "running";
      return `Compete for the longest ${actLabel} distance over ${dur}. Top ${topN} win.`;
    }
    case "running_window": {
      const km = Number(form.distanceKm ?? 5);
      return `Run at least ${fmtKm(km)} total within ${dur}.`;
    }
    case "cycling_window": {
      const km = Number(form.distanceKm ?? 20);
      return `Cycle at least ${fmtKm(km)} total within ${dur}.`;
    }
    case "hiking_elev_gain":
    case "hiking_elev_gain_window": {
      const m = Number(form.elevGainM ?? 500);
      return `Gain at least ${fmtNum(m)} meters of elevation hiking within ${dur}.`;
    }
    case "swimming_laps":
    case "swimming_laps_window": {
      const km = Number(form.distanceKm ?? 1);
      return `Swim at least ${fmtKm(km)} total within ${dur}.`;
    }
    case "strength_workouts": {
      const sessions = Number(form.sessions ?? 5);
      return `Complete ${sessions} strength training sessions within ${dur}.`;
    }
    case "yoga_duration": {
      const min = Number(form.durationMin ?? 60);
      return `Practice at least ${min} minutes of yoga within ${dur}.`;
    }
    case "hiit_sessions": {
      const min = Number(form.durationMin ?? 60);
      return `Complete at least ${min} minutes of HIIT training within ${dur}.`;
    }
    case "rowing_distance": {
      const km = Number(form.distanceKm ?? 5);
      return `Row at least ${fmtKm(km)} total within ${dur}.`;
    }
    case "calorie_burn": {
      const cals = Number(form.calories ?? 500);
      return `Burn at least ${fmtNum(cals)} active calories within ${dur}.`;
    }
    case "exercise_time": {
      const min = Number(form.minutes ?? 150);
      return `Accumulate ${min} exercise minutes within ${dur}.`;
    }
    case "duration_threshold": {
      const min = Number(form.durationMin ?? 150);
      return `Accumulate ${min} active minutes from fitness activities within ${dur}.`;
    }
    default:
      return `${template.name} — ${dur} challenge.`;
  }
}
