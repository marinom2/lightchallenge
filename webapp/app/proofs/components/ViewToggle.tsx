// components/Validators/ViewToggle.tsx
"use client";
import { LayoutGrid, Rows, Images } from "lucide-react";

export type ViewMode = "shelves" | "grid" | "list";

export default function ViewToggle({
  mode, onChange,
}: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const Btn = ({
    m, icon: Icon, label,
  }: { m: ViewMode; icon: any; label: string }) => (
    <button
      className={`segmented__btn ${mode === m ? "is-active" : ""}`}
      aria-pressed={mode === m}
      onClick={() => onChange(m)}
      title={label}
    >
      <Icon size={16} />
      <span className="hidden sm:inline ml-1">{label}</span>
    </button>
  );

  return (
    <div className="segmented">
      <Btn m="shelves" icon={Images} label="Shelves" />
      <Btn m="grid"    icon={LayoutGrid} label="Grid" />
      <Btn m="list"    icon={Rows} label="List" />
    </div>
  );
}