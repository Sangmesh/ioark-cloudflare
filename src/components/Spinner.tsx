import { useCallback, useState } from "react";

/** Inline spinner; inherits the surrounding text color (currentColor). */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`spinner ${className}`.trim()}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Full-width centered loader for page/section loads (replaces blank screens). */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size={30} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Tracks a busy flag around an async action — for buttons not driven by
 * react-hook-form's isSubmitting. Usage:
 *   const [busy, run] = useBusy();
 *   <button disabled={busy} onClick={() => run(doThing)}>{busy && <Spinner/>}…</button>
 */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try { return await fn(); } finally { setBusy(false); }
  }, []);
  return [busy, run];
}
