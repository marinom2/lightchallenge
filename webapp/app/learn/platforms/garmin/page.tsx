"use client";

import { MapPin, Mountain, HeartPulse, BarChart3 } from "lucide-react";
import { GarminIcon } from "@/app/components/icons/BrandIcons";
import LearnPage from "../../components/LearnPage";

export default function GarminPage() {
  return (
    <LearnPage
      icon={<GarminIcon size={32} />}
      title="Garmin Connect"
      subtitle="Bring your Garmin GPS data into LightChallenge for precision-verified fitness challenges."
      description={[
        "Garmin devices are trusted by athletes, adventurers, and fitness enthusiasts for their accurate GPS tracking and comprehensive health monitoring. LightChallenge accepts Garmin data exports to verify your activities.",
        "Export your daily summaries, individual activities, or full data archive from Garmin Connect. We support JSON, TCX, and GPX formats — giving you flexibility in how you submit your proof.",
        "Garmin's GPS accuracy makes it ideal for distance-based challenges, elevation goals, and outdoor adventure verification where precise route tracking matters.",
      ]}
      metrics={[
        { value: "3", label: "Export Formats", sub: "JSON, TCX, GPX" },
        { value: "GPS", label: "Precision", sub: "Multi-band satellite tracking" },
        { value: "24/7", label: "Activity Tracking", sub: "Steps, HR, sleep, stress" },
      ]}
      features={[
        {
          icon: <MapPin size={20} />,
          title: "Precision GPS Tracking",
          desc: "Garmin's multi-band GPS provides the most accurate route and distance data. Ideal for distance-based challenges.",
        },
        {
          icon: <HeartPulse size={20} />,
          title: "Heart Rate Data",
          desc: "Wrist-based and chest strap HR data. Verify effort-based challenges like zone training or calorie burn targets.",
        },
        {
          icon: <Mountain size={20} />,
          title: "Elevation and Terrain",
          desc: "Barometric altimeter data for elevation gain challenges. Prove you climbed that mountain.",
        },
        {
          icon: <BarChart3 size={20} />,
          title: "Comprehensive Metrics",
          desc: "Steps, distance, calories, training load, VO2 max — everything your Garmin tracks can be verified.",
        },
      ]}
      steps={[
        { step: "01", title: "Export from Garmin Connect", desc: "On connect.garmin.com: gear icon → Account → Export Your Data. Or export individual activities as TCX/GPX." },
        { step: "02", title: "Choose your format", desc: "JSON for daily summaries, TCX for activities with heart rate, GPX for routes. All three work." },
        { step: "03", title: "Submit proof", desc: "Select Garmin as your tracking source in the proof submission page and upload your export file." },
        { step: "04", title: "Verified on-chain", desc: "AI analyzes your Garmin data, extracts the relevant metrics, and records the verification result on-chain." },
      ]}
      extraTitle="Supported Garmin Devices"
      extraContent={
        <div className="learn-page__text">
          <p style={{ marginBottom: "var(--lc-space-2)" }}>Any Garmin device that syncs with Garmin Connect works:</p>
          <ul style={{ paddingLeft: "var(--lc-space-4)", display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
            <li>Forerunner series (running, triathlon)</li>
            <li>Fenix / Enduro (adventure, ultra)</li>
            <li>Venu series (fitness, lifestyle)</li>
            <li>Edge series (cycling)</li>
            <li>Instinct series (outdoor)</li>
            <li>Vivosmart / Vivoactive (everyday fitness)</li>
          </ul>
        </div>
      }
      ctaLabel="Browse Fitness Challenges"
      ctaHref="/explore"
    />
  );
}
