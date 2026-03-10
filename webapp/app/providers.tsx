// webapp/app/providers.tsx
"use client";

import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { WagmiProvider, type State } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/wallets";
import { DeploymentsProvider } from "@/lib/deployments";

const queryClient = new QueryClient();

type Mode = "light" | "dark";

function readMode(): Mode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export default function Providers({
  children,
  initialState,
}: PropsWithChildren<{ initialState?: State }>) {
  const [mode, setMode] = useState<Mode>(() => readMode());

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setMode(readMode()));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    setMode(readMode());
    return () => obs.disconnect();
  }, []);

  const rkTheme = useMemo(() => {
    const base =
      mode === "light"
        ? lightTheme({ borderRadius: "large", overlayBlur: "small" })
        : darkTheme({ borderRadius: "large", overlayBlur: "small" });

    return {
      ...base,
      colors: {
        ...base.colors,
        accentColor: "color-mix(in oklab, var(--grad-2) 80%, white 20%)",
        accentColorForeground: "#fff",
        modalBackground: "var(--panel)",
        modalBorder: "var(--border)",
        actionButtonBorder: "var(--border)",
        actionButtonSecondaryBackground: "color-mix(in oklab, var(--panel) 85%, transparent)",
        closeButton: "var(--text-muted)",
        closeButtonBackground: "color-mix(in oklab, var(--panel) 80%, transparent)",
      },
      radii: {
        ...base.radii,
        actionButton: "999px",
        connectButton: "999px",
        menuButton: "999px",
        modal: "24px",
        modalMobile: "24px",
      },
      fonts: {
        body: "var(--font-sans, ui-sans-serif, system-ui, -apple-system)",
      },
      shadows: {
        ...base.shadows,
        connectButton: "var(--sh-1)",
        dialog: "var(--sh-2)",
        profileDetailsAction: "var(--sh-1)",
        selectedOption: "var(--sh-1)",
        selectedWallet: "var(--sh-1)",
        walletLogo: "var(--sh-1)",
      },
    };
  }, [mode]);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <DeploymentsProvider>{children}</DeploymentsProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}