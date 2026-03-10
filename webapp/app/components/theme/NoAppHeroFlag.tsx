"use client";

import { useEffect } from "react";

export default function NoAppHeroFlag({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const el = document.documentElement;
    el.classList.add("no-app-hero");
    return () => el.classList.remove("no-app-hero");
  }, [enabled]);

  return null;
}