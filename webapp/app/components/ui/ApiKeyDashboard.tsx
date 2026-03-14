"use client";

/**
 * ApiKeyDashboard — API key management and rate-limit usage display.
 *
 * Shows all keys for an organization with status, usage stats,
 * and controls to create/revoke keys.
 *
 * Styled with var(--lc-*) design tokens.
 */

import React, { useState, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  orgId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
};

type ApiKey = {
  id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  rate_limit: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type NewKeyForm = {
  label: string;
  scopes: string[];
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AVAILABLE_SCOPES = ["read", "write", "admin"] as const;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = {
  container: {
    fontFamily: "var(--lc-font-sans)",
    color: "var(--lc-text)",
    maxWidth: "var(--lc-content-max-w)",
  } as React.CSSProperties,

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "var(--lc-space-6)",
  } as React.CSSProperties,

  title: {
    fontSize: "var(--lc-text-heading)",
    fontWeight: "var(--lc-weight-semibold)" as unknown as number,
    letterSpacing: "var(--lc-tracking-tight)",
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    borderRadius: "var(--lc-radius-md)",
    overflow: "hidden",
    border: "1px solid var(--lc-border)",
  } as React.CSSProperties,

  th: {
    textAlign: "left" as const,
    padding: "var(--lc-space-3) var(--lc-space-4)",
    fontSize: "var(--lc-text-caption)",
    fontWeight: "var(--lc-weight-medium)" as unknown as number,
    color: "var(--lc-text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid var(--lc-border-strong)",
    background: "var(--lc-bg-raised)",
  } as React.CSSProperties,

  td: {
    padding: "var(--lc-space-3) var(--lc-space-4)",
    fontSize: "var(--lc-text-small)",
    borderBottom: "1px solid var(--lc-border)",
  } as React.CSSProperties,

  rowEven: {
    background: "var(--lc-bg)",
  } as React.CSSProperties,

  rowOdd: {
    background: "var(--lc-bg-raised)",
  } as React.CSSProperties,

  badge: (variant: "active" | "revoked" | "expired") => {
    const colors = {
      active: {
        bg: "var(--lc-success-muted)",
        color: "var(--lc-success)",
        border: "var(--lc-success)",
      },
      revoked: {
        bg: "var(--lc-danger-muted)",
        color: "var(--lc-danger)",
        border: "var(--lc-danger)",
      },
      expired: {
        bg: "var(--lc-warning-muted)",
        color: "var(--lc-warning)",
        border: "var(--lc-warning)",
      },
    };
    const c = colors[variant];
    return {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "var(--lc-radius-pill)",
      fontSize: "var(--lc-text-caption)",
      fontWeight: "var(--lc-weight-medium)" as unknown as number,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
    } as React.CSSProperties;
  },

  monoPrefix: {
    fontFamily: "var(--lc-font-mono)",
    fontSize: "var(--lc-text-caption)",
    color: "var(--lc-text-secondary)",
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: "var(--lc-radius-sm)",
    background: "var(--lc-bg-inset)",
    border: "1px solid var(--lc-border)",
    transition: "background var(--lc-dur-fast) var(--lc-ease)",
  } as React.CSSProperties,

  btn: {
    padding: "var(--lc-space-2) var(--lc-space-4)",
    borderRadius: "var(--lc-radius-sm)",
    fontSize: "var(--lc-text-small)",
    fontWeight: "var(--lc-weight-medium)" as unknown as number,
    cursor: "pointer",
    border: "1px solid var(--lc-border-strong)",
    background: "var(--lc-bg-raised)",
    color: "var(--lc-text)",
    transition: "all var(--lc-dur-fast) var(--lc-ease)",
  } as React.CSSProperties,

  btnPrimary: {
    padding: "var(--lc-space-2) var(--lc-space-5)",
    borderRadius: "var(--lc-radius-sm)",
    fontSize: "var(--lc-text-small)",
    fontWeight: "var(--lc-weight-semibold)" as unknown as number,
    cursor: "pointer",
    border: "none",
    background: "var(--lc-accent)",
    color: "var(--lc-accent-text)",
    transition: "all var(--lc-dur-fast) var(--lc-ease)",
  } as React.CSSProperties,

  btnDanger: {
    padding: "var(--lc-space-1) var(--lc-space-3)",
    borderRadius: "var(--lc-radius-sm)",
    fontSize: "var(--lc-text-caption)",
    fontWeight: "var(--lc-weight-medium)" as unknown as number,
    cursor: "pointer",
    border: "1px solid var(--lc-danger)",
    background: "var(--lc-danger-muted)",
    color: "var(--lc-danger)",
    transition: "all var(--lc-dur-fast) var(--lc-ease)",
  } as React.CSSProperties,

  formOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "var(--lc-overlay-bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  } as React.CSSProperties,

  formCard: {
    background: "var(--lc-bg-raised)",
    border: "1px solid var(--lc-border-strong)",
    borderRadius: "var(--lc-radius-lg)",
    padding: "var(--lc-space-8)",
    minWidth: 380,
    maxWidth: 480,
    boxShadow: "var(--lc-shadow-lg)",
  } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "var(--lc-space-2) var(--lc-space-3)",
    borderRadius: "var(--lc-radius-sm)",
    border: "1px solid var(--lc-border-strong)",
    background: "var(--lc-bg-inset)",
    color: "var(--lc-text)",
    fontSize: "var(--lc-text-body)",
    fontFamily: "var(--lc-font-sans)",
    outline: "none",
    transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  rateMeter: {
    display: "flex",
    alignItems: "center",
    gap: "var(--lc-space-2)",
  } as React.CSSProperties,

  rateBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "var(--lc-bg-inset)",
    overflow: "hidden",
  } as React.CSSProperties,

  empty: {
    textAlign: "center" as const,
    padding: "var(--lc-space-12) var(--lc-space-4)",
    color: "var(--lc-text-secondary)",
    fontSize: "var(--lc-text-body)",
  } as React.CSSProperties,

  error: {
    padding: "var(--lc-space-3) var(--lc-space-4)",
    borderRadius: "var(--lc-radius-sm)",
    background: "var(--lc-danger-muted)",
    color: "var(--lc-danger)",
    fontSize: "var(--lc-text-small)",
    marginBottom: "var(--lc-space-4)",
    border: "1px solid var(--lc-danger)",
  } as React.CSSProperties,

  newKeyBanner: {
    padding: "var(--lc-space-4)",
    borderRadius: "var(--lc-radius-md)",
    background: "var(--lc-success-muted)",
    border: "1px solid var(--lc-success)",
    marginBottom: "var(--lc-space-4)",
  } as React.CSSProperties,
} as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getKeyStatus(
  key: ApiKey,
): "active" | "revoked" | "expired" {
  if (key.revoked_at) return "revoked";
  return "active";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ApiKeyDashboard({ orgId, authFetch }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyForm, setNewKeyForm] = useState<NewKeyForm>({
    label: "",
    scopes: ["read", "write"],
  });
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  /* ---- Fetch keys ------------------------------------------------ */

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(
        `/api/v1/auth/api-keys?org_id=${encodeURIComponent(orgId)}`,
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to fetch API keys");
        return;
      }
      setKeys(data.data ?? []);
    } catch (err) {
      setError("Network error fetching API keys");
    } finally {
      setLoading(false);
    }
  }, [orgId, authFetch]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  /* ---- Create key ------------------------------------------------ */

  const handleCreate = async () => {
    if (!newKeyForm.label.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const res = await authFetch(`/api/v1/auth/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newKeyForm.label.trim(),
          scopes: newKeyForm.scopes,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to create key");
        return;
      }
      // The plaintext key is only shown once
      setNewlyCreatedKey(data.data.key ?? null);
      setShowCreateForm(false);
      setNewKeyForm({ label: "", scopes: ["read", "write"] });
      await fetchKeys();
    } catch {
      setError("Network error creating API key");
    } finally {
      setCreating(false);
    }
  };

  /* ---- Revoke key ------------------------------------------------ */

  const handleRevoke = async (keyId: string) => {
    if (!window.confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }
    try {
      setRevokingId(keyId);
      setError(null);
      const res = await authFetch(
        `/api/v1/auth/api-keys?id=${encodeURIComponent(keyId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to revoke key");
        return;
      }
      await fetchKeys();
    } catch {
      setError("Network error revoking API key");
    } finally {
      setRevokingId(null);
    }
  };

  /* ---- Copy prefix ------------------------------------------------ */

  const handleCopy = async (prefix: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(prefix);
      setCopiedId(keyId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  /* ---- Scope toggle ---------------------------------------------- */

  const toggleScope = (scope: string) => {
    setNewKeyForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  };

  /* ---- Render ---------------------------------------------------- */

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>API Keys</h2>
        <button
          style={styles.btnPrimary}
          onClick={() => {
            setShowCreateForm(true);
            setNewlyCreatedKey(null);
          }}
        >
          + Create New Key
        </button>
      </div>

      {/* Error */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Newly created key banner */}
      {newlyCreatedKey && (
        <div style={styles.newKeyBanner}>
          <div
            style={{
              fontSize: "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-semibold)" as unknown as number,
              color: "var(--lc-success)",
              marginBottom: "var(--lc-space-2)",
            }}
          >
            Key created successfully
          </div>
          <div
            style={{
              fontSize: "var(--lc-text-caption)",
              color: "var(--lc-text-secondary)",
              marginBottom: "var(--lc-space-2)",
            }}
          >
            Copy this key now. It will not be shown again.
          </div>
          <code
            style={{
              fontFamily: "var(--lc-font-mono)",
              fontSize: "var(--lc-text-small)",
              color: "var(--lc-text)",
              background: "var(--lc-bg-inset)",
              padding: "var(--lc-space-2) var(--lc-space-3)",
              borderRadius: "var(--lc-radius-sm)",
              display: "block",
              wordBreak: "break-all",
              cursor: "pointer",
              border: "1px solid var(--lc-border)",
            }}
            onClick={() => {
              navigator.clipboard.writeText(newlyCreatedKey).catch(() => {});
            }}
            title="Click to copy"
          >
            {newlyCreatedKey}
          </code>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.empty}>Loading API keys...</div>
      )}

      {/* Empty state */}
      {!loading && keys.length === 0 && (
        <div style={styles.empty}>
          <div
            style={{
              fontSize: "var(--lc-text-heading)",
              marginBottom: "var(--lc-space-2)",
            }}
          >
            No API keys
          </div>
          <div>
            Create your first API key to start integrating with the platform.
          </div>
        </div>
      )}

      {/* Keys table */}
      {!loading && keys.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Label</th>
              <th style={styles.th}>Key</th>
              <th style={styles.th}>Scopes</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Rate Limit</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Last Used</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key, idx) => {
              const status = getKeyStatus(key);
              return (
                <tr
                  key={key.id}
                  style={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}
                >
                  <td style={styles.td}>
                    <span
                      style={{
                        fontWeight: "var(--lc-weight-medium)" as unknown as number,
                      }}
                    >
                      {key.label}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span
                      style={styles.monoPrefix}
                      onClick={() => handleCopy(key.key_prefix, key.id)}
                      title="Click to copy prefix"
                    >
                      {copiedId === key.id ? "Copied!" : key.key_prefix}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--lc-space-1)",
                        flexWrap: "wrap",
                      }}
                    >
                      {(key.scopes ?? []).map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: "var(--lc-text-caption)",
                            padding: "1px 6px",
                            borderRadius: "var(--lc-radius-pill)",
                            background: "var(--lc-accent-muted)",
                            color: "var(--lc-text-secondary)",
                            border: "1px solid var(--lc-border)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={styles.badge(status)}>{status}</span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.rateMeter}>
                      <span
                        style={{
                          fontSize: "var(--lc-text-caption)",
                          color: "var(--lc-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {key.rate_limit ?? 1000}/hr
                      </span>
                      <div style={styles.rateBar}>
                        <div
                          style={{
                            height: "100%",
                            width: "100%",
                            borderRadius: 3,
                            background:
                              status === "active"
                                ? "var(--lc-success)"
                                : "var(--lc-text-muted)",
                            opacity: status === "active" ? 1 : 0.3,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
                      {formatDate(key.created_at)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
                      {formatDate(key.last_used_at)}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {status === "active" && (
                      <button
                        style={styles.btnDanger}
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokingId === key.id}
                      >
                        {revokingId === key.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Create key modal */}
      {showCreateForm && (
        <div
          style={styles.formOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateForm(false);
          }}
        >
          <div style={styles.formCard}>
            <h3
              style={{
                fontSize: "var(--lc-text-heading)",
                fontWeight: "var(--lc-weight-semibold)" as unknown as number,
                marginBottom: "var(--lc-space-6)",
                marginTop: 0,
              }}
            >
              Create New API Key
            </h3>

            {/* Label */}
            <div style={{ marginBottom: "var(--lc-space-5)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as unknown as number,
                  color: "var(--lc-text-secondary)",
                  marginBottom: "var(--lc-space-2)",
                }}
              >
                Label
              </label>
              <input
                style={styles.input}
                type="text"
                placeholder="e.g. Production API Key"
                value={newKeyForm.label}
                onChange={(e) =>
                  setNewKeyForm((prev) => ({
                    ...prev,
                    label: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </div>

            {/* Scopes */}
            <div style={{ marginBottom: "var(--lc-space-6)" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as unknown as number,
                  color: "var(--lc-text-secondary)",
                  marginBottom: "var(--lc-space-3)",
                }}
              >
                Scopes
              </label>
              <div
                style={{
                  display: "flex",
                  gap: "var(--lc-space-3)",
                  flexWrap: "wrap",
                }}
              >
                {AVAILABLE_SCOPES.map((scope) => {
                  const checked = newKeyForm.scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-2)",
                        cursor: "pointer",
                        padding: "var(--lc-space-2) var(--lc-space-3)",
                        borderRadius: "var(--lc-radius-sm)",
                        border: checked
                          ? "1px solid var(--lc-select-border)"
                          : "1px solid var(--lc-border)",
                        background: checked
                          ? "var(--lc-select)"
                          : "transparent",
                        transition:
                          "all var(--lc-dur-fast) var(--lc-ease)",
                        fontSize: "var(--lc-text-small)",
                        color: checked
                          ? "var(--lc-select-text)"
                          : "var(--lc-text-secondary)",
                        fontWeight: checked
                          ? ("var(--lc-weight-medium)" as unknown as number)
                          : ("var(--lc-weight-normal)" as unknown as number),
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope)}
                        style={{
                          accentColor: "var(--lc-select-text)",
                        }}
                      />
                      {scope}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--lc-space-3)",
              }}
            >
              <button
                style={styles.btn}
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.btnPrimary,
                  opacity: creating || !newKeyForm.label.trim() ? 0.5 : 1,
                  pointerEvents:
                    creating || !newKeyForm.label.trim() ? "none" : "auto",
                }}
                onClick={handleCreate}
                disabled={creating || !newKeyForm.label.trim()}
              >
                {creating ? "Creating..." : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
