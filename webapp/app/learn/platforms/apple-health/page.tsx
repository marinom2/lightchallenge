"use client";

import { Footprints, Shield, FileArchive, Activity } from "lucide-react";
import { AppleIcon } from "@/app/components/icons/BrandIcons";
import LearnPage from "../../components/LearnPage";

export default function AppleHealthPage() {
  return (
    <LearnPage
      icon={<AppleIcon size={32} />}
      title="Apple Health"
      subtitle="Export your iPhone health data to verify fitness challenges with real biometric data."
      description={[
        "Apple Health aggregates data from your iPhone, Apple Watch, and connected health apps into one place. LightChallenge accepts Apple Health exports to verify step counts, workout sessions, active energy, and more.",
        "Because Apple Health data is stored on your device, you'll need to export it manually as a ZIP file. The export contains comprehensive health records that our AI models analyze to verify challenge completion.",
        "Apple Health is the most comprehensive data source for iPhone users — it captures steps passively without any additional tracking app, making it ideal for walking and daily activity challenges.",
      ]}
      metrics={[
        { value: "ZIP", label: "Export Format", sub: "Full health data archive" },
        { value: "Passive", label: "Step Tracking", sub: "No app needed — built in" },
        { value: "iPhone", label: "Platform", sub: "iOS and Apple Watch" },
      ]}
      features={[
        {
          icon: <Footprints size={20} />,
          title: "Automatic Step Counting",
          desc: "Your iPhone counts steps passively all day. No extra app or wearable needed — just carry your phone.",
        },
        {
          icon: <Activity size={20} />,
          title: "Rich Activity Data",
          desc: "Steps, distance, flights climbed, active energy, exercise minutes, and workout sessions from Apple Watch.",
        },
        {
          icon: <Shield size={20} />,
          title: "Trusted Source",
          desc: "Apple Health data comes directly from device sensors and is cryptographically signed by iOS. Hard to fabricate.",
        },
        {
          icon: <FileArchive size={20} />,
          title: "One-Time Export",
          desc: "Export once from the Health app. The ZIP contains all your data — upload it and we extract what's needed.",
        },
      ]}
      steps={[
        { step: "01", title: "Export from Health app", desc: "On your iPhone: open Health app → tap your profile (top right) → Export All Health Data → tap Export. This creates a ZIP file." },
        { step: "02", title: "Transfer to your computer", desc: "AirDrop, email, or save the ZIP to Files. You'll upload it when submitting proof." },
        { step: "03", title: "Submit proof", desc: "In the proof submission page, select Apple Health as your tracking source and upload the ZIP file." },
        { step: "04", title: "AI verifies your data", desc: "Our model extracts step counts, workout data, and activity metrics from the export and checks against challenge criteria." },
      ]}
      extraTitle="Best For"
      extraContent={
        <div className="learn-page__text">
          <ul style={{ paddingLeft: "var(--lc-space-4)", display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
            <li>Daily step count challenges (10K steps/day)</li>
            <li>Walking distance goals</li>
            <li>Active energy burn targets</li>
            <li>Workout session frequency</li>
            <li>Apple Watch ring completion challenges</li>
          </ul>
        </div>
      }
      ctaLabel="Browse Fitness Challenges"
      ctaHref="/explore"
    />
  );
}
