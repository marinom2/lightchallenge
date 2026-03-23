/**
 * Loading skeleton for /competitions/[id] pages.
 *
 * Mirrors the competition detail page layout with shimmer placeholders
 * so the user sees a stable frame while data loads.
 */

import Skeleton from "@/app/components/ui/Skeleton";

export default function CompetitionLoading() {
  return (
    <div
      style={{
        maxWidth: "var(--lc-content-max-w)",
        margin: "0 auto",
        padding: "var(--lc-space-6)",
      }}
    >
      {/* Back link */}
      <div style={{ marginBottom: "var(--lc-space-4)" }}>
        <Skeleton variant="text" width="140px" height="16px" />
      </div>

      {/* Hero section */}
      <div
        style={{
          backgroundColor: "var(--lc-bg-raised)",
          border: "1px solid var(--lc-border)",
          borderRadius: "var(--lc-radius-lg)",
          padding: "var(--lc-space-6)",
          marginBottom: "var(--lc-space-6)",
        }}
      >
        {/* Title + badges row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "var(--lc-space-4)",
            gap: "var(--lc-space-3)",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
            <Skeleton variant="text" width="70%" height="28px" />
            <Skeleton variant="text" width="50%" height="16px" />
          </div>
          <div style={{ display: "flex", gap: "var(--lc-space-2)", flexShrink: 0 }}>
            <Skeleton variant="text" width="70px" height="24px" />
            <Skeleton variant="text" width="90px" height="24px" />
          </div>
        </div>

        {/* Description */}
        <Skeleton variant="text" width="100%" height="14px" count={2} />

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: "var(--lc-space-4)",
            marginTop: "var(--lc-space-5)",
            flexWrap: "wrap",
          }}
        >
          <Skeleton variant="stat" width="120px" height="56px" />
          <Skeleton variant="stat" width="120px" height="56px" />
          <Skeleton variant="stat" width="120px" height="56px" />
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: "var(--lc-space-3)",
          marginBottom: "var(--lc-space-6)",
        }}
      >
        <Skeleton variant="text" width="160px" height="44px" />
        <Skeleton variant="text" width="120px" height="44px" />
      </div>

      {/* Content area (challenge cards or similar) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "var(--lc-space-4)",
        }}
      >
        <Skeleton variant="card" width="100%" height="180px" />
        <Skeleton variant="card" width="100%" height="180px" />
        <Skeleton variant="card" width="100%" height="180px" />
      </div>
    </div>
  );
}
