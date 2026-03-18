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
  const [adminConfirm, setAdminConfirm] = useState("");
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
    if (adminConfirm.toLowerCase() !== a.toLowerCase()) return;
    const confirmed = window.confirm(
      `ADMIN TRANSFER — CRITICAL\n\n` +
      `New admin: ${a}\n\n` +
      `This initiates a 2-step admin transfer:\n` +
      `1. This call sets the pending admin\n` +
      `2. The new admin must call acceptAdmin() to complete\n\n` +
      `If you transfer to an incorrect address that cannot call acceptAdmin(),\n` +
      `admin control is permanently lost.\n\n` +
      `Are you absolutely sure?`
    );
    if (!confirmed) return;
    await onWrite("setAdmin", [a], "Admin transfer initiated (pending acceptance)");
    setNewAdmin(""); setAdminConfirm("");
  };

  const doPauseAll = async () => {
    if (paused) {
      const confirmed = window.confirm(
        `GLOBAL PAUSE\n\n` +
        `This will freeze ALL challenge operations across the entire platform:\n` +
        `- No challenge creation\n` +
        `- No joining\n` +
        `- No proof submission\n` +
        `- No claims\n\n` +
        `All participant funds remain locked until you unpause.\n` +
        `Are you sure?`
      );
      if (!confirmed) return;
    }
    await onWrite("pauseAll", [paused], paused ? "Global paused" : "Global unpaused");
  };

  const doSetLeadBounds = async () => {
    const min = toBigintOrZero(leadMin);
    const max = toBigintOrZero(leadMax);
    if (min === 0n || max < min) return;
    await onWrite("setLeadTimeBounds", [min, max], "Lead time bounds updated");
  };

  const adminAddr = okAddr(newAdmin);
  const adminMatch = adminAddr && adminConfirm.toLowerCase() === adminAddr.toLowerCase();

  return (
    <Panel title="Governance">
      <Card title="Ownership">
        <div className="text-xs opacity-50 p-2 rounded border border-red-500/10 mb-3">
          Admin transfer is irreversible if the target cannot call acceptAdmin().
          You must type the new admin address twice to confirm.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New admin address (0x…)">
            <input className="input" value={newAdmin} onChange={(e) => { setNewAdmin(e.target.value); setAdminConfirm(""); }} placeholder="0x…" />
          </Field>
          <Field label="Confirm: re-type the address">
            <input
              className="input"
              value={adminConfirm}
              onChange={(e) => setAdminConfirm(e.target.value)}
              placeholder="Type the same address again"
              disabled={!adminAddr}
            />
          </Field>
        </div>
        {adminAddr && adminConfirm.length > 0 && !adminMatch && (
          <div className="text-xs text-red-400 mt-1">Addresses do not match</div>
        )}
        <button className="btn btn-warn mt-3" onClick={doSetAdmin} disabled={!adminMatch}>
          Transfer Admin
        </button>
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
