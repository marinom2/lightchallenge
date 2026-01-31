"use client";
import * as React from "react";

export function Switch({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`switch ${enabled ? "is-on" : ""}`}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
    />
  );
}