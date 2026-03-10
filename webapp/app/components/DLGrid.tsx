// app/components/DLGrid.tsx
import { ReactNode } from "react";

export default function DLGrid({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="ov-grid">
      {rows.map(([label, value], i) => (
        <div className="ov-item" key={`${String(label)}-${i}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}