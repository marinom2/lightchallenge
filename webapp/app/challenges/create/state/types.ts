// webapp/app/challenges/create/state/types.ts
import type { Address, Hex } from "viem";
import type { VerificationBackend } from "../lib/proof";

export type ChallengeType = "GAMING" | "FITNESS";
export type Visibility = "PUBLIC" | "PRIVATE";

export type GameId = "dota" | "cs" | "lol";
export type GamingMode = "1v1" | "5v5";

export type CurrencyType = "NATIVE" | "ERC20";

export type VerificationStyle = "SIMPLE" | "ADVANCED";
export type ProofMode = "AIVM" | "PLONK" | "ZK";

export type IntentState = {
  type: ChallengeType | null;
  visibility: Visibility;
  gameId?: GameId | null;
  gameMode?: GamingMode | null;
  fitnessKind?: string | null;
};

export type EssentialsState = {
  title: string;
  description: string;
  tags: string[];
};

export type CurrencyState =
  | {
      type: "NATIVE";
      symbol?: string;
      decimals?: number;
    }
  | {
      type: "ERC20";
      address?: Address | null;
      symbol?: string;
      decimals?: number;
    };

export type MoneyState = {
  currency: CurrencyState;
  stake: string;
  bond: string;
};

export type TimelineState = {
  joinCloses: Date | null;
  starts: Date | null;
  ends: Date | null;
  proofDeadline: Date | null;
  peerDeadline: Date | null;
  approvalDeadline?: Date | null;
};

export type OptionsState = {
  participantCap: string;
  externalId: string;
};

export type ProofMeta = {
  mode: ProofMode;
  backend?: VerificationBackend | null;
  templateId?: string | null;
  verifier?: Address | null;
  modelId?: string | null;
  modelHash?: Hex | null;
  params?: Record<string, unknown> | undefined;
  paramsHash?: Hex | null;
  benchmarkHash?: Hex | null;
  proofOn?: boolean;
};

export type VerificationState = {
  style?: VerificationStyle;
  mode: ProofMode | null;
  backend?: VerificationBackend | null;
  templateId?: string | null;
  modelId?: string | null;
  modelHash?: Hex | null;
  params?: Record<string, any> | undefined;
  paramsHash?: Hex | null;
  benchmarkHash?: Hex | null;
  verifier?: Address | null;
  proofOn?: boolean;
};

export type AivmFormState = {
  templateId: string | null;
  [key: string]: unknown;
};

export type InviteRosterItem = {
  id: string;
  team?: string | null;
  wallet?: string | null;
  status?: string | null;
};

export type ChallengeFormState = {
  intent: IntentState;
  essentials: EssentialsState;
  money: MoneyState;
  timeline: TimelineState;
  options: OptionsState;
  verification: VerificationState;

  aivmForm: AivmFormState;
  peers: string[];
  peerApprovalsNeeded: number;
  invites?: {
    roster?: InviteRosterItem[];
  };

  stepReady?: boolean;
};

export type AllowanceState = "unknown" | "prompting" | "granting" | "granted";

export type UiState = {
  step: 1 | 2 | 3 | 4;
  isSubmitting: boolean;
  error: string | null;
  allowanceState: AllowanceState;
  success: boolean;
  txHash: `0x${string}` | null;
  challengeId?: number;
  wasAutoApproved?: boolean;
};

export type DerivedState = {
  totalDepositWei: bigint;
  totalDepositFormatted: string;
  verifier: Address | null;
  verifierSource: "state" | "missing";
  modelId: string | null;
  resolvedKind: string | null;
  errors: Record<string, string>;
};

export type Action =
  | { type: "SET_INTENT"; payload: Partial<IntentState> }
  | { type: "SET_ESSENTIALS"; payload: Partial<EssentialsState> }
  | { type: "SET_MONEY"; payload: Partial<MoneyState> }
  | { type: "SET_CURRENCY"; payload: CurrencyState }
  | { type: "SET_TIMELINE"; payload: Partial<TimelineState> }
  | { type: "SET_OPTIONS"; payload: Partial<OptionsState> }
  | { type: "SET_VERIFICATION_STYLE"; payload: VerificationStyle }
  | { type: "SET_VERIFICATION"; payload: Partial<ProofMeta> }
  | { type: "SET_AIVM_FORM"; payload: Partial<AivmFormState> }
  | { type: "SET_PEERS"; payload: string[] }
  | { type: "SET_PEER_APPROVALS_NEEDED"; payload: number }
  | { type: "RESET"; payload?: Partial<ChallengeFormState> };