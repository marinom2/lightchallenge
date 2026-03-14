"use client";

export default function MobileLayout({
  header,
  primaryAction,
  join,
  story,
  details,
  timeline,
}: any) {
  return (
    <div className="space-y-4">
      {header}

      {/* Sticky primary action (Apple rule) */}
      <div className="sticky top-[calc(var(--navbar-top)+env(safe-area-inset-top))] z-20">
        {primaryAction}
      </div>

      {join}
      {story}
      {details}
      {timeline}
    </div>
  );
}