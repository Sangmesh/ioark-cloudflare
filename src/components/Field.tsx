import React from "react";

/** Label + input slot + inline validation error. Pair the input's
 *  `aria-invalid={!!error}` so it picks up the invalid styling. */
export function Field({
  label, error, children, hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
