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
      className="stack-6 mx-auto"
      style={{ maxWidth: "var(--lc-content-wide, 1100px)" }}
    >
      <Breadcrumb items={[{ label: "Organizations" }]} />

      {/* ── Hero Section ───────────────────────────────────────────────── */}
      <div
        className="stack-3 rounded-lg"
        style={{
          padding: "var(--lc-space-8) var(--lc-space-6)",
          border: "1px solid var(--lc-glass-border)",
          background: "var(--lc-glass)",
          backdropFilter: "var(--lc-glass-blur)",
        }}
      >
        <h1 className="text-title font-bold color-primary m-0">
          Organizations
        </h1>
        <p className="text-body color-secondary m-0" style={{ maxWidth: 520 }}>
          Teams and organizers on LightChallenge
        </p>
      </div>

      {/* ── Search + CTA ───────────────────────────────────────────────── */}
      <div className="row-3 flex-wrap">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-small rounded-md border bg-raised color-primary transition-fast"
            style={{ padding: "10px 14px", outline: "none" }}
          />
        </div>
        <Link
          href="/org/new"
          className="d-inline-flex items-center gap-2 text-small font-medium border-none rounded-md cursor-pointer transition-fast text-nowrap"
          style={{
            padding: "10px 20px",
            color: "var(--lc-accent-text)",
            backgroundColor: "var(--lc-accent)",
            textDecoration: "none",
          }}
        >
          + Create Organization
        </Link>
      </div>

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && (
        <div
          className="d-grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="card" height="180px" />
          ))}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-3 rounded-md bg-warning-muted color-warning text-small">
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
          className="d-grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {filtered.map((org) => (
            <Link
              key={org.id}
              href={`/org/${org.slug}`}
              className="stack-3 p-5 rounded-lg transition-fast"
              style={{
                border: "1px solid var(--lc-glass-border)",
                background: "var(--lc-glass)",
                backdropFilter: "var(--lc-glass-blur)",
                textDecoration: "none",
              }}
            >
              {/* Logo / Initial */}
              <div className="row-3">
                <div
                  className="flex-center justify-center rounded-md bg-accent-muted overflow-hidden shrink-0"
                  style={{ width: 48, height: 48 }}
                >
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={`${org.name} logo`}
                      className="w-full h-full"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <span className="text-heading font-bold color-accent">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-body font-semibold color-primary text-ellipsis">
                    {org.name}
                  </div>
                </div>
              </div>

              {/* Description snippet */}
              {org.description && (
                <p
                  className="text-small color-secondary m-0 leading-normal overflow-hidden"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {org.description}
                </p>
              )}

              {/* Stats */}
              <div
                className="d-flex gap-4 text-caption color-muted pt-2 border-t"
                style={{ marginTop: "auto" }}
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
