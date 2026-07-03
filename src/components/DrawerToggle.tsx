import { useEffect, useState } from "react";

const KEY = "drawer-closed";
const isMobile = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

/**
 * Hamburger that toggles the sidebar drawer. State is persisted and reflected as
 * a `drawer-closed` class on <body>, so CSS can collapse the sidebar on desktop
 * and slide it off-canvas (with a backdrop) on mobile. Default: open on desktop,
 * closed on mobile.
 */
export function DrawerToggle() {
  const [closed, setClosed] = useState(() => {
    // Mobile: always start closed (the overlay is transient per page, so it never
    // covers content after navigating). Desktop: remember the user's preference.
    if (isMobile()) return true;
    return localStorage.getItem(KEY) === "1";
  });

  useEffect(() => {
    document.body.classList.toggle("drawer-closed", closed);
    if (!isMobile()) localStorage.setItem(KEY, closed ? "1" : "0");
  }, [closed]);

  return (
    <>
      <button
        type="button"
        className="drawer-toggle"
        aria-label="Toggle menu"
        aria-expanded={!closed}
        title="Toggle menu"
        onClick={() => setClosed((c) => !c)}
      >
        <span /><span /><span />
      </button>
      {/* Mobile-only backdrop (CSS hides it on desktop); tap to close the drawer. */}
      {!closed && <div className="drawer-backdrop" onClick={() => setClosed(true)} />}
    </>
  );
}
