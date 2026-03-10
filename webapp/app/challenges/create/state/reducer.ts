// webapp/app/challenges/create/state/reducer.ts
import type { Action, ChallengeFormState } from "./types";
import { defaultCreateState } from "./defaults";

function selectedIntentKind(state: ChallengeFormState): string | null {
  if (state.intent.type === "FITNESS") return state.intent.fitnessKind ?? null;
  if (state.intent.type === "GAMING") return state.intent.gameId ?? null;
  return null;
}

function resetTemplateDependentState(
  state: ChallengeFormState
): ChallengeFormState {
  return {
    ...state,
    verification: {
      ...state.verification,
      templateId: null,
      verifier: null,
      modelId: null,
      modelHash: null,
      params: undefined,
      paramsHash: null,
      benchmarkHash: null,
    },
    aivmForm: {
      templateId: null,
    },
  };
}

export function createReducer(
  state: ChallengeFormState,
  action: Action
): ChallengeFormState {
  switch (action.type) {
    case "SET_INTENT": {
      const next: ChallengeFormState = {
        ...state,
        intent: { ...state.intent, ...action.payload },
      };

      const prevKind = selectedIntentKind(state);
      const nextKind = selectedIntentKind(next);

      const typeChanged =
        action.payload.type !== undefined &&
        action.payload.type !== state.intent.type;

      const kindChanged = prevKind !== nextKind;

      if (typeChanged || kindChanged) {
        return resetTemplateDependentState(next);
      }

      return next;
    }

    case "SET_ESSENTIALS":
      return {
        ...state,
        essentials: { ...state.essentials, ...action.payload },
      };

    case "SET_MONEY":
      return {
        ...state,
        money: { ...state.money, ...action.payload },
      };

    case "SET_CURRENCY":
      return {
        ...state,
        money: { ...state.money, currency: action.payload },
      };

    case "SET_TIMELINE":
      return {
        ...state,
        timeline: { ...state.timeline, ...action.payload },
      };

    case "SET_OPTIONS":
      return {
        ...state,
        options: { ...state.options, ...action.payload },
      };

    case "SET_VERIFICATION_STYLE":
      return {
        ...state,
        verification: { ...state.verification, style: action.payload },
      };

    case "SET_VERIFICATION": {
      const nextVerification = {
        ...state.verification,
        ...action.payload,
      };

      const modeChanged =
        Object.prototype.hasOwnProperty.call(action.payload, "mode") &&
        action.payload.mode !== state.verification.mode;

      const templateChanged =
        Object.prototype.hasOwnProperty.call(action.payload, "templateId") &&
        action.payload.templateId !== state.verification.templateId;

      let nextState: ChallengeFormState = {
        ...state,
        verification: nextVerification,
      };

      if (templateChanged) {
        const templateWasCleared = action.payload.templateId === null;

        nextState = {
          ...nextState,
          verification: {
            ...nextState.verification,
            modelId: templateWasCleared
              ? null
              : nextState.verification.modelId ?? null,
            modelHash: templateWasCleared
              ? null
              : nextState.verification.modelHash ?? null,
            verifier: templateWasCleared
              ? null
              : nextState.verification.verifier ?? null,
            params: templateWasCleared
              ? undefined
              : nextState.verification.params,
            paramsHash: templateWasCleared
              ? null
              : nextState.verification.paramsHash ?? null,
            benchmarkHash: templateWasCleared
              ? null
              : nextState.verification.benchmarkHash ?? null,
          },
          aivmForm: {
            ...state.aivmForm,
            templateId: action.payload.templateId ?? null,
          },
        };
      }

      if (modeChanged) {
        const nextMode = action.payload.mode;

        if (nextMode !== "AIVM") {
          nextState = {
            ...nextState,
            verification: {
              ...nextState.verification,
              templateId: null,
              modelId: null,
              modelHash: null,
              params: undefined,
              paramsHash: null,
              benchmarkHash: null,
            },
            aivmForm: {
              templateId: null,
            },
          };
        }
        
        nextState = {
          ...nextState,
          peerApprovalsNeeded: 0,
          peers: [],
          timeline: {
            ...nextState.timeline,
            peerDeadline: null,
          },
        };
      }

      return nextState;
    }

    case "SET_AIVM_FORM":
      return {
        ...state,
        aivmForm: { ...state.aivmForm, ...action.payload },
      };

    case "SET_PEERS":
      return {
        ...state,
        peers: action.payload,
      };

    case "SET_PEER_APPROVALS_NEEDED":
      return {
        ...state,
        peerApprovalsNeeded: Math.max(0, action.payload),
      };

    case "RESET":
      return { ...defaultCreateState(), ...(action.payload ?? {}) };

    default:
      return state;
  }
}