import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, subdomainTenant } from "../lib/api";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { ioarkLogo } from "../components/Brand";

const loginSchema = z.object({
  username: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});
const mfaSchema = z.object({
  code: z.string()
    .min(1, "Enter the 6-digit code from your authenticator")
    .regex(/^\d{6}$/, "Code must be exactly 6 digits (numbers only)"),
});
type LoginForm = z.infer<typeof loginSchema>;
type MfaForm = z.infer<typeof mfaSchema>;

const REMEMBER_KEY = "rememberedUsername";

// Suggested recovery questions; users pick a distinct one for each slot.
const SQ_OPTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was the name of your primary school?",
  "What is your mother's maiden name?",
  "What was the make and model of your first car?",
  "What is the name of your favorite childhood friend?",
  "What was your childhood nickname?",
  "What is your favorite book?",
];
const SQ_COUNT = 3;

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState<"login" | "mfa" | "enroll" | "sq">("login");
  const fixedTenant = subdomainTenant() !== null;
  const [err, setErr] = useState("");
  const [superAdmin, setSuperAdmin] = useState(false);
  const [org, setOrg] = useState<any>(null);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const rememberedUsername = localStorage.getItem(REMEMBER_KEY) || "";
  const [remember, setRemember] = useState(!!rememberedUsername);

  // Account-lock + security-question enrollment state.
  const [locked, setLocked] = useState(false);
  const [sqQuestions, setSqQuestions] = useState<string[]>(
    () => SQ_OPTIONS.slice(0, SQ_COUNT));
  const [sqAnswers, setSqAnswers] = useState<string[]>(() => Array(SQ_COUNT).fill(""));
  const [sqBusy, setSqBusy] = useState(false);

  const returnTo = new URLSearchParams(window.location.search).get("return_to");

  // Resolve branding before painting the logo/title — otherwise the default
  // ioark logo flashes first and then swaps to the org logo (a visible flicker).
  const [brandLoaded, setBrandLoaded] = useState(false);
  useEffect(() => {
    api.orgBranding().then(setOrg).catch(() => {}).finally(() => setBrandLoaded(true));
  }, []);
  const isOrg = !!org && !org.isSystem;   // tenant (org) login vs. control plane

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: rememberedUsername },
  });
  const mfaForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });
  const enrollForm = useForm<MfaForm>({ resolver: zodResolver(mfaSchema) });

  function finish(isSuper = superAdmin) {
    if (returnTo) window.location.href = returnTo;       // resume OIDC SSO flow
    else if (isSuper) nav("/control");
    else nav("/app");
  }

  // After every factor is satisfied: force security-question enrollment if the
  // org requires it and the user hasn't set theirs, otherwise complete sign-in.
  function proceed(sqRequired: boolean, isSuper = superAdmin) {
    if (sqRequired) setStep("sq");
    else finish(isSuper);
  }

  // A persistent suspicious-activity lock comes back as HTTP 423; surface it and
  // reveal the unlock link instead of a generic error.
  function handleAuthError(e: any) {
    if (e?.status === 423) { setLocked(true); setStep("login"); }
    setErr(e?.message || "Something went wrong");
  }

  async function onLogin(data: LoginForm) {
    setErr(""); setLocked(false);
    try {
      if (!fixedTenant) api.setTenant("system");   // bare host -> control plane
      const r = await api.login(data.username, data.password);
      // Remember only the username; the browser password manager handles the
      // password securely. Never persist plaintext passwords in localStorage.
      if (remember) localStorage.setItem(REMEMBER_KEY, data.username);
      else localStorage.removeItem(REMEMBER_KEY);
      const isSuper = !!r.user?.is_super_admin;
      setSuperAdmin(isSuper);
      const sqRequired = !!r.security_questions_required;
      if (r.mfa_enroll_required) {
        // Org policy requires MFA but this user hasn't enrolled — set it up now.
        const setup = await api.mfaEnroll();
        setMfaSetup(setup);
        setStep("enroll");
      } else if (r.mfa_required) {
        setStep("mfa");
      } else {
        proceed(sqRequired, isSuper);
      }
    } catch (e: any) { handleAuthError(e); }
  }

  async function onMfa(data: MfaForm) {
    setErr("");
    try {
      const r = await api.mfaVerify(data.code);
      proceed(!!r?.security_questions_required);
    } catch (e: any) { handleAuthError(e); }
  }

  async function onEnroll(data: MfaForm) {
    setErr("");
    // Activating with a valid code both enables MFA and completes the session.
    try {
      const r = await api.mfaActivate(data.code);
      proceed(!!r?.security_questions_required);
    } catch (e: any) { handleAuthError(e); }
  }

  async function onSecurityQuestions() {
    setErr("");
    const answers = sqAnswers.map((a) => a.trim());
    if (new Set(sqQuestions).size !== SQ_COUNT) {
      setErr("Please choose a different question for each one."); return;
    }
    if (answers.some((a) => a.length < 2)) {
      setErr("Please answer all security questions (at least 2 characters)."); return;
    }
    setSqBusy(true);
    try {
      await api.setSecurityQuestions(
        sqQuestions.map((question, i) => ({ question, answer: answers[i] })));
      finish();
    } catch (e: any) { setErr(e.message); }
    finally { setSqBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          {brandLoaded ? (
            <>
              <img className="brand-logo-img"
                src={isOrg && org.logoUrl ? org.logoUrl : ioarkLogo}
                alt={isOrg ? org.name : "ioark"} />
              <hr className="brand-divider" />
              <h1>{isOrg ? `Sign in to ${org.name}` : "Sign in to ioark"}</h1>
            </>
          ) : (
            <div className="brand-loading" aria-hidden="true"><Spinner /></div>
          )}
        </div>

        {step === "login" && (
          <form onSubmit={loginForm.handleSubmit(onLogin)} noValidate>
            <Field label="Username or email" error={loginForm.formState.errors.username?.message}>
              <input autoFocus={!rememberedUsername} autoComplete="username"
                aria-invalid={!!loginForm.formState.errors.username}
                {...loginForm.register("username")} />
            </Field>
            <Field label="Password" error={loginForm.formState.errors.password?.message}>
              <div className="password-field">
                <input type={showPassword ? "text" : "password"} autoComplete="current-password"
                  autoFocus={!!rememberedUsername}
                  aria-invalid={!!loginForm.formState.errors.password}
                  {...loginForm.register("password")} />
                <button type="button" className="password-toggle" tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>
            <label className="remember-me">
              <input type="checkbox" checked={remember}
                onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember me</span>
            </label>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={loginForm.formState.isSubmitting}>
              {loginForm.formState.isSubmitting && <Spinner />}
              {loginForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </button>
            <div className="hint" style={{ textAlign: "center", marginTop: 12 }}>
              <a onClick={() => nav("/forgot-password")}
                 style={{ cursor: "pointer", color: "var(--brand)" }}>Forgot password?</a>
            </div>
            <div className="hint" style={{ textAlign: "center", marginTop: 6 }}>
              <a onClick={() => nav("/unlock-account")}
                 style={{ cursor: "pointer", color: locked ? "var(--brand)" : "var(--muted)",
                          fontWeight: locked ? 600 : 400 }}>
                Account locked? Unlock it</a>
            </div>
          </form>
        )}

        {step === "sq" && (
          <form onSubmit={(e) => { e.preventDefault(); onSecurityQuestions(); }} noValidate>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              Set up {SQ_COUNT} security questions. If your account is ever locked,
              you'll answer one of these along with your authenticator code to unlock it.
            </p>
            {Array.from({ length: SQ_COUNT }).map((_, i) => (
              <div key={i}>
                <Field label={`Security question ${i + 1}`}>
                  <select value={sqQuestions[i]}
                    onChange={(e) => setSqQuestions((qs) =>
                      qs.map((q, j) => (j === i ? e.target.value : q)))}>
                    {SQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Your answer">
                  <input autoComplete="off" value={sqAnswers[i]}
                    onChange={(e) => setSqAnswers((as) =>
                      as.map((a, j) => (j === i ? e.target.value : a)))} />
                </Field>
              </div>
            ))}
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={sqBusy}>
              {sqBusy && <Spinner />}{sqBusy ? "Saving…" : "Save & continue"}
            </button>
          </form>
        )}

        {step === "mfa" && (
          <form onSubmit={mfaForm.handleSubmit(onMfa)} noValidate>
            <Field label="Enter the 6-digit code from your authenticator"
              error={mfaForm.formState.errors.code?.message}>
              <input maxLength={6} inputMode="numeric" autoFocus
                aria-invalid={!!mfaForm.formState.errors.code}
                style={{ letterSpacing: "8px", textAlign: "center", fontSize: "22px" }}
                {...mfaForm.register("code")} />
            </Field>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={mfaForm.formState.isSubmitting}>
              {mfaForm.formState.isSubmitting && <Spinner />}
              {mfaForm.formState.isSubmitting ? "Verifying…" : "Verify"}
            </button>
            <div className="hint">Two-factor authentication required</div>
          </form>
        )}

        {step === "enroll" && (
          <form onSubmit={enrollForm.handleSubmit(onEnroll)} noValidate>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              Your organization requires two-factor authentication. Scan this QR code in
              Google Authenticator (or any TOTP app), then enter the 6-digit code to finish.
            </p>
            <img className="qr" alt="Authenticator QR code"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaSetup?.otpauth_url || "")}`} />
            <p className="mono">{mfaSetup?.secret}</p>
            <Field label="6-digit code" error={enrollForm.formState.errors.code?.message}>
              <input inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code"
                aria-invalid={!!enrollForm.formState.errors.code}
                style={{ letterSpacing: "8px", textAlign: "center", fontSize: "22px" }}
                {...enrollForm.register("code")} />
            </Field>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={enrollForm.formState.isSubmitting}>
              {enrollForm.formState.isSubmitting && <Spinner />}
              {enrollForm.formState.isSubmitting ? "Verifying…" : "Activate & continue"}
            </button>
            <div className="hint">Two-factor authentication is mandatory for your organization</div>
          </form>
        )}

        <div className="auth-footer">Protected by ioark</div>
      </div>
    </div>
  );
}
