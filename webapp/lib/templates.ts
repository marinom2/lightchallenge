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
export type FitnessKind = "steps" | "running" | "cycling" | "hiking" | "swimming";
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
};

/** A plain serializable template (no functions) — used by runtime/admin JSON */
export type TemplatePlain = Omit<Template, "paramsBuilder">;

/* Utility */
const ts = (d?: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

/**
 * IMPORTANT:
 * Templates must keep working even if the create-state schema evolves.
 * We read template params from a tolerant "aivmForm" bucket.
 * If in the future you move these values, change only this helper.
 */
const aivm = (state: ChallengeFormState) => (state as any).aivmForm ?? {};

/* -------------------------------------------------------------------------- */
/*                                  FITNESS                                   */
/* -------------------------------------------------------------------------- */

const FITNESS_STEPS: Template = {
  id: "steps_daily",
  kind: "steps",
  name: "Steps • Every day",
  hint: "Complete X steps each day for N days.",
  modelId: "apple_health.steps@1",
  fields: [
    { kind: "number", key: "minSteps", label: "Min steps/day", min: 100, step: 100, default: 8000 },
    { kind: "number", key: "days", label: "Days", min: 1, step: 1, default: 7 },
  ],
  paramsBuilder: ({ state }) => ({
    days: Number(aivm(state).days ?? 7),
    minSteps: Number(aivm(state).minSteps ?? 8000),
  }),
};

const FITNESS_RUNNING_DISTANCE_WINDOW: Template = {
  id: "running_window",
  kind: "running",
  name: "Running • Distance in window",
  hint: "Run at least X km between Start and End.",
  modelId: "strava.distance_in_window@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 1, step: 0.5, default: 5 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 5) * 1000),
  }),
};

const FITNESS_CYCLING_DISTANCE_WINDOW: Template = {
  id: "cycling_window",
  kind: "cycling",
  name: "Cycling • Distance in window",
  hint: "Ride at least X km between Start and End.",
  modelId: "strava.cycling_distance_in_window@1",
  fields: [{ kind: "number", key: "distanceKm", label: "Distance (km)", min: 5, step: 1, default: 20 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_distance_m: Math.round(Number(aivm(state).distanceKm ?? 20) * 1000),
  }),
};

const FITNESS_HIKING_ELEVATION_WINDOW: Template = {
  id: "hiking_elev_gain_window",
  kind: "hiking",
  name: "Hiking • Elevation gain",
  hint: "Accumulate at least X meters of elevation between Start and End.",
  modelId: "strava.elevation_gain_window@1",
  fields: [{ kind: "number", key: "elevGainM", label: "Elevation gain (m)", min: 100, step: 50, default: 1000 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    min_elev_gain_m: Math.round(Number(aivm(state).elevGainM ?? 1000)),
  }),
};

const FITNESS_SWIMMING_LAPS_WINDOW: Template = {
  id: "swimming_laps_window",
  kind: "swimming",
  name: "Swimming • Laps in window",
  hint: "Swim at least X laps between Start and End.",
  modelId: "strava.swimming_laps_window@1",
  fields: [{ kind: "number", key: "laps", label: "Laps", min: 10, step: 5, default: 40 }],
  paramsBuilder: ({ state }) => ({
    start_ts: ts(state.timeline.starts),
    end_ts: ts(state.timeline.ends),
    laps: Math.round(Number(aivm(state).laps ?? 40)),
  }),
};

/** Fitness registry (code-side defaults) */
const FITNESS: Template[] = [
  FITNESS_STEPS,
  FITNESS_RUNNING_DISTANCE_WINDOW,
  FITNESS_CYCLING_DISTANCE_WINDOW,
  FITNESS_HIKING_ELEVATION_WINDOW,
  FITNESS_SWIMMING_LAPS_WINDOW,
];

/* -------------------------------------------------------------------------- */
/*                                   DOTA                                     */
/* -------------------------------------------------------------------------- */
/** Note: options use ctx.dotaHeroes injected by the React component */
const DOTA: Template[] = [
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
  },
];

/* -------------------------------------------------------------------------- */
/*                                    LOL                                     */
/* -------------------------------------------------------------------------- */
const LOL: Template[] = [
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
  },
];

/* -------------------------------------------------------------------------- */
/*                                     CS                                     */
/* -------------------------------------------------------------------------- */
const CS: Template[] = [
  {
    id: "cs_kills_in_window",
    kind: "cs",
    name: "Kills in Window",
    hint: "Accumulate at least X kills between Start and End.",
    modelId: "cs.kills_in_window@1",
    fields: [{ kind: "number", key: "kills", label: "Kills", min: 1, step: 1, default: 30 }],
    paramsBuilder: ({ state }) => ({
      start_ts: ts(state.timeline.starts),
      end_ts: ts(state.timeline.ends),
      kills: Number(aivm(state).kills ?? 30),
    }),
  },
];

/* -------------------------------------------------------------------------- */
/*                               REGISTRY / API                               */
/* -------------------------------------------------------------------------- */

/** All code-side templates in one list (used by Step1 discovery) */
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