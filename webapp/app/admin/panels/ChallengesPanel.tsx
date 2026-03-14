import { useState } from "react";
import { ZERO, okAddr, toBigintOrZero } from "../lib/utils";
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

  const doPause = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    await onWrite("pauseChallenge", [bid, paused], paused ? "Challenge paused" : "Challenge unpaused");
  };
  const doCancel = async () => {
    const bid = toBigintOrZero(id); if (bid === 0n) return;
    await onWrite("cancelChallenge", [bid], "Challenge canceled");
  };
  const doVC = async () => {
    const bid = toBigintOrZero(vcId); if (bid === 0n) return;
    const ver = vcVerifier ? (okAddr(vcVerifier) || ZERO) : ZERO;
    const proofD = toBigintOrZero(vcProofDeadline || "0");
    const peerD = toBigintOrZero(vcPeerDeadline || "0");
    await onWrite("setVerificationConfig", [bid, vcReq, ver, proofD, peerD], "Verification config set");
  };

  return (
    <Panel title="Challenges">
      <Card title="Pause / Cancel">
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
