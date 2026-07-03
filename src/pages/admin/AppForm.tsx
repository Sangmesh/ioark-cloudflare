import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "../../lib/api";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";

const schema = z.object({
  name: z.string().min(1, "Application name is required"),
  protocol: z.enum(["oidc", "saml"]),
  redirect_uris: z.string().optional(),
  login_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  logo_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  network_security_enabled: z.boolean().optional(),
  allowed_networks: z.string().optional(),   // IPs / subnets, comma- or newline-separated
  // SAML (validated in onSubmit when protocol === "saml")
  saml_sp_entity_id: z.string().optional(),
  saml_acs_url: z.string().optional(),
  saml_nameid_format: z.string().optional(),
});
type AppForm = z.infer<typeof schema>;

const metadataUrl = `${window.location.origin}/saml/metadata`;

export default function AppForm() {
  const nav = useNavigate();
  const { id } = useParams();
  const editing = !!id;
  const [loaded, setLoaded] = useState(!editing);
  const [current, setCurrent] = useState<any>(null);
  const [created, setCreated] = useState<any>(null);   // newly created app
  const [msg, setMsg] = useState("");
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<AppForm>({ resolver: zodResolver(schema),
                       defaultValues: { protocol: "oidc", network_security_enabled: false,
                                        saml_nameid_format: "emailAddress" } });
  const netOn = watch("network_security_enabled");
  const isSaml = watch("protocol") === "saml";

  useEffect(() => {
    if (editing) {
      api.app(id!).then((a: any) => {
        setCurrent(a);
        reset({
          name: a.name,
          protocol: a.protocol === "saml" ? "saml" : "oidc",
          redirect_uris: (a.redirect_uris || []).join(", "),
          login_url: a.login_url || "",
          logo_url: a.logo_url || "",
          network_security_enabled: !!a.network_security_enabled,
          allowed_networks: (a.allowed_networks || []).join("\n"),
          saml_sp_entity_id: a.saml_sp_entity_id || "",
          saml_acs_url: a.saml_acs_url || "",
          saml_nameid_format: a.saml_nameid_format || "emailAddress",
        });
        setLoaded(true);
      }).catch((e: any) => { setMsg(e.message); setLoaded(true); });
    }
  }, []);

  async function onSubmit(data: AppForm) {
    setMsg("");
    if (data.protocol === "saml" && (!data.saml_sp_entity_id?.trim() || !data.saml_acs_url?.trim())) {
      setMsg("SAML applications require an SP Entity ID and an ACS (Reply) URL."); return;
    }
    const payload = {
      name: data.name,
      protocol: data.protocol,
      redirect_uris: (data.redirect_uris || "").split(",").map((s) => s.trim()).filter(Boolean),
      login_url: data.login_url || null,
      logo_url: data.logo_url || null,
      network_security_enabled: !!data.network_security_enabled,
      allowed_networks: (data.allowed_networks || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      saml_sp_entity_id: data.saml_sp_entity_id || null,
      saml_acs_url: data.saml_acs_url || null,
      saml_nameid_format: data.saml_nameid_format || "emailAddress",
    };
    try {
      if (editing) {
        await api.updateApp(id!, payload);
        nav("/admin/applications");
      } else {
        setCreated(await api.createApp(payload));
      }
    } catch (e: any) { setMsg(e.message); }
  }

  if (!loaded) return <div className="section-loader"><Spinner /> Loading…</div>;

  // After creation: show what the integrator needs (OIDC creds, or SAML metadata).
  if (created) {
    return (
      <>
        <div className="page-head">
          <h2 className="page-title">Application registered</h2>
          <button className="btn-sm" onClick={() => nav("/admin/applications")}>← Back to applications</button>
        </div>
        <div className="card">
          {created.protocol === "saml" ? (
            <>
              <strong>SAML app registered. Configure your service provider with ioark as the IdP:</strong>
              <p className="mono">IdP metadata: {metadataUrl}</p>
              <p className="mono">IdP entity / issuer: {window.location.origin}</p>
              <p className="mono">SSO URL: {window.location.origin}/saml/sso</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Paste the metadata URL into the app's SAML settings (or enter the SSO URL + the
                signing certificate from the metadata). Audience = the SP Entity ID you set.
              </p>
            </>
          ) : (
            <>
              <strong>Save these credentials now — the secret is shown only once:</strong>
              <p className="mono">client_id: {created.client_id}</p>
              <p className="mono">client_secret: {created.client_secret}</p>
            </>
          )}
          <button className="btn-sm primary-sm" style={{ marginTop: 12 }}
            onClick={() => nav("/admin/applications")}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h2 className="page-title">{editing ? `Edit ${current?.name || "application"}` : "Register application"}</h2>
        <button className="btn-sm" onClick={() => nav("/admin/applications")}>← Back to applications</button>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="row">
            <div><Field label="App name" error={errors.name?.message}>
              <input aria-invalid={!!errors.name} {...register("name")} />
            </Field></div>
            <div><Field label="SSO protocol"
              hint={isSaml ? "SAML 2.0 — ioark issues signed assertions to this app."
                           : "OpenID Connect (OAuth2 + PKCE)."}>
              <select {...register("protocol")}>
                <option value="oidc">OpenID Connect (OIDC)</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </Field></div>
          </div>

          {!isSaml && (
            <div className="row">
              <div><Field label="Redirect URIs (comma-separated)" error={errors.redirect_uris?.message}>
                <input aria-invalid={!!errors.redirect_uris} {...register("redirect_uris")} />
              </Field></div>
              <div><Field label="Login URL (SP-initiated SSO start)" error={errors.login_url?.message}
                hint="Where the tile sends the user to begin login, e.g. https://app.example.com/api/auth/oidc/login">
                <input placeholder="https://…" aria-invalid={!!errors.login_url} {...register("login_url")} />
              </Field></div>
            </div>
          )}

          {isSaml && (
            <>
              <div className="row">
                <div><Field label="SP Entity ID (Audience)" error={errors.saml_sp_entity_id?.message}
                  hint="The service provider's SAML EntityID — must match the Audience the SP expects.">
                  <input placeholder="https://app.example.com/saml/metadata"
                    {...register("saml_sp_entity_id")} />
                </Field></div>
                <div><Field label="ACS (Reply) URL" error={errors.saml_acs_url?.message}
                  hint="The SP's Assertion Consumer Service URL — ioark posts the signed assertion here.">
                  <input placeholder="https://app.example.com/sso/acs" {...register("saml_acs_url")} />
                </Field></div>
              </div>
              <div className="row">
                <div><Field label="NameID format">
                  <select {...register("saml_nameid_format")}>
                    <option value="emailAddress">Email address</option>
                    <option value="persistent">Persistent</option>
                    <option value="unspecified">Unspecified</option>
                  </select>
                </Field></div>
                <div><Field label="IdP metadata URL (give this to the SP)">
                  <input className="mono" value={metadataUrl} readOnly disabled />
                </Field></div>
              </div>
            </>
          )}

          <Field label="Logo URL (optional — favicon used if blank)" error={errors.logo_url?.message}>
            <input placeholder="https://…" aria-invalid={!!errors.logo_url} {...register("logo_url")} />
          </Field>

          <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              <input type="checkbox" {...register("network_security_enabled")} />
              Network security — restrict launches to allowed networks
            </label>
            {netOn && (
              <div style={{ marginTop: 10 }}>
                <Field label="Allowed IPs / subnets (one per line, or comma-separated)"
                  error={errors.allowed_networks?.message}
                  hint="e.g. 203.0.113.10, 10.0.0.0/24, 2001:db8::/32. Launches from outside these networks are denied. Leave empty to apply no network check.">
                  <textarea rows={4} placeholder={"203.0.113.10\n10.0.0.0/24"}
                    style={{ width: "100%", fontFamily: "monospace" }}
                    {...register("allowed_networks")} />
                </Field>
              </div>
            )}
          </div>

          <button className="btn-sm primary-sm" style={{ marginTop: 12 }} disabled={isSubmitting}>
            {isSubmitting && <Spinner />}{editing ? "Save changes" : "Register application"}
          </button>
          <button type="button" className="btn-sm" style={{ marginTop: 12, marginLeft: 8 }}
            onClick={() => nav("/admin/applications")} disabled={isSubmitting}>Cancel</button>
          {msg && <span style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
        </form>
      </div>
    </>
  );
}
