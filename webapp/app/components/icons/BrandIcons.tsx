/**
 * Brand / partner icons — official SVG marks for platforms and services.
 *
 * These are simplified monochrome renditions of each brand's mark, suitable
 * for UI use at small sizes (16-32px). They inherit `currentColor` and accept
 * a `size` prop for consistent sizing.
 *
 * Usage:
 *   import { SteamIcon, StravaIcon } from "@/app/components/icons/BrandIcons";
 *   <SteamIcon size={20} />
 */

type IconProps = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/* ── Steam ────────────────────────────────────────────────────────────────── */

export function SteamIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M11.98 0C5.68 0 .53 4.82.04 10.88l6.45 2.66a3.41 3.41 0 0 1 1.93-.59h.18l2.89-4.18v-.06a4.56 4.56 0 1 1 4.56 4.56h-.1l-4.11 2.93c0 .05 0 .1-.01.16a3.43 3.43 0 0 1-6.83.46L.73 15.14C1.97 20.16 6.54 24 11.98 24 18.62 24 24 18.63 24 12S18.62 0 11.98 0zM7.5 18.27l-2.07-.85a2.57 2.57 0 1 0 2.72-3.95l2.14.88a1.9 1.9 0 0 1-1.13 3.6 1.89 1.89 0 0 1-1.66-.68zm8.03-5.71a3.04 3.04 0 1 0 0-6.09 3.04 3.04 0 0 0 0 6.09zm-.01-5.07a2.03 2.03 0 1 1 0 4.07 2.03 2.03 0 0 1 0-4.07z" />
    </svg>
  );
}

/* ── Strava ───────────────────────────────────────────────────────────────── */

export function StravaIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zM7.778 14.054l4.338-8.576L16.32 14.054h2.904L12.116 0 5 14.054h2.778z" />
    </svg>
  );
}

/* ── Apple ────────────────────────────────────────────────────────────────── */

export function AppleIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

/* ── Garmin ───────────────────────────────────────────────────────────────── */

export function GarminIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 1.5C6.21 1.5 1.5 6.21 1.5 12S6.21 22.5 12 22.5 22.5 17.79 22.5 12 17.79 1.5 12 1.5zm0 2c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5zm-.5 3v5.7l-3.6 3.6 1.42 1.42L13 13.5V6.5h-1.5z" />
    </svg>
  );
}

/* ── Fitbit ───────────────────────────────────────────────────────────────── */

export function FitbitIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12.756 2.469c0 .898-.726 1.624-1.624 1.624S9.508 3.367 9.508 2.469C9.508 1.573 10.234.845 11.132.845s1.624.728 1.624 1.624zm0 4.773c0 .898-.726 1.624-1.624 1.624s-1.624-.726-1.624-1.624.726-1.624 1.624-1.624 1.624.726 1.624 1.624zm0 4.758c0 .898-.726 1.624-1.624 1.624s-1.624-.726-1.624-1.624.726-1.624 1.624-1.624 1.624.726 1.624 1.624zm0 4.773c0 .898-.726 1.624-1.624 1.624s-1.624-.726-1.624-1.624.726-1.624 1.624-1.624 1.624.726 1.624 1.624zm0 4.758c0 .898-.726 1.624-1.624 1.624s-1.624-.726-1.624-1.624.726-1.624 1.624-1.624 1.624.726 1.624 1.624zm4.639-14.304c0 .898-.726 1.624-1.624 1.624s-1.625-.726-1.625-1.624.727-1.624 1.625-1.624 1.624.726 1.624 1.624zm0 4.758c0 .898-.726 1.624-1.624 1.624s-1.625-.726-1.625-1.624.727-1.624 1.625-1.624 1.624.726 1.624 1.624zm0 4.773c0 .898-.726 1.624-1.624 1.624s-1.625-.726-1.625-1.624.727-1.624 1.625-1.624 1.624.726 1.624 1.624zm4.605-4.773c0 .898-.726 1.624-1.624 1.624S18.752 12.9 18.752 12s.726-1.624 1.624-1.624S22 11.102 22 12zM8.107 7.242c0 .898-.726 1.624-1.625 1.624-.897 0-1.624-.726-1.624-1.624s.727-1.624 1.624-1.624c.899 0 1.625.726 1.625 1.624zm0 4.758c0 .898-.726 1.624-1.625 1.624-.897 0-1.624-.726-1.624-1.624s.727-1.624 1.624-1.624c.899 0 1.625.726 1.625 1.624zm0 4.773c0 .898-.726 1.624-1.625 1.624-.897 0-1.624-.726-1.624-1.624s.727-1.624 1.624-1.624c.899 0 1.625.726 1.625 1.624zM3.482 12c0 .898-.726 1.624-1.624 1.624S.234 12.898.234 12s.726-1.624 1.624-1.624S3.482 11.102 3.482 12z" />
    </svg>
  );
}

/* ── Google Fit ───────────────────────────────────────────────────────────── */

export function GoogleFitIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M22.928 6.697a3.701 3.701 0 0 0-5.24 0l-5.248 5.25-2.2-2.2 5.248-5.25a3.705 3.705 0 0 0-5.24-5.24L4.997 4.51l-.002-.003L2.38 7.122a3.706 3.706 0 0 0 0 5.24L7.627 17.6l2.617 2.616.004-.003.002.003 2.615-2.616.003.002 2.614-2.617-.002-.003 7.448-7.045a3.705 3.705 0 0 0 0-5.24zM12.249 17.6L9.632 14.98l2.617-2.617 2.618 2.617L12.249 17.6z" />
    </svg>
  );
}

/* ── Riot Games ──────────────────────────────────────────────────────────── */

export function RiotIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12.534 21.77l-1.09-2.81 10.52.54-3.145 2.27h-6.285zm9.39-17.89L9.498 7.3l1.674 12.53 2.388-.98L12.1 8.27l7.85-1.1 1.37 10.24 3.71.53L21.924 3.88zM1.637 7.87L0 18.086l5.18 2.74 1.16-1.64L2.2 17.4l1.262-8.94-1.826-.59z" />
    </svg>
  );
}

/* ── Dota 2 ──────────────────────────────────────────────────────────────── */

export function DotaIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M2.229 16.611l4.908 4.756 2.4-.942L4.176 14.8l.924-7.92-2.856.216-.015 9.515zm18.966-9.31l-4.908-4.756-2.4.942 5.361 5.625-.924 7.92 2.856-.216.015-9.515zM7.4 19.6l-.48-2.64L12 11.88l-5.04-5.04L9.6 4.2l7.56 7.56-2.64 2.64 2.04 2.04-4.2 4.2L7.4 19.6z" />
    </svg>
  );
}

/* ── Counter-Strike 2 ────────────────────────────────────────────────────── */

export function CS2Icon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.5 5v3H8v2h2.5v3h3v-3H16v-2h-2.5V7h-3z" />
    </svg>
  );
}

/* ── League of Legends ───────────────────────────────────────────────────── */

export function LoLIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M5.26 3.535L3.756 4.96v14.08l1.504 1.424h4.368L8.58 18.728V5.272l1.048-1.737H5.26zM15.088 2.04L12 4.24l3.088 2.2V17.56L12 19.76l3.088 2.2h5.156l1.504-1.424V5.464L20.244 4.04h-5.156v-2z" />
    </svg>
  );
}

/* ── Valorant ────────────────────────────────────────────────────────────── */

export function ValorantIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M2.2 4.2L13.1 19.8H8L2.2 11.6V4.2ZM12.5 4.2L21.8 17.5V19.8H17.5L12.5 12.7V4.2Z" />
    </svg>
  );
}
