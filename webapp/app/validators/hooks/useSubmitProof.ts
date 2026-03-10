// app/validators/hooks/useSubmitProof.ts
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { isAddress, type Hex, encodeAbiParameters, parseAbiParameters } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import type { Abi } from "viem";
import type { UiModel, ModelParam } from "../types";

/* Helpers */

type SteamBinding = {
  external_id?: string;
  handle?: string;
  avatar_url?: string;
} | null;

type IntakeOut = {
  ok: boolean;
  publicSignals?: Array<string | number | bigint>;
  dataHash?: Hex;
  previewCount?: number;
  preview?: unknown[];
  error?: string;
};

function asHexMaybe(v: unknown): Hex | null {
  return typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v) ? (v as Hex) : null;
}

/** Normalize one raw model object */
function normalizeRawModel(raw: any): UiModel | null {
  if (!raw) return null;

  const mh = typeof raw.modelHash === "string" ? raw.modelHash : raw.model_id || raw.model || "";
  if (typeof mh !== "string" || !mh.startsWith("0x") || mh.length !== 66) return null;

  const kind =
    String(raw.kind || raw.verifierKind || "AIVM").toUpperCase() === "ZK" ? "ZK" : "AIVM";

  const params: ModelParam[] | undefined = Array.isArray(raw.params)
    ? raw.params.map((p: any) => {
        const def = p.default ?? p.defaultValue;
        return {
          key: String(p.key ?? p.name ?? ""),
          type: String(p.type ?? "text"),
          label: String(p.label ?? p.key ?? "Param"),
          default: def,
          defaultValue: def,
          placeholder: p.placeholder,
          required: Boolean(p.required),
        };
      })
    : undefined;

  const providers: Array<"steam"> | undefined = Array.isArray(raw.providers)
    ? (raw.providers.filter((x: any) => x === "steam") as Array<"steam">)
    : undefined;

  return {
    name: raw.label || raw.name || "Unknown Model",
    modelHash: mh as `0x${string}`,
    verifierKind: kind,
    providers,
    params,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

/* Hook */

export function useSubmitProof() {
  const { address: connectedAccount } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<UiModel[]>([]);
  const [search, setSearch] = useState("");
  const [selectedModelHash, setSelectedModelHash] = useState<`0x${string}` | null>(null);

  const [challengeId, setChallengeId] = useState("");
  const [subject, setSubject] = useState("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [file, setFile] = useState<File | null>(null);
  const [steam, setSteam] = useState<SteamBinding>(null);

  const [intakeResult, setIntakeResult] = useState<IntakeOut | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const modelsAbortRef = useRef<AbortController | null>(null);
  const intakeAbortRef = useRef<AbortController | null>(null);
  const signAbortRef = useRef<AbortController | null>(null);

  /* Load models */
  useEffect(() => {
    modelsAbortRef.current?.abort();
    const ctrl = new AbortController();
    modelsAbortRef.current = ctrl;

    (async () => {
      try {
        setError(null);
        const res = await fetch(`/models/models.json?ts=${Date.now()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Models load failed (${res.status})`);
        const data = await res.json().catch(() => ({}));
        const rawList: any[] = Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data)
          ? data
          : [];
        const mapped = rawList.map(normalizeRawModel).filter((m): m is UiModel => !!m);
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setModels(mapped);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message || "Failed to load validation models.");
        setModels([]);
      }
    })();

    return () => ctrl.abort();
  }, []);

  /* Intake */
  const runIntake = useCallback(async () => {
    if (!selectedModelHash || !subject || !challengeId) return;
    intakeAbortRef.current?.abort();
    const ctrl = new AbortController();
    intakeAbortRef.current = ctrl;
    setIsLoading(true);
    setError(null);
    setIntakeResult(null);

    try {
      const fd = new FormData();
      fd.set("modelHash", selectedModelHash);
      fd.set("challengeId", challengeId);
      fd.set("subject", subject);
      if (params && Object.keys(params).length) fd.set("params", JSON.stringify(params));
      if (file) fd.set("file", file);

      const res = await fetch("/api/aivm/intake", { method: "POST", body: fd, signal: ctrl.signal });
      const out = (await res.json().catch(() => ({}))) as IntakeOut;
      if (!res.ok || !out?.ok) throw new Error(out?.error || `Preview generation failed (${res.status})`);
      setIntakeResult(out);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Intake failed");
    } finally {
      setIsLoading(false);
    }
  }, [selectedModelHash, challengeId, subject, params, file]);

  /* Submit AIVM — aligned to page.tsx: payload = abi.encode(uint256[], bytes32) */
  const submitAivm = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      if (!selectedModelHash) throw new Error("Pick a model");
      if (!challengeId || !/^\d+$/.test(challengeId)) throw new Error("Bad challengeId");
      if (!isAddress(subject)) throw new Error("Bad subject address");
      if (!intakeResult) throw new Error("Generate preview first");
      if (!asHexMaybe(intakeResult.dataHash)) throw new Error("Server did not return dataHash");

      const pubSignals = (intakeResult.publicSignals || []).map((x) => BigInt(x as any));
      const payload = encodeAbiParameters(
        parseAbiParameters("uint256[], bytes32"),
        [pubSignals, intakeResult.dataHash as Hex]
      );

      signAbortRef.current?.abort();
      const ctrl = new AbortController();
      signAbortRef.current = ctrl;

      const res = await fetch("/api/proof/aivm/sign", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: subject,
          challengeId: Number(challengeId),
          modelId: selectedModelHash,
          modelVersion: 1,
          payload,
        }),
      });

      const out = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(out?.error || `Sign failed (${res.status})`);
      const packed: Hex | null = asHexMaybe(out?.packed);
      if (!packed) throw new Error("Server did not return packed bytes.");

      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as unknown as Abi,
        address: ADDR.ChallengePay!,
        functionName: "submitProof",
        args: [BigInt(challengeId), packed] as [bigint, `0x${string}`],
      });

      setTxHash(hash);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.shortMessage || e?.message || "Submit failed");
    } finally {
      setIsLoading(false);
    }
  }, [selectedModelHash, challengeId, subject, intakeResult, writeContractAsync]);

  /* Derived */
  const { filteredModels, selectedModel, isSteamRequired, firstError } = useMemo(() => {
    const model = models.find((m) => m.modelHash === selectedModelHash) || null;
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? models
      : models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.modelHash.toLowerCase().includes(q) ||
            (m.providers || []).some((p) => p.toLowerCase().includes(q))
        );
    const steamReq = model?.providers?.includes("steam") ?? false;
    let err: string | null = null;
    if (step === 1 && !selectedModelHash) err = "Select a model to continue";
    else if (step >= 2 && !challengeId) err = "Challenge ID required";
    else if (step >= 2 && !isAddress(subject)) err = "Valid subject address required";
    else if (step >= 2 && steamReq && !steam) err = "Link Steam account first";
    return { filteredModels: filtered, selectedModel: model, isSteamRequired: steamReq, firstError: err };
  }, [models, search, selectedModelHash, step, challengeId, subject, steam]);

  /* Actions */
  const selectModel = (hash: `0x${string}`) => {
    setSelectedModelHash(hash);
    const model = models.find((m) => m.modelHash === hash);
    if (model?.params) {
      const defaults = model.params.reduce((acc, p) => {
        const val = p.default ?? p.defaultValue;
        if (val !== undefined) acc[p.key] = val;
        return acc;
      }, {} as Record<string, any>);
      setParams(defaults);
    }
    setStep(2);
  };

  const goToStep = (n: number) => (!firstError && setStep(n));

  return {
    state: {
      step,
      models,
      search,
      selectedModel,
      challengeId,
      subject,
      params,
      file,
      steam,
      isLoading,
      error,
      intakeResult,
      txHash,
      filteredModels,
    },
    derived: { isSteamRequired, firstError },
    actions: {
      setSearch,
      selectModel,
      setChallengeId,
      setSubject,
      setParams,
      setFile,
      setStep,
      setError,
      runIntake,
      submitAivm,
      goToStep,
      setSteamBinding: (b: SteamBinding) => setSteam(b),
    },
  };
}