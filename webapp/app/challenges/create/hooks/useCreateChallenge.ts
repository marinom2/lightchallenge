"use client";

import * as React from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  decodeErrorResult,
  isAddress,
  keccak256,
  parseEther,
  parseEventLogs,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";

import { defaultCreateState } from "../state/defaults";
import { createReducer } from "../state/reducer";
import type { Action, ChallengeFormState, UiState } from "../state/types";
import { buildDerivedState } from "../state/selectors";
import { loadChainPolicyHints } from "../lib/chainRulesLoader";
import { validateAgainstContract } from "../lib/contractGuards";
import { SAFE_MIN_LEAD_SEC, GAS_BUFFER_BPS } from "../lib/constants";

import { useToasts } from "@/lib/ui/toast";
import { ADDR, ABI, ZERO_ADDR } from "@/lib/contracts";
import { getKind, type ChallengeKindKey } from "@/lib/challengeKinds";
import { getTemplateByIdSync } from "@/lib/templateRegistry";
import { getModelFromRegistry } from "@/lib/modelRegistry";
import { buildAutoDescription } from "@/lib/templates";
import {
  resolveChallengeBinding,
  makeBenchmarkHash,
  buildCanonicalAivmParamsPayload,
  buildCanonicalAivmParamsHash,
} from "@/lib/challengeProofFlow";
import {
  saveLocalMeta,
  triggerAivmPipeline,
} from "../lib/afterCreate";
import { buildAuthHeaders } from "@/lib/authHeaders";

const TX_FEE_CAP_WEI = parseEther("0.95");

/**
 * V1 CreateParams — matches ChallengePay.sol struct exactly.
 */
type CreatePayload = {
  kind: number;
  currency: 0 | 1;
  token: Address;
  stakeAmount: bigint;
  joinClosesTs: bigint;
  startTs: bigint;
  duration: bigint;
  maxParticipants: bigint;
  verifier: Address;
  proofDeadlineTs: bigint;
  externalId: Hex;
};

const initialUi = (): UiState => ({
  step: 1,
  isSubmitting: false,
  error: null,
  allowanceState: "unknown",
  success: false,
  txHash: null,
  challengeId: undefined,
});

const toUnixSec = (d?: Date | null) => (d ? Math.floor(d.getTime() / 1000) : 0);

function kindId(state: ChallengeFormState): number {
  let key: ChallengeKindKey;

  if (state.intent.type === "FITNESS") {
    const fk = state.intent.fitnessKind;
    if (fk === "running") key = "running";
    else if (fk === "cycling") key = "cycling";
    else if (fk === "hiking") key = "hiking";
    else if (fk === "swimming") key = "swimming";
    else if (fk === "walking") key = "walking";
    else key = "fitness_general";
  } else if (state.intent.type === "GAMING") {
    const gid = state.intent.gameId;
    if (gid === "dota") key = "dota";
    else if (gid === "lol") key = "lol";
    else if (gid === "cs") key = "cs";
    else key = "gaming_general";
  } else {
    key = "fitness_general";
  }

  return getKind(key).kindId;
}

function tokenAddr(state: ChallengeFormState): Address {
  if (state.money.currency.type !== "ERC20") return ZERO_ADDR;
  if (!isAddress(String(state.money.currency.address))) {
    throw new Error("Invalid ERC20 token address.");
  }
  return state.money.currency.address as Address;
}

function amount(state: ChallengeFormState, raw: string): bigint {
  const decimals =
    state.money.currency.type === "ERC20"
      ? Number(state.money.currency.decimals ?? 18)
      : 18;

  return state.money.currency.type === "ERC20"
    ? parseUnits(raw || "0", decimals)
    : parseEther(raw || "0");
}

function verifierAddr(state: ChallengeFormState): Address {
  const manual = state.verification?.verifier;

  if (manual && isAddress(manual)) {
    return manual as Address;
  }

  if (ADDR.ChallengePayAivmPoiVerifier === ZERO_ADDR) {
    throw new Error("ChallengePayAivmPoiVerifier not deployed.");
  }

  return ADDR.ChallengePayAivmPoiVerifier;
}

function externalId(raw?: string | null): Hex {
  const v = String(raw || "").trim();
  return v ? keccak256(toBytes(v)) : (`0x${"00".repeat(32)}` as Hex);
}

function decodeError(err: unknown): string | null {
  const e = err as any;
  const data = [
    e?.data?.data,
    e?.data,
    e?.cause?.data,
    e?.error?.data,
    e?.details?.data,
  ].find((x) => typeof x === "string" && x.startsWith("0x")) as Hex | undefined;

  if (!data) return null;

  for (const abi of [ABI.ChallengePay]) {
    try {
      const d = decodeErrorResult({ abi, data });
      return d.errorName;
    } catch {}
  }

  return null;
}

function legacyFee(estimatedGas: bigint, gasPrice: bigint) {
  const gas = (estimatedGas * GAS_BUFFER_BPS) / 100n;
  const price = gasPrice > 0n ? gasPrice : 1_000_000_000n;
  const capped = gas * price > TX_FEE_CAP_WEI ? TX_FEE_CAP_WEI / gas : price;

  if (capped <= 0n) {
    throw new Error("Estimated gas is too high.");
  }

  return { gas, gasPrice: capped };
}

async function buildAivmCreateMeta(state: ChallengeFormState) {
  if (state.verification.mode !== "AIVM") return null;

  const templateId =
    state.aivmForm?.templateId ?? state.verification.templateId ?? null;

  if (!templateId) {
    throw new Error("AIVM template is missing.");
  }

  const template = getTemplateByIdSync(templateId);
  if (!template) {
    throw new Error("Selected AIVM template could not be resolved.");
  }

  if (!template.paramsBuilder) {
    throw new Error("Template is missing paramsBuilder.");
  }

  const rule = template.ruleBuilder ? template.ruleBuilder({ state }) : null;

  const params = buildCanonicalAivmParamsPayload({
    templateId,
    form: state.aivmForm ?? {},
    intent: state.intent,
    rule: rule ?? undefined,
  });

  const paramsHash = buildCanonicalAivmParamsHash({
    templateId,
    form: state.aivmForm ?? {},
    intent: state.intent,
    rule: rule ?? undefined,
  });
  const model = await getModelFromRegistry(template.modelId);

  if (!model) {
    throw new Error(`Model not found in registry: ${template.modelId}`);
  }

  const benchmarkHash = makeBenchmarkHash({
    templateId,
    modelId: template.modelId,
    intent: state.intent,
    timeline: {
      starts: state.timeline.starts?.toISOString() ?? null,
      ends: state.timeline.ends?.toISOString() ?? null,
    },
  });

  return {
    templateId,
    template,
    model,
    params,
    paramsHash,
    benchmarkHash,
  };
}

export function useCreateChallenge() {
  const { address } = useAccount();
  const pc = usePublicClient();
  const { data: wc } = useWalletClient();
  const { push } = useToasts();

  const [state, dispatch] = React.useReducer(
    createReducer,
    undefined,
    defaultCreateState
  );
  const [ui, setUi] = React.useState<UiState>(initialUi);

  const derived = React.useMemo(() => buildDerivedState(state), [state]);
  const allowSubmit = React.useMemo(
    () => Object.keys(derived.errors).length === 0,
    [derived.errors]
  );

  const goTo = React.useCallback((step: 1 | 2 | 3 | 4) => {
    setUi((u) => ({ ...u, step }));
  }, []);

  const next = React.useCallback(() => {
    setUi((u) => ({ ...u, step: Math.min(4, u.step + 1) as 1 | 2 | 3 | 4 }));
  }, []);

  const back = React.useCallback(() => {
    setUi((u) => ({ ...u, step: Math.max(1, u.step - 1) as 1 | 2 | 3 | 4 }));
  }, []);

  const reset = React.useCallback(() => {
    dispatch({ type: "RESET" });
    setUi(initialUi());
  }, []);

  const submit = React.useCallback(async () => {
    setUi((u) => ({
      ...u,
      isSubmitting: true,
      error: null,
      txHash: null,
      success: false,
      challengeId: undefined,
    }));

    try {
      if (!address || !pc || !wc) throw new Error("Wallet is not ready.");
      if (!allowSubmit) throw new Error("Form is not valid.");
      if (ADDR.ChallengePay === ZERO_ADDR) {
        throw new Error("ChallengePay deployment address is missing.");
      }

      const hints = await loadChainPolicyHints({
        pc,
        currencyType: state.money.currency.type,
        token:
          state.money.currency.type === "ERC20"
            ? (tokenAddr(state) as Address)
            : null,
        creator: address,
      });

      const guard = validateAgainstContract(state, hints);
      if (!guard.ok) {
        throw new Error(
          guard.reasons[0] || "Challenge does not satisfy contract rules."
        );
      }

      const aivmMeta = await buildAivmCreateMeta(state);

      if (aivmMeta) {
        dispatch({
          type: "SET_VERIFICATION",
          payload: {
            mode: "AIVM",
            backend: "LIGHTCHAIN_POI",
            templateId: aivmMeta.templateId,
            modelId: aivmMeta.model.id,
            modelHash: aivmMeta.model.modelHash,
            params: aivmMeta.params,
            benchmarkHash: aivmMeta.benchmarkHash,
          },
        });
      }

      const stakeAmount = amount(state, state.money.stake || "0");

      const payload: CreatePayload = {
        kind: kindId(state),
        currency: state.money.currency.type === "ERC20" ? 1 : 0,
        token: tokenAddr(state),
        stakeAmount,
        joinClosesTs: BigInt(toUnixSec(state.timeline.joinCloses)),
        startTs: BigInt(toUnixSec(state.timeline.starts)),
        duration: BigInt(
          toUnixSec(state.timeline.ends) - toUnixSec(state.timeline.starts)
        ),
        maxParticipants: BigInt(Number(state.options.participantCap || 0)),
        verifier: verifierAddr(state),
        proofDeadlineTs: BigInt(toUnixSec(state.timeline.proofDeadline)),
        externalId: externalId(state.options.externalId),
      };

      const value =
        state.money.currency.type === "NATIVE"
          ? stakeAmount
          : 0n;

      await pc.simulateContract({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "createChallenge",
        args: [payload],
        value,
        account: address,
      });

      const estimatedGas = await pc.estimateContractGas({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "createChallenge",
        args: [payload],
        value,
        account: address,
      });

      const fee = legacyFee(estimatedGas, await pc.getGasPrice());

      const hash = await wc.writeContract({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "createChallenge",
        args: [payload],
        account: address,
        value,
        gas: fee.gas,
        gasPrice: fee.gasPrice,
        type: "legacy",
      });

      const receipt = await pc.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Transaction reverted on-chain.");
      }

      let challengeId: number | undefined;

      try {
        const logs = parseEventLogs({
          abi: ABI.ChallengePay,
          logs: receipt.logs,
          eventName: "ChallengeCreated",
        });

        const evt = logs[0];
        const args = evt?.args as
          | { id?: bigint }
          | undefined;

        if (args?.id != null) challengeId = Number(args.id);
      } catch {}

      if (challengeId != null && aivmMeta) {
        const binding = resolveChallengeBinding({
          challengeId: BigInt(challengeId),
          subject: address,
          modelId: aivmMeta.model.id,
          modelHash: aivmMeta.model.modelHash,
          params: aivmMeta.params,
          benchmarkHash: aivmMeta.benchmarkHash,
        });

        const authHeaders = await buildAuthHeaders(wc);

        await saveLocalMeta({
          id: String(challengeId),
          title: state.essentials.title,
          description: buildAutoDescription(state) || state.essentials.description || "",
          category: state.intent.type === "FITNESS" ? (state.intent.fitnessKind ?? "fitness") : (state.intent.gameId ?? "gaming"),
          params: aivmMeta.params,
          tags: [...(state.essentials.tags ?? []), "aivm", "lightchain-poi"],
          game: state.intent.gameId ?? null,
          mode: state.intent.gameMode ?? null,
          subject: address as Hex,
          txHash: hash,
          externalId: state.options.externalId,
          status: "Active",
          modelId: binding.modelId,
          modelKind: "aivm",
          verificationBackend: "lightchain_poi",
          paramsHash: binding.paramsHash,
          benchmarkHash: binding.benchmarkHash,
          verifier: payload.verifier as Hex,
          verifierUsed: payload.verifier as Hex,
          modelHash: binding.modelDigest,
          timeline: {
            joinClosesAt: state.timeline.joinCloses?.toISOString() ?? null,
            startsAt: state.timeline.starts?.toISOString() ?? null,
            endsAt: state.timeline.ends?.toISOString() ?? null,
            proofDeadline: state.timeline.proofDeadline?.toISOString() ?? null,
          },
          funds: {
            stake: state.money.stake,
            currency:
              state.money.currency.type === "ERC20"
                ? {
                    type: "ERC20",
                    symbol: state.money.currency.symbol ?? null,
                    address: state.money.currency.address ?? null,
                  }
                : {
                    type: "NATIVE",
                    symbol: state.money.currency.symbol ?? null,
                    address: null,
                  },
          },
          options: {
            participantCap: state.options.participantCap,
            externalId: state.options.externalId,
          },
          proofSource: "API",
          invites: {
            roster: (state.invites?.roster ?? []).map((item, index) => ({
              id: String(item.id ?? `invite-${index + 1}`),
              team: item.team ?? null,
              wallet: item.wallet ?? null,
            })),
          },
          proof: {
            kind: "aivm",
            backend: "lightchain_poi",
            modelId: binding.modelId,
            params: aivmMeta.params,
            paramsHash: binding.paramsHash,
            benchmarkHash: binding.benchmarkHash,
            taskBinding: {
              schemaVersion: binding.schemaVersion,
              requestId: null,
              taskId: null,
            },
          },
        }, authHeaders);

        await triggerAivmPipeline(String(challengeId));
      }

      setUi((u) => ({
        ...u,
        txHash: hash,
        success: true,
        challengeId,
      }));

      push(
        challengeId != null
          ? `Challenge created (#${challengeId}).`
          : "Challenge created."
      );
    } catch (err) {
      const msg =
        decodeError(err) ||
        (err as any)?.shortMessage ||
        (err as any)?.message ||
        "Transaction failed.";

      setUi((u) => ({ ...u, error: msg }));
      push(msg);
    } finally {
      setUi((u) => ({ ...u, isSubmitting: false }));
    }
  }, [address, allowSubmit, pc, state, wc, push]);

  return {
    state,
    dispatch: dispatch as React.Dispatch<Action>,
    ui,
    derived,
    allowSubmit,
    goTo,
    next,
    back,
    reset,
    submit,
  };
}