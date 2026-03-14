"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Coins,
  BrainCircuit,
  Layers,
  Link2,
  SlidersHorizontal,
  Sparkles,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassIcon } from "@/app/components/ui/GlassIcon";
import UnderlineTabs, { UnderlineTab } from "@/app/components/ui/UnderlineTabs";
import type { TabKey, ApiOut } from "../lib/types";
import { groupByDate, timeAgo, short } from "../lib/formatters";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";

export function CollapsiblePanel({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="panel">
      <button
        type="button"
        className="panel-header w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2 w-full">
          {Icon ? (
            <span className="subpanel__icon">
              <GlassIcon icon={Icon} size={18} />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            {subtitle ? <div className="text-xs text-(--text-muted) mt-0.5">{subtitle}</div> : null}
          </div>

          <div className="ml-auto pt-0.5 text-(--text-muted)">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {open ? <div className="panel-body">{children}</div> : null}
    </div>
  );
}

export function PhaseStory(props: {
  statusLabel?: string;
  startTs: number | null;
  endTs: number | null;
  joinCloseTs: number | null;
  hasJoined: boolean;
  proofRequired: boolean;
  canVote: boolean;
  isAdmin: boolean;
  canFinalize: boolean;
  claimablesCount: number;
}) {
  const { statusLabel, startTs, endTs, joinCloseTs, hasJoined, proofRequired, canVote, isAdmin, canFinalize, claimablesCount } =
    props;

  const now = Math.floor(Date.now() / 1000);

  const joinOpen = !!joinCloseTs && now < joinCloseTs && (!!startTs ? now < startTs : true);
  const preStart = !!startTs && now < startTs;
  const active = !!startTs && !!endTs && now >= startTs && now < endTs;
  const ended = !!endTs && now >= endTs;

  const steps: Array<{ title: string; desc: string; done: boolean }> = [
    {
      title: "Join",
      desc: joinOpen ? "Join is open right now." : preStart ? "Join may be closed." : "Join phase ended.",
      done: hasJoined || (!joinOpen && !preStart),
    },
    {
      title: "Run",
      desc: active ? "Challenge is running." : preStart ? "Not started yet." : ended ? "Challenge ended." : "—",
      done: ended || active,
    },
    {
      title: "Verify",
      desc: proofRequired ? "Proof may be required for verification." : "Validators may still review outcomes.",
      done: statusLabel === "Completed" || statusLabel === "Finalizing",
    },
    {
      title: "Claim",
      desc: claimablesCount > 0 ? "Your reward is ready." : "Claims are available after finalization.",
      done: claimablesCount === 0 ? statusLabel === "Completed" : true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="subpanel">
        <div className="subpanel__body">
          <div className="flex items-start gap-2">
            <span className="subpanel__icon">
              <GlassIcon icon={Sparkles} size={18} />
            </span>

            <div className="min-w-0">
              <div className="text-sm font-semibold">Your path</div>
              <div className="text-xs text-(--text-muted) mt-0.5">Your journey through this challenge, step by step.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {steps.map((s) => (
              <div key={s.title} className="metric">
                <div className="flex items-center gap-2">
                  <span className="metric-ic" aria-hidden>
                    <GlassIcon icon={s.done ? CheckCircle2 : Info} size={18} />
                  </span>
                  <div className="text-xs uppercase tracking-wider text-(--text-muted)">{s.title}</div>
                </div>
                <div className="mt-1 text-sm font-semibold">{s.desc}</div>
              </div>
            ))}
          </div>

          {canVote ? <div className="mt-3 text-xs text-(--text-muted)">Validators: voting is available now.</div> : null}

          {isAdmin && canFinalize ? (
            <div className="mt-2 text-xs text-(--text-muted)">Admin: finalization is available for this challenge.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActionRow(props: {
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-col sm:flex-row gap-2">
      <button type="button" className="btn btn-outline flex-1" onClick={props.onPrimary} disabled={props.disabled}>
        {props.primaryLabel}
      </button>

      <button
        type="button"
        className="btn btn-outline btn-ice flex-1"
        onClick={props.onSecondary}
        disabled={props.disabled}
      >
        {props.secondaryLabel}
      </button>
    </div>
  );
}

export function TabBar(props: { value: TabKey; onChange: (k: TabKey) => void }) {
  const tabs: UnderlineTab[] = [
    { key: "details", label: "Details", icon: <LayoutDashboard size={16} /> },
    { key: "economics", label: "Economics", icon: <Coins size={16} /> },
    { key: "model", label: "Model", icon: <BrainCircuit size={16} /> },
    { key: "onchain", label: "On-Chain", icon: <Layers size={16} /> },
    { key: "links", label: "Links", icon: <Link2 size={16} /> },
    { key: "params", label: "Params", icon: <SlidersHorizontal size={16} /> },
  ];

  return (
    <UnderlineTabs
      tabs={tabs}
      activeKey={props.value}
      onChange={(k) => props.onChange(k as TabKey)}
      ariaLabel="Challenge tabs"
      indicatorInsetPx={10}
    />
  );
}

export function DLGrid({ rows }: { rows: Array<[string, string | React.JSX.Element]> }) {
  return (
    <dl className="ov-grid">
      {rows.map(([dt, dd]) => (
        <div className="ov-item" key={dt}>
          <dt>{dt}</dt>
          <dd>{dd}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{children}</div>
    </div>
  );
}

export function SectionPanel({
  title,
  help,
  icon: Icon,
  children,
}: {
  title: string;
  help?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="subpanel">
      <div className="subpanel__head">
        <div className="subpanel__title">
          <span className="subpanel__icon">
            <GlassIcon icon={Icon} size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            {help ? <div className="text-xs text-(--text-muted) mt-0.5">{help}</div> : null}
          </div>
        </div>
      </div>

      <div className="subpanel__body">{children}</div>
    </div>
  );
}

export function ChainTimeline({ items }: { items: ApiOut["timeline"] }) {
  const days = groupByDate(items);

  const sameText = (a?: string, b?: string) => {
    const x = (a ?? "").trim().toLowerCase();
    const y = (b ?? "").trim().toLowerCase();
    return !!x && !!y && x === y;
  };

  return (
    <div className="timeline relative">
      <div aria-hidden className="timeline__spine" />

      {days.map(({ date, arr }) => (
        <div key={date} className="timeline__day space-y-3">
          <div className="timeline__date">{date}</div>

          <div className="timeline__list">
            {arr.map((t) => {
              const hideLabel = sameText(t.name, t.label);

              return (
                <div key={`${t.tx}-${t.block}`} className="timeline__row">
                  <span aria-hidden className="timeline__node" />

                  <div className="timeline__card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip chip--soft py-1!">{t.name}</span>
                      {!hideLabel ? <div className="font-medium text-sm sm:text-base">{t.label}</div> : null}
                    </div>

                    <div className="timeline__meta mt-2 text-sm">
                      {t.timestamp ? (
                        <>
                          <span className="tabular-nums">{new Date(t.timestamp * 1000).toLocaleTimeString()}</span>
                          <span> • </span>
                          <span>{timeAgo(t.timestamp * 1000)}</span>
                          <span> • </span>
                        </>
                      ) : null}

                      <a className="link" target="_blank" rel="noreferrer" href={blockUrl(t.block)}>
                        Block #{t.block}
                      </a>

                      <span> • </span>

                      <a className="link" target="_blank" rel="noreferrer" href={txUrl(t.tx)}>
                        {t.tx.slice(0, 10)}…
                      </a>

                      {t.who ? (
                        <>
                          <span> • </span>
                          <a className="link" target="_blank" rel="noreferrer" href={addressUrl(t.who)}>
                            {short(t.who)}
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
