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
    <section className={`mb-8 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold opacity-90">{title}</h3>
        {pages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === page ? "w-5 bg-white/80" : "w-2 bg-white/30"}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={ref}
        className="snap-x snap-mandatory overflow-x-auto scroll-smooth no-scrollbar -mx-3 px-3"
        style={{ scrollPadding: "0 12px" }}
      >
        <div className="flex gap-2 w-max">
          {/* width ~360 with tighter gaps -> denser “poster rows” */}
          {React.Children.map(children, (child) => (
            <div className="snap-start shrink-0 w-[360px]">{child}</div>
          ))}
        </div>
      </div>
    </section>
  );
}