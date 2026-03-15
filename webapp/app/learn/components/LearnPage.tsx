"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

type Feature = {
  icon: React.ReactNode;
  title: string;
  desc: string;
};

type Metric = {
  label: string;
  value: string;
  sub?: string;
};

type Step = {
  step: string;
  title: string;
  desc: string;
};

type Props = {
  /** Page icon node */
  icon: React.ReactNode;
  /** Page title */
  title: string;
  /** Hero subtitle */
  subtitle: string;
  /** Extended description paragraphs */
  description: string[];
  /** Feature/benefit cards */
  features?: Feature[];
  /** Key metrics */
  metrics?: Metric[];
  /** How-to steps */
  steps?: Step[];
  /** Extra section title + content */
  extraTitle?: string;
  extraContent?: React.ReactNode;
  /** CTA button */
  ctaLabel?: string;
  ctaHref?: string;
  /** Back link override */
  backHref?: string;
  backLabel?: string;
};

export default function LearnPage({
  icon,
  title,
  subtitle,
  description,
  features,
  metrics,
  steps,
  extraTitle,
  extraContent,
  ctaLabel = "Explore Challenges",
  ctaHref = "/explore",
  backHref = "/",
  backLabel = "Home",
}: Props) {
  return (
    <div className="learn-page">
      {/* Back nav */}
      <div className="learn-page__back">
        <Link href={backHref} className="learn-page__back-link">
          <ArrowLeft size={16} />
          {backLabel}
        </Link>
      </div>

      {/* Hero */}
      <section className="learn-page__hero">
        <div className="learn-page__icon">{icon}</div>
        <h1 className="learn-page__title">{title}</h1>
        <p className="learn-page__subtitle">{subtitle}</p>
      </section>

      {/* Description */}
      <section className="learn-page__section">
        {description.map((p, i) => (
          <p key={i} className="learn-page__text">{p}</p>
        ))}
      </section>

      {/* Metrics */}
      {metrics && metrics.length > 0 && (
        <section className="learn-page__section">
          <div className="learn-page__metrics">
            {metrics.map((m) => (
              <div key={m.label} className="learn-page__metric">
                <div className="learn-page__metric-value">{m.value}</div>
                <div className="learn-page__metric-label">{m.label}</div>
                {m.sub && <div className="learn-page__metric-sub">{m.sub}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      {features && features.length > 0 && (
        <section className="learn-page__section">
          <h2 className="learn-page__heading">Key Benefits</h2>
          <div className="learn-page__features">
            {features.map((f) => (
              <div key={f.title} className="learn-page__feature">
                <div className="learn-page__feature-icon">{f.icon}</div>
                <h3 className="learn-page__feature-title">{f.title}</h3>
                <p className="learn-page__feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Steps */}
      {steps && steps.length > 0 && (
        <section className="learn-page__section">
          <h2 className="learn-page__heading">How It Works</h2>
          <div className="learn-page__steps">
            {steps.map((s) => (
              <div key={s.step} className="learn-page__step">
                <div className="learn-page__step-num">{s.step}</div>
                <div>
                  <h3 className="learn-page__step-title">{s.title}</h3>
                  <p className="learn-page__step-desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Extra */}
      {extraTitle && extraContent && (
        <section className="learn-page__section">
          <h2 className="learn-page__heading">{extraTitle}</h2>
          {extraContent}
        </section>
      )}

      {/* CTA */}
      <section className="learn-page__cta">
        <Link href={ctaHref} className="btn btn-primary btn-lg">
          {ctaLabel} <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
