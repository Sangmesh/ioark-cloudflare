import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, subdomainTenant } from "../lib/api";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { ioarkLogo } from "../components/Brand";

const schema = z.object({ email: z.string().min(1, "Enter your account email or username") });
type Form = z.infer<typeof schema>;

export default function ForgotPassword() {
  const nav = useNavigate();
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    // On the bare host (control plane) target the system tenant, like the login screen.
    if (subdomainTenant() === null) api.setTenant("system");
    try {
      const r = await api.forgotPassword(data.email.trim());
      setMsg(r?.message || "");
    } catch {
      // Stay enumeration-safe: show the same generic confirmation either way.
    }
    setSent(true);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <img className="brand-logo-img" src={ioarkLogo} alt="ioark" />
          <hr className="brand-divider" />
          <h1>Reset your password</h1>
        </div>

        {sent ? (
          <>
            <p style={{ fontSize: 14 }}>
              {msg || "If an account exists for that address, a password reset link has been sent. " +
                "Check your inbox and follow the link to choose a new password."}
            </p>
            <button className="primary" onClick={() => nav("/")}>Back to sign in</button>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              Enter your account email and we'll send you a link to set a new password.
            </p>
            <Field label="Email or username" error={errors.email?.message}>
              <input autoFocus autoComplete="username" aria-invalid={!!errors.email}
                {...register("email")} />
            </Field>
            <button className="primary" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}{isSubmitting ? "Sending…" : "Send reset link"}
            </button>
            <div className="hint" style={{ textAlign: "center", marginTop: 12 }}>
              <a onClick={() => nav("/")} style={{ cursor: "pointer", color: "var(--brand)" }}>
                Back to sign in</a>
            </div>
          </form>
        )}

        <div className="auth-footer">Protected by ioark</div>
      </div>
    </div>
  );
}
