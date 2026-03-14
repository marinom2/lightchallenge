// webapp/app/challenges/create/state/defaults.ts
import type { ChallengeFormState } from "./types";
import { SAFE_APPROVAL_WINDOW_SEC, SAFE_MIN_LEAD_SEC } from "../lib/constants";

function roundUpToNearest(date: Date, minutes = 5) {
  const ms = minutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

export function defaultCreateState(now: Date = new Date()): ChallengeFormState {
  const leadBufferSec = 300; // 5 min
  const proofGraceSec = 3600; // 1h
  const defaultDurationSec = 3 * 3600; // 3h

  const starts = roundUpToNearest(
    new Date(now.getTime() + (SAFE_MIN_LEAD_SEC + leadBufferSec) * 1000),
    5
  );

  const joinCloses = new Date(
    starts.getTime() - SAFE_APPROVAL_WINDOW_SEC * 1000
  );

  const ends = new Date(starts.getTime() + defaultDurationSec * 1000);
  const proofDeadline = new Date(ends.getTime() + proofGraceSec * 1000);

  return {
    intent: {
      type: null,
      visibility: "PUBLIC",
      gameId: null,
      gameMode: null,
      fitnessKind: null,
    },

    essentials: {
      title: "",
      description: "",
      tags: [],
    },

    money: {
      currency: {
        type: "NATIVE",
        symbol: "LCAI",
        decimals: 18,
      },
      stake: "0",
    },

    timeline: {
      joinCloses,
      starts,
      ends,
      proofDeadline,
    },

    options: {
      participantCap: "0",
      externalId: "",
    },

    verification: {
      style: "SIMPLE",
      mode: "AIVM",
      templateId: null,
      verifier: null,
      modelId: null,
      modelHash: null,
      params: undefined,
      proofOn: true,
    },

    aivmForm: {
      templateId: null,
    },

    invites: {
      roster: [],
    },

    stepReady: false,
  };
}