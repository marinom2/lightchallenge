"use client";

import { Brain, FileSearch, ShieldCheck, Zap, BarChart3, Cpu } from "lucide-react";
import { AivmIcon } from "@/app/components/icons/ProductIcons";
import LearnPage from "../../components/LearnPage";

export default function AiVerificationPage() {
  return (
    <LearnPage
      icon={<AivmIcon size={32} />}
      title="AI Verification"
      subtitle="Specialized AI models analyze your evidence and produce a deterministic verification result."
      description={[
        "When you submit proof for a challenge, your data doesn't go to a human reviewer. Instead, it's processed by a specialized AI model running on the Lightchain AIVM (Artificial Intelligence Virtual Machine). Each challenge type has a model trained to evaluate the specific evidence needed.",
        "For fitness challenges, the model analyzes step counts, GPS tracks, workout logs, and activity summaries. For gaming challenges, it checks match results, win rates, and performance stats. The evaluation is deterministic — the same evidence always produces the same result.",
        "The AI model outputs a structured verdict: pass or fail, with specific reasons. This verdict is then submitted to Lightchain validators for consensus, and the final result is recorded on-chain as immutable proof.",
      ]}
      features={[
        {
          icon: <Brain size={20} />,
          title: "Specialized Models",
          desc: "Each challenge type has a dedicated AI model. Fitness models understand activity data. Gaming models understand match statistics. No generic one-size-fits-all approach.",
        },
        {
          icon: <FileSearch size={20} />,
          title: "Evidence Analysis",
          desc: "Models parse raw data exports (ZIP, JSON, CSV, TCX, GPX), extract relevant metrics, and evaluate them against challenge criteria automatically.",
        },
        {
          icon: <Zap size={20} />,
          title: "Fast and Deterministic",
          desc: "AI verification takes seconds, not days. And it's deterministic — the same data always produces the same verdict. No subjective judgment calls.",
        },
        {
          icon: <ShieldCheck size={20} />,
          title: "Fraud Detection",
          desc: "Models check for structural validity, timestamp consistency, and data integrity. Fabricated or manipulated evidence is detected and rejected.",
        },
      ]}
      steps={[
        { step: "01", title: "Evidence submitted", desc: "You upload your fitness data, match results, or activity export. The intake API validates the file format and extracts normalized records." },
        { step: "02", title: "AI model evaluates", desc: "A specialized evaluator processes the normalized data, checks it against the challenge criteria (steps, wins, distance, etc.), and produces a verdict." },
        { step: "03", title: "Verdict produced", desc: "The model outputs a structured result: pass/fail, evidence hash, specific reasons, and confidence score." },
        { step: "04", title: "Result goes on-chain", desc: "The verdict is packaged into an AIVM inference request and submitted to Lightchain validators for consensus and on-chain recording." },
      ]}
      extraTitle="Supported Evidence Types"
      extraContent={
        <div className="learn-page__features" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            { icon: <BarChart3 size={20} />, title: "Fitness Data", desc: "Steps, distance, calories, workouts from Apple Health, Strava, Garmin, Fitbit, Google Fit" },
            { icon: <Cpu size={20} />, title: "Gaming Stats", desc: "Match results, win rates, KDA from Dota 2, CS2, League of Legends via Steam/Riot APIs" },
          ].map((e) => (
            <div key={e.title} className="learn-page__feature">
              <div className="learn-page__feature-icon">{e.icon}</div>
              <h3 className="learn-page__feature-title">{e.title}</h3>
              <p className="learn-page__feature-desc">{e.desc}</p>
            </div>
          ))}
        </div>
      }
      ctaLabel="Try a Challenge"
      ctaHref="/explore"
    />
  );
}
