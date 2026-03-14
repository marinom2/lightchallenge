import { useEffect, useState } from "react";
import { okAddr, toBigintOrZero } from "../lib/utils";
import { Panel, Card, Field, seg } from "../components/ui";

export function GovernancePanel({
  values,
  onWrite,
}: {
  values: { globalPaused?: boolean; minLeadTime?: bigint; maxLeadTime?: bigint };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [newAdmin, setNewAdmin] = useState("");
  const [paused, setPaused] = useState<boolean>(!!values.globalPaused);
  const [leadMin, setLeadMin] = useState(values.minLeadTime ? String(values.minLeadTime) : "");
  const [leadMax, setLeadMax] = useState(values.maxLeadTime ? String(values.maxLeadTime) : "");

  useEffect(() => {
    setPaused(!!values.globalPaused);
    if (values.minLeadTime) setLeadMin(String(values.minLeadTime));
    if (values.maxLeadTime) setLeadMax(String(values.maxLeadTime));
  }, [values.globalPaused, values.minLeadTime, values.maxLeadTime]);

  const doSetAdmin = async () => {
    const a = okAddr(newAdmin); if (!a) return;
    await onWrite("setAdmin", [a], "Admin updated");
  };
  const doPauseAll = async () => {
    await onWrite("pauseAll", [paused], paused ? "Global paused" : "Global unpaused");
  };
  const doSetLeadBounds = async () => {
    const min = toBigintOrZero(leadMin);
    const max = toBigintOrZero(leadMax);
    if (min === 0n || max < min) return;
    await onWrite("setLeadTimeBounds", [min, max], "Lead time bounds updated");
  };

  return (
    <Panel title="Governance">
      <Card title="Ownership">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">New admin (0x…)</div>
            <input className="input" value={newAdmin} onChange={(e) => setNewAdmin(e.target.value)} placeholder="0x…" />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-primary" onClick={doSetAdmin}>Transfer Admin</button>
          </div>
        </div>
      </Card>

      <Card title="Global Pause">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <button className={seg(paused)} onClick={() => setPaused(true)}>Paused</button>
            <button className={seg(!paused)} onClick={() => setPaused(false)}>Unpaused</button>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button className="btn btn-warn" onClick={doPauseAll}>Apply</button>
          </div>
        </div>
      </Card>

      <Card title="Lead Time Bounds (seconds)">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs opacity-70 mb-1">Min</div>
            <input className="input" value={leadMin} onChange={(e) => setLeadMin(e.target.value)} />
          </div>
          <div>
            <div className="text-xs opacity-70 mb-1">Max</div>
            <input className="input" value={leadMax} onChange={(e) => setLeadMax(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetLeadBounds}>Save</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
