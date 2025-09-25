import type { Abi } from "viem"

export type ChallengeView = {
  id: bigint
  kind: number
  status: number
  outcome: number
  challenger: `0x${string}`
  daoTreasury: `0x${string}`
  currency: `0x${string}`
  stake: bigint
  proposalBond: bigint
  approvalDeadline: bigint
  startTs: bigint
  maxParticipants: number
  yesWeight: bigint
  noWeight: bigint
  partWeight: bigint
  peers: number
  peerApprovalsNeeded: number
  peerApprovals: number
  peerRejections: number
  charityBps: number
  charity: `0x${string}`
  poolSuccess: bigint
  poolFail: bigint
  proofRequired: boolean
  verifier: `0x${string}`
  proofOk: boolean
  participantsCount: number
}

export function mapChallengeTuple(t: any[]): ChallengeView {
  return {
    id: t[0], kind: Number(t[1]), status: Number(t[2]), outcome: Number(t[3]),
    challenger: t[4], daoTreasury: t[5], currency: t[6],
    stake: t[7], proposalBond: t[8], approvalDeadline: t[9], startTs: t[10],
    maxParticipants: Number(t[11]),
    yesWeight: t[12], noWeight: t[13], partWeight: t[14],
    peers: Number(t[15]), peerApprovalsNeeded: Number(t[16]),
    peerApprovals: Number(t[17]), peerRejections: Number(t[18]),
    charityBps: Number(t[19]), charity: t[20],
    poolSuccess: t[21], poolFail: t[22],
    proofRequired: !!t[23], verifier: t[24],
    proofOk: !!t[25], participantsCount: Number(t[26]),
  }
}

export const StatusLabel: Record<number,string> = {
  0: "Unknown", 1: "Proposed", 2: "Active", 3: "Succeeded", 4: "Failed", 5: "Cancelled", 6: "Finalized"
}
