import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageLoader, Spinner, useBusy } from "../components/Spinner";
import { SidebarLogo } from "../components/Brand";
import { DrawerToggle } from "../components/DrawerToggle";
import { TopbarMenu } from "../components/TopbarMenu";
import { registerThisDevice, verifyThisDevice, webauthnSupported } from "../lib/webauthn";

export default function Dashboard() {
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [authorizing, runAuth] = useBusy();
  const [authErr, setAuthErr] = useState("");
  const [otp, setOtp] = useState("");
  const [netDenied, setNetDenied] = useState(false);   // launch blocked by network policy (in-page)

  useEffect(() => {
    api.me().then(setMe).catch(() => nav("/"));
  }, []);

  function authorizeThisDevice() {
    setAuthErr("");
    return runAuth(async () => {
      try {
        // Auto-named from this device; confirmed with an authenticator code.
        await api.authorizeDevice(undefined, otp.trim());
        setMe(await api.me());
      } catch (e: any) { setAuthErr(e.message); }
    });
  }

  function runWebauthn(fn: () => Promise<any>) {
    setAuthErr("");
    return runAuth(async () => {
      try { await fn(); setMe(await api.me()); }
      catch (e: any) { setAuthErr(e?.message || "Device verification was cancelled or failed."); }
    });
  }

  if (!me) return <PageLoader />;

  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.displayName || me.username;
  const needsVerify = me.webauthnRequired && !me.deviceVerified;
  const deviceBlocked = !me.webauthnRequired && me.deviceRequired && !me.deviceAuthorized;

  const networkDenied = netDenied || new URLSearchParams(window.location.search).get("denied") === "network";

  return (
    <div className="shell">
      <div className="sidebar">
        <SidebarLogo logoUrl={me.tenantLogo} />
        <div className="nav-item active">My Apps</div>
        <div className="nav-item" onClick={() => nav("/profile")}>My Profile</div>
        {me.isAdmin && <div className="nav-item" onClick={() => nav("/admin")}>Admin Console</div>}
      </div>

      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <DrawerToggle />
            <div className="who">{me.tenantName} · {fullName}</div>
          </div>
          <TopbarMenu />
        </div>

        <div className="content">
          <h2 className="page-title">My Applications</h2>

          {networkDenied && (
            <div className="card" style={{ borderColor: "var(--danger)", width: "100%", marginBottom: 16, textAlign: "center" }}>
              <strong style={{ color: "var(--danger)", fontSize: 18 }}>Access denied — network not authorized.</strong>
            </div>
          )}

          {needsVerify ? (
            <div className="card" style={{ borderColor: "var(--danger)", maxWidth: 560 }}>
              <strong style={{ color: "var(--danger)" }}>Verify this device to continue.</strong>
              <p style={{ fontSize: 13 }}>
                For your security, applications can only be launched from a device you have
                registered. {me.hasPasskeys
                  ? "Confirm it's the same device using your fingerprint, face, or device PIN."
                  : "Register this device using your fingerprint, face, or device PIN."}
              </p>
              {!webauthnSupported() && (
                <div className="error">This browser doesn't support secure device verification.</div>
              )}
              {authErr && <div className="error">{authErr}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {me.hasPasskeys ? (
                  <>
                    <button className="primary" onClick={() => runWebauthn(verifyThisDevice)}
                      disabled={authorizing || !webauthnSupported()}>
                      {authorizing && <Spinner />}Verify this device
                    </button>
                    <button className="btn-sm" onClick={() => runWebauthn(registerThisDevice)}
                      disabled={authorizing || !webauthnSupported()}>
                      New device? Register it
                    </button>
                  </>
                ) : (
                  <button className="primary" onClick={() => runWebauthn(registerThisDevice)}
                    disabled={authorizing || !webauthnSupported()}>
                    {authorizing && <Spinner />}Register this device
                  </button>
                )}
              </div>
            </div>
          ) : deviceBlocked ? (
            <div className="card" style={{ borderColor: "var(--danger)", maxWidth: 560 }}>
              <strong style={{ color: "var(--danger)" }}>This device is not authorized.</strong>
              <p style={{ fontSize: 13 }}>
                Your account only allows access from authorized devices. To add this device,
                confirm with the 6-digit code from your authenticator app. It will be named
                automatically from your browser and OS.
              </p>
              {authErr && <div className="error">{authErr}</div>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input inputMode="numeric" maxLength={6} placeholder="6-digit code"
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  style={{ width: 120, letterSpacing: "4px", textAlign: "center" }} />
                <button className="primary" onClick={authorizeThisDevice}
                  disabled={authorizing || otp.length !== 6}>
                  {authorizing && <Spinner />}Authorize this device
                </button>
                <button className="btn-sm" onClick={() => nav("/profile")}>Manage devices</button>
              </div>
            </div>
          ) : (
            <div className="tiles">
              {me.applications.map((a: any) => (
                <a className="tile" key={a.name} href={a.launch_url}
                  target="_blank" rel="noopener noreferrer"
                  onClick={(e) => {
                    // Check network policy in THIS tab before opening anything.
                    if (a.network_allowed === false) {
                      e.preventDefault();
                      setNetDenied(true);
                      document.querySelector(".content")?.scrollTo?.({ top: 0 });
                    } else {
                      setNetDenied(false);
                    }
                  }}>
                  <div className="ic">
                    {a.icon_url ? (
                      <img src={a.icon_url} alt=""
                        onError={(e) => {
                          // image failed → fall back to the app's initials
                          const img = e.currentTarget;
                          img.style.display = "none";
                          const parent = img.parentElement;
                          if (parent && !parent.textContent?.trim())
                            parent.textContent = a.name.slice(0, 2).toUpperCase();
                        }} />
                    ) : a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <hr className="sep" />
                  <div className="name">{a.name}</div>
                </a>
              ))}
              {me.applications.length === 0 && <p>No applications assigned yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
