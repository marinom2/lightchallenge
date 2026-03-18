import { useState } from "react";
import { ZERO, okAddr, toBigintOrZero } from "../lib/utils";
import { ADDR } from "@/lib/contracts";
import { Panel, Card, Field, seg } from "../components/ui";

export function ChallengesPanel({
  onWrite,
}: {
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [paused, setPaused] = useState(false);

  const [vcId, setVcId] = useState("");
  const [vcReq, setVcReq] = useState(false);
  const [vcVerifier, setVcVerifier] = useState("");
  const [vcProofDeadline, setVcProofDeadline] = useState("");
  const [vcPeerDeadline, setVcPeerDeadline] = useState("");

  const KNOWN_VERIFIERS = [
    ADDR.ChallengePayAivmPoiVerifier,
  ].filter(Boolean).map(a => a!.toLowerCase());

  const doPause = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    if (paused) {
      const confirmed = window.confirm(
        `PAUSE Challenge #${bid}\n\n` +
        `This will freeze all operations on this challenge:\n` +
        `- No new participants can join\n` +
        `- No proofs can be submitted\n` +
        `- No claims can be processed\n\n` +
        `Participant funds remain locked until unpaused.\n` +
        `Are you sure?`
      );
      if (!confirmed) return;
    }
    await onWrite("pauseChallenge", [bid, paused], paused ? "Challenge paused" : "Challenge unpaused");
  };

  const doCancel = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    const confirmed = window.confirm(
      `CANCEL Challenge #${bid} — FINANCIAL IMPACT\n\n` +
      `This action:\n` +
      `- Refunds ALL participants (losers get their stake back)\n` +
      `- Winners LOSE their claims permanently\n` +
      `- Cannot be undone\n\n` +
      `Only cancel if the challenge is invalid or disputed.\n` +
      `Are you absolutely sure?`
    );
    if (!confirmed) return;
    await onWrite("cancelChallenge", [bid], "Challenge canceled");
  };

  const doVC = async () => {
    const bid = toBigintOrZero(vcId); if (bid === 0n) return;
    const ver = vcVerifier ? (okAddr(vcVerifier) || ZERO) : ZERO;

    if (ver !== ZERO && !KNOWN_VERIFIERS.includes(ver.toLowerCase())) {
      const confirmed = window.confirm(
        `WARNING: Unknown verifier address\n\n` +
        `Address: ${ver}\n\n` +
        `This address is NOT one of the known deployed verifiers.\n` +
        `Setting an incorrect verifier can allow fraudulent proofs\n` +
        `or permanently block legitimate proof submission.\n\n` +
        `Only proceed if you have verified this contract.\n` +
        `Are you sure?`
      );
      if (!confirmed) return;
    }

    const proofD = toBigintOrZero(vcProofDeadline || "0");
    const peerD = toBigintOrZero(vcPeerDeadline || "0");
    await onWrite("setVerificationConfig", [bid, vcReq, ver, proofD, peerD], "Verification config set");
  };

  return (
    <Panel title="Challenges">
      <Card title="Pause / Cancel">
        <div className="text-xs opacity-50 p-2 rounded border border-white/5 mb-3">
          Pausing freezes all operations; canceling refunds everyone and is irreversible.
          Neither action can steal funds, but canceling prevents winners from claiming.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Challenge ID">
            <input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="id" />
          </Field>
          <div className="flex items-end gap-2">
            <button className={seg(paused)} onClick={() => setPaused(true)}>Paused</button>
            <button className={seg(!paused)} onClick={() => setPaused(false)}>Unpaused</button>
          </div>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary" onClick={doPause}>Apply Pause</button>
            <button className="btn btn-warn" onClick={doCancel}>Cancel</button>
          </div>
        </div>
      </Card>

      <Card title="Verification Config (per challenge)">
        <div className="text-xs opacity-50 p-2 rounded border border-red-500/10 mb-3">
          DANGER: Changing the verifier on an active challenge affects how proofs are validated.
          Setting an incorrect verifier can allow fraudulent proofs or block legitimate ones.
          Only change this if you understand the implications.
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Challenge ID">
            <input className="input" value={vcId} onChange={(e) => setVcId(e.target.value)} />
          </Field>
          <Field label="Proof Required">
            <div className="flex gap-2">
              <button className={seg(vcReq)} onClick={() => setVcReq(true)}>Yes</button>
              <button className={seg(!vcReq)} onClick={() => setVcReq(false)}>No</button>
            </div>
          </Field>
          <Field label="Verifier (0x…)">
            <input className="input" value={vcVerifier} onChange={(e) => setVcVerifier(e.target.value)} />
          </Field>
          <Field label="Proof Deadline (unix sec)">
            <input className="input" value={vcProofDeadline} onChange={(e) => setVcProofDeadline(e.target.value)} />
          </Field>
          <Field label="Peer Deadline (unix sec)">
            <input className="input" value={vcPeerDeadline} onChange={(e) => setVcPeerDeadline(e.target.value)} />
          </Field>
          <div className="sm:col-span-5">
            <button className="btn btn-primary" onClick={doVC}>Set Verification Config</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
