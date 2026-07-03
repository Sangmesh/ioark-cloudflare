import ioarkLogo from "../ioark.png";

// Default product logo, used when there's no org-specific logo (system mode
// or an org that hasn't set one).
export { ioarkLogo };

/** Sidebar header: shows the org logo if present, otherwise the ioark logo. */
export function SidebarLogo({ logoUrl }: { logoUrl?: string | null }) {
  return (
    <div className="logo-row">
      <img className="sidebar-logo" src={logoUrl || ioarkLogo} alt="ioark" />
    </div>
  );
}
