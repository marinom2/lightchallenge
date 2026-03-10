"use client";

import * as React from "react";
import { addHours, addMinutes, isAfter, isBefore } from "date-fns";
import DateTimePicker from "./DateTimePicker";
import { SAFE_APPROVAL_WINDOW_SEC, SAFE_MIN_LEAD_SEC } from "../../lib/constants";

export type TimelineValue = {
  joinCloses?: Date | null;
  starts?: Date | null;
  ends?: Date | null;
  proofDeadline?: Date | null;
};

type Props = {
  value: TimelineValue;
  onChange: (t: TimelineValue) => void;
  onDone?: () => void;
  embedded?: boolean;
};

type NormalizedTimelineValue = {
  joinCloses: Date;
  starts: Date;
  ends: Date;
  proofDeadline: Date;
};

const APPROVAL_WINDOW_MIN = SAFE_APPROVAL_WINDOW_SEC / 60;
const MIN_LEAD_MIN = SAFE_MIN_LEAD_SEC / 60;
const LEAD_BUFFER_MIN = 5;
const DEFAULT_DURATION_HOURS = 3;
const DEFAULT_PROOF_GRACE_HOURS = 1;

function roundUpToNearest(d: Date, minutes = 5) {
  const ms = minutes * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

function earliestJoin(now = new Date()) {
  return roundUpToNearest(addMinutes(now, LEAD_BUFFER_MIN), 5);
}

function earliestStart(now = new Date()) {
  return roundUpToNearest(addMinutes(now, MIN_LEAD_MIN + LEAD_BUFFER_MIN), 5);
}

function normalize(v: TimelineValue): NormalizedTimelineValue {
  const now = new Date();

  let starts = v.starts ?? earliestStart(now);
  let joinCloses =
    v.joinCloses ?? roundUpToNearest(addMinutes(starts, -APPROVAL_WINDOW_MIN), 5);
  let ends = v.ends ?? addHours(starts, DEFAULT_DURATION_HOURS);
  let proofDeadline = v.proofDeadline ?? addHours(ends, DEFAULT_PROOF_GRACE_HOURS);

  const minJoin = earliestJoin(now);
  const minStart = earliestStart(now);

  if (isBefore(starts, minStart)) starts = minStart;
  if (isBefore(joinCloses, minJoin)) joinCloses = minJoin;

  const minStartFromJoin = roundUpToNearest(
    addMinutes(joinCloses, APPROVAL_WINDOW_MIN),
    5
  );
  if (isBefore(starts, minStartFromJoin)) starts = minStartFromJoin;

  const maxJoinFromStart = roundUpToNearest(
    addMinutes(starts, -APPROVAL_WINDOW_MIN),
    5
  );
  if (isAfter(joinCloses, maxJoinFromStart)) joinCloses = maxJoinFromStart;

  if (!isAfter(ends, starts)) ends = addHours(starts, DEFAULT_DURATION_HOURS);
  if (isBefore(proofDeadline, ends)) {
    proofDeadline = addHours(ends, DEFAULT_PROOF_GRACE_HOURS);
  }

  return { joinCloses, starts, ends, proofDeadline };
}

export default function TimelineWheel({
  value,
  onChange,
  onDone,
  embedded = false,
}: Props) {
  const [local, setLocal] = React.useState<NormalizedTimelineValue>(() => normalize(value));

  React.useEffect(() => {
    setLocal(normalize(value));
  }, [value]);

  const commit = React.useCallback(
    (next: Partial<TimelineValue>) => {
      const merged = normalize({ ...local, ...next });
      setLocal(merged);
      onChange(merged);
    },
    [local, onChange]
  );

  const { joinCloses, starts, ends, proofDeadline } = local;

  const now = new Date();
  const joinMin = earliestJoin(now);
  const startMinFromNow = earliestStart(now);
  const startMinFromJoin = roundUpToNearest(addMinutes(joinCloses, APPROVAL_WINDOW_MIN), 5);
  const startMin =
    startMinFromNow.getTime() > startMinFromJoin.getTime()
      ? startMinFromNow
      : startMinFromJoin;

  const endMin = addMinutes(starts, 1);
  const proofMin = ends;

  const body = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="timeline__card">
        <div className="mb-2 text-sm font-medium">Join closes</div>
        <DateTimePicker
          value={joinCloses}
          onChange={(date) => commit({ joinCloses: date })}
          min={joinMin}
          hint="Participants must join before the challenge starts."
        />
      </div>

      <div className="timeline__card">
        <div className="mb-2 text-sm font-medium">Starts</div>
        <DateTimePicker
          value={starts}
          onChange={(date) => commit({ starts: date })}
          min={startMin}
          hint="Must stay at least 1 hour after join closes and 2 hours from now."
        />
      </div>

      <div className="timeline__card">
        <div className="mb-2 text-sm font-medium">Ends</div>
        <DateTimePicker
          value={ends}
          onChange={(date) => commit({ ends: date })}
          min={endMin}
          hint="Challenge end must be after start."
        />
      </div>

      <div className="timeline__card">
        <div className="mb-2 text-sm font-medium">Proof deadline</div>
        <DateTimePicker
          value={proofDeadline}
          onChange={(date) => commit({ proofDeadline: date })}
          min={proofMin}
          hint="Must be on or after the end time."
        />
      </div>

      <div className="sm:col-span-2 timeline__note">
        These values are automatically aligned to the earliest contract-safe window. You can still
        adjust them, and the schedule will stay valid.
      </div>

      {onDone ? (
        <div className="sm:col-span-2 flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      ) : null}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="timeline" aria-labelledby="timeline-title">
      <div className="subpanel__head">
        <div className="subpanel__title">
          <div className="subpanel__icon" aria-hidden>
            🕒
          </div>
          <div>
            <h3 id="timeline-title" className="h2">
              Schedule
            </h3>
            <p className="text-sm text-(--text-muted)">
              Earliest valid times are prefilled automatically. You can still fine-tune them.
            </p>
          </div>
        </div>
      </div>

      <div className="subpanel__body">{body}</div>
    </section>
  );
}