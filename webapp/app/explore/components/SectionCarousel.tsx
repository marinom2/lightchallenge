"use client";
import * as React from "react";

export default function SectionCarousel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode[] | React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [page, setPage] = React.useState(0);
  const [pages, setPages] = React.useState(1);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      if (!ref.current) return;
      const host = ref.current;
      const p = Math.max(1, Math.ceil(host.scrollWidth / host.clientWidth));
      setPages(p);
      setPage(Math.round(host.scrollLeft / host.clientWidth));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  function go(i: number) {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <section className={className} style={{ marginBottom: "var(--lc-space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--lc-space-3)" }}>
        <h3 style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text-secondary)" }}>
          {title}
        </h3>
        {pages > 1 && (
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => go(i)}
                style={{
                  height: 6,
                  width: i === page ? 20 : 8,
                  borderRadius: "var(--lc-radius-pill)",
                  border: "none",
                  backgroundColor: i === page ? "var(--lc-accent)" : "var(--lc-border)",
                  cursor: "pointer",
                  transition: "all var(--lc-dur-fast) var(--lc-ease)",
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={ref}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
          gap: "var(--lc-space-3)",
          paddingBottom: "var(--lc-space-2)",
          scrollbarWidth: "none",
        }}
      >
        {React.Children.map(children, (child) => (
          <div style={{ scrollSnapAlign: "start", flexShrink: 0, width: 360 }}>
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}
