"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import Badge from "@/app/components/ui/Badge";
import Skeleton from "@/app/components/ui/Skeleton";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import StatCard from "@/app/components/ui/StatCard";
import EmptyState from "@/app/components/ui/EmptyState";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Organization = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo_url: string | null;
  website: string | null;
  created_at: string;
  member_count: number;
  team_count: number;
  competition_count: number;
  settings?: {
    webhook_url?: string;
    white_label?: {
      primary_color?: string;
      logo_url?: string;
      custom_domain?: string;
    };
  };
};

type OrgCompetition = {
  id: string;
  title: string;
  type: string;
  status: "draft" | "registration" | "active" | "completed" | "canceled";
  category: string;
  participant_count: number;
  starts_at: string;
  ends_at: string;
};

type OrgMember = {
  wallet: string;
  role: "owner" | "admin" | "member";
  display_name?: string;
  joined_at: string;
};

type OrgTeam = {
  id: string;
  name: string;
  tag: string;
  roster_count: number;
  created_at: string;
};

type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

const STATUS_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "muted" | "info"> = {
  draft: "muted",
  registration: "info",
  active: "success",
  completed: "accent",
  canceled: "warning",
};

const ROLE_TONE: Record<string, "warning" | "accent" | "muted"> = {
  owner: "warning",
  admin: "accent",
  member: "muted",
};

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function UsersIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrophyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function ShieldIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function GlobeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

/* ── Shared Styles ─────────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-md)",
  outline: "none",
  transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
  fontFamily: "inherit",
};

const cardStyle: React.CSSProperties = {
  padding: "var(--lc-space-5)",
  borderRadius: "var(--lc-radius-lg)",
  border: "1px solid var(--lc-border)",
  backgroundColor: "var(--lc-bg-raised)",
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function OrgDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { authFetch } = useAuthFetch();

  const [org, setOrg] = useState<Organization | null>(null);
  const [competitions, setCompetitions] = useState<OrgCompetition[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("competitions");

  /* Flash messages */
  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showFlash = useCallback((type: "success" | "error", message: string) => {
    setFlash({ type, message });
    setTimeout(() => setFlash(null), 4000);
  }, []);

  /* Invite member form */
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteWallet, setInviteWallet] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  /* Create team form */
  const [teamFormOpen, setTeamFormOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  /* Webhook form */
  const [webhookFormOpen, setWebhookFormOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [addingWebhook, setAddingWebhook] = useState(false);

  /* Settings form */
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    description: "",
    website: "",
    primaryColor: "",
    customDomain: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  /* Fetch organization */
  useEffect(() => {
    if (!slug) return;
    let stop = false;
    setLoading(true);

    (async () => {
      try {
        const res = await authFetch(`/api/v1/organizations?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(`Organization not found (${res.status})`);
        const data = await res.json();
        const orgData = Array.isArray(data) ? data[0] : data?.organization || data;
        if (!orgData) throw new Error("Organization not found");
        if (!stop) {
          setOrg(orgData);
          setSettingsForm({
            name: orgData.name || "",
            description: orgData.description || "",
            website: orgData.website || "",
            primaryColor: orgData.settings?.white_label?.primary_color || "",
            customDomain: orgData.settings?.white_label?.custom_domain || "",
          });
        }
      } catch (e: any) {
        if (!stop) setError(e?.message || String(e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => { stop = true; };
  }, [slug, authFetch]);

  /* Fetch org sub-resources */
  useEffect(() => {
    if (!org?.id) return;
    let stop = false;

    const fetchAll = async () => {
      // Competitions
      try {
        const res = await authFetch(`/api/v1/organizations/${org.id}/competitions`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setCompetitions(Array.isArray(data?.competitions) ? data.competitions : Array.isArray(data) ? data : []);
        }
      } catch {}

      // Members
      try {
        const res = await authFetch(`/api/v1/organizations/${org.id}/members`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setMembers(Array.isArray(data?.members) ? data.members : Array.isArray(data) ? data : []);
        }
      } catch {}

      // Teams
      try {
        const res = await authFetch(`/api/v1/organizations/${org.id}/teams`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setTeams(Array.isArray(data?.teams) ? data.teams : Array.isArray(data) ? data : []);
        }
      } catch {}

      // Webhooks
      try {
        const res = await authFetch(`/api/v1/organizations/${org.id}/webhooks`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setWebhooks(Array.isArray(data?.webhooks) ? data.webhooks : Array.isArray(data) ? data : []);
        }
      } catch {}
    };

    fetchAll();
    return () => { stop = true; };
  }, [org?.id, authFetch]);

  /* Actions */
  const handleInviteMember = useCallback(async () => {
    if (!org?.id || !inviteWallet.trim()) return;
    setInviting(true);
    try {
      const res = await authFetch(`/api/v1/organizations/${org.id}/members`, {
        method: "POST",
        body: JSON.stringify({ wallet: inviteWallet.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Failed to invite member (${res.status})`);
      }
      const data = await res.json();
      const newMember = data?.member || { wallet: inviteWallet.trim(), role: inviteRole, joined_at: new Date().toISOString() };
      setMembers((prev) => [...prev, newMember]);
      setInviteWallet("");
      setInviteOpen(false);
      showFlash("success", "Member invited!");
    } catch (e: any) {
      showFlash("error", e?.message || "Failed to invite member");
    }
    setInviting(false);
  }, [org?.id, inviteWallet, inviteRole, authFetch, showFlash]);

  const handleCreateTeam = useCallback(async () => {
    if (!org?.id || !teamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await authFetch(`/api/v1/organizations/${org.id}/teams`, {
        method: "POST",
        body: JSON.stringify({ name: teamName.trim(), tag: teamTag.trim() || teamName.trim().substring(0, 4).toUpperCase() }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Failed to create team (${res.status})`);
      }
      const data = await res.json();
      const newTeam = data?.team || { id: Date.now().toString(), name: teamName.trim(), tag: teamTag.trim(), roster_count: 0, created_at: new Date().toISOString() };
      setTeams((prev) => [...prev, newTeam]);
      setTeamName("");
      setTeamTag("");
      setTeamFormOpen(false);
      showFlash("success", "Team created!");
    } catch (e: any) {
      showFlash("error", e?.message || "Failed to create team");
    }
    setCreatingTeam(false);
  }, [org?.id, teamName, teamTag, authFetch, showFlash]);

  const handleAddWebhook = useCallback(async () => {
    if (!org?.id || !webhookUrl.trim()) return;
    setAddingWebhook(true);
    try {
      const res = await authFetch(`/api/v1/organizations/${org.id}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ url: webhookUrl.trim(), events: ["competition.created", "match.completed", "competition.finalized"] }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Failed to add webhook (${res.status})`);
      }
      const data = await res.json();
      const newHook = data?.webhook || { id: Date.now().toString(), url: webhookUrl.trim(), events: [], active: true, created_at: new Date().toISOString() };
      setWebhooks((prev) => [...prev, newHook]);
      setWebhookUrl("");
      setWebhookFormOpen(false);
      showFlash("success", "Webhook added!");
    } catch (e: any) {
      showFlash("error", e?.message || "Failed to add webhook");
    }
    setAddingWebhook(false);
  }, [org?.id, webhookUrl, authFetch, showFlash]);

  const handleSaveSettings = useCallback(async () => {
    if (!org?.id) return;
    setSavingSettings(true);
    try {
      const res = await authFetch(`/api/v1/organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsForm.name,
          description: settingsForm.description,
          website: settingsForm.website,
          settings: {
            white_label: {
              primary_color: settingsForm.primaryColor || undefined,
              custom_domain: settingsForm.customDomain || undefined,
            },
          },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Failed to save settings (${res.status})`);
      }
      // Refresh org data
      setOrg((prev) => prev ? { ...prev, name: settingsForm.name, description: settingsForm.description, website: settingsForm.website } : prev);
      showFlash("success", "Settings saved!");
    } catch (e: any) {
      showFlash("error", e?.message || "Failed to save settings");
    }
    setSavingSettings(false);
  }, [org?.id, settingsForm, authFetch, showFlash]);

  const tabs: Tab[] = useMemo(
    () => [
      { id: "competitions", label: "Competitions", count: competitions.length || undefined },
      { id: "members", label: "Members", count: members.length || undefined },
      { id: "teams", label: "Teams", count: teams.length || undefined },
      { id: "settings", label: "Settings" },
    ],
    [competitions.length, members.length, teams.length]
  );

  /* Loading state */
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
        <Skeleton variant="text" width="180px" />
        <div style={{ display: "flex", gap: "var(--lc-space-4)", alignItems: "center" }}>
          <Skeleton variant="circle" width="64px" height="64px" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)", flex: 1 }}>
            <Skeleton variant="text" width="40%" height="24px" />
            <Skeleton variant="text" width="70%" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--lc-space-4)" }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="card" height="80px" />)}
        </div>
        <Skeleton variant="card" height="300px" />
      </div>
    );
  }

  /* Error state */
  if (error || !org) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
        <Breadcrumb items={[{ label: "Organizations" }, { label: slug }]} />
        <EmptyState
          title="Organization not found"
          description={error || "This organization does not exist or could not be loaded."}
          actionLabel="Go Home"
          onAction={() => { window.location.href = "/"; }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      {/* Flash message */}
      {flash && (
        <div
          role="alert"
          style={{
            padding: "var(--lc-space-3) var(--lc-space-4)",
            borderRadius: "var(--lc-radius-md)",
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-medium)" as any,
            color: flash.type === "success" ? "var(--lc-success)" : "var(--lc-danger)",
            backgroundColor: flash.type === "success" ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
            border: `1px solid ${flash.type === "success" ? "var(--lc-success)" : "var(--lc-danger)"}`,
            opacity: 0.95,
            transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
          }}
        >
          {flash.message}
        </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Organizations" },
          { label: org.name },
        ]}
      />

      {/* ── Org Header ──────────────────────────────────────────────────────── */}
      <section
        style={{
          display: "flex",
          gap: "var(--lc-space-5)",
          alignItems: "flex-start",
          padding: "var(--lc-space-5)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "var(--lc-radius-lg)",
            backgroundColor: "var(--lc-accent-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            fontWeight: "var(--lc-weight-bold)" as any,
            color: "var(--lc-accent)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt={org.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            org.name.charAt(0).toUpperCase()
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: "var(--lc-text-heading)",
              fontWeight: "var(--lc-weight-bold)" as any,
              color: "var(--lc-text)",
              letterSpacing: "var(--lc-tracking-tight)",
              lineHeight: "var(--lc-leading-tight)" as any,
              margin: "0 0 var(--lc-space-1) 0",
            }}
          >
            {org.name}
          </h1>
          {org.description && (
            <p
              style={{
                fontSize: "var(--lc-text-small)",
                color: "var(--lc-text-secondary)",
                lineHeight: "var(--lc-leading-normal)" as any,
                margin: "0 0 var(--lc-space-2) 0",
              }}
            >
              {org.description}
            </p>
          )}
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: "var(--lc-text-caption)",
                color: "var(--lc-accent)",
                textDecoration: "none",
              }}
            >
              <GlobeIcon />
              {org.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </section>

      {/* ── Stats Row ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--lc-space-4)",
          padding: "var(--lc-space-4)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
        }}
      >
        <StatCard label="Competitions" value={org.competition_count} icon={<TrophyIcon />} />
        <StatCard label="Members" value={org.member_count} icon={<UsersIcon />} />
        <StatCard label="Teams" value={org.team_count} icon={<ShieldIcon />} />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />

      <div style={{ marginTop: "var(--lc-space-2)" }}>
        {/* ── Competitions Tab ──────────────────────────────────────────────── */}
        {activeTab === "competitions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Link
                href="/competitions/create"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--lc-space-2)",
                  padding: "8px 16px",
                  borderRadius: "var(--lc-radius-md)",
                  backgroundColor: "var(--lc-accent)",
                  color: "var(--lc-accent-text)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  textDecoration: "none",
                  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                + Create Competition
              </Link>
            </div>

            {competitions.length === 0 ? (
              <EmptyState
                title="No competitions yet"
                description="Create your first competition to get started."
                actionLabel="Create Competition"
                onAction={() => router.push("/competitions/create")}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                {competitions.map((c) => (
                  <Link
                    key={c.id}
                    href={`/competitions/${c.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--lc-space-4)",
                      padding: "var(--lc-space-4)",
                      borderRadius: "var(--lc-radius-lg)",
                      border: "1px solid var(--lc-border)",
                      backgroundColor: "var(--lc-bg-raised)",
                      textDecoration: "none",
                      transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-1)" }}>
                        <span
                          style={{
                            fontSize: "var(--lc-text-body)",
                            fontWeight: "var(--lc-weight-semibold)" as any,
                            color: "var(--lc-text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.title}
                        </span>
                        <Badge variant="tone" tone={STATUS_TONE[c.status] || "muted"} dot size="sm">
                          {c.status}
                        </Badge>
                      </div>
                      <div style={{ display: "flex", gap: "var(--lc-space-4)", fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                        <span>{c.type.replace(/_/g, " ")}</span>
                        <span>{c.participant_count} participants</span>
                        <span>{formatDate(c.starts_at)}</span>
                      </div>
                    </div>
                    <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-body)", flexShrink: 0 }}>
                      &rsaquo;
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Members Tab ───────────────────────────────────────────────────── */}
        {activeTab === "members" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setInviteOpen((v) => !v)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--lc-radius-md)",
                  backgroundColor: "var(--lc-accent)",
                  color: "var(--lc-accent-text)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                + Invite Member
              </button>
            </div>

            {/* Invite form */}
            {inviteOpen && (
              <div
                style={{
                  ...cardStyle,
                  display: "flex",
                  gap: "var(--lc-space-3)",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <label style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Wallet Address</span>
                  <input
                    type="text"
                    value={inviteWallet}
                    onChange={(e) => setInviteWallet(e.target.value)}
                    placeholder="0x..."
                    style={inputStyle}
                  />
                </label>
                <label style={{ minWidth: 120, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Role</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                    style={inputStyle}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button
                  onClick={handleInviteMember}
                  disabled={inviting || !inviteWallet.trim()}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "var(--lc-radius-md)",
                    border: "none",
                    backgroundColor: "var(--lc-accent)",
                    color: "var(--lc-accent-text)",
                    fontSize: "var(--lc-text-small)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    cursor: inviting ? "not-allowed" : "pointer",
                    opacity: inviting ? 0.7 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {inviting ? "Inviting..." : "Send Invite"}
                </button>
              </div>
            )}

            {/* Members table */}
            {members.length === 0 ? (
              <EmptyState
                title="No members yet"
                description="Invite members to join your organization."
              />
            ) : (
              <div
                style={{
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 140px",
                    padding: "var(--lc-space-3) var(--lc-space-4)",
                    backgroundColor: "var(--lc-bg-inset)",
                    fontSize: "var(--lc-text-caption)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    color: "var(--lc-text-muted)",
                    gap: "var(--lc-space-2)",
                  }}
                >
                  <span>Wallet</span>
                  <span>Role</span>
                  <span>Joined</span>
                </div>

                {/* Rows */}
                {members.map((m, i) => (
                  <div
                    key={m.wallet}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 140px",
                      padding: "var(--lc-space-3) var(--lc-space-4)",
                      backgroundColor: i % 2 === 0 ? "var(--lc-bg-raised)" : "var(--lc-bg)",
                      borderTop: "1px solid var(--lc-border)",
                      alignItems: "center",
                      gap: "var(--lc-space-2)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          color: "var(--lc-text)",
                          fontFamily: "var(--lc-font-mono)",
                        }}
                      >
                        {truncAddr(m.wallet)}
                      </span>
                      {m.display_name && (
                        <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                          {m.display_name}
                        </span>
                      )}
                    </div>
                    <Badge variant="tone" tone={ROLE_TONE[m.role] || "muted"} size="sm">
                      {m.role}
                    </Badge>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                      {formatDate(m.joined_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Teams Tab ─────────────────────────────────────────────────────── */}
        {activeTab === "teams" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setTeamFormOpen((v) => !v)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--lc-radius-md)",
                  backgroundColor: "var(--lc-accent)",
                  color: "var(--lc-accent-text)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  border: "none",
                  cursor: "pointer",
                  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                + Create Team
              </button>
            </div>

            {/* Create team form */}
            {teamFormOpen && (
              <div
                style={{
                  ...cardStyle,
                  display: "flex",
                  gap: "var(--lc-space-3)",
                  alignItems: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <label style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Team Name</span>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Dragon Slayers"
                    style={inputStyle}
                    maxLength={60}
                  />
                </label>
                <label style={{ minWidth: 100, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                  <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Tag</span>
                  <input
                    type="text"
                    value={teamTag}
                    onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                    placeholder="e.g. DRGN"
                    style={{ ...inputStyle, fontFamily: "var(--lc-font-mono)", textTransform: "uppercase" }}
                    maxLength={6}
                  />
                </label>
                <button
                  onClick={handleCreateTeam}
                  disabled={creatingTeam || !teamName.trim()}
                  style={{
                    padding: "10px 18px",
                    borderRadius: "var(--lc-radius-md)",
                    border: "none",
                    backgroundColor: "var(--lc-accent)",
                    color: "var(--lc-accent-text)",
                    fontSize: "var(--lc-text-small)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    cursor: creatingTeam ? "not-allowed" : "pointer",
                    opacity: creatingTeam ? 0.7 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {creatingTeam ? "Creating..." : "Create"}
                </button>
              </div>
            )}

            {/* Team grid */}
            {teams.length === 0 ? (
              <EmptyState
                title="No teams yet"
                description="Create teams and assign members to compete together."
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "var(--lc-space-4)",
                }}
              >
                {teams.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      ...cardStyle,
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--lc-space-3)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "var(--lc-text-body)",
                          fontWeight: "var(--lc-weight-semibold)" as any,
                          color: "var(--lc-text)",
                        }}
                      >
                        {t.name}
                      </span>
                      <Badge variant="tone" tone="accent" size="sm">
                        {t.tag}
                      </Badge>
                    </div>

                    <div style={{ display: "flex", gap: "var(--lc-space-4)" }}>
                      <div>
                        <div
                          style={{
                            fontSize: "var(--lc-text-heading)",
                            fontWeight: "var(--lc-weight-bold)" as any,
                            color: "var(--lc-text)",
                          }}
                        >
                          {t.roster_count}
                        </div>
                        <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                          Members
                        </div>
                      </div>
                    </div>

                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                      Created {formatDate(t.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Settings Tab ──────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
            {/* Org Details */}
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-4)", maxWidth: 600 }}>
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  margin: 0,
                }}
              >
                Organization Details
              </h3>

              <label style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Name</span>
                <input
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, name: e.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Description</span>
                <textarea
                  value={settingsForm.description}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Website</span>
                <input
                  type="url"
                  value={settingsForm.website}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://"
                  style={inputStyle}
                />
              </label>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  alignSelf: "flex-start",
                  padding: "10px 24px",
                  borderRadius: "var(--lc-radius-md)",
                  border: "none",
                  backgroundColor: "var(--lc-accent)",
                  color: "var(--lc-accent-text)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  cursor: savingSettings ? "not-allowed" : "pointer",
                  opacity: savingSettings ? 0.7 : 1,
                  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                {savingSettings ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {/* Webhooks */}
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-4)", maxWidth: 600 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3
                  style={{
                    fontSize: "var(--lc-text-subhead)",
                    fontWeight: "var(--lc-weight-semibold)" as any,
                    color: "var(--lc-text)",
                    margin: 0,
                  }}
                >
                  Webhooks
                </h3>
                <button
                  onClick={() => setWebhookFormOpen((v) => !v)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--lc-radius-md)",
                    border: "1px solid var(--lc-border)",
                    backgroundColor: "transparent",
                    color: "var(--lc-text-secondary)",
                    fontSize: "var(--lc-text-caption)",
                    cursor: "pointer",
                    transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
                  }}
                >
                  + Add Webhook
                </button>
              </div>

              {/* Webhook form */}
              {webhookFormOpen && (
                <div style={{ display: "flex", gap: "var(--lc-space-2)", alignItems: "flex-end" }}>
                  <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Endpoint URL</span>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://api.example.com/webhook"
                      style={inputStyle}
                    />
                  </label>
                  <button
                    onClick={handleAddWebhook}
                    disabled={addingWebhook || !webhookUrl.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "var(--lc-radius-md)",
                      border: "none",
                      backgroundColor: "var(--lc-accent)",
                      color: "var(--lc-accent-text)",
                      fontSize: "var(--lc-text-small)",
                      fontWeight: "var(--lc-weight-medium)" as any,
                      cursor: addingWebhook ? "not-allowed" : "pointer",
                      opacity: addingWebhook ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {addingWebhook ? "Adding..." : "Add"}
                  </button>
                </div>
              )}

              {/* Webhook list */}
              {webhooks.length === 0 ? (
                <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", textAlign: "center", padding: "var(--lc-space-4)" }}>
                  No webhooks configured. Add one to receive event notifications.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
                  {webhooks.map((wh) => (
                    <div
                      key={wh.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "var(--lc-space-3)",
                        borderRadius: "var(--lc-radius-md)",
                        backgroundColor: "var(--lc-bg-inset)",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: "var(--lc-text-small)",
                            color: "var(--lc-text)",
                            fontFamily: "var(--lc-font-mono)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {wh.url}
                        </div>
                        <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: 2 }}>
                          {wh.events.join(", ") || "all events"}
                        </div>
                      </div>
                      <Badge
                        variant="tone"
                        tone={wh.active ? "success" : "muted"}
                        dot
                        size="sm"
                      >
                        {wh.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* White-label */}
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "var(--lc-space-4)", maxWidth: 600 }}>
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  margin: 0,
                }}
              >
                White-Label Configuration
              </h3>
              <p style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", margin: 0 }}>
                Customize the look and feel for your organization&apos;s competition pages.
              </p>

              <label style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Primary Color</span>
                <div style={{ display: "flex", gap: "var(--lc-space-2)", alignItems: "center" }}>
                  <input
                    type="color"
                    value={settingsForm.primaryColor || "#f6f7ff"}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                    style={{
                      width: 40,
                      height: 40,
                      border: "1px solid var(--lc-border)",
                      borderRadius: "var(--lc-radius-sm)",
                      cursor: "pointer",
                      backgroundColor: "transparent",
                      padding: 2,
                    }}
                  />
                  <input
                    type="text"
                    value={settingsForm.primaryColor}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                    placeholder="#f6f7ff"
                    style={{ ...inputStyle, flex: 1, fontFamily: "var(--lc-font-mono)" }}
                  />
                </div>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>Custom Domain</span>
                <input
                  type="text"
                  value={settingsForm.customDomain}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, customDomain: e.target.value }))}
                  placeholder="competitions.yourorg.com"
                  style={inputStyle}
                />
              </label>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  alignSelf: "flex-start",
                  padding: "10px 24px",
                  borderRadius: "var(--lc-radius-md)",
                  border: "none",
                  backgroundColor: "var(--lc-accent)",
                  color: "var(--lc-accent-text)",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  cursor: savingSettings ? "not-allowed" : "pointer",
                  opacity: savingSettings ? 0.7 : 1,
                  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
                }}
              >
                {savingSettings ? "Saving..." : "Save White-Label Config"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
