import Link from "next/link";
import { cn } from "../lib/utils";

export function Chrome({
  children,
  toast,
  busy,
}: {
  children: React.ReactNode;
  toast?: { kind: "info" | "ok" | "bad"; text: string } | null;
  busy?: string | null;
}) {
  return (
    <div className="space-y-8">
      {toast && <Toast kind={toast.kind} text={toast.text} />}
      {busy && <Busy text={busy} />}
      {children}
    </div>
  );
}

export function Hero({
  items = [],
  right = [],
}: {
  items?: { label: string; value?: string }[];
  right?: React.ReactNode[];
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="font-semibold">Admin Console</div>
      </div>
      <div className="panel-body grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {items.map((x, i) => (
          <div key={i} className="rounded-xl border p-3">
            <div className="opacity-70">{x.label}</div>
            {x.value ? (
              <Link className="mono link break-all" target="_blank" href={`https://testnet.lightscan.app/address/${x.value}`}>
                {x.value}
              </Link>
            ) : (
              <div className="mono">—</div>
            )}
          </div>
        ))}
        {right}
      </div>
    </section>
  );
}

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (k: any) => void;
  items: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <button
          key={t.key}
          className={cn("pill-toggle", value === t.key && "is-active")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="font-semibold">{title}</div>
      </div>
      <div className="panel-body space-y-4">{children}</div>
    </section>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs opacity-70 mb-1">{label}</div>
      {children}
    </div>
  );
}

export function Toast({ kind, text }: { kind: "info" | "ok" | "bad"; text: string }) {
  return (
    <div className={cn("toast", kind === "ok" && "toast--ok", kind === "bad" && "toast--bad")}>
      {text}
    </div>
  );
}

export function Busy({ text }: { text: string }) {
  return <div className="toast toast--info">{text}</div>;
}

export function seg(active: boolean) {
  return cn("pill-toggle", active && "is-active");
}
