import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import type { Abi, Hex } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { ZERO, OPERATOR_ROLE, SWEEPER_ROLE, okAddr, cn } from "../lib/utils";
import { Panel, Card, Field, Toast, Busy, seg } from "../components/ui";

export function RolesPanel() {
  const { writeContractAsync } = useWriteContract();
  const pc = usePublicClient();
  const [toast, setToast] = useState<{ kind: "info" | "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const push = (text: string, kind: "info" | "ok" | "bad" = "info") => { setToast({ kind, text }); setTimeout(() => setToast(null), 3600); };
  const waitReceipt = async (hash: Hex) => { if (!pc) return; setBusy("Waiting…"); await pc.waitForTransactionReceipt({ hash }); setBusy(null); };

  const [roleAddr, setRoleAddr] = useState("");
  const [role, setRole] = useState<"operator" | "sweeper">("operator");
  const roleId = role === "operator" ? OPERATOR_ROLE : SWEEPER_ROLE;

  const targetAddr = okAddr(roleAddr) ?? ZERO;
  const { data: hasRole } = useReadContract({
    address: ADDR.Treasury,
    abi: ABI.Treasury,
    functionName: "hasRole",
    args: [roleId, targetAddr],
    query: { enabled: targetAddr !== ZERO },
  } as any);

  const doGrant = async () => {
    const who = okAddr(roleAddr); if (!who) return;
    const roleName = role === "operator" ? "OPERATOR" : "SWEEPER";
    const warning = role === "operator"
      ? "The OPERATOR role can grant ERC-20 allowances from the Treasury.\nThis gives the address direct access to Treasury funds."
      : "The SWEEPER role can sweep excess funds out of the Treasury.\nThis gives the address ability to withdraw funds.";
    const confirmed = window.confirm(
      `GRANT ${roleName} ROLE — FINANCIAL ACCESS\n\n` +
      `Address: ${who}\n\n` +
      `${warning}\n\n` +
      `Only grant this role to trusted, verified addresses.\n` +
      `Are you sure?`
    );
    if (!confirmed) return;
    try {
      setBusy("Sending…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "grantRole",
        args: [roleId, who],
      });
      await waitReceipt(tx);
      push("Role granted", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Grant role failed", "bad");
    }
  };
  const doRevoke = async () => {
    const who = okAddr(roleAddr); if (!who) return;
    try {
      setBusy("Sending…");
      const tx = await writeContractAsync({
        address: ADDR.Treasury,
        abi: ABI.Treasury as Abi,
        functionName: "revokeRole",
        args: [roleId, who],
      });
      await waitReceipt(tx);
      push("Role revoked", "ok");
    } catch (e: any) {
      setBusy(null);
      push(e?.shortMessage || e?.message || "Revoke role failed", "bad");
    }
  };

  return (
    <Panel title="Roles">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}

      <Card title="Treasury Roles">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Role">
            <div className="segmented">
              <button className={seg(role === "operator")} onClick={() => setRole("operator")}>Operator</button>
              <button className={seg(role === "sweeper")} onClick={() => setRole("sweeper")}>Sweeper</button>
            </div>
          </Field>
          <Field label="Address (0x…)">
            <input className="input" value={roleAddr} onChange={(e) => setRoleAddr(e.target.value)} placeholder="0x…" />
          </Field>
          <div className="flex items-end gap-2">
            <span className={cn("chip", hasRole ? "chip--ok" : "chip--bad")}>{hasRole ? "Has role" : "Not granted"}</span>
            <button className="btn btn-primary" onClick={doGrant}>Grant</button>
            <button className="btn btn-ghost" onClick={doRevoke}>Revoke</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
