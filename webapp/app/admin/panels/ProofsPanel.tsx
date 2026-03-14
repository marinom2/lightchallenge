import { useEffect, useState } from "react";
import { Panel, Card, seg } from "../components/ui";

/**
 * V1 ProofsPanel — only proofTightenOnly remains from V1 contract.
 * fastTrackVerifier was removed in V1.
 */
export function ProofsPanel({
  current,
  onWrite,
}: {
  current: { tightenOnly?: boolean };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [tight, setTight] = useState<boolean>(!!current.tightenOnly);

  useEffect(() => {
    setTight(!!current.tightenOnly);
  }, [current.tightenOnly]);

  const doTight = async () => {
    await onWrite("setProofTightenOnly", [tight], tight ? "Tighten-only ON" : "Tighten-only OFF");
  };

  return (
    <Panel title="Proof Verification">
      <div className="text-xs opacity-50 p-3 rounded-lg border border-white/5 mb-2">
        Proof verification is handled by the AIVM PoI pipeline.
      </div>

      <Card title="Tighten-Only Mode">
        <div className="text-xs opacity-50 mb-2">When ON, proofs can only improve (tighten) an existing result — they cannot weaken it.</div>
        <div className="flex items-center gap-2">
          <button className={seg(tight)} onClick={() => setTight(true)}>ON</button>
          <button className={seg(!tight)} onClick={() => setTight(false)}>OFF</button>
          <button className="btn btn-primary ml-auto" onClick={doTight}>Apply</button>
        </div>
      </Card>
    </Panel>
  );
}
