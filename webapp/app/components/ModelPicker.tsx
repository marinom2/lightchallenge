"use client";
import { useEffect, useMemo, useState } from "react";

export type Model = {
  name: string;
  modelHash: string;
  verifier: string;
  enforceBinding: boolean;
  signals: string[];
  maxProofBytes?: number;
  params?: Array<{ key: string; type: string; label: string; default?: any }>;
};

export default function ModelPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (model: Model | null) => void;
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [sel, setSel] = useState<string>(value || "");

  useEffect(() => {
    fetch("/models/models.json").then((r) => r.json()).then(setModels).catch(() => setModels([]));
  }, []);

  const selected = useMemo(() => models.find((m) => m.modelHash === sel) || null, [models, sel]);

  useEffect(() => {
    onChange(selected);
  }, [selected, onChange]);

  return (
    <div className="stack">
      <label className="text-sm font-medium">Verifier Model</label>

      <select value={sel} onChange={(e) => setSel(e.target.value)} className="input">
        <option value="">No model (manual verifier)</option>
        {models.map((m) => (
          <option key={m.modelHash} value={m.modelHash}>
            {m.name}
          </option>
        ))}
      </select>

      {sel && (
        <div className="text-xs text-[color:var(--text-muted)]">
          Signals: {selected?.signals.join(", ")}
        </div>
      )}
    </div>
  );
}