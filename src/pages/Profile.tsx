import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../lib/api";
import { Field } from "../components/Field";
import { PageLoader, Spinner, useBusy } from "../components/Spinner";
import { SidebarLogo } from "../components/Brand";
import { DrawerToggle } from "../components/DrawerToggle";
import { TopbarMenu } from "../components/TopbarMenu";
import { registerThisDevice, verifyThisDevice, webauthnSupported } from "../lib/webauthn";

const nameSchema = z.object({ name: z.string().max(60, "Name is too long").optional() });
const otpField = z.string().regex(/^\d{6}$/, "Enter the 6-digit authenticator code");
const authorizeSchema = z.object({ name: z.string().max(60, "Name is too long").optional(), otp: otpField });
const claimSchema = z.object({
  code: z.string().min(4, "Enter the code shown on the other device"),
  otp: otpField,
});
const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });
const pwSchema = z.object({
  current_password: z.string().min(1, "Enter your current password"),
  new_password: z.string().min(8, "Use at least 8 characters"),
  confirm: z.string().min(1, "Confirm your new password"),
}).refine((d) => d.new_password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
type NameForm = z.infer<typeof nameSchema>;
type AuthorizeForm = z.infer<typeof authorizeSchema>;
type ClaimForm = z.infer<typeof claimSchema>;
type MfaForm = z.infer<typeof mfaSchema>;
type PwForm = z.infer<typeof pwSchema>;

export default function Profile() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [me, setMe] = useState<any>(null);
  const [dev, setDev] = useState<any>(null);
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const [newCode, setNewCode] = useState<{ name: string; code: string } | null>(null);
  const [devErr, setDevErr] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState("");
  const [sessMsg, setSessMsg] = useState("");
  const [sessBusy, setSessBusy] = useState(false);
  const [passkeys, setPasskeys] = useState<any[] | null>(null);
  const [pkErr, setPkErr] = useState("");
  const [pkBusy, setPkBusy] = useState(false);

  const [enrolling, runEnroll] = useBusy();
  const [enfBusy, runEnf] = useBusy();

  const deviceBlocked = params.get("device") === "unauthorized";

  const authorizeForm = useForm<AuthorizeForm>({ resolver: zodResolver(authorizeSchema) });
  const registerForm = useForm<NameForm>({ resolver: zodResolver(nameSchema) });
  const claimForm = useForm<ClaimForm>({ resolver: zodResolver(claimSchema) });
  const mfaForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });
  const pwForm = useForm<PwForm>({ resolver: zodResolver(pwSchema) });

  function loadMe() { return api.me().then(setMe); }
  function loadDevices() { return api.devices().then(setDev); }
  function loadPasskeys() { return api.webauthnCredentials().then(setPasskeys); }

  useEffect(() => {
    loadMe().catch(() => nav("/"));
    loadDevices().catch(() => {});
    loadPasskeys().catch(() => {});
  }, []);

  async function onRegisterPasskey() {
    setPkErr(""); setPkBusy(true);
    try { await registerThisDevice(); await Promise.all([loadPasskeys(), loadMe()]); }
    catch (e: any) { setPkErr(e?.message || "Could not register this device."); }
    finally { setPkBusy(false); }
  }
  async function onVerifyPasskey() {
    setPkErr(""); setPkBusy(true);
    try { await verifyThisDevice(); await loadMe(); }
    catch (e: any) { setPkErr(e?.message || "Verification was cancelled or failed."); }
    finally { setPkBusy(false); }
  }
  async function revokePasskey(id: string) {
    setPkErr(""); setPkBusy(true);
    try { await api.deleteWebauthnCredential(id); await loadPasskeys(); }
    catch (e: any) { setPkErr(e?.message || "Could not remove device."); }
    finally { setPkBusy(false); }
  }

  function onEnroll() { return runEnroll(async () => { setMfaSetup(await api.mfaEnroll()); }); }
  async function onActivate(data: MfaForm) {
    await api.mfaActivate(data.code);
    setMfaSetup(null); mfaForm.reset(); loadMe();
  }

  async function refresh() { await Promise.all([loadDevices(), loadMe()]); }

  async function onChangePassword(data: PwForm) {
    setPwMsg("");
    try {
      await api.changePassword(data.current_password, data.new_password);
      pwForm.reset({ current_password: "", new_password: "", confirm: "" });
      setPwMsg("Password updated. Other sessions have been signed out.");
    } catch (e: any) { setPwMsg(e.message); }
  }

  async function onLogoutEverywhere() {
    setSessMsg(""); setSessBusy(true);
    try {
      const r = await api.logoutAll();
      setSessMsg(`Signed out of ${r.sessions_revoked} other session(s) and revoked ${r.refresh_tokens_revoked} app token(s).`);
    } catch (e: any) { setSessMsg(e.message); }
    finally { setSessBusy(false); }
  }

  async function onAuthorize(data: AuthorizeForm) {
    setDevErr("");
    try { await api.authorizeDevice(data.name?.trim() || undefined, data.otp); authorizeForm.reset(); await refresh(); }
    catch (e: any) { setDevErr(e.message); }
  }
  async function onRegister(data: NameForm) {
    setDevErr("");
    try {
      const d = await api.registerDevice(data.name?.trim() || undefined);
      setNewCode({ name: d.name, code: d.enrollCode });
      registerForm.reset(); await refresh();
    } catch (e: any) { setDevErr(e.message); }
  }
  async function onClaim(data: ClaimForm) {
    setDevErr("");
    try { await api.claimDevice(data.code.trim().toUpperCase(), data.otp); claimForm.reset(); await refresh(); }
    catch (e: any) { setDevErr(e.message); }
  }
  async function revoke(id: string) {
    setDevErr(""); setRevokingId(id);
    try { await api.revokeDevice(id); await refresh(); }
    catch (e: any) { setDevErr(e.message); }
    finally { setRevokingId(null); }
  }
  function toggleEnforcement(enabled: boolean) {
    setDevErr("");
    return runEnf(async () => {
      try { await api.setDeviceEnforcement(enabled); await refresh(); }
      catch (e: any) { setDevErr(e.message); }
    });
  }

  if (!me) return <PageLoader />;

  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.displayName || me.username;

  return (
    <div className="shell">
      <div className="sidebar">
        <SidebarLogo logoUrl={me.tenantLogo} />
        <div className="nav-item" onClick={() => nav("/app")}>My Apps</div>
        <div className="nav-item active">My Profile</div>
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
          <h2 className="page-title">My Profile</h2>

          {deviceBlocked && (
            <div className="card" style={{ borderColor: "var(--danger)", maxWidth: 760 }}>
              <strong style={{ color: "var(--danger)" }}>This device is not authorized.</strong>
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                Access is restricted to authorized devices. Authorize this device below to continue.
              </p>
            </div>
          )}

          {/* Employee details */}
          <div className="card" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>Employee details</h3>
            <table>
              <tbody>
                <tr><th>First name</th><td>{me.firstName || "—"}</td></tr>
                <tr><th>Last name</th><td>{me.lastName || "—"}</td></tr>
                <tr><th>Full name</th><td>{fullName}</td></tr>
                <tr><th>Username</th><td>{me.username}</td></tr>
                <tr><th>Email</th><td>{me.email}</td></tr>
                <tr><th>Employee ID</th><td>{me.employeeId || "—"}</td></tr>
                <tr><th>Organization</th><td>{me.tenantName}</td></tr>
                <tr><th>Employment status</th><td><span className={"badge " + (me.status === "ACTIVE" ? "active" : "left")}>{me.status === "ACTIVE" ? "Active" : me.status === "LEFT" ? "Left" : me.status}</span></td></tr>
                <tr><th>Groups</th><td>{me.groups.length ? me.groups.map((g: string) => <span className="chip" key={g}>{g}</span>) : "—"}</td></tr>
                <tr><th>Role</th><td>{me.isSuperAdmin ? "Super Admin" : me.isAdmin ? "Tenant Admin" : "Member"}</td></tr>
              </tbody>
            </table>
          </div>

          {/* MFA */}
          <div className="card" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>Multi-factor authentication</h3>
            <p>Status:{" "}
              <span className={"badge " + (me.mfa === "Enabled" ? "active" : "suspended")}>{me.mfa}</span>
            </p>
            {me.mfa !== "Enabled" && !mfaSetup && (
              <button className="btn-sm" onClick={onEnroll} disabled={enrolling}>
                {enrolling && <Spinner />}Set up MFA
              </button>
            )}
            {me.mfa === "Enabled" && !mfaSetup && (
              <>
                <p style={{ fontSize: 13 }}>
                  Got a new phone or reinstalled your authenticator app? Generate a fresh QR
                  code and scan it on the new device — your previous authenticator stops working
                  once you activate the new one. (Lost the device entirely? Ask your administrator
                  to reset MFA for you.)
                </p>
                <button className="btn-sm" onClick={onEnroll} disabled={enrolling}>
                  {enrolling && <Spinner />}Change authenticator (new device)
                </button>
              </>
            )}
            {mfaSetup && (
              <form onSubmit={mfaForm.handleSubmit(onActivate)} noValidate>
                <p style={{ fontSize: 13 }}>Scan in your authenticator, or enter the key:</p>
                <img className="qr" alt="qr"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaSetup.otpauth_url)}`} />
                <p className="mono">{mfaSetup.secret}</p>
                <Field label="6-digit code" error={mfaForm.formState.errors.code?.message}>
                  <input inputMode="numeric" maxLength={6} aria-invalid={!!mfaForm.formState.errors.code}
                    {...mfaForm.register("code")} />
                </Field>
                <button className="btn-sm" style={{ marginTop: 10 }} disabled={mfaForm.formState.isSubmitting}>
                  {mfaForm.formState.isSubmitting && <Spinner />}Activate
                </button>
              </form>
            )}
          </div>

          {/* Change password */}
          <div className="card" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>Change password</h3>
            <form onSubmit={pwForm.handleSubmit(onChangePassword)} noValidate>
              <Field label="Current password" error={pwForm.formState.errors.current_password?.message}>
                <input type="password" autoComplete="current-password"
                  aria-invalid={!!pwForm.formState.errors.current_password}
                  {...pwForm.register("current_password")} />
              </Field>
              <div className="row">
                <div><Field label="New password" error={pwForm.formState.errors.new_password?.message}>
                  <input type="password" autoComplete="new-password"
                    aria-invalid={!!pwForm.formState.errors.new_password}
                    {...pwForm.register("new_password")} />
                </Field></div>
                <div><Field label="Confirm new password" error={pwForm.formState.errors.confirm?.message}>
                  <input type="password" autoComplete="new-password"
                    aria-invalid={!!pwForm.formState.errors.confirm}
                    {...pwForm.register("confirm")} />
                </Field></div>
              </div>
              <button className="btn-sm" style={{ marginTop: 12 }} disabled={pwForm.formState.isSubmitting}>
                {pwForm.formState.isSubmitting && <Spinner />}Update password
              </button>
              {pwMsg && <span style={{ marginLeft: 12, fontSize: 13 }}>{pwMsg}</span>}
            </form>
          </div>

          {/* Active sessions */}
          <div className="card" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>Active sessions</h3>
            <p style={{ fontSize: 13 }}>
              Lost a device, or think someone else is signed in? Sign out of every other
              browser and revoke all app tokens. This session stays signed in.
            </p>
            <button className="btn-sm" onClick={onLogoutEverywhere} disabled={sessBusy}>
              {sessBusy && <Spinner />}Log out everywhere else
            </button>
            {sessMsg && <span style={{ marginLeft: 12, fontSize: 13 }}>{sessMsg}</span>}
          </div>

          {/* Passkey / strict device verification */}
          {me.webauthnRequired && (
            <div className="card" style={{ maxWidth: 760 }}>
              <h3 style={{ marginTop: 0 }}>Device verification (passkey)</h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
                Apps can only be launched from a registered device. Each device is bound with a
                passkey held in its secure hardware (fingerprint, face, or device PIN) — it proves
                the same physical device and cannot be copied.
              </p>
              {!webauthnSupported() && (
                <div className="error">This browser doesn't support secure device verification.</div>
              )}
              {pkErr && <div className="error">{pkErr}</div>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <button className="btn-sm" onClick={onRegisterPasskey}
                  disabled={pkBusy || !webauthnSupported()}>
                  {pkBusy && <Spinner />}Register this device
                </button>
                {(passkeys?.length ?? 0) > 0 && (
                  <button className="btn-sm" onClick={onVerifyPasskey}
                    disabled={pkBusy || !webauthnSupported()}>
                    Verify this device
                  </button>
                )}
              </div>

              {passkeys === null ? (
                <div className="section-loader"><Spinner /> Loading…</div>
              ) : (
                <table style={{ marginTop: 16 }}>
                  <thead><tr><th>Registered device</th><th>Added</th><th>Last used</th><th></th></tr></thead>
                  <tbody>
                    {passkeys.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td>{new Date(p.lastUsedAt).toLocaleDateString()}</td>
                        <td>
                          <button className="btn-sm" onClick={() => revokePasskey(p.id)} disabled={pkBusy}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {passkeys.length === 0 && (
                      <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No registered devices yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Devices */}
          <div className="card" style={{ maxWidth: 760 }}>
            <h3 style={{ marginTop: 0 }}>Authorized devices</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
              Restrict access to devices you have authorized. Authorized devices can launch apps and use
              the console; others are blocked.
            </p>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
              <input type="checkbox" style={{ width: "auto" }} disabled={enfBusy || !!dev?.locked}
                checked={!!dev?.enforcement}
                onChange={(e) => toggleEnforcement(e.target.checked)} />
              Allow access only from authorized devices {enfBusy && <Spinner />}
            </label>
            {dev?.locked && (
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
                Required by your organization — applications can be launched only from devices
                you have authorized here.
              </p>
            )}

            {devErr && <div className="error">{devErr}</div>}

            {/* Authorize the current browser — auto-named, confirmed with an OTP */}
            <form onSubmit={authorizeForm.handleSubmit(onAuthorize)} noValidate style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, margin: "0 0 8px" }}>
                Confirm with the 6-digit code from your authenticator app to authorize this device.
                It is named automatically from your browser & OS.
              </p>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <Field label="Authenticator code" error={authorizeForm.formState.errors.otp?.message}>
                    <input inputMode="numeric" maxLength={6} placeholder="6-digit code"
                      style={{ letterSpacing: "6px", textAlign: "center" }}
                      aria-invalid={!!authorizeForm.formState.errors.otp}
                      {...authorizeForm.register("otp")} />
                  </Field>
                </div>
                <div style={{ flex: 2 }}>
                  <Field label="Device name (optional)" error={authorizeForm.formState.errors.name?.message}>
                    <input placeholder="Optional — e.g. Work laptop"
                      aria-invalid={!!authorizeForm.formState.errors.name}
                      {...authorizeForm.register("name")} />
                  </Field>
                </div>
              </div>
              <button className="btn-sm" disabled={authorizeForm.formState.isSubmitting}>
                {authorizeForm.formState.isSubmitting && <Spinner />}
                {dev?.currentRegistered ? "Re-authorize this device" : "Authorize this device"}
              </button>
            </form>

            {/* Add another device: the new device names itself when it joins */}
            <form onSubmit={registerForm.handleSubmit(onRegister)} noValidate
              className="row" style={{ marginTop: 6, alignItems: "flex-start" }}>
              <div style={{ flex: 2 }}>
                <Field label="Add a mobile or other device (it names itself when it joins)"
                  error={registerForm.formState.errors.name?.message}>
                  <input placeholder="Optional custom name" aria-invalid={!!registerForm.formState.errors.name}
                    {...registerForm.register("name")} />
                </Field>
              </div>
              <button className="btn-sm" style={{ marginTop: 30 }} disabled={registerForm.formState.isSubmitting}>
                {registerForm.formState.isSubmitting && <Spinner />}Generate QR
              </button>
            </form>

            {newCode && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 13, margin: "0 0 8px" }}>
                  On <strong>{newCode.name}</strong>: scan this QR code with the device's camera,
                  or open ioark there, sign in, and enter the code.
                </p>
                <img className="qr" alt="Device enrollment QR code"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`${window.location.origin}/enroll?code=${newCode.code}`)}`} />
                <div style={{ marginTop: 8 }}><span className="code-pill">{newCode.code}</span></div>
              </div>
            )}

            {/* Claim a registered device from THIS browser */}
            <form onSubmit={claimForm.handleSubmit(onClaim)} noValidate
              className="row" style={{ marginTop: 16, alignItems: "flex-start" }}>
              <div style={{ flex: 2 }}>
                <Field label="Authorize this device with a code"
                  error={claimForm.formState.errors.code?.message}
                  hint="Use a code generated on another device you've already authorized.">
                  <input placeholder="e.g. HT5SDAPP" style={{ textTransform: "uppercase" }}
                    aria-invalid={!!claimForm.formState.errors.code} {...claimForm.register("code")} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Authenticator code" error={claimForm.formState.errors.otp?.message}>
                  <input inputMode="numeric" maxLength={6} placeholder="6-digit code"
                    style={{ letterSpacing: "6px", textAlign: "center" }}
                    aria-invalid={!!claimForm.formState.errors.otp} {...claimForm.register("otp")} />
                </Field>
              </div>
              <button className="btn-sm" style={{ marginTop: 30 }} disabled={claimForm.formState.isSubmitting}>
                {claimForm.formState.isSubmitting && <Spinner />}Claim device
              </button>
            </form>

            {!dev ? (
              <div className="section-loader"><Spinner /> Loading devices…</div>
            ) : (
              <table style={{ marginTop: 18 }}>
                <thead>
                  <tr><th>Device</th><th>Type</th><th>Status</th><th>Added</th><th></th></tr>
                </thead>
                <tbody>
                  {dev.devices.map((d: any) => (
                    <tr key={d.id}>
                      <td>
                        {d.name} {d.current && <span className="badge mfa">This device</span>}
                        {d.status === "pending" && d.enrollCode && (
                          <div style={{ marginTop: 4 }}><span className="code-pill">{d.enrollCode}</span></div>
                        )}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{d.deviceType || "—"}</td>
                      <td>
                        <span className={"badge " + (d.status === "authorized" ? "active" : "pending")}>
                          {d.status === "authorized" ? "Authorized" : "Pending"}
                        </span>
                      </td>
                      <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="btn-sm" onClick={() => revoke(d.id)} disabled={revokingId === d.id}>
                          {revokingId === d.id && <Spinner />}Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dev.devices.length === 0 && (
                    <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No devices yet.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
