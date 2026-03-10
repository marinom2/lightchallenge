"use client";

export default function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="container-narrow mt-10 mb-6">
      <div className="text-xs tracking-widest uppercase text-(--text-muted)">Section</div>
      <h1 className="h1 h-gradient mt-2">{title}</h1>
      {subtitle && (
        <p className="mt-3 text-base text-(--text-muted) max-w-prose leading-relaxed">
          {subtitle}
        </p>
      )}
      <div className="divider mt-5 opacity-70" />
    </header>
  );
}