import { useEffect, useMemo, useRef, useState } from "react";
import { getAllCodeTemplates, toPlain } from "@/lib/templates";
import { AUTO_POI_VERIFIER, addrRegex, aivmHashFromId, bytes32Regex, parseJSON, pretty, cn } from "../lib/utils";
import { Panel, Card, Field, seg } from "../components/ui";

/* ── Types aligned with current AIVM + PoI architecture ──────────────── */

/**
 * Model kinds:
 *   aivm   — verified by Lightchain AIVM network via PoI attestation (primary)
 *   custom — reserved for admin-managed models outside the AIVM pipeline
 */
const MODEL_KINDS = ["aivm", "custom"] as const;
type ModelKind = (typeof MODEL_KINDS)[number];

type ModelParam = { key: string; label: string; type: "int" | "text" | "datetime"; default?: number | string };

type ModelRow = {
  id: string;
  label: string;
  kind: ModelKind;
  modelHash: string;
  verifier: string;
  binding?: boolean;
  signals?: string[];
  params?: ModelParam[];
  sources?: string[];
  fileAccept?: string[];
  notes?: string;
  active?: boolean;
};

const TEMPLATE_KINDS = ["steps", "running", "cycling", "hiking", "swimming", "dota", "cs", "lol"] as const;
type TemplateKind = (typeof TEMPLATE_KINDS)[number];

type TemplateField =
  | { kind: "number"; key: string; label: string; min?: number; step?: number; default?: number }
  | { kind: "text"; key: string; label: string; default?: string }
  | { kind: "readonly"; key: string; label: string; value: string }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; default?: string };

type TemplateRow = {
  id: string;
  kind: TemplateKind;
  name: string;
  hint?: string;
  modelId: string;
  fields: TemplateField[];
  ruleConfig?: Record<string, unknown> | null;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _source?: "code" | "db" | "merged";
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

function StatusChip({ ok, yes = "Valid", no = "Error" }: { ok: boolean; yes?: string; no?: string }) {
  return <span className={cn("chip", ok ? "chip--ok" : "chip--bad")}>{ok ? yes : no}</span>;
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <div className="text-xs opacity-50 mt-1">{children}</div>;
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="text-xs opacity-50 mt-0.5">{description}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

export function ModelsPanel() {
  const [tab, setTab] = useState<"models" | "templates">("models");
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("lc.admin.key") ?? ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem("lc.admin.key", adminKey); } catch {} }, [adminKey]);

  return (
    <Panel title="Models & Templates">
      <div className="flex flex-wrap gap-2 items-center">
        <button className={seg(tab === "models")} onClick={() => setTab("models")}>Models</button>
        <button className={seg(tab === "templates")} onClick={() => setTab("templates")}>Templates</button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="text-xs opacity-70">Admin Key</div>
          <input
            className="input w-64"
            type="password"
            placeholder="x-admin-key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
          />
        </div>
      </div>

      {tab === "models" ? <ModelsTab adminKey={adminKey} /> : <TemplatesTab adminKey={adminKey} />}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/* MODELS TAB                                                            */
/* ══════════════════════════════════════════════════════════════════════ */

function ModelsTab({ adminKey }: { adminKey: string }) {
  const [mText, setMText] = useState<string>('{"models": []}');
  const [mValid, setMValid] = useState<string | null>(null);
  const [mStatus, setMStatus] = useState<{ text: string; kind: "info" | "ok" | "bad" } | null>(null);
  const mInitial = useRef<string>('{"models": []}');
  const [loading, setLoading] = useState(true);

  // quick-form
  const [mId, setMId] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [mKind, setMKind] = useState<ModelKind>("aivm");
  const [mHash, setMHash] = useState("");
  const [mHashOverride, setMHashOverride] = useState(false); // true = custom hash (not auto-computed)
  const [mHashConfirmText, setMHashConfirmText] = useState(""); // typed confirmation for enabling override
  const [mVerifier, setMVerifier] = useState("");
  const [mBinding, setMBinding] = useState(true);
  const [mActive, setMActive] = useState(true);
  const [mSignals, setMSignals] = useState("bind, success");
  const [mSources, setMSources] = useState("");
  const [mFileAccept, setMFileAccept] = useState("");
  const [mNotes, setMNotes] = useState("");
  const [mParams, setMParams] = useState<ModelParam[]>([]);
  const addParam = () => setMParams(p => [...p, { key: "", label: "", type: "int" }]);
  const delParam = (i: number) => setMParams(p => p.filter((_, idx) => idx !== i));
  const setParam = (i: number, patch: Partial<ModelParam>) =>
    setMParams(p => p.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  // Existing model selector
  const existingModels = useMemo(() => {
    const obj = parseJSON<{ models: ModelRow[] }>(mText);
    return obj?.models ?? [];
  }, [mText]);

  const [editId, setEditId] = useState("");
  const loadModelIntoForm = (id: string) => {
    const m = existingModels.find(x => x.id === id);
    if (!m) { setEditId(""); return; }
    setEditId(id);
    setMId(m.id); setMLabel(m.label); setMKind(m.kind as ModelKind);
    setMHash(m.modelHash); setMVerifier(m.verifier);
    // Detect custom hash: if stored hash differs from keccak256(id), it's overridden
    const autoHash = m.id.trim() ? aivmHashFromId(m.id.trim()) : "";
    setMHashOverride(m.kind === "aivm" && m.modelHash.toLowerCase() !== autoHash.toLowerCase());
    setMBinding(m.binding !== false); setMActive(m.active !== false);
    setMSignals((m.signals ?? []).join(", "));
    setMSources((m.sources ?? []).join(", "));
    setMFileAccept((m.fileAccept ?? []).join(", "));
    setMNotes(m.notes ?? "");
    setMParams(m.params ?? []);
  };

  // load models from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/models", { cache: "no-store" });
        const j = await res.json();
        const txt = pretty(j);
        mInitial.current = txt; setMText(txt); setMValid("OK");
      } catch {
        setMText('{"models": []}'); setMValid("Load error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // live validate
  useEffect(() => {
    const obj = parseJSON<{ models: ModelRow[] }>(mText);
    if (!obj) return setMValid("Invalid JSON");
    if (!obj.models || !Array.isArray(obj.models)) return setMValid("Top-level must be { models: [] }");
    for (const m of obj.models) {
      if (!m?.id || !m?.label) return setMValid("Each model needs id+label");
      if (!MODEL_KINDS.includes(m.kind as any)) return setMValid(`kind must be one of: ${MODEL_KINDS.join(", ")}`);
      if (!bytes32Regex.test(m.modelHash)) return setMValid(`modelHash must be 32-byte 0x hex (${m.id})`);
      if (!addrRegex.test(m.verifier)) return setMValid(`verifier must be 0x address (${m.id})`);
      if (m.params && !Array.isArray(m.params)) return setMValid("params must be array");
      if (m.signals && !Array.isArray(m.signals)) return setMValid("signals must be array");
      if (m.sources && !Array.isArray(m.sources)) return setMValid("sources must be array");
      if (m.fileAccept && !Array.isArray(m.fileAccept)) return setMValid("fileAccept must be array");
    }
    setMValid("OK");
  }, [mText]);

  // auto-fill for AIVM kind (skip hash if override is active)
  useEffect(() => {
    if (mKind === "aivm") {
      if (!mHashOverride) setMHash(mId.trim() ? aivmHashFromId(mId.trim()) : "");
      if (AUTO_POI_VERIFIER) setMVerifier(AUTO_POI_VERIFIER);
    }
  }, [mId, mKind, mHashOverride]);

  const clearForm = () => {
    setEditId(""); setMId(""); setMLabel(""); setMKind("aivm");
    setMHash(""); setMHashOverride(false); setMHashConfirmText(""); setMVerifier(""); setMBinding(true); setMActive(true);
    setMSignals("bind, success"); setMSources(""); setMFileAccept("");
    setMNotes(""); setMParams([]);
  };

  const insertModel = () => {
    if (!mId.trim() || !mLabel.trim()) return setMStatus({ text: "Enter id & label", kind: "bad" });
    if (mKind !== "aivm" && !bytes32Regex.test(mHash)) return setMStatus({ text: "Custom models require a valid modelHash (0x, 64 hex chars)", kind: "bad" });
    if (mKind !== "aivm" && !addrRegex.test(mVerifier)) return setMStatus({ text: "Custom models require a valid verifier address", kind: "bad" });
    if (mKind === "aivm" && mHashOverride) {
      if (!bytes32Regex.test(mHash)) return setMStatus({ text: "Custom hash must be a valid 32-byte 0x hex string (66 chars)", kind: "bad" });
      if (mHash.toLowerCase() === aivmHashFromId(mId.trim()).toLowerCase()) {
        return setMStatus({ text: "Custom hash is the same as auto-computed — disable override instead", kind: "bad" });
      }
    }

    const signals = mSignals.split(",").map(s => s.trim()).filter(Boolean);
    const sources = mSources.split(",").map(s => s.trim()).filter(Boolean);
    const fileAccept = mFileAccept.split(",").map(s => s.trim()).filter(Boolean);
    const entry: ModelRow = {
      id: mId.trim(),
      label: mLabel.trim(),
      kind: mKind,
      modelHash: mKind === "aivm" && !mHashOverride ? aivmHashFromId(mId.trim()) : mHash.trim(),
      verifier: mKind === "aivm" ? (AUTO_POI_VERIFIER || mVerifier) : mVerifier,
      ...(mBinding ? { binding: true } : {}),
      active: mActive,
      ...(signals.length ? { signals } : {}),
      ...(mParams.length ? { params: mParams.filter((p) => p.key && p.label) } : {}),
      ...(sources.length ? { sources } : {}),
      ...(fileAccept.length ? { fileAccept } : {}),
      ...(mNotes.trim() ? { notes: mNotes.trim() } : {}),
    };
    const base = parseJSON<{ models: ModelRow[] }>(mText) || { models: [] };
    const idx = base.models.findIndex(x => x.id === entry.id);
    if (idx >= 0) base.models[idx] = entry; else base.models.push(entry);
    const txt = pretty(base); setMText(txt);
    setMStatus({ text: idx >= 0 ? "Model updated (not yet saved to DB)" : "Model added (not yet saved to DB)", kind: "info" });
    setEditId(entry.id);
  };

  const deleteModel = () => {
    if (!editId) return;
    const base = parseJSON<{ models: ModelRow[] }>(mText) || { models: [] };
    base.models = base.models.filter(x => x.id !== editId);
    const txt = pretty(base); setMText(txt);
    setMStatus({ text: `Removed ${editId} (not yet saved to DB)`, kind: "info" });
    clearForm();
  };

  const saveModels = async () => {
    if (mValid !== "OK") return setMStatus({ text: "Fix validation errors before saving", kind: "bad" });

    // Defensive: warn about custom-hash models before saving
    const parsed = parseJSON<{ models: ModelRow[] }>(mText);
    const customHashModels = (parsed?.models ?? []).filter(m =>
      m.kind === "aivm" && m.id.trim() &&
      m.modelHash.toLowerCase() !== aivmHashFromId(m.id.trim()).toLowerCase()
    );
    if (customHashModels.length > 0) {
      const names = customHashModels.map(m => m.id).join(", ");
      const confirmed = window.confirm(
        `WARNING: ${customHashModels.length} model(s) have custom hash overrides:\n\n` +
        `${names}\n\n` +
        `Custom hashes should ONLY be used when Lightchain has assigned different identifiers ` +
        `during mainnet model registration. This will affect all future challenges using these models.\n\n` +
        `Are you sure you want to save?`
      );
      if (!confirmed) return setMStatus({ text: "Save cancelled", kind: "info" });
    }

    setMStatus({ text: "Saving…", kind: "info" });
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: mText,
      });
      const j = await res.json();
      if (j.ok) { setMStatus({ text: `Saved ${j.count} model(s) to DB`, kind: "ok" }); mInitial.current = mText; }
      else setMStatus({ text: j.error || "Save failed", kind: "bad" });
    } catch (e: any) {
      setMStatus({ text: e?.message || "Save failed", kind: "bad" });
    }
  };

  if (loading) {
    return <div className="p-6 text-sm opacity-60">Loading models…</div>;
  }

  const isDirty = mText !== mInitial.current;

  return (
    <>
      {/* Info */}
      <div className="text-xs opacity-50 p-3 rounded-lg border border-white/5">
        Models define AIVM inference tasks. Each model maps to a Lightchain AIVM task via its modelHash.
        By default, the hash is keccak256(modelId). If Lightchain assigns different identifiers after model registration,
        enable &quot;Custom Model Hash&quot; on the model to override it — all adapters and proof routing update automatically.
      </div>

      {/* Existing model selector */}
      <Card title="Edit Existing Model">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Select a model to edit">
            <select className="input" value={editId} onChange={(e) => loadModelIntoForm(e.target.value)}>
              <option value="">— new model —</option>
              {existingModels.map((m) => {
                const isCustomHash = m.kind === "aivm" && m.id.trim() &&
                  m.modelHash.toLowerCase() !== aivmHashFromId(m.id.trim()).toLowerCase();
                return (
                  <option key={m.id} value={m.id}>
                    {m.id} ({m.kind}{m.active === false ? ", inactive" : ""}{isCustomHash ? ", CUSTOM HASH" : ""})
                  </option>
                );
              })}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn btn-ghost" onClick={clearForm}>New</button>
            {editId && <button className="btn btn-warn" onClick={deleteModel}>Remove</button>}
          </div>
          <div className="flex items-end">
            <span className="text-xs opacity-50">{existingModels.length} model(s) loaded</span>
          </div>
        </div>
      </Card>

      {/* Quick form */}
      <Card title={editId ? `Editing: ${editId}` : "Add New Model"}>
        <SectionHeader title="Identity" description="Unique model ID and human-readable label" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Model ID">
            <input className="input" value={mId} onChange={(e) => setMId(e.target.value)} placeholder="e.g. cycling.distance_in_window@1" />
            <HelpText>Unique identifier. For AIVM models, keccak256(id) produces the on-chain modelHash.</HelpText>
          </Field>
          <Field label="Label">
            <input className="input" value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="Cycling Distance Window" />
            <HelpText>Human-readable name shown in challenge creation.</HelpText>
          </Field>
        </div>

        <SectionHeader title="Type & Status" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kind">
            <select className="input" value={mKind} onChange={(e) => setMKind(e.target.value as ModelKind)}>
              {MODEL_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <HelpText>
              {mKind === "aivm" && "Verified by Lightchain AIVM network via PoI attestation. Hash and verifier are auto-configured."}
              {mKind === "custom" && "Manual configuration. You must provide modelHash and verifier address."}
            </HelpText>
          </Field>
          <Field label="Active">
            <div className="flex gap-2">
              <button className={seg(mActive)} onClick={() => setMActive(true)}>Active</button>
              <button className={seg(!mActive)} onClick={() => setMActive(false)}>Inactive</button>
            </div>
            <HelpText>Inactive models are hidden from challenge creation.</HelpText>
          </Field>
          <Field label="Task Binding">
            <div className="flex gap-2">
              <button className={seg(mBinding)} onClick={() => setMBinding(true)}>Yes</button>
              <button className={seg(!mBinding)} onClick={() => setMBinding(false)}>No</button>
            </div>
            <HelpText>Whether a ChallengeTaskRegistry binding is created on AIVM request.</HelpText>
          </Field>
        </div>

        <SectionHeader title="AIVM Configuration" description={mKind === "aivm" ? (mHashOverride ? "CUSTOM HASH OVERRIDE ACTIVE" : "Auto-configured from model ID") : "Manual configuration required"} />
        {mKind === "aivm" && !mHashOverride && (
          <details className="p-3 rounded-lg border border-white/10 mb-3">
            <summary className="text-xs opacity-50 cursor-pointer select-none">
              Override model hash (only if Lightchain assigned a different identifier)
            </summary>
            <div className="mt-3 p-3 rounded border border-red-500/20 bg-red-500/5">
              <div className="text-xs text-red-300 font-semibold mb-2">
                WARNING: Changing the model hash affects all future challenges using this model.
                Existing active challenges will continue to use the hash they were created with.
                Only do this if Lightchain has assigned a different identifier during mainnet model registration.
              </div>
              <Field label={`To confirm, type the model ID: ${mId || "(enter model ID first)"}`}>
                <input
                  className="input text-sm"
                  value={mHashConfirmText}
                  onChange={(e) => setMHashConfirmText(e.target.value)}
                  placeholder={mId || "model.id@version"}
                  disabled={!mId.trim()}
                />
              </Field>
              <button
                className="btn btn-warn mt-2"
                disabled={!mId.trim() || mHashConfirmText.trim() !== mId.trim()}
                onClick={() => { setMHashOverride(true); setMHashConfirmText(""); }}
              >
                Enable Custom Hash
              </button>
              {mId.trim() && mHashConfirmText.trim().length > 0 && mHashConfirmText.trim() !== mId.trim() && (
                <span className="text-xs text-red-400 ml-2">Model ID does not match</span>
              )}
            </div>
          </details>
        )}
        {mKind === "aivm" && mHashOverride && (
          <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 mb-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="chip chip--bad">Custom Hash Active</span>
              <button className="btn btn-ghost text-xs" onClick={() => {
                setMHashOverride(false);
                setMHashConfirmText("");
                if (mId.trim()) setMHash(aivmHashFromId(mId.trim()));
              }}>
                Revert to auto-computed hash
              </button>
            </div>
            <div className="text-xs text-yellow-300">
              This model uses a custom hash instead of keccak256(modelId). This should only be set
              when Lightchain&apos;s mainnet model registration assigns a different identifier.
              The auto-computed hash would be: <code className="text-xs opacity-70">{mId.trim() ? aivmHashFromId(mId.trim()).slice(0, 18) + "…" : "—"}</code>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={mHashOverride ? "Model Hash (CUSTOM)" : "Model Hash"}>
            <input
              className={cn("input font-mono text-xs", mHashOverride && "border-yellow-500/40")}
              value={mHash}
              onChange={(e) => setMHash(e.target.value)}
              placeholder="0x…"
              readOnly={mKind === "aivm" && !mHashOverride}
            />
            <HelpText>
              {mKind === "aivm" && !mHashOverride
                ? <span className="chip chip--info">Auto: keccak256(modelId)</span>
                : mKind === "aivm" && mHashOverride
                ? "Enter the 0x hash assigned by Lightchain. Must be 32-byte hex (66 chars)."
                : "32-byte hex digest identifying this model on-chain."}
            </HelpText>
          </Field>
          <Field label="PoI Verifier">
            <input className="input font-mono text-xs" value={mVerifier} onChange={(e) => setMVerifier(e.target.value)} placeholder="0x…" readOnly={mKind === "aivm"} />
            <HelpText>
              {mKind === "aivm" && AUTO_POI_VERIFIER
                ? <span className="chip chip--info">Auto: ChallengePayAivmPoiVerifier</span>
                : "Contract address that verifies proofs for this model."}
            </HelpText>
          </Field>
        </div>

        <SectionHeader title="Evidence Sources" description="Where evidence comes from and what AIVM signals to emit" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signals (comma-separated)">
            <input className="input" value={mSignals} onChange={(e) => setMSignals(e.target.value)} placeholder="bind, success" />
            <HelpText>AIVM signal names emitted during inference.</HelpText>
          </Field>
          <Field label="Sources (comma-separated)">
            <input className="input" value={mSources} onChange={(e) => setMSources(e.target.value)} placeholder="apple_health:zip, opendota:api" />
            <HelpText>Provider:format pairs. Determines which adapters can supply evidence.</HelpText>
          </Field>
          <Field label="File Accept (comma-separated)">
            <input className="input" value={mFileAccept} onChange={(e) => setMFileAccept(e.target.value)} placeholder=".zip, .json, .gpx" />
            <HelpText>Allowed file extensions for evidence upload.</HelpText>
          </Field>
          <Field label="Notes (optional)">
            <input className="input" value={mNotes} onChange={(e) => setMNotes(e.target.value)} placeholder="Internal notes for operators" />
          </Field>
        </div>

        {/* Params table */}
        <SectionHeader title="AIVM Parameters" description="Runtime parameters passed to the AIVM inference request" />
        {mParams.length === 0 ? (
          <div className="empty text-xs">No parameters defined. Click below to add one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table--compact" style={{ minWidth: 720 }}>
              <thead><tr><th>key</th><th>label</th><th>type</th><th>default</th><th /></tr></thead>
              <tbody>
                {mParams.map((p, i) => (
                  <tr key={i}>
                    <td><input className="input" value={p.key} onChange={(e) => setParam(i, { key: e.target.value })} placeholder="start_ts" /></td>
                    <td><input className="input" value={p.label} onChange={(e) => setParam(i, { label: e.target.value })} placeholder="Start (UTC)" /></td>
                    <td>
                      <select className="input" value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ModelParam["type"] })}>
                        <option value="int">int</option>
                        <option value="text">text</option>
                        <option value="datetime">datetime</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        value={(p.default as any as string) ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (p.type === "int") {
                            const v = raw.trim() === "" ? "" : Number.isFinite(Number(raw)) ? Number(raw) : p.default ?? "";
                            setParam(i, { default: v as any });
                          } else setParam(i, { default: raw });
                        }}
                        placeholder="(optional)"
                      />
                    </td>
                    <td className="text-right"><button className="btn btn-ghost" onClick={() => delParam(i)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="btn btn-ghost" onClick={addParam}>+ Add Param</button>

        {/* Action bar */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-white/10">
          <button className="btn btn-primary" onClick={insertModel}>
            {editId ? "Update in List" : "Add to List"}
          </button>
          <button className="btn btn-ghost" onClick={clearForm}>Clear Form</button>
        </div>
      </Card>

      {/* Raw JSON */}
      <Card title="Raw JSON">
        <div className="flex items-center gap-2 mb-2">
          <StatusChip ok={mValid === "OK"} yes="Valid JSON" no={mValid ?? "Error"} />
          {isDirty && <span className="chip chip--info">Unsaved changes</span>}
        </div>
        <textarea
          className="input font-mono text-xs"
          rows={14}
          value={mText}
          onChange={(e) => setMText(e.target.value)}
          spellCheck={false}
        />
      </Card>

      {/* Save bar */}
      <div className="flex gap-2 items-center">
        <button className="btn btn-primary" onClick={saveModels} disabled={mValid !== "OK" || !isDirty}>
          Save to DB
        </button>
        <button className="btn btn-ghost" onClick={() => setMText(mInitial.current)} disabled={!isDirty}>
          Revert
        </button>
        {mStatus && (
          <span className={cn("text-xs", mStatus.kind === "ok" && "text-green-400", mStatus.kind === "bad" && "text-red-400")}>
            {mStatus.text}
          </span>
        )}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/* TEMPLATES TAB                                                         */
/* ══════════════════════════════════════════════════════════════════════ */

function TemplatesTab({ adminKey }: { adminKey: string }) {
  const [tText, setTText] = useState<string>("[]");
  const [tValid, setTValid] = useState<string | null>(null);
  const [tStatus, setTStatus] = useState<{ text: string; kind: "info" | "ok" | "bad" } | null>(null);
  const tInitial = useRef<string>("[]");
  const [loading, setLoading] = useState(true);

  // quick-form
  const [selId, setSelId] = useState("");
  const [tId, setTId] = useState("");
  const [tKind, setTKind] = useState<TemplateKind>("dota");
  const [tName, setTName] = useState("");
  const [tModelId, setTModelId] = useState("");
  const [tHint, setTHint] = useState("");
  const [tActive, setTActive] = useState(true);
  const [tRuleConfig, setTRuleConfig] = useState("");
  const [tFields, setTFields] = useState<TemplateField[]>([]);
  const addField = (kind: TemplateField["kind"] = "number") => {
    const base: any =
      kind === "number" ? { kind, key: "", label: "", min: 0, step: 1 } :
      kind === "text" ? { kind, key: "", label: "", default: "" } :
      kind === "readonly" ? { kind, key: "", label: "", value: "" } :
      { kind: "select", key: "", label: "", options: [], default: "" };
    setTFields(f => [...f, base]);
  };

  // load templates
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/templates", { cache: "no-store" });
        const j = await res.json();
        let arr: TemplateRow[] = Array.isArray(j) ? j : (j?.templates ?? []);

        const codeIds = new Set(getAllCodeTemplates().map(t => t.id));
        arr = arr.map(t => ({
          ...t,
          _source: codeIds.has(t.id) ? "merged" as const : "db" as const,
        }));

        if (!arr.length) {
          arr = getAllCodeTemplates().map(t => ({
            ...toPlain(t) as unknown as TemplateRow,
            _source: "code" as const,
          }));
        }

        const txt = pretty(arr);
        tInitial.current = txt; setTText(txt); setTValid("OK");
      } catch {
        setTText("[]"); setTValid("Load error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // validate templates
  useEffect(() => {
    const arr = parseJSON<TemplateRow[]>(tText);
    if (!arr) return setTValid("Invalid JSON");
    if (!Array.isArray(arr)) return setTValid("Top-level must be an array");
    for (const t of arr) {
      if (!t?.id) return setTValid("Each template needs id");
      if (!TEMPLATE_KINDS.includes(t.kind as any)) return setTValid(`Invalid kind "${t.kind}" on ${t.id}. Must be: ${TEMPLATE_KINDS.join(", ")}`);
      if (!t.name) return setTValid(`Template ${t.id} needs name`);
      if (!t.modelId) return setTValid(`Template ${t.id} needs modelId`);
      if (!Array.isArray(t.fields)) return setTValid(`Template ${t.id} fields must be array`);
      for (const f of t.fields) {
        const k = (f as any).kind;
        if (!["number", "text", "readonly", "select"].includes(k)) return setTValid(`Bad field kind ${k}`);
        if (k === "select" && !Array.isArray((f as any).options)) return setTValid(`select.options must be array`);
      }
      if (t.ruleConfig && typeof t.ruleConfig !== "object") return setTValid(`Template ${t.id} ruleConfig must be object`);
    }
    setTValid("OK");
  }, [tText]);

  const listTemplates = useMemo(() => parseJSON<TemplateRow[]>(tText) ?? [], [tText]);
  const loadIntoForm = (id: string) => {
    const t = listTemplates.find(x => x.id === id); if (!t) return;
    setSelId(id); setTId(t.id); setTKind(t.kind); setTName(t.name);
    setTModelId(t.modelId); setTHint(t.hint ?? "");
    setTActive(t.active !== false);
    setTRuleConfig(t.ruleConfig ? pretty(t.ruleConfig) : "");
    setTFields(t.fields ?? []);
  };

  const clearForm = () => {
    setSelId(""); setTId(""); setTKind("dota"); setTName("");
    setTModelId(""); setTHint(""); setTActive(true);
    setTRuleConfig(""); setTFields([]);
  };

  const upsertTemplate = () => {
    if (!tId.trim() || !tName.trim() || !tModelId.trim()) return setTStatus({ text: "Fill id, name, and modelId", kind: "bad" });

    let ruleConfig: Record<string, unknown> | undefined;
    if (tRuleConfig.trim()) {
      const parsed = parseJSON<Record<string, unknown>>(tRuleConfig);
      if (!parsed) return setTStatus({ text: "ruleConfig must be valid JSON", kind: "bad" });
      ruleConfig = parsed;
    }

    const entry: TemplateRow = {
      id: tId.trim(),
      kind: tKind,
      name: tName.trim(),
      modelId: tModelId.trim(),
      hint: tHint.trim() || undefined,
      fields: tFields,
      ...(ruleConfig ? { ruleConfig } : {}),
      active: tActive,
    };
    const base = listTemplates.slice();
    const idx = base.findIndex(x => x.id === entry.id);
    if (idx >= 0) base[idx] = { ...base[idx], ...entry }; else base.push(entry);
    const txt = pretty(base); setTText(txt);
    setTStatus({ text: idx >= 0 ? "Updated (not yet saved to DB)" : "Added (not yet saved to DB)", kind: "info" });
    setSelId(entry.id);
  };

  const delTemplate = () => {
    if (!selId) return;
    const t = listTemplates.find(x => x.id === selId);
    if (t?._source === "code") {
      return setTStatus({ text: "Code-side templates cannot be deleted here — they are defined in lib/templates.ts", kind: "bad" });
    }
    const base = listTemplates.filter(x => x.id !== selId);
    const txt = pretty(base); setTText(txt);
    setTStatus({ text: `Removed ${selId} (not yet saved to DB)`, kind: "info" });
    clearForm();
  };

  const saveTemplates = async () => {
    if (tValid !== "OK") return setTStatus({ text: "Fix validation errors before saving", kind: "bad" });
    setTStatus({ text: "Saving…", kind: "info" });
    try {
      const clean = listTemplates.map(({ _source, createdAt, updatedAt, ...rest }) => rest);
      const res = await fetch("/api/admin/templates", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify(clean),
      });
      const j = await res.json();
      if (j.ok) { setTStatus({ text: `Saved ${j.count} template(s) to DB`, kind: "ok" }); tInitial.current = tText; }
      else setTStatus({ text: j.error || "Save failed", kind: "bad" });
    } catch (e: any) { setTStatus({ text: e?.message || "Save failed", kind: "bad" }); }
  };

  if (loading) {
    return <div className="p-6 text-sm opacity-60">Loading templates…</div>;
  }

  const isDirty = tText !== tInitial.current;
  const selectedTemplate = listTemplates.find(x => x.id === selId);

  return (
    <>
      {/* Info banner */}
      <div className="text-xs opacity-50 p-3 rounded-lg border border-white/5">
        Templates define the challenge creation form for each activity type. Each template links to an AIVM model and specifies the fields shown during challenge setup.
        Code-side templates (lib/templates.ts) provide paramsBuilder and ruleBuilder functions; DB templates override display fields but code-side builders are preserved at runtime.
      </div>

      {/* Existing template selector */}
      <Card title="Edit Existing Template">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Select a template">
            <select className="input" value={selId} onChange={(e) => loadIntoForm(e.target.value)}>
              <option value="">— new template —</option>
              {listTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} • {t.name}
                  {t._source === "code" ? " [code]" : t._source === "merged" ? " [merged]" : ""}
                  {t.active === false ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn btn-ghost" onClick={clearForm}>New</button>
            {selId && (
              <button className="btn btn-warn" onClick={delTemplate}
                disabled={selectedTemplate?._source === "code"}
                title={selectedTemplate?._source === "code" ? "Code-side templates cannot be deleted from admin" : ""}
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex items-end gap-2">
            {selectedTemplate?._source && (
              <span className={cn("chip", selectedTemplate._source === "code" ? "chip--info" : "chip--ok")}>
                {selectedTemplate._source === "code" ? "Code-side" : selectedTemplate._source === "merged" ? "Code + DB" : "DB only"}
              </span>
            )}
            <span className="text-xs opacity-50">{listTemplates.length} template(s)</span>
          </div>
        </div>
      </Card>

      {/* Quick form */}
      <Card title={selId ? `Editing: ${selId}` : "Add New Template"}>
        <SectionHeader title="Identity" description="Template ID, display name, and activity category" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Template ID">
            <input className="input" value={tId} onChange={(e) => setTId(e.target.value)} placeholder="lol_winrate_next_n" />
            <HelpText>Unique slug. Must match code-side ID to override its display fields.</HelpText>
          </Field>
          <Field label="Name">
            <input className="input" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Win Rate • Next N" />
            <HelpText>Shown in challenge creation UI.</HelpText>
          </Field>
          <Field label="Activity Category">
            <select className="input" value={tKind} onChange={(e) => setTKind(e.target.value as TemplateKind)}>
              {TEMPLATE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <HelpText>Groups templates in challenge creation by activity type.</HelpText>
          </Field>
        </div>

        <SectionHeader title="Model & Configuration" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="AIVM Model ID">
            <input className="input" value={tModelId} onChange={(e) => setTModelId(e.target.value)} placeholder="lol.winrate_next_n@1" />
            <HelpText>Must match a model ID from the Models tab.</HelpText>
          </Field>
          <Field label="Hint (optional)">
            <input className="input" value={tHint} onChange={(e) => setTHint(e.target.value)} placeholder="Short description for users" />
          </Field>
          <Field label="Active">
            <div className="flex gap-2">
              <button className={seg(tActive)} onClick={() => setTActive(true)}>Active</button>
              <button className={seg(!tActive)} onClick={() => setTActive(false)}>Inactive</button>
            </div>
            <HelpText>Inactive templates are hidden from challenge creation.</HelpText>
          </Field>
        </div>

        {/* Rule config */}
        <SectionHeader title="Rule Config (optional)" description="JSON object passed to the ruleBuilder function during challenge creation" />
        <textarea
          className="input font-mono text-xs"
          rows={3}
          value={tRuleConfig}
          onChange={(e) => setTRuleConfig(e.target.value)}
          placeholder='e.g. {"threshold": 10000, "metric": "steps"}'
          spellCheck={false}
        />
        {tRuleConfig.trim() && !parseJSON(tRuleConfig) && (
          <span className="chip chip--bad mt-1">Invalid JSON</span>
        )}

        {/* Fields editor */}
        <SectionHeader title="Form Fields" description="Fields shown in the challenge creation form when this template is selected" />
        {tFields.length === 0 ? (
          <div className="empty text-xs">No fields defined. Add fields below to build the creation form.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table--compact" style={{ minWidth: 920 }}>
              <thead><tr><th>kind</th><th>key</th><th>label</th><th>config</th><th /></tr></thead>
              <tbody>
                {tFields.map((f, i) => {
                  const kind = f.kind;
                  return (
                    <tr key={i}>
                      <td>
                        <select
                          className="input"
                          value={kind}
                          onChange={(e) => {
                            const k = e.target.value as TemplateField["kind"];
                            const base: any =
                              k === "number" ? { kind: k, key: (f as any).key ?? "", label: (f as any).label ?? "", min: 0, step: 1 } :
                              k === "text" ? { kind: k, key: (f as any).key ?? "", label: (f as any).label ?? "", default: "" } :
                              k === "readonly" ? { kind: k, key: (f as any).key ?? "", label: (f as any).label ?? "", value: "" } :
                              { kind: "select", key: (f as any).key ?? "", label: (f as any).label ?? "", options: [], default: "" };
                            setTFields(rows => rows.map((r, idx) => idx === i ? base : r));
                          }}
                        >
                          <option value="number">number</option>
                          <option value="text">text</option>
                          <option value="readonly">readonly</option>
                          <option value="select">select</option>
                        </select>
                      </td>
                      <td><input className="input" value={(f as any).key ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, key: e.target.value } as any) : r))} /></td>
                      <td><input className="input" value={(f as any).label ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, label: e.target.value } as any) : r))} /></td>
                      <td>
                        {kind === "number" && (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input className="input" placeholder="min" value={(f as any).min ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, min: Number(e.target.value) } as any) : r))} />
                            <input className="input" placeholder="step" value={(f as any).step ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, step: Number(e.target.value) } as any) : r))} />
                            <input className="input" placeholder="default" value={(f as any).default ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, default: Number(e.target.value) } as any) : r))} />
                          </div>
                        )}
                        {kind === "text" && (
                          <input className="input" placeholder="default" value={(f as any).default ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, default: e.target.value } as any) : r))} />
                        )}
                        {kind === "readonly" && (
                          <input className="input" placeholder="value" value={(f as any).value ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, value: e.target.value } as any) : r))} />
                        )}
                        {kind === "select" && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <textarea
                              className="input font-mono" rows={3}
                              placeholder='[{"value":"ranked","label":"Ranked"}]'
                              value={JSON.stringify((f as any).options ?? [], null, 0)}
                              onChange={(e) => {
                                const parsed = parseJSON<{ value: string; label: string }[]>(e.target.value) || [];
                                setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, options: parsed } as any) : r));
                              }}
                            />
                            <input className="input" placeholder="default" value={(f as any).default ?? ""} onChange={(e) => setTFields(rows => rows.map((r, idx) => idx === i ? ({ ...r, default: e.target.value } as any) : r))} />
                          </div>
                        )}
                      </td>
                      <td className="text-right"><button className="btn btn-ghost" onClick={() => setTFields(rows => rows.filter((_, idx) => idx !== i))}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => addField("number")}>+ number</button>
          <button className="btn btn-ghost" onClick={() => addField("text")}>+ text</button>
          <button className="btn btn-ghost" onClick={() => addField("select")}>+ select</button>
          <button className="btn btn-ghost" onClick={() => addField("readonly")}>+ readonly</button>
        </div>

        {/* Action bar */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-white/10">
          <button className="btn btn-primary" onClick={upsertTemplate}>
            {selId ? "Update in List" : "Add to List"}
          </button>
          <button className="btn btn-ghost" onClick={clearForm}>Clear Form</button>
        </div>
      </Card>

      {/* Raw JSON */}
      <Card title="Raw JSON">
        <div className="flex items-center gap-2 mb-2">
          <StatusChip ok={tValid === "OK"} yes="Valid JSON" no={tValid ?? "Error"} />
          {isDirty && <span className="chip chip--info">Unsaved changes</span>}
        </div>
        <textarea
          className="input font-mono text-xs"
          rows={12}
          value={tText}
          onChange={(e) => setTText(e.target.value)}
          spellCheck={false}
        />
      </Card>

      {/* Save bar */}
      <div className="flex gap-2 items-center">
        <button className="btn btn-primary" onClick={saveTemplates} disabled={tValid !== "OK" || !isDirty}>
          Save to DB
        </button>
        <button className="btn btn-ghost" onClick={() => setTText(tInitial.current)} disabled={!isDirty}>
          Revert
        </button>
        {tStatus && (
          <span className={cn("text-xs", tStatus.kind === "ok" && "text-green-400", tStatus.kind === "bad" && "text-red-400")}>
            {tStatus.text}
          </span>
        )}
      </div>
    </>
  );
}
