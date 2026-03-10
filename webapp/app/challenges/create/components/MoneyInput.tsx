// webapp/app/challenges/create/components/MoneyInput.tsx
"use client";

import * as React from "react";

/**
 * MoneyInput
 * - Locale-safe numeric entry (clamps, single decimal, comma→dot)
 * - Uses global tokens only (no stray hex)
 * - Optional balance + Max button
 * - Accessible label/help/error
 */

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;

  symbol?: string; // e.g. "LCAI" or "USDC"
  placeholder?: string; // default "0.00"
  disabled?: boolean;

  balanceFormatted?: string; // e.g. "12.3456"
  onClickMax?: () => void; // sets max value if provided

  id?: string; // for a11y (label htmlFor)
  helpText?: string; // small helper under the input
  errorText?: string | null; // validation error message
};

function clampDecimal(raw: string) {
  // allow digits and dot, collapse multiple dots, trim leading zeros
  const cleaned = raw.replace(/[^\d.]/g, "");
  const once = cleaned.replace(/(\..*)\./g, "$1");
  return once.replace(/^0+(?=\d)/, "");
}

export default function MoneyInput({
  label,
  value,
  onChange,
  symbol = "",
  placeholder = "0.00",
  disabled = false,
  balanceFormatted,
  onClickMax,
  id,
  helpText,
  errorText,
}: Props) {
  const inputId = id ?? React.useId();
  const hasError = Boolean(errorText);

  return (
    <div className="field">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="label">
          {label}
        </label>

        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {typeof balanceFormatted === "string" && balanceFormatted.length > 0 && (
            <span className="font-mono">
              Bal: {balanceFormatted}
              {symbol ? ` ${symbol}` : ""}
            </span>
          )}

          {onClickMax && (
            <button
              type="button"
              className="chip"
              onClick={onClickMax}
              disabled={disabled}
              aria-label="Use maximum available amount"
            >
              Max
            </button>
          )}
        </div>
      </div>

      {/* Input + suffix chip */}
      <div className="cluster">
        <input
          id={inputId}
          className="input font-mono"
          inputMode="decimal"
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(clampDecimal(e.target.value.replace(",", ".")))}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined}
          style={{
            boxShadow: hasError ? `0 0 0 1px var(--error)` : undefined,
          }}
        />
        {symbol ? <span className="chip select-none">{symbol}</span> : null}
      </div>

      {/* Help / Error */}
      {hasError ? (
        <p id={`${inputId}-error`} className="help" style={{ color: "var(--error)" }}>
          {errorText}
        </p>
      ) : helpText ? (
        <p id={`${inputId}-help`} className="help">
          {helpText}
        </p>
      ) : null}
    </div>
  );
}