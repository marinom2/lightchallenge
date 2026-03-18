import { useEffect, useState } from "react";
import { Panel, Card, Field } from "../components/ui";

/**
 * V1 FeesPanel — matches ChallengePay V1 fee structs:
 *   FeeCaps:   { forfeitFeeMaxBps, cashbackMaxBps }
 *   FeeConfig: { forfeitFeeBps, protocolBps, creatorBps, cashbackBps }
 *
 * UI guardrails:
 *   - Warns when forfeit > 5000 bps (50%)
 *   - Blocks forfeit > 10000 bps (100%)
 *   - Requires confirmation for any fee change
 */

const WARN_FORFEIT_BPS = 5000; // warn above 50%

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

    const msg =
      `FEE CAPS CHANGE\n\n` +
      `Forfeit Max: ${f} bps (${(f / 100).toFixed(1)}%)\n` +
      `Cashback Max: ${b} bps (${(b / 100).toFixed(1)}%)\n\n` +
      (f > WARN_FORFEIT_BPS
        ? `WARNING: Forfeit cap > 50% — this allows capturing more than half of loser stakes.\n\n`
        : ``) +
      `Fee caps apply to ALL future challenges. Are you sure?`;
    if (!window.confirm(msg)) return;

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

  const fVal = Number(forfeit || "0");
  const pVal = Number(protocol || "0");
  const crVal = Number(creator || "0");
  const cbVal = Number(cashback || "0");
  const splitValid = pVal + crVal === fVal;
  const allValid = [fVal, pVal, crVal, cbVal].every(x => Number.isFinite(x) && x >= 0 && x <= 10_000);

  const doSetFeeConfig = async () => {
    if (!allValid) return;
    if (!splitValid) return;

    const msg =
      `FEE CONFIG CHANGE — FINANCIAL IMPACT\n\n` +
      `Forfeit: ${fVal} bps (${(fVal / 100).toFixed(1)}% of loser stakes)\n` +
      `  Protocol: ${pVal} bps (${(pVal / 100).toFixed(1)}%)\n` +
      `  Creator: ${crVal} bps (${(crVal / 100).toFixed(1)}%)\n` +
      `Cashback: ${cbVal} bps (${(cbVal / 100).toFixed(1)}% returned to losers)\n\n` +
      (fVal > WARN_FORFEIT_BPS
        ? `WARNING: Forfeit > 50% — more than half of loser stakes are captured as fees.\n\n`
        : ``) +
      `This applies to ALL new challenges created after this change.\n` +
      `Existing challenges keep the fees they were created with.\n\n` +
      `Are you sure?`;
    if (!window.confirm(msg)) return;

    await onWrite("setFeeConfig", [{
      forfeitFeeBps: fVal, protocolBps: pVal, creatorBps: crVal, cashbackBps: cbVal,
    }], "Fee config updated");
  };

  return (
    <Panel title="Fees">
      <Card title="Caps (bps)">
        <div className="text-xs opacity-50 p-2 rounded border border-white/5 mb-3">
          Fee caps set the maximum allowed values. Actual fees (below) must be within these caps.
          1 bps = 0.01%. 10000 bps = 100%.
        </div>
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
          Fees are snapshotted at challenge creation — changes only affect new challenges.
        </div>
        {fVal > WARN_FORFEIT_BPS && (
          <div className="text-xs p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 mb-3">
            Forfeit is above 50% ({(fVal / 100).toFixed(1)}%). This means more than half of loser stakes are captured as fees.
          </div>
        )}
        {!splitValid && fVal > 0 && (
          <div className="text-xs p-2 rounded bg-red-500/10 border border-red-500/20 text-red-300 mb-3">
            Protocol ({pVal}) + Creator ({crVal}) = {pVal + crVal}, but Forfeit = {fVal}. These must be equal.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Forfeit"><input className="input" value={forfeit} onChange={(e) => setForfeit(e.target.value)} /></Field>
          <Field label="Protocol"><input className="input" value={protocol} onChange={(e) => setProtocol(e.target.value)} /></Field>
          <Field label="Creator"><input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} /></Field>
          <Field label="Cashback"><input className="input" value={cashback} onChange={(e) => setCashback(e.target.value)} /></Field>
          <div className="flex items-end">
            <button className="btn btn-primary" onClick={doSetFeeConfig} disabled={!allValid || !splitValid}>Save Config</button>
          </div>
        </div>
      </Card>
    </Panel>
  );
}
