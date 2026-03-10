"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  value: Date | null;
  onChange: (value: Date) => void;
  min?: Date | null;
  hint?: string;
};

function toSafeDate(value: Date | null | undefined, fallback = new Date()) {
  return value && !Number.isNaN(value.getTime()) ? value : fallback;
}

function clampToMin(date: Date, min?: Date | null) {
  if (!min) return date;
  return date.getTime() < min.getTime() ? min : date;
}

function buildCalendarDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const days: Date[] = [];
  const cur = new Date(start);

  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}

function parseTimeParts(date: Date) {
  return {
    hour: String(date.getHours()).padStart(2, "0"),
    minute: String(date.getMinutes()).padStart(2, "0"),
  };
}

function startOfDaySafe(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDaySafe(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export default function DateTimePicker({
  value,
  onChange,
  min,
  hint,
}: Props) {
  const safeValue = toSafeDate(value);
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(startOfMonth(safeValue));
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties>({});

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setMonth(startOfMonth(safeValue));
  }, [safeValue]);

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 340), 400);
    const left = Math.max(20, Math.min(rect.left, window.innerWidth - width - 20));

    let top = rect.bottom + 12;
    const estimatedHeight = 460;
    if (top + estimatedHeight > window.innerHeight - 20) {
      top = Math.max(20, rect.top - estimatedHeight - 12);
    }

    setPopoverStyle({
      position: "fixed",
      top,
      left,
      width,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;

    updatePosition();

    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("dtp-open");

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      document.body.style.overflow = "";
      document.documentElement.classList.remove("dtp-open");
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const days = React.useMemo(() => buildCalendarDays(month), [month]);
  const { hour, minute } = parseTimeParts(safeValue);

  const applyDay = (day: Date) => {
    const next = new Date(safeValue);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onChange(clampToMin(next, min));
  };

  const applyTime = (nextHour: string, nextMinute: string) => {
    const next = new Date(safeValue);
    next.setHours(Number(nextHour), Number(nextMinute), 0, 0);
    onChange(clampToMin(next, min));
  };

  const overlay =
    open && mounted
      ? createPortal(
          <>
            <div className="dtp-backdrop" />

            <div
              ref={popoverRef}
              className="dtp__popover dtp-popover"
              style={popoverStyle}
            >
              <div className="dtp__popover-inner dtp-popover__inner">
                <div className="dtp-popover__header">
                  <div className="dtp-popover__title">
                    {format(month, "MMMM yyyy")}
                  </div>

                  <div className="dtp-popover__actions">
                    <button
                      type="button"
                      className="dtp-popover__nav"
                      onClick={() => setMonth((m) => subMonths(m, 1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <button
                      type="button"
                      className="dtp-popover__nav"
                      onClick={() => setMonth((m) => addMonths(m, 1))}
                      aria-label="Next month"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="dtp__calendar">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <div key={`${d}-${i}`} className="dtp__weekday">
                      {d}
                    </div>
                  ))}

                  {days.map((day) => {
                    const selected = isSameDay(day, safeValue);
                    const today = isSameDay(day, new Date());
                    const muted = !isSameMonth(day, month);
                    const disabled =
                      !!min &&
                      endOfDaySafe(day).getTime() < startOfDaySafe(min).getTime();

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        className={[
                          "dtp__day",
                          selected ? "dtp__day--selected" : "",
                          today ? "dtp__day--today" : "",
                          muted ? "dtp__day--muted" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => !disabled && applyDay(day)}
                        disabled={disabled}
                        aria-pressed={selected}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="dtp__bar">
                  <div className="dtp__field">
                    <label>Hour</label>
                    <select
                      className="dtp__select"
                      value={hour}
                      onChange={(e) => applyTime(e.target.value, minute)}
                    >
                      {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="dtp__field">
                    <label>Minute</label>
                    <select
                      className="dtp__select"
                      value={minute}
                      onChange={(e) => applyTime(hour, e.target.value)}
                    >
                      {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="dtp__footer">
                  <div className="dtp__hint">
                    {hint || "Pick a date and time. Values stay contract-safe."}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div className="dtp" data-open={open ? "true" : "false"}>
        <button
          ref={triggerRef}
          type="button"
          className="dtp__trigger"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="dtp__value">
            {format(safeValue, "dd.MM.yyyy, HH:mm")}
          </span>
          <CalendarDays size={18} className="dtp__icon" />
        </button>
      </div>

      {overlay}
    </>
  );
}