// webapp/lib/ui/Status.tsx
export function Chip({
  color,
  children,
}: {
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs border border-white/10 ${
        color ?? "bg-[color:var(--soft-bg-10)]"
      }`}
    >
      {children}
    </span>
  );
}