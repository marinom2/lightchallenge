"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuthFetch } from "@/lib/useAuthFetch";
import Breadcrumb from "@/app/components/ui/Breadcrumb";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type WizardStep = 1 | 2 | 3;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Generate a URL-safe slug from an org name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 48);
}

/* ── Shared Styles ─────────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  padding: "var(--lc-space-6)",
  borderRadius: "var(--lc-radius-lg)",
  border: "1px solid var(--lc-border)",
  backgroundColor: "var(--lc-bg-raised)",
};

const glassCardStyle: React.CSSProperties = {
  ...cardStyle,
  backgroundColor: "var(--lc-glass)",
  backdropFilter: "var(--lc-glass-blur)",
  WebkitBackdropFilter: "var(--lc-glass-blur)",
  borderColor: "var(--lc-glass-border)",
};

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

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-1)",
};

const labelTextStyle: React.CSSProperties = {
  fontSize: "var(--lc-text-caption)",
  color: "var(--lc-text-muted)",
  fontWeight: "var(--lc-weight-medium)" as any,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: "var(--lc-radius-md)",
  border: "none",
  backgroundColor: "var(--lc-accent)",
  color: "var(--lc-accent-text)",
  fontSize: "var(--lc-text-small)",
  fontWeight: "var(--lc-weight-medium)" as any,
  cursor: "pointer",
  transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
};

const btnSecondary: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: "var(--lc-radius-md)",
  border: "1px solid var(--lc-border)",
  backgroundColor: "transparent",
  color: "var(--lc-text-secondary)",
  fontSize: "var(--lc-text-small)",
  fontWeight: "var(--lc-weight-medium)" as any,
  cursor: "pointer",
  transition: "border-color var(--lc-dur-fast) var(--lc-ease)",
};

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function WalletIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M22 10H2" />
      <path d="M6 14h.01" />
    </svg>
  );
}

function FormIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </svg>
  );
}

function RocketIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function KeyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </svg>
  );
}

/* ── Step Indicator ────────────────────────────────────────────────────────── */

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = [
    { num: 1 as const, label: "Connect", icon: <WalletIcon size={16} /> },
    { num: 2 as const, label: "Details", icon: <FormIcon size={16} /> },
    { num: 3 as const, label: "Create", icon: <RocketIcon size={16} /> },
  ];

  return (
    <div className="d-flex items-center justify-center row-2">
      {steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <React.Fragment key={s.num}>
            {i > 0 && (
              <div
                style={{
                  width: 32,
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: isDone ? "var(--lc-accent)" : "var(--lc-border)",
                  transition: "background-color var(--lc-dur-base) var(--lc-ease)",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "var(--lc-space-2) var(--lc-space-3)",
                borderRadius: "var(--lc-radius-pill)",
                backgroundColor: isActive
                  ? "var(--lc-accent-muted)"
                  : isDone
                  ? "var(--lc-success-muted)"
                  : "transparent",
                border: `1px solid ${
                  isActive
                    ? "var(--lc-accent)"
                    : isDone
                    ? "var(--lc-success)"
                    : "var(--lc-border)"
                }`,
                transition: "all var(--lc-dur-base) var(--lc-ease)",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  backgroundColor: isActive
                    ? "var(--lc-accent)"
                    : isDone
                    ? "var(--lc-success)"
                    : "var(--lc-bg-inset)",
                  color: isActive || isDone ? "var(--lc-accent-text)" : "var(--lc-text-muted)",
                  transition: "all var(--lc-dur-base) var(--lc-ease)",
                }}
              >
                {isDone ? <CheckIcon size={14} /> : s.num}
              </div>
              <span
                style={{
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: isActive ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
                  color: isActive ? "var(--lc-text)" : isDone ? "var(--lc-success)" : "var(--lc-text-muted)",
                  transition: "color var(--lc-dur-base) var(--lc-ease)",
                }}
              >
                {s.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function OrgNewPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { authFetch } = useAuthFetch();

  /* Step state */
  const [wizardStep, setWizardStep] = useState<WizardStep>(2);
  const currentStep: WizardStep = !address ? 1 : wizardStep;

  /* Form fields */
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  /* Submission state */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* Success state */
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const effectiveSlug = useMemo(() => slugOverride || slugify(name), [slugOverride, name]);

  const isFormValid = useMemo(() => name.trim().length >= 2 && effectiveSlug.length >= 2, [name, effectiveSlug]);

  const handleSubmit = useCallback(async () => {
    if (!isFormValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await authFetch("/api/v1/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: effectiveSlug,
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          logo_url: logoUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Failed to create organization (${res.status})`);
      }
      const data = await res.json();
      const org = data?.organization || data;
      setCreatedSlug(org?.slug || effectiveSlug);
      setApiKey(data?.api_key || org?.api_key || null);
    } catch (e: any) {
      setSubmitError(e?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [isFormValid, name, effectiveSlug, description, website, logoUrl, authFetch]);

  const handleCopyKey = useCallback(async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2500);
    } catch {
      /* fallback — select text in the field */
    }
  }, [apiKey]);

  /* ── Success Screen ──────────────────────────────────────────────────────── */
  if (createdSlug) {
    return (
      <div className="stack-6">
        <Breadcrumb items={[{ label: "Organizations" }, { label: "New" }, { label: "Created" }]} />

        <div
          style={{
            ...glassCardStyle,
            maxWidth: 540,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--lc-space-6)",
            textAlign: "center",
            padding: "var(--lc-space-8) var(--lc-space-6)",
          }}
        >
          {/* Success icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "var(--lc-success-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckIcon size={28} />
          </div>

          <div>
            <h1 className="text-heading font-bold" style={{ margin: "0 0 var(--lc-space-2) 0", letterSpacing: "var(--lc-tracking-tight)" }}>
              Organization Created
            </h1>
            <p className="text-small color-secondary m-0">
              Your organization is ready. You can manage it from the dashboard.
            </p>
          </div>

          {/* API Key */}
          {apiKey && (
            <div
              style={{
                width: "100%",
                padding: "var(--lc-space-4)",
                borderRadius: "var(--lc-radius-md)",
                backgroundColor: "var(--lc-warning-muted)",
                border: "1px solid var(--lc-warning)",
                textAlign: "left",
              }}
            >
              <div className="d-flex items-center row-2 mb-2">
                <KeyIcon size={16} />
                <span className="text-small font-semibold" style={{ color: "var(--lc-warning)" }}>
                  API Key — Save this now
                </span>
              </div>
              <p className="text-caption color-secondary leading-normal" style={{ margin: "0 0 var(--lc-space-3) 0" }}>
                This key will not be shown again. Copy it now and store it securely.
              </p>
              <div className="d-flex items-center row-2">
                <input
                  type="text"
                  readOnly
                  value={apiKey}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    fontFamily: "var(--lc-font-mono)",
                    fontSize: "var(--lc-text-caption)",
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopyKey}
                  style={{
                    ...btnSecondary,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--lc-space-1)",
                    color: keyCopied ? "var(--lc-success)" : "var(--lc-text-secondary)",
                    borderColor: keyCopied ? "var(--lc-success)" : "var(--lc-border)",
                  }}
                >
                  {keyCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  {keyCopied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Navigate to dashboard */}
          <Link
            href={`/org/${createdSlug}`}
            style={{
              ...btnPrimary,
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--lc-space-2)",
              textDecoration: "none",
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  /* ── Wizard ──────────────────────────────────────────────────────────────── */
  return (
    <div className="stack-6">
      <Breadcrumb items={[{ label: "Organizations" }, { label: "New" }]} />

      {/* Title */}
      <div className="text-center">
        <h1 className="text-heading font-bold" style={{ margin: "0 0 var(--lc-space-2) 0", letterSpacing: "var(--lc-tracking-tight)" }}>
          Create Organization
        </h1>
        <p className="text-small color-secondary m-0">
          Set up your organization to host competitions on LightChallenge.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={currentStep} />

      {/* ── Step 1: Connect Wallet ──────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div
          style={{
            ...glassCardStyle,
            maxWidth: 480,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--lc-space-6)",
            textAlign: "center",
            padding: "var(--lc-space-8) var(--lc-space-6)",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "var(--lc-accent-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--lc-accent)",
            }}
          >
            <WalletIcon size={24} />
          </div>
          <div>
            <h2 className="text-subhead font-semibold" style={{ margin: "0 0 var(--lc-space-2) 0" }}>
              Connect Your Wallet
            </h2>
            <p className="text-small color-secondary m-0 leading-normal" style={{ maxWidth: 340 }}>
              Your wallet address will be the owner of the new organization.
            </p>
          </div>
          <ConnectButton />
        </div>
      )}

      {/* ── Step 2: Org Details Form ────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div
          style={{
            ...glassCardStyle,
            maxWidth: 540,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "var(--lc-space-5)",
          }}
        >
          <h2 className="text-subhead font-semibold m-0">
            Organization Details
          </h2>

          {/* Name */}
          <label className="stack-1">
            <span className="text-caption color-muted font-medium">
              Name <span style={{ color: "var(--lc-danger)" }}>*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Esports"
              style={inputStyle}
              maxLength={80}
              autoFocus
            />
          </label>

          {/* Slug */}
          <label className="stack-1">
            <span className="text-caption color-muted font-medium">Slug (URL path)</span>
            <div className="d-flex items-center row-2">
              <span className="text-small color-muted" style={{ whiteSpace: "nowrap" }}>
                /org/
              </span>
              <input
                type="text"
                value={slugOverride || effectiveSlug}
                onChange={(e) => setSlugOverride(slugify(e.target.value))}
                placeholder={effectiveSlug || "auto-generated"}
                style={{ ...inputStyle, fontFamily: "var(--lc-font-mono)" }}
                maxLength={48}
              />
            </div>
          </label>

          {/* Description */}
          <label className="stack-1">
            <span className="text-caption color-muted font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does your organization do?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              maxLength={500}
            />
          </label>

          {/* Website */}
          <label className="stack-1">
            <span className="text-caption color-muted font-medium">Website</span>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourorg.com"
              style={inputStyle}
            />
          </label>

          {/* Logo URL */}
          <label className="stack-1">
            <span className="text-caption color-muted font-medium">Logo URL</span>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://yourorg.com/logo.png"
              style={inputStyle}
            />
          </label>

          {/* Navigation */}
          <div className="d-flex justify-end row-3 mt-2">
            <button
              onClick={() => setWizardStep(3)}
              disabled={!isFormValid}
              style={{
                ...btnPrimary,
                opacity: isFormValid ? 1 : 0.5,
                cursor: isFormValid ? "pointer" : "not-allowed",
              }}
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review + Create ─────────────────────────────────────────── */}
      {currentStep === 3 && (
        <div
          style={{
            ...glassCardStyle,
            maxWidth: 540,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "var(--lc-space-5)",
          }}
        >
          <h2 className="text-subhead font-semibold m-0">
            Review & Create
          </h2>

          {/* Summary card */}
          <div
            style={{
              ...cardStyle,
              display: "flex",
              gap: "var(--lc-space-4)",
              alignItems: "flex-start",
            }}
          >
            {/* Logo preview */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--lc-radius-md)",
                backgroundColor: "var(--lc-accent-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.25rem",
                fontWeight: "var(--lc-weight-bold)" as any,
                color: "var(--lc-accent)",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                name.charAt(0).toUpperCase() || "?"
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-body font-semibold mb-1">
                {name || "Untitled"}
              </div>
              <div
                className="text-caption color-muted"
                style={{
                  fontFamily: "var(--lc-font-mono)",
                  marginBottom: description ? "var(--lc-space-2)" : 0,
                }}
              >
                /org/{effectiveSlug}
              </div>
              {description && (
                <p className="text-small color-secondary m-0 leading-normal">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Details grid */}
          <div className="stack-2">
            {[
              { label: "Owner", value: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "--" },
              { label: "Website", value: website || "--" },
              { label: "Logo", value: logoUrl ? "Provided" : "None" },
            ].map((row) => (
              <div
                key={row.label}
                className="d-flex flex-between items-center border-b"
                style={{ padding: "var(--lc-space-2) 0" }}
              >
                <span className="text-small color-muted">
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: "var(--lc-text-small)",
                    color: "var(--lc-text)",
                    fontFamily: row.label === "Owner" ? "var(--lc-font-mono)" : "inherit",
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Error */}
          {submitError && (
            <div
              role="alert"
              style={{
                padding: "var(--lc-space-3) var(--lc-space-4)",
                borderRadius: "var(--lc-radius-md)",
                fontSize: "var(--lc-text-small)",
                color: "var(--lc-danger)",
                backgroundColor: "var(--lc-danger-muted)",
                border: "1px solid var(--lc-danger)",
              }}
            >
              {submitError}
            </div>
          )}

          {/* Navigation */}
          <div className="d-flex flex-between row-3 mt-2">
            <button onClick={() => setWizardStep(2)} className="btn btn-ghost">
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isFormValid}
              style={{
                ...btnPrimary,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
              }}
            >
              {submitting ? "Creating..." : "Create Organization"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
