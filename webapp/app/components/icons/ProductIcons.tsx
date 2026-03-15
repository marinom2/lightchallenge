/**
 * Custom LightChallenge product icons — unique to our domain.
 *
 * These represent product-specific concepts that don't have direct equivalents
 * in standard icon libraries: AIVM pipeline, proof verification, challenge
 * lifecycle, escrow, settlement, evidence, etc.
 *
 * All icons use `currentColor`, accept `size` prop, and have consistent
 * 24x24 viewBox with 1.8 stroke weight.
 */

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/* ── AIVM / AI Verification ──────────────────────────────────────────────── */

/** AI brain with neural connections — represents AIVM inference */
export function AivmIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Brain outline */}
      <path d="M12 2C8 2 5 5 5 8.5c0 2 1 3.5 2 4.5v4a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-4c1-1 2-2.5 2-4.5C19 5 16 2 12 2z" />
      {/* Neural connections */}
      <path d="M9 21v1" />
      <path d="M15 21v1" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="15" y2="14" />
      {/* Signal dots */}
      <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Proof / On-chain Verification ───────────────────────────────────────── */

/** Shield with checkmark and chain link — on-chain proof */
export function ProofIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

/* ── Challenge Lifecycle ─────────────────────────────────────────────────── */

/** Flag with progress arc — active challenge */
export function ChallengeIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

/* ── Escrow / Stakes ─────────────────────────────────────────────────────── */

/** Locked vault — escrow holding */
export function EscrowIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1.5" />
      <line x1="12" y1="17.5" x2="12" y2="19" />
    </svg>
  );
}

/* ── Reward / Settlement ─────────────────────────────────────────────────── */

/** Coins with sparkle — reward claim */
export function RewardIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="9" cy="15" r="6" />
      <path d="M15 9a6 6 0 0 0-6-6" />
      <circle cx="15" cy="9" r="6" />
      {/* Sparkle */}
      <path d="M20 2v3" />
      <path d="M18.5 3.5h3" />
    </svg>
  );
}

/* ── Evidence ────────────────────────────────────────────────────────────── */

/** Document with data pattern — evidence submission */
export function EvidenceIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <polyline points="14 2 14 8 20 8" />
      {/* Data lines */}
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
      {/* Check dot */}
      <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ── Tournament / Competition ────────────────────────────────────────────── */

/** Trophy with bracket lines — tournament */
export function TournamentIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

/* ── Rankings / Leaderboard ──────────────────────────────────────────────── */

/** Podium bars — rankings */
export function RankingsIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="2" y="14" width="5" height="8" rx="1" />
      <rect x="9.5" y="6" width="5" height="16" rx="1" />
      <rect x="17" y="10" width="5" height="12" rx="1" />
      {/* Crown on first place */}
      <path d="M10 4l2-2 2 2" />
    </svg>
  );
}

/* ── Validator / Consensus ───────────────────────────────────────────────── */

/** Network nodes with consensus ring — decentralized validation */
export function ValidatorIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Central ring */}
      <circle cx="12" cy="12" r="3" />
      {/* Outer nodes */}
      <circle cx="12" cy="3" r="1.5" />
      <circle cx="19.8" cy="8" r="1.5" />
      <circle cx="19.8" cy="16" r="1.5" />
      <circle cx="12" cy="21" r="1.5" />
      <circle cx="4.2" cy="16" r="1.5" />
      <circle cx="4.2" cy="8" r="1.5" />
      {/* Connections */}
      <line x1="12" y1="4.5" x2="12" y2="9" />
      <line x1="18.5" y1="8.8" x2="14.6" y2="10.5" />
      <line x1="18.5" y1="15.2" x2="14.6" y2="13.5" />
      <line x1="12" y1="19.5" x2="12" y2="15" />
      <line x1="5.5" y1="15.2" x2="9.4" y2="13.5" />
      <line x1="5.5" y1="8.8" x2="9.4" y2="10.5" />
    </svg>
  );
}
