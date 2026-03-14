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
        <div className="create-layout__body">{children}</div>
      </div>
    </>
  );
}