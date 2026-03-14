// webapp/app/challenges/create/layout.tsx
import type { Metadata } from "next";
import NoAppHeroFlag from "./components/NoAppHeroFlag";

export const dynamic = "force-dynamic";
export const revalidate = false;
export const fetchCache = "force-no-store";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Create Challenge — LightChallenge",
  description:
    "Set your rules, deposit funds, and launch a challenge that finalizes on-chain.",
};

export default function CreateChallengeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NoAppHeroFlag />

      <div className="create-layout">
        <section className="section create-hero-shell">
          <div aria-hidden className="create-hero-bg">
            <div className="page-hero" />
            <div className="content-scrim" />
          </div>

          <div className="create-hero">
            <div className="create-hero__copy">
              <div className="create-hero__eyebrow">Builder</div>

              <h1 className="create-hero__title">Create a Challenge</h1>

              <p className="create-hero__subtitle">
                Define intent, stake funds, set the timeline, and publish. The network
                verifies proofs and the contract finalizes on-chain.
              </p>
            </div>

            <aside className="create-hero__aside">
              <div className="create-hero__tip">
                <span className="create-hero__tip-label">Tip</span>
                <span className="create-hero__tip-text">
                  Clear title, fair stake, short timeline.
                </span>
              </div>
            </aside>
          </div>
        </section>

        <div className="create-layout__body">{children}</div>
      </div>
    </>
  );
}