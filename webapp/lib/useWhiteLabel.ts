"use client";

import { useState, useEffect } from "react";

type WhiteLabelConfig = {
  primary_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  custom_css: string | null;
  footer_text: string | null;
};

/**
 * Hook that fetches and applies white-label configuration for the
 * current domain. Applies CSS custom properties and optional custom
 * stylesheet when config is loaded.
 *
 * Returns the config object (or null if no custom config / still loading).
 */
export function useWhiteLabel(): WhiteLabelConfig | null {
  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);

  useEffect(() => {
    fetch("/api/v1/whitelabel/middleware-config")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.data) setConfig(d.data);
      })
      .catch(() => {});
  }, []);

  // Apply custom CSS variables when config loads
  useEffect(() => {
    if (!config) return;

    const root = document.documentElement;

    if (config.primary_color) {
      root.style.setProperty("--lc-accent", config.primary_color);
    }

    if (config.favicon_url) {
      // Update favicon link element if present
      const link =
        (document.querySelector('link[rel="icon"]') as HTMLLinkElement) ??
        document.createElement("link");
      link.rel = "icon";
      link.href = config.favicon_url;
      if (!link.parentNode) document.head.appendChild(link);
    }

    if (config.custom_css) {
      const style = document.createElement("style");
      style.textContent = config.custom_css;
      style.id = "whitelabel-css";
      document.head.appendChild(style);
      return () => {
        document.getElementById("whitelabel-css")?.remove();
      };
    }
  }, [config]);

  return config;
}
