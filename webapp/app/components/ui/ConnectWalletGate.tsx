"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type Props = {
  /** Message shown above the connect button */
  message?: string;
  /** Content to show when wallet IS connected. Optional — can be used standalone as a prompt. */
  children?: React.ReactNode;
};

/**
 * Renders children only when a wallet is connected.
 * Otherwise shows a centered connect prompt with RainbowKit's ConnectButton.
 */
export default function ConnectWalletGate({
  message = "Connect your wallet to continue.",
  children,
}: Props) {
  const { address } = useAccount();

  if (address) return <>{children}</>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--lc-space-6)",
        padding: "var(--lc-space-16) var(--lc-space-4)",
        maxWidth: "var(--lc-content-narrow)",
        margin: "0 auto",
        textAlign: "center",
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
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--lc-accent)" }}
        >
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M22 10H2" />
          <path d="M6 14h.01" />
        </svg>
      </div>

      <div>
        <h2
          style={{
            fontSize: "var(--lc-text-heading)",
            fontWeight: "var(--lc-weight-semibold)" as any,
            color: "var(--lc-text)",
            marginBottom: "var(--lc-space-2)",
          }}
        >
          Wallet Required
        </h2>
        <p
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-secondary)",
            maxWidth: 360,
            lineHeight: "var(--lc-leading-normal)",
          }}
        >
          {message}
        </p>
      </div>

      <ConnectButton />
    </div>
  );
}
