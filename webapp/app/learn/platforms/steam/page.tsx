"use client";

import { Trophy, Shield, BarChart3, Users, Zap } from "lucide-react";
import { SteamIcon, DotaIcon, CS2Icon } from "@/app/components/icons/BrandIcons";
import LearnPage from "../../components/LearnPage";

export default function SteamPage() {
  return (
    <LearnPage
      icon={<SteamIcon size={32} />}
      title="Steam"
      subtitle="Verify your gaming achievements with data from Steam. Compete in Dota 2, CS2, and more."
      description={[
        "Steam is the world's largest PC gaming platform with over 130 million monthly active users. LightChallenge connects to Steam's public API to verify your in-game statistics, match results, and achievements.",
        "When you link your Steam account, we can automatically pull your match history, win rates, and performance metrics. This data is used by our AI verification models to confirm challenge completion — no screenshots or manual entry needed.",
        "Your Steam data is only accessed when you submit proof for a challenge. We never store your credentials, and you can unlink your account at any time from Settings.",
      ]}
      metrics={[
        { value: "3", label: "Supported Games", sub: "Dota 2, CS2, and more" },
        { value: "Auto", label: "Data Collection", sub: "Via Steam Web API" },
        { value: "Real-time", label: "Match Verification", sub: "Recent match history" },
      ]}
      features={[
        {
          icon: <Trophy size={20} />,
          title: "Match Result Verification",
          desc: "Win/loss records pulled directly from game APIs. No way to fake a victory — the data comes straight from the source.",
        },
        {
          icon: <BarChart3 size={20} />,
          title: "Performance Metrics",
          desc: "KDA, GPM, hero stats, and more. Challenge yourself to hit specific performance benchmarks.",
        },
        {
          icon: <Shield size={20} />,
          title: "Anti-Fraud Protection",
          desc: "Match IDs are cross-referenced with game servers. Photoshopped screenshots won't work here.",
        },
        {
          icon: <Users size={20} />,
          title: "Team Challenges",
          desc: "Create challenges that track team performance across multiple matches and tournaments.",
        },
      ]}
      steps={[
        { step: "01", title: "Link your Steam account", desc: "Go to Settings → Linked Accounts and connect your Steam profile. Make sure your match history is set to public." },
        { step: "02", title: "Join a gaming challenge", desc: "Browse challenges tagged with Dota 2, CS2, or other supported games. Stake your LCAI to enter." },
        { step: "03", title: "Play and prove it", desc: "Play your matches. When you're ready, submit proof — we'll pull your recent match data automatically." },
        { step: "04", title: "AI verifies, you get paid", desc: "Our verification model checks your match data against the challenge criteria. Pass the check and claim your reward." },
      ]}
      extraTitle="Supported Games"
      extraContent={
        <div className="learn-page__features" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            { icon: <DotaIcon size={20} />, name: "Dota 2", desc: "Match history, win rate, MMR challenges" },
            { icon: <CS2Icon size={20} />, name: "Counter-Strike 2", desc: "Match results, K/D tracking, rank challenges" },
          ].map((g) => (
            <div key={g.name} className="learn-page__feature">
              <div className="learn-page__feature-icon">{g.icon}</div>
              <h3 className="learn-page__feature-title">{g.name}</h3>
              <p className="learn-page__feature-desc">{g.desc}</p>
            </div>
          ))}
        </div>
      }
      ctaLabel="Browse Gaming Challenges"
      ctaHref="/explore"
    />
  );
}
