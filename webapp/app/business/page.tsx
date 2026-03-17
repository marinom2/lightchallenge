"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Shield,
  Users,
  Zap,
  DollarSign,
  Target,
  Globe,
  BarChart3,
  Layers,
  Award,
  Building2,
  Rocket,
  CheckCircle2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   LightChallenge — Business Plan & Investment Overview
   Route: /business
   ═══════════════════════════════════════════════════════════════════════════ */

export default function BusinessPage() {
  return (
    <div className="bp">
      {/* Back nav */}
      <div className="bp-back">
        <Link href="/" className="bp-back__link">
          <ArrowLeft size={16} />
          Home
        </Link>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="bp-hero">
        <div className="bp-hero__badge">Business Plan</div>
        <h1 className="bp-hero__title">
          The Accountability Layer<br />for Real-World Achievement
        </h1>
        <p className="bp-hero__subtitle">
          LightChallenge is a decentralized challenge platform where real activity earns real rewards.
          Verified by AI, settled on-chain, powered by Lightchain.
        </p>
      </section>

      {/* ── Executive Summary ─────────────────────────────────────────────── */}
      <Section title="Executive Summary" id="summary">
        <p className="bp-text">
          LightChallenge turns fitness and gaming activity into verifiable, stake-backed commitments.
          Users join challenges, stake tokens, and earn rewards when they hit their goals — verified
          autonomously by AI models running on Lightchain&apos;s AIVM infrastructure.
        </p>
        <p className="bp-text">
          The platform captures revenue from protocol fees on every challenge resolution, creating a
          transaction-fee business model that scales linearly with platform activity. Our smart
          contract architecture ensures trustless settlement, while the AI verification layer
          eliminates the need for manual judging or centralized arbitration.
        </p>

        <div className="bp-metrics">
          <MetricCard value="$0" label="User Acquisition Cost" sub="Organic Web3 + referral loops" />
          <MetricCard value="~5%" label="Protocol Take Rate" sub="From forfeited stakes" />
          <MetricCard value="60%+" label="Typical Loss Rate" sub="Fitness challenge benchmarks" />
          <MetricCard value="0" label="Human Judges Needed" sub="Fully autonomous verification" />
        </div>
      </Section>

      {/* ── Problem & Opportunity ─────────────────────────────────────────── */}
      <Section title="Problem & Opportunity" id="problem">
        <div className="bp-columns">
          <div className="bp-card">
            <div className="bp-card__icon" style={{ background: "var(--lc-danger)" }}>
              <Target size={20} />
            </div>
            <h3 className="bp-card__title">The Problem</h3>
            <ul className="bp-list">
              <li>92% of people fail their New Year fitness resolutions</li>
              <li>Accountability apps have no real financial consequence</li>
              <li>Traditional betting platforms are centralized and extractive (15-25% take rates)</li>
              <li>Existing Web3 fitness apps (STEPN) collapsed due to speculative tokenomics</li>
              <li>No trustless way to verify real-world activity completion</li>
            </ul>
          </div>
          <div className="bp-card">
            <div className="bp-card__icon" style={{ background: "var(--lc-success)" }}>
              <Zap size={20} />
            </div>
            <h3 className="bp-card__title">Our Solution</h3>
            <ul className="bp-list">
              <li>Stake-backed challenges create real skin in the game</li>
              <li>AI verification via Lightchain AIVM — no human judges, no disputes</li>
              <li>Fair fee structure (5% vs. industry 15-25%) — users keep more</li>
              <li>Real utility, not speculation — value comes from activity, not token price</li>
              <li>Multi-source data: Apple Health, Strava, Fitbit, Garmin, Steam, Riot</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <Section title="How It Works" id="how">
        <div className="bp-flow">
          <FlowStep num="01" title="Create or Join" desc="Anyone can create a challenge with custom rules, deadlines, and stake amounts. Others join by staking tokens." />
          <FlowStep num="02" title="Do the Work" desc="Complete the fitness or gaming goal. Activity data flows from connected platforms (Strava, Apple Health, Steam, etc.)." />
          <FlowStep num="03" title="AI Verification" desc="Evidence is submitted to Lightchain's AIVM. Decentralized AI models verify completion against challenge rules." />
          <FlowStep num="04" title="On-Chain Settlement" desc="Smart contracts automatically distribute rewards to winners. Losers forfeit their stake (minus cashback). Protocol earns fees." />
        </div>
      </Section>

      {/* ── Revenue Model ─────────────────────────────────────────────────── */}
      <Section title="Revenue Model" id="revenue">
        <p className="bp-text">
          LightChallenge operates a <strong>transaction-fee model</strong> that captures value from
          every challenge resolution. Revenue is protocol-level, enforced by smart contracts, and
          requires zero manual intervention.
        </p>

        <h3 className="bp-subheading">Fee Architecture (ChallengePay V1)</h3>
        <p className="bp-text">
          When a challenge finalizes, the losers&apos; forfeited pool is distributed through a
          deterministic pipeline:
        </p>

        <div className="bp-fee-flow">
          <div className="bp-fee-flow__item">
            <div className="bp-fee-flow__label">Losers&apos; Pool</div>
            <div className="bp-fee-flow__value">100%</div>
          </div>
          <div className="bp-fee-flow__arrow">&darr;</div>
          <div className="bp-fee-flow__item">
            <div className="bp-fee-flow__label">Cashback to Losers</div>
            <div className="bp-fee-flow__value bp-fee-flow__value--muted">10%</div>
            <div className="bp-fee-flow__note">Retention incentive — losers get partial refund</div>
          </div>
          <div className="bp-fee-flow__arrow">&darr;</div>
          <div className="bp-fee-flow__item bp-fee-flow__item--highlight">
            <div className="bp-fee-flow__label">Protocol Fee</div>
            <div className="bp-fee-flow__value bp-fee-flow__value--accent">5%</div>
            <div className="bp-fee-flow__note">LightChallenge revenue — enforced on-chain</div>
          </div>
          <div className="bp-fee-flow__arrow">&darr;</div>
          <div className="bp-fee-flow__item">
            <div className="bp-fee-flow__label">Creator Fee</div>
            <div className="bp-fee-flow__value bp-fee-flow__value--muted">5%</div>
            <div className="bp-fee-flow__note">Incentive for challenge creators</div>
          </div>
          <div className="bp-fee-flow__arrow">&darr;</div>
          <div className="bp-fee-flow__item">
            <div className="bp-fee-flow__label">Winner Rewards</div>
            <div className="bp-fee-flow__value" style={{ color: "var(--lc-success)" }}>80%</div>
            <div className="bp-fee-flow__note">Pro-rata by individual contribution</div>
          </div>
        </div>

        <h3 className="bp-subheading">Revenue Streams</h3>
        <div className="bp-grid-3">
          <RevenueCard
            icon={<DollarSign size={20} />}
            title="Protocol Fees"
            desc="5% of every losers' pool. Enforced by smart contract. No human needed."
            status="Active"
          />
          <RevenueCard
            icon={<Award size={20} />}
            title="No-Winner Windfall"
            desc="If all participants fail, the entire distributable pool routes to protocol."
            status="Active"
          />
          <RevenueCard
            icon={<Building2 size={20} />}
            title="Sponsored Challenges"
            desc="Brands fund prize pools for marketing campaigns. 15-20% sourcing fee."
            status="Planned"
          />
          <RevenueCard
            icon={<Layers size={20} />}
            title="Premium Tiers"
            desc="Higher-stakes challenges, custom rules, private groups. Enhanced creator fees."
            status="Planned"
          />
          <RevenueCard
            icon={<Globe size={20} />}
            title="API & White-Label"
            desc="Embedded challenges for fitness apps, corporate wellness, esports platforms."
            status="Planned"
          />
          <RevenueCard
            icon={<Rocket size={20} />}
            title="Challenge Creation Fee"
            desc="Small flat fee to create challenges. Predictable baseline regardless of outcome."
            status="Planned"
          />
        </div>
      </Section>

      {/* ── Financial Projections ─────────────────────────────────────────── */}
      <Section title="Financial Projections" id="projections">
        <p className="bp-text">
          Projections based on 5% protocol fee, 10% cashback, ~50% loss rate, and $25 average stake per participant.
          Conservative estimates — excludes sponsored challenges and premium features.
        </p>

        <div className="bp-table-wrap">
          <table className="bp-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Monthly Challenges</th>
                <th>Avg. Participants</th>
                <th>Monthly GMV</th>
                <th>Monthly Protocol Revenue</th>
                <th>Annual Revenue</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="bp-stage bp-stage--seed">Seed</span></td>
                <td>50</td>
                <td>20</td>
                <td>$25,000</td>
                <td>$562</td>
                <td>$6,750</td>
              </tr>
              <tr>
                <td><span className="bp-stage bp-stage--early">Early</span></td>
                <td>200</td>
                <td>30</td>
                <td>$150,000</td>
                <td>$3,375</td>
                <td>$40,500</td>
              </tr>
              <tr>
                <td><span className="bp-stage bp-stage--growth">Growth</span></td>
                <td>1,000</td>
                <td>50</td>
                <td>$1,250,000</td>
                <td>$28,125</td>
                <td>$337,500</td>
              </tr>
              <tr className="bp-table__highlight">
                <td><span className="bp-stage bp-stage--scale">Scale</span></td>
                <td>5,000</td>
                <td>60</td>
                <td>$7,500,000</td>
                <td>$168,750</td>
                <td>$2,025,000</td>
              </tr>
              <tr>
                <td><span className="bp-stage bp-stage--mature">Mature</span></td>
                <td>10,000</td>
                <td>80</td>
                <td>$20,000,000</td>
                <td>$450,000</td>
                <td>$5,400,000</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bp-callout">
          <div className="bp-callout__icon"><TrendingUp size={20} /></div>
          <div>
            <strong>Upside scenario:</strong> With sponsored challenges (est. 15-20% of volume at growth stage)
            and no-winner windfalls (~5% of challenges), annual revenue at the Scale stage
            reaches <strong>$2.5M+</strong>.
          </div>
        </div>
      </Section>

      {/* ── Market Analysis ───────────────────────────────────────────────── */}
      <Section title="Market Analysis" id="market">
        <p className="bp-text">
          LightChallenge sits at the intersection of three massive and growing markets:
          fitness accountability ($10B+), prediction markets ($50B+), and Web3 gaming ($25B+).
        </p>

        <h3 className="bp-subheading">Competitive Landscape</h3>
        <div className="bp-table-wrap">
          <table className="bp-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Model</th>
                <th>Peak Revenue</th>
                <th>Take Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>STEPN</strong></td>
                <td>Move-to-earn NFTs</td>
                <td>$122.5M / quarter</td>
                <td>8-10%</td>
                <td><span className="bp-badge bp-badge--warn">Collapsed 90%+</span></td>
              </tr>
              <tr>
                <td><strong>Sweatcoin</strong></td>
                <td>Brand partnerships</td>
                <td>$20-33M / year</td>
                <td>N/A</td>
                <td><span className="bp-badge bp-badge--ok">Active</span></td>
              </tr>
              <tr>
                <td><strong>Polymarket</strong></td>
                <td>Prediction market fees</td>
                <td>$23.5B volume (2024)</td>
                <td>0.10%</td>
                <td><span className="bp-badge bp-badge--ok">Active</span></td>
              </tr>
              <tr>
                <td><strong>Azuro</strong></td>
                <td>DeFi betting protocol</td>
                <td>$6.3M revenue</td>
                <td>~2%</td>
                <td><span className="bp-badge bp-badge--ok">Active</span></td>
              </tr>
              <tr>
                <td><strong>StepBet</strong></td>
                <td>Fitness staking (CeFi)</td>
                <td>$5-10M / year</td>
                <td>15%</td>
                <td><span className="bp-badge bp-badge--ok">Active</span></td>
              </tr>
              <tr className="bp-table__highlight">
                <td><strong>LightChallenge</strong></td>
                <td>AI-verified stake challenges</td>
                <td>Pre-revenue</td>
                <td>~5%</td>
                <td><span className="bp-badge bp-badge--accent">Building</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="bp-subheading">Our Competitive Advantages</h3>
        <div className="bp-grid-2">
          <AdvantageCard
            icon={<Shield size={20} />}
            title="Trustless Verification"
            desc="No centralized judge. AI models on Lightchain AIVM verify activity data autonomously — disputes are eliminated by design."
          />
          <AdvantageCard
            icon={<DollarSign size={20} />}
            title="Fair Economics"
            desc="5% take rate vs. industry 15-25%. Winners keep more. Losers get 10% cashback. Everyone has a reason to come back."
          />
          <AdvantageCard
            icon={<Users size={20} />}
            title="Flexible Staking"
            desc="No minimum buy-in barrier. Participants can stake any amount. Distribution is pro-rata — fair regardless of stake size."
          />
          <AdvantageCard
            icon={<Layers size={20} />}
            title="Multi-Category Platform"
            desc="Fitness (Strava, Apple Health, Garmin, Fitbit) and gaming (Steam, Riot) on one platform. More use cases = more volume."
          />
        </div>
      </Section>

      {/* ── Why STEPN Failed and We Won't ─────────────────────────────────── */}
      <Section title="Sustainable by Design" id="sustainability">
        <p className="bp-text">
          STEPN generated $122.5M in a single quarter — then lost 90%+ of users within months. The
          collapse taught the industry a hard lesson: <strong>speculative tokenomics are not a business model.</strong>
        </p>

        <div className="bp-compare">
          <div className="bp-compare__col bp-compare__col--bad">
            <h4 className="bp-compare__title">STEPN&apos;s Model (Failed)</h4>
            <ul className="bp-list">
              <li>Revenue from NFT minting and marketplace fees</li>
              <li>Required buying $500-2,000 NFT shoes to participate</li>
              <li>Ponzi-adjacent: new money funded existing payouts</li>
              <li>No real verification — spoofing was rampant</li>
              <li>Token price collapse = user exodus</li>
            </ul>
          </div>
          <div className="bp-compare__col bp-compare__col--good">
            <h4 className="bp-compare__title">LightChallenge (Sustainable)</h4>
            <ul className="bp-list">
              <li>Revenue from protocol fees on real activity</li>
              <li>No NFT purchase required — stake any amount</li>
              <li>Zero-sum pool: losers fund winners, no new money needed</li>
              <li>AI verification on decentralized infrastructure</li>
              <li>Value tied to activity completion, not token speculation</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Technology Stack ──────────────────────────────────────────────── */}
      <Section title="Technology Stack" id="tech">
        <div className="bp-grid-3">
          <TechCard
            title="Smart Contracts"
            items={["ChallengePay V1 — Solidity 0.8.24", "Treasury with bucketed custody", "EIP-2771 gasless transactions", "2-step admin, role-based access"]}
          />
          <TechCard
            title="AI Verification (AIVM)"
            items={["Lightchain AIVM infrastructure", "Proof-of-Intelligence consensus", "5 adapter models (fitness + gaming)", "Decentralized validator network"]}
          />
          <TechCard
            title="Full-Stack Platform"
            items={["Next.js 14 web app", "Native iOS app (SwiftUI)", "Multi-source data integrations", "PostgreSQL + on-chain hybrid"]}
          />
        </div>
      </Section>

      {/* ── Go-to-Market Strategy ─────────────────────────────────────────── */}
      <Section title="Go-to-Market Strategy" id="gtm">
        <div className="bp-phases">
          <PhaseCard
            phase="Phase 1"
            title="Foundation"
            timeline="Q1–Q2 2026"
            items={[
              "Launch on Lightchain testnet (complete)",
              "iOS app on TestFlight",
              "Fitness challenges: steps, running, cycling",
              "Core integrations: Apple Health, Strava, Garmin",
              "Seed community of 500+ active users",
            ]}
            status="current"
          />
          <PhaseCard
            phase="Phase 2"
            title="Growth"
            timeline="Q3–Q4 2026"
            items={[
              "Mainnet launch on Lightchain",
              "Android app release",
              "Gaming challenges: Steam, Riot Games",
              "Creator tools: custom rules, branding",
              "Referral system with on-chain rewards",
              "First sponsored challenge partnerships",
            ]}
            status="next"
          />
          <PhaseCard
            phase="Phase 3"
            title="Scale"
            timeline="2027"
            items={[
              "Corporate wellness partnerships (B2B)",
              "White-label API for fitness apps",
              "Tournament/competition engine",
              "Cross-chain deployment (Ethereum L2s)",
              "Premium features and subscription tiers",
              "Target: 5,000+ monthly challenges",
            ]}
            status="future"
          />
        </div>
      </Section>

      {/* ── Unit Economics ─────────────────────────────────────────────────── */}
      <Section title="Unit Economics" id="economics">
        <p className="bp-text">
          Each challenge is a self-contained economic unit. Here&apos;s the math for a typical challenge:
        </p>

        <div className="bp-example">
          <h4 className="bp-example__title">Example: &ldquo;Run 50km in 2 weeks&rdquo; Challenge</h4>
          <div className="bp-example__grid">
            <div className="bp-example__item">
              <div className="bp-example__label">Participants</div>
              <div className="bp-example__value">40 users</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Average Stake</div>
              <div className="bp-example__value">$30</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Total Pool</div>
              <div className="bp-example__value">$1,200</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Completion Rate</div>
              <div className="bp-example__value">45% (18 winners)</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Losers&apos; Pool</div>
              <div className="bp-example__value">$660</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Cashback (10%)</div>
              <div className="bp-example__value">$66 to losers</div>
            </div>
            <div className="bp-example__item bp-example__item--accent">
              <div className="bp-example__label">Protocol Revenue (5%)</div>
              <div className="bp-example__value">$29.70</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Creator Revenue (5%)</div>
              <div className="bp-example__value">$29.70</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Winner Bonus Pool</div>
              <div className="bp-example__value">$534.60</div>
            </div>
            <div className="bp-example__item">
              <div className="bp-example__label">Avg. Winner Payout</div>
              <div className="bp-example__value">$30 + $29.70 = $59.70</div>
            </div>
          </div>
          <p className="bp-example__note">
            Winners nearly double their stake. Losers get 10% back. The creator earns $29.70 for setting up the challenge.
            Protocol earns $29.70 with zero operational cost.
          </p>
        </div>

        <div className="bp-metrics" style={{ marginTop: "var(--lc-space-8)" }}>
          <MetricCard value="$0" label="Marginal Cost per Challenge" sub="Smart contracts handle all settlement" />
          <MetricCard value="99%+" label="Gross Margin" sub="No COGS — protocol fees are pure margin" />
          <MetricCard value="~2.5%" label="Effective Take Rate" sub="Of total GMV (5% of losers pool)" />
          <MetricCard value="Infinite" label="LTV:CAC Ratio" sub="$0 CAC with organic Web3 distribution" />
        </div>
      </Section>

      {/* ── Risk Factors ──────────────────────────────────────────────────── */}
      <Section title="Risk Factors & Mitigations" id="risks">
        <div className="bp-grid-2">
          <RiskCard
            risk="All-Winner Problem"
            desc="Easy challenges where everyone wins = $0 protocol revenue."
            mitigation="Challenge difficulty calibration tools. Creator incentives to set 40-60% difficulty. Minimum stake thresholds."
          />
          <RiskCard
            risk="Token Price Volatility"
            desc="LCAI price drops reduce dollar-denominated pool sizes."
            mitigation="Stablecoin (USDC) support planned. Multi-currency challenges. Revenue diversification via sponsorships."
          />
          <RiskCard
            risk="Data Spoofing"
            desc="Users fabricating fitness data to win challenges."
            mitigation="Multi-source cross-validation. GPS verification. AIVM Proof-of-Intelligence consensus. Historical anomaly detection."
          />
          <RiskCard
            risk="Regulatory Uncertainty"
            desc="Stake-based challenges may face gambling classification in some jurisdictions."
            mitigation="Skill-based challenges (not chance). User-controlled outcomes. Legal review per jurisdiction. Configurable fee caps."
          />
        </div>
      </Section>

      {/* ── Team & Vision ─────────────────────────────────────────────────── */}
      <Section title="Vision" id="vision">
        <div className="bp-vision">
          <p className="bp-vision__text">
            We believe accountability should be <em>trustless</em>, rewards should be <em>fair</em>,
            and verification should be <em>autonomous</em>. LightChallenge is building the infrastructure
            layer where real-world achievement meets on-chain settlement.
          </p>
          <p className="bp-vision__text">
            Our goal is to become the default protocol for verified, stake-backed challenges —
            starting with fitness and gaming, expanding to education, productivity, and any domain
            where commitment can be measured and verified.
          </p>
        </div>
      </Section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="bp-cta">
        <h2 className="bp-cta__title">Ready to Explore?</h2>
        <p className="bp-cta__desc">
          See live challenges, join the community, or create your own.
        </p>
        <div className="bp-cta__buttons">
          <Link href="/explore" className="btn btn-primary btn-lg">
            Explore Challenges <ArrowRight size={16} />
          </Link>
          <Link href="/challenges/create" className="btn btn-outline btn-lg">
            Create a Challenge
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section className="bp-section" id={id}>
      <h2 className="bp-section__title">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="bp-metric">
      <div className="bp-metric__value">{value}</div>
      <div className="bp-metric__label">{label}</div>
      <div className="bp-metric__sub">{sub}</div>
    </div>
  );
}

function RevenueCard({ icon, title, desc, status }: { icon: React.ReactNode; title: string; desc: string; status: string }) {
  return (
    <div className="bp-card bp-card--compact">
      <div className="bp-card__header">
        <div className="bp-card__icon" style={{ background: "var(--lc-warm)" }}>{icon}</div>
        <span className={`bp-badge bp-badge--${status === "Active" ? "ok" : "planned"}`}>{status}</span>
      </div>
      <h3 className="bp-card__title">{title}</h3>
      <p className="bp-card__desc">{desc}</p>
    </div>
  );
}

function AdvantageCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bp-card">
      <div className="bp-card__icon" style={{ background: "var(--lc-accent)" }}>{icon}</div>
      <h3 className="bp-card__title">{title}</h3>
      <p className="bp-card__desc">{desc}</p>
    </div>
  );
}

function FlowStep({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="bp-flow__step">
      <div className="bp-flow__num">{num}</div>
      <div>
        <h3 className="bp-flow__title">{title}</h3>
        <p className="bp-flow__desc">{desc}</p>
      </div>
    </div>
  );
}

function TechCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bp-card">
      <h3 className="bp-card__title">{title}</h3>
      <ul className="bp-list bp-list--check">
        {items.map((item) => (
          <li key={item}><CheckCircle2 size={14} /> {item}</li>
        ))}
      </ul>
    </div>
  );
}

function PhaseCard({ phase, title, timeline, items, status }: { phase: string; title: string; timeline: string; items: string[]; status: string }) {
  return (
    <div className={`bp-phase bp-phase--${status}`}>
      <div className="bp-phase__header">
        <span className="bp-phase__label">{phase}</span>
        <span className="bp-phase__timeline">{timeline}</span>
      </div>
      <h3 className="bp-phase__title">{title}</h3>
      <ul className="bp-list bp-list--check">
        {items.map((item) => (
          <li key={item}><CheckCircle2 size={14} /> {item}</li>
        ))}
      </ul>
      {status === "current" && <div className="bp-phase__badge">Current Phase</div>}
    </div>
  );
}

function RiskCard({ risk, desc, mitigation }: { risk: string; desc: string; mitigation: string }) {
  return (
    <div className="bp-card">
      <h3 className="bp-card__title" style={{ color: "var(--lc-warning)" }}>{risk}</h3>
      <p className="bp-card__desc">{desc}</p>
      <div className="bp-card__mitigation">
        <strong>Mitigation:</strong> {mitigation}
      </div>
    </div>
  );
}
