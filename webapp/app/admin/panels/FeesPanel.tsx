import { useEffect, useState } from "react";
import { Panel, Card, Field } from "../components/ui";

/**
 * V1 FeesPanel — matches ChallengePay V1 fee structs:
 *   FeeCaps:   { forfeitFeeMaxBps, cashbackMaxBps }
 *   FeeConfig: { forfeitFeeBps, protocolBps, creatorBps, cashbackBps }
 */
export function FeesPanel({
  caps,
  cfg,
  onWrite,
}: {
  caps: { forfeit?: bigint; cashback?: bigint };
  cfg: { forfeit?: bigint; protocol?: bigint; creator?: bigint; cashback?: bigint };
  onWrite: (fn: string, args: any[], msg: string) => Promise<void>;
}) {
  const [capForfeit, setCapForfeit] = useState(caps.forfeit ? String(caps.forfeit) : "");
  const [capCashback, setCapCashback] = useState(caps.cashback ? String(caps.cashback) : "");

  useEffect(() => {
    if (caps.forfeit !== undefined) setCapForfeit(String(caps.forfeit));
    if (caps.cashback !== undefined) setCapCashback(String(caps.cashback));
  }, [caps.forfeit, caps.cashback]);

  const doSetFeeCaps = async () => {
    const f = Number(capForfeit || "0");
    const b = Number(capCashback || "0");
    if ([f, b].some(v => !Number.isFinite(v) || v < 0 || v > 10_000)) return;
    await onWrite("setFeeCaps", [{ forfeitFeeMaxBps: f, cashbackMaxBps: b }], "Fee caps updated");
  };

  const [forfeit, setForfeit] = useState(cfg.forfeit ? String(cfg.forfeit) : "");
  const [protocol, setProtocol] = useState(cfg.protocol ? String(cfg.protocol) : "");
  const [creator, setCreator] = useState(cfg.creator ? String(cfg.creator) : "");
  const [cashback, setCashback] = useState(cfg.cashback ? String(cfg.cashback) : "");

  useEffect(() => {
    if (cfg.forfeit !== undefined) setForfeit(String(cfg.forfeit));
    if (cfg.protocol !== undefined) setProtocol(String(cfg.protocol));
    if (cfg.creator !== undefined) setCreator(String(cfg.creator));
    if (cfg.cashback !== undefined) setCashback(String(cfg.cashback));
  }, [cfg]);

  const doSetFeeConfig = async () => {
    const f = Number(forfeit || "0");
    const p = Number(protocol || "0");
    const cr = Number(creator || "0");
    const cb = Number(cashback || "0");
    if ([f, p, cr, cb].some(x => !Number.isFinite(x) || x < 0 || x > 10_000)) return;
    if (p + cr !== f) return;
    await onWrite("setFeeConfig", [{
      forfeitFeeBps: f, protocolBps: p, creatorBps: cr, cashbackBps: cb,
    }], "Fee config updated");
  };

  return (
    <Panel title="Fees">
      <Card title="Caps (bps)">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Forfeit Max">
            <input className="input" value={capForfeit} onChange={(e) => setCapForfeit(e.target.value)} />
          </Field>
          <Field label="Cashback Max">
            <input className="input" value={capCashback} onChange={(e) => setCapCashback(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetFeeCaps}>Save Caps</button>
          </div>
        </div>
      </Card>

      <Card title="Configuration (bps)">
        <div className="text-xs opacity-50 mb-2">
          V1: forfeit = protocol + creator (validation enforced). Cashback applied before fees.
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Forfeit"><input className="input" value={forfeit} onChange={(e) => setForfeit(e.target.value)} /></Field>
          <Field label="Protocol"><input className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)} /></Field>
          <Field label="Creator"><input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} /></Field>
          <Field label="Cashback"><input className="input" value={cashback} onChange={(e) => setCashback(e.target.value)} /></Field>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetFeeConfig}>Save Config</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
