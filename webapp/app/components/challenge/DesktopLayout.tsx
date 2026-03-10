"use client";

export default function DesktopLayout({
  header,
  primaryAction,
  join,
  story,
  details,
  timeline,
}: any) {
  return (
    <>
      {header}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-4">
          {story}
          {details}
          {timeline}
        </div>

        <div className="lg:col-span-4 space-y-4 sticky top-[calc(var(--navbar-top)+16px)]">
          {primaryAction}
          {join}
        </div>
      </div>
    </>
  );
}