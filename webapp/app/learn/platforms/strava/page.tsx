"use client";

import { MapPin, Clock, TrendingUp, FileCheck } from "lucide-react";
import { StravaIcon } from "@/app/components/icons/BrandIcons";
import LearnPage from "../../components/LearnPage";

export default function StravaPage() {
  return (
    <LearnPage
      icon={<StravaIcon size={32} />}
      title="Strava"
      subtitle="Turn your runs, rides, and workouts into verified on-chain achievements."
      description={[
        "Strava is the social network for athletes, used by over 100 million people worldwide. LightChallenge integrates with Strava to verify your fitness activities — running distances, cycling stats, workout durations, and more.",
        "You can either link your Strava account for automatic data collection, or manually export your activity data. Either way, our AI verification models analyze your activities against challenge requirements to confirm completion.",
        "Strava integration works for any fitness challenge: step goals, running distances, cycling challenges, swimming targets, and custom workout metrics.",
      ]}
      metrics={[
        { value: "5+", label: "Activity Types", sub: "Run, ride, swim, hike, walk" },
        { value: "GPS", label: "Route Tracking", sub: "Distance and elevation" },
        { value: "JSON/CSV", label: "Export Formats", sub: "Manual upload supported" },
      ]}
      features={[
        {
          icon: <MapPin size={20} />,
          title: "GPS-Verified Activities",
          desc: "Route data with distance, elevation, and pace. Challenges verified against actual GPS tracks, not self-reported numbers.",
        },
        {
          icon: <Clock size={20} />,
          title: "Time-Bound Verification",
          desc: "Activities are timestamped. The AI checks that your workouts fall within the challenge deadline window.",
        },
        {
          icon: <TrendingUp size={20} />,
          title: "Progressive Challenges",
          desc: "Track improvement over time. Set challenges for weekly mileage, monthly totals, or personal bests.",
        },
        {
          icon: <FileCheck size={20} />,
          title: "Flexible Data Input",
          desc: "Link your account for auto-collection, or manually export JSON/CSV from Strava settings and upload it.",
        },
      ]}
      steps={[
        { step: "01", title: "Connect Strava or export data", desc: "Link via Settings → Linked Accounts, or export from Strava: Settings → My Account → Download Your Data." },
        { step: "02", title: "Join a fitness challenge", desc: "Find a walking, running, or cycling challenge. Stake LCAI and commit to the goal." },
        { step: "03", title: "Complete your activities", desc: "Track your workouts with Strava. Make sure GPS is on for accurate distance recording." },
        { step: "04", title: "Submit proof", desc: "Upload your Strava data or let auto-collection handle it. Select Strava as your tracking app in the proof submission." },
      ]}
      extraTitle="Example Challenges"
      extraContent={
        <div className="learn-page__text">
          <ul style={{ paddingLeft: "var(--lc-space-4)", display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
            <li>Run 50km in one week</li>
            <li>Cycle 200km this month</li>
            <li>Walk 10,000 steps daily for 30 days</li>
            <li>Complete a half-marathon before the deadline</li>
            <li>Achieve a personal best 5K time</li>
          </ul>
        </div>
      }
      ctaLabel="Browse Fitness Challenges"
      ctaHref="/explore"
    />
  );
}
