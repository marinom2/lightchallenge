// app/proofs/components/QrHandoff.tsx
// Challenge-specific, source-aware QR handoff modal.
// Passes sourceType in URL so the mobile page renders source-specific instructions.
// For Apple Health: generates a signed evidence token and embeds it in a
// lightchallenge:// deep link QR so the iOS app can submit authenticated evidence.
"use client";

import { useEffect, useState } from "react";
import { Smartphone, Shield, X, Trophy } from "lucide-react";
import QRCode from "qrcode";
import { useWalletClient } from "wagmi";
import type { SourceType } from "@/lib/verificationCapability";
import { generateEvidenceToken, buildDeepLinkWithToken } from "@/lib/evidenceToken";

interface Props {
  challengeId: string;
  challengeTitle?: string;
  subject: string;
  sourceType?: SourceType;
  sourceName?: string;
  sourceIcon?: string;
  onClose: () => void;
}

export default function QrHandoff({
  challengeId,
  challengeTitle,
  subject,
  sourceType,
  sourceName,
  sourceIcon,
  onClose,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const { data: walletClient } = useWalletClient();

  // For Apple Health: generate a signed deep link (lightchallenge://) with evidence token.
  // For other sources: use the web-based /evidence/mobile page.
  const isAppleHealth = sourceType === "apple_health";

  useEffect(() => {
    if (isAppleHealth) {
      // Deep link QR is generated on-demand when "Sign & Generate" is clicked
      return;
    }
    const p = new URLSearchParams();
    p.set("challengeId", challengeId);
    if (subject) p.set("subject", subject);
    if (sourceType) p.set("sourceType", sourceType);
    const url = `${window.location.origin}/evidence/mobile?${p.toString()}`;
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [challengeId, subject, sourceType, isAppleHealth]);

  async function handleSignAndGenerate() {
    if (!walletClient || !subject || !challengeId) return;
    setSigning(true);
    try {
      const token = await generateEvidenceToken(walletClient, challengeId, subject);
      const deepLink = buildDeepLinkWithToken(challengeId, subject, token);
      const url = await QRCode.toDataURL(deepLink, {
        width: 280,
        margin: 2,
        color: { dark: "#ffffff", light: "#00000000" },
      });
      setDataUrl(url);
    } catch {
      // User rejected signing or error — stay in unsigned state
    } finally {
      setSigning(false);
    }
  }

  const sourceDisplay = sourceName ?? (sourceType ? sourceType.replace(/_/g, " ") : "your fitness app");
  const sourceEmoji = sourceIcon ?? "📲";

  return (
    <div className="proof-qr-overlay" onClick={onClose}>
      <div className="proof-qr-panel" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-4 right-4 btn btn-ghost btn-sm p-1" onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </button>

        <div className="text-center mb-5">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ background: "color-mix(in oklab, var(--accent) 15%, transparent)" }}
          >
            <Smartphone className="size-6 text-(--accent)" />
          </div>
          <h2 className="text-xl font-bold">Continue on your phone</h2>
          <p className="text-sm text-(--text-muted) mt-2 max-w-xs mx-auto">
            Scan to open the {sourceDisplay} evidence page for{" "}
            {challengeTitle ? `"${challengeTitle}"` : `challenge #${challengeId}`}.
          </p>
        </div>

        <div className="flex justify-center mb-5">
          {dataUrl ? (
            <div className="proof-qr-code">
              <img src={dataUrl} alt="QR code for mobile evidence" className="w-full h-full" />
            </div>
          ) : isAppleHealth ? (
            <div className="text-center space-y-3">
              <p className="text-xs text-(--text-muted) max-w-xs mx-auto">
                Sign with your wallet to generate an authenticated QR code for the iOS app.
                The token expires in 30 minutes.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSignAndGenerate}
                disabled={signing || !walletClient}
              >
                {signing ? "Signing…" : "Sign & Generate QR"}
              </button>
            </div>
          ) : (
            <div className="proof-qr-code animate-pulse" />
          )}
        </div>

        <div className="proof-qr-context">
          {challengeTitle && (
            <div className="flex justify-between text-sm gap-3">
              <span className="text-(--text-muted) shrink-0">Challenge</span>
              <span className="font-semibold text-right truncate">{challengeTitle}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-(--text-muted)">Challenge ID</span>
            <span className="font-mono">#{challengeId}</span>
          </div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-(--text-muted)">Data source</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span>{sourceEmoji}</span>
              <span className="capitalize">{sourceDisplay}</span>
            </span>
          </div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-(--text-muted)">On success</span>
            <span className="flex items-center gap-1 text-(--ok) text-xs font-medium">
              <Trophy className="size-3" /> Stake + reward
            </span>
          </div>
        </div>

        <div className="mt-5 text-center space-y-2">
          <p className="text-xs text-(--text-muted) leading-relaxed">
            Your phone will open the {sourceDisplay} evidence page with all challenge context carried over.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-(--text-muted)">
            <Shield className="size-3" />
            <span>Secure · Your data stays between you and LightChallenge</span>
          </div>
        </div>
      </div>
    </div>
  );
}
