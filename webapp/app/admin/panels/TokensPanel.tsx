import { useEffect, useState } from "react";
import { okAddr } from "../lib/utils";
import { Panel, Card, Field, seg } from "../components/ui";

export function TokensPanel({
  current,
  onWrite,
}: {
  current: { useAllowlist?: boolean };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState<boolean>(!!current.useAllowlist);
  const [tokenAddr, setTokenAddr] = useState("");
  const [flag, setFlag] = useState<boolean>(true);

  useEffect(() => setEnabled(!!current.useAllowlist), [current.useAllowlist]);

  const doToggle = async () => {
    await onWrite("setUseTokenAllowlist", [enabled], enabled ? "Allowlist enabled" : "Allowlist disabled");
  };
  const doSetToken = async () => {
    const t = okAddr(tokenAddr); if (!t) return;
    await onWrite("setTokenAllowed", [t, flag], flag ? "Token allowed" : "Token disallowed");
  };

  return (
    <Panel title="Token Allowlist">
      <Card title="Global Allowlist">
        <div className="flex items-center gap-2">
          <button className={seg(enabled)} onClick={() => setEnabled(true)}>Enabled</button>
          <button className={seg(!enabled)} onClick={() => setEnabled(false)}>Disabled</button>
          <button className="btn btn-primary ml-auto" onClick={doToggle}>Save</button>
        </div>
      </Card>

      <Card title="Allow / Disallow Token">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Token (0x…)">
            <input className="input" value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <div className="flex items-end gap-2">
            <button className={seg(flag)} onClick={() => setFlag(true)}>Allow</button>
            <button className={seg(!flag)} onClick={() => setFlag(false)}>Disallow</button>
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetToken}>Apply</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
