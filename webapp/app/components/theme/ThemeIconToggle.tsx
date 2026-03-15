"use client";

import * as React from "react";
import { useTheme } from "./ThemeProvider";

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-16h1v3h-2V2h1Zm0 19h1v1h-2v-1h1ZM4.2 5.6l2.1 2.1-1.4 1.4L2.8 7 4.2 5.6Zm14.9 14.9 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4ZM2 11h3v2H2v-2Zm19 0h3v2h-3v-2ZM4.9 19.1l1.4 1.4L4.2 22.6 2.8 21.2l2.1-2.1Zm14.2-14.2 1.4 1.4L19.1 7.7l-1.4-1.4 1.4-1.4Z"
      />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M21 15.5A8.5 8.5 0 0 1 9.2 3.3a.9.9 0 0 1 1.1 1.1A6.7 6.7 0 1 0 19.6 13a.9.9 0 0 1 1.1 1.1 8.4 8.4 0 0 1-.7 1.4Z"
      />
    </svg>
  );
}

function SystemIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v10h16V6H4Zm4 14h8v2H8v-2Z"
      />
    </svg>
  );
}

const LABELS = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
} as const;

export default function ThemeIconToggle() {
  const { preference, cycle } = useTheme();

  const icon =
    preference === "system" ? <SystemIcon /> :
    preference === "light" ? <SunIcon /> :
    <MoonIcon />;

  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={LABELS[preference]}
      title={LABELS[preference]}
      onClick={cycle}
    >
      {icon}
    </button>
  );
}
