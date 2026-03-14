"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import Skeleton from "@/app/components/ui/Skeleton";
import EmptyState from "@/app/components/ui/EmptyState";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Organization = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  competitionCount: number;
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/v1/organizations")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load organizations");
        return r.json();
      })
      .then((data: Organization[]) => {
        setOrgs(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        setError(e?.message ?? "Network error");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.trim().toLowerCase();
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.description ?? "").toLowerCase().includes(q),
    );
  }, [orgs, search]);

  return (
    <div
      style={{
        maxWidth: "var(--lc-content-wide, 1100px)",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-6)",
      }}
    >
      <Breadcrumb items={[{ label: "Organizations" }]} />

      {/* ── Hero Section ───────────────────────────────────────────────── */}
      <div
        style={{
          padding: "var(--lc-space-8) var(--lc-space-6)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-glass-border)",
          background: "var(--lc-glass)",
          backdropFilter: "var(--lc-glass-blur)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--lc-space-3)",
        }}
      >
        <h1
          style={{
            fontSize: "var(--lc-text-title)",
            fontWeight: "var(--lc-weight-bold)" as unknown as number,
            color: "var(--lc-text)",
            margin: 0,
          }}
        >
          Organizations
        </h1>
        <p
          style={{
            fontSize: "var(--lc-text-body)",
            color: "var(--lc-text-secondary)",
            margin: 0,
            maxWidth: 520,
          }}
        >
          Teams and organizers on LightChallenge
        </p>
      </div>

      {/* ── Search + CTA ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "var(--lc-space-3)",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "var(--lc-text-small)",
              borderRadius: "var(--lc-radius-md)",
              border: "1px solid var(--lc-border)",
              backgroundColor: "var(--lc-bg-raised)",
              color: "var(--lc-text)",
              outline: "none",
              transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
            }}
          />
        </div>
        <Link
          href="/org/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--lc-space-2)",
            padding: "10px 20px",
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-medium)" as unknown as number,
            color: "var(--lc-accent-text)",
            backgroundColor: "var(--lc-accent)",
            border: "none",
            borderRadius: "var(--lc-radius-md)",
            textDecoration: "none",
            cursor: "pointer",
            transition: "background-color var(--lc-dur-fast) var(--lc-ease)",
            whiteSpace: "nowrap",
          }}
        >
          + Create Organization
        </Link>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--lc-space-4)",
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="card" height="180px" />
          ))}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div
          style={{
            padding: "var(--lc-space-3)",
            borderRadius: "var(--lc-radius-md)",
            backgroundColor: "var(--lc-warning-muted)",
            color: "var(--lc-warning)",
            fontSize: "var(--lc-text-small)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={
            search.trim()
              ? "No organizations match your search"
              : "No organizations yet"
          }
          description={
            search.trim()
              ? "Try a different search term."
              : "Be the first to create an organization on LightChallenge."
          }
          actionLabel={search.trim() ? undefined : "Create Organization"}
          onAction={
            search.trim()
              ? undefined
              : () => {
                  window.location.href = "/org/new";
                }
          }
        />
      )}

      {/* ── Org Grid ───────────────────────────────────────────────────── */}
      {!loading && !error && filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--lc-space-4)",
          }}
        >
          {filtered.map((org) => (
            <Link
              key={org.id}
              href={`/org/${org.slug}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--lc-space-3)",
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-glass-border)",
                background: "var(--lc-glass)",
                backdropFilter: "var(--lc-glass-blur)",
                textDecoration: "none",
                transition:
                  "border-color var(--lc-dur-fast) var(--lc-ease), transform var(--lc-dur-fast) var(--lc-ease)",
              }}
            >
              {/* Logo / Initial */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--lc-space-3)",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "var(--lc-radius-md)",
                    backgroundColor: "var(--lc-accent-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={`${org.name} logo`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: "var(--lc-text-heading)",
                        fontWeight:
                          "var(--lc-weight-bold)" as unknown as number,
                        color: "var(--lc-accent)",
                      }}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "var(--lc-text-body)",
                      fontWeight:
                        "var(--lc-weight-semibold)" as unknown as number,
                      color: "var(--lc-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {org.name}
                  </div>
                </div>
              </div>

              {/* Description snippet */}
              {org.description && (
                <p
                  style={{
                    fontSize: "var(--lc-text-small)",
                    color: "var(--lc-text-secondary)",
                    margin: 0,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: "var(--lc-leading-normal)",
                  }}
                >
                  {org.description}
                </p>
              )}

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  gap: "var(--lc-space-4)",
                  fontSize: "var(--lc-text-caption)",
                  color: "var(--lc-text-muted)",
                  marginTop: "auto",
                  paddingTop: "var(--lc-space-2)",
                  borderTop: "1px solid var(--lc-border)",
                }}
              >
                <span>
                  {org.memberCount}{" "}
                  {org.memberCount === 1 ? "member" : "members"}
                </span>
                <span>
                  {org.competitionCount}{" "}
                  {org.competitionCount === 1
                    ? "competition"
                    : "competitions"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
