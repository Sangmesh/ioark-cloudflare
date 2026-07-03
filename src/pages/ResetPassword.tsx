import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, subdomainTenant } from "../lib/api";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { ioarkLogo } from "../components/Brand";

const schema = z.object({
  new_password: z.string().min(8, "Use at least 8 characters"),
  confirm: z.string().min(1, "Confirm your new password"),
}).refine((d) => d.new_password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
type Form = z.infer<typeof schema>;

export default function ResetPassword() {
  const nav = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    setErr("");
    if (subdomainTenant() === null) api.setTenant("system");
    try {
      await api.resetPassword(token, data.new_password);
      setDone(true);
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <img className="brand-logo-img" src={ioarkLogo} alt="ioark" />
          <hr className="brand-divider" />
          <h1>Choose a new password</h1>
        </div>

        {!token ? (
          <>
            <div className="error">This reset link is missing its token. Please use the link from your email.</div>
            <button className="primary" onClick={() => nav("/forgot-password")}>Request a new link</button>
          </>
        ) : done ? (
          <>
            <p style={{ fontSize: 14 }}>
              Your password has been reset. For your security, any other sessions have been signed out.
              You can now sign in with your new password.
            </p>
            <button className="primary" onClick={() => nav("/")}>Go to sign in</button>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="New password" error={errors.new_password?.message}>
              <input type="password" autoFocus autoComplete="new-password"
                aria-invalid={!!errors.new_password} {...register("new_password")} />
            </Field>
            <Field label="Confirm new password" error={errors.confirm?.message}>
              <input type="password" autoComplete="new-password"
                aria-invalid={!!errors.confirm} {...register("confirm")} />
            </Field>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}{isSubmitting ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        <div className="auth-footer">Protected by ioark</div>
      </div>
    </div>
  );
}
