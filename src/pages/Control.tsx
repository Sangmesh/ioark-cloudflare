import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../lib/api";
import { Field } from "../components/Field";
import { PageLoader, Spinner } from "../components/Spinner";
import { SidebarLogo } from "../components/Brand";
import { DrawerToggle } from "../components/DrawerToggle";
import { TopbarMenu } from "../components/TopbarMenu";

const tenantSchema = z.object({
  slug: z.string().min(2, "At least 2 characters")
    .regex(/^[a-z0-9-]+$/i, "Use letters, numbers and hyphens only"),
  name: z.string().min(1, "Display name is required"),
  admin_email: z.string().min(1, "Admin email is required").email("Enter a valid email address"),
  admin_password: z.string().min(10, "Use at least 10 characters"),
  logo_url: z.string().url("Enter a valid URL (https://… or data:…)").optional().or(z.literal("")),
});
type TenantForm = z.infer<typeof tenantSchema>;

export default function Control() {
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [locked, setLocked] = useState<any[]>([]);
  const [created, setCreated] = useState<any>(null);
  const [rotated, setRotated] = useState<any>(null);   // newly rotated SCIM token (shown once)
  const [err, setErr] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<TenantForm>({ resolver: zodResolver(tenantSchema) });

  const loadLocked = () => api.lockedAccounts().then(setLocked).catch(() => {});
  const load = () => {
    setLoadingList(true);
    api.tenants().then(setTenants).catch((e) => setErr(e.message)).finally(() => setLoadingList(false));
    loadLocked();
  };
  useEffect(() => {
    api.me().then((m) => {
      if (!m.isSuperAdmin) { nav("/app"); return; }
      setMe(m); load();
    }).catch(() => nav("/"));
  }, []);

  async function unlockAccount(u: any) {
    if (!window.confirm(`Unlock ${u.username} (${u.tenant_slug})?`)) return;
    setErr("");
    try { await api.unlockTenantUser(u.id); loadLocked(); }
    catch (e: any) { setErr(e.message); }
  }

  async function rotateScim(t: any) {
    if (!window.confirm(
      `Generate a NEW SCIM token for ${t.name}? The current token stops working immediately — `
      + `any HRMS/app using it must be updated.`)) return;
    setErr(""); setRotated(null);
    try {
      const r = await api.rotateScim(t.id);
      setRotated({ name: t.name, slug: t.slug, token: r.scim_token });
    } catch (e: any) { setErr(e.message); }
  }
  if (!me) return <PageLoader />;

  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.displayName || me.username;

  async function create(data: TenantForm) {
    setErr("");
    try {
      const t = await api.createTenant({ ...data, logo_url: data.logo_url || undefined });
      setCreated(t);
      reset({ slug: "", name: "", admin_email: "", admin_password: "", logo_url: "" });
      load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="shell">
      <div className="sidebar">
        <SidebarLogo logoUrl={me.tenantLogo} />
        <div className="nav-item active">Organizations</div>
      </div>
      <div className="main">
        <div className="topbar">
          <div className="topbar-left">
            <DrawerToggle />
            <div className="who">Control Plane · {fullName}</div>
          </div>
          <TopbarMenu />
        </div>
        <div className="content">
          <h2 className="page-title">Organizations (Tenants)</h2>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Create organization</h3>
            <form onSubmit={handleSubmit(create)} noValidate>
              <div className="row">
                <div><Field label="Slug (subdomain)" error={errors.slug?.message}>
                  <input placeholder="acme" aria-invalid={!!errors.slug} {...register("slug")} />
                </Field></div>
                <div><Field label="Display name" error={errors.name?.message}>
                  <input aria-invalid={!!errors.name} {...register("name")} />
                </Field></div>
              </div>
              <div className="row">
                <div><Field label="Admin email" error={errors.admin_email?.message}>
                  <input aria-invalid={!!errors.admin_email} {...register("admin_email")} />
                </Field></div>
                <div><Field label="Admin password (min 10)" error={errors.admin_password?.message}>
                  <input type="password" aria-invalid={!!errors.admin_password} {...register("admin_password")} />
                </Field></div>
              </div>
              <Field label="Logo URL (optional)" error={errors.logo_url?.message}
                hint="Shown on the org's login page instead of the default logo.">
                <input placeholder="https://acme.example.com/logo.png"
                  aria-invalid={!!errors.logo_url} {...register("logo_url")} />
              </Field>
              {err && <div className="error">{err}</div>}
              <button className="btn-sm" style={{ marginTop: 12 }} disabled={isSubmitting}>
                {isSubmitting && <Spinner />}Create organization
              </button>
            </form>
            {created && (
              <div style={{ marginTop: 14 }}>
                <strong>Organization ready. Save the SCIM token now — shown once:</strong>
                <p className="mono">login: {created.login_url}</p>
                <p className="mono">SCIM token: {created.scim_token}</p>
              </div>
            )}
          </div>

          {rotated && (
            <div className="card" style={{ borderColor: "var(--brand)" }}>
              <strong>New SCIM token for {rotated.name} — shown once. Update the app/HRMS config now
                (e.g. IOCRM's IOARK_SCIM_TOKEN), then redeploy it:</strong>
              <p className="mono">SCIM token: {rotated.token}</p>
              <button className="btn-sm" onClick={() => setRotated(null)}>Dismiss</button>
            </div>
          )}

          {loadingList ? <div className="section-loader"><Spinner /> Loading organizations…</div> : (
          <table>
            <thead><tr><th>Organization</th><th>Slug</th><th>Login URL</th><th>Users</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.logo_url && <img src={t.logo_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, verticalAlign: "middle", marginRight: 6, objectFit: "contain" }} />}
                    {t.name}{t.is_system && <span className="chip">system</span>}
                  </td>
                  <td className="mono">{t.slug}</td>
                  <td className="mono">{t.login_url}</td>
                  <td>{t.users}</td>
                  <td><span className={"badge " + (t.enabled ? "active" : "suspended")}>{t.enabled ? "Active" : "Disabled"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!t.is_system && (
                      <button className="btn-sm" onClick={() => rotateScim(t)}>Rotate SCIM token</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}

          <h2 className="page-title" style={{ marginTop: 28 }}>Locked accounts</h2>
          <div className="card">
            {locked.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
                No accounts are currently locked.
              </p>
            ) : (
              <table>
                <thead><tr><th>User</th><th>Email</th><th>Organization</th><th>Reason</th><th>Locked at</th><th></th></tr></thead>
                <tbody>
                  {locked.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>{u.tenant_name} <span className="chip">{u.tenant_slug}</span></td>
                      <td>{u.lock_reason || "—"}</td>
                      <td>{u.locked_at ? new Date(u.locked_at).toLocaleString() : "—"}</td>
                      <td><button className="btn-sm" onClick={() => unlockAccount(u)}>Unlock</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
