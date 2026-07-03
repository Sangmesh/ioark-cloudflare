import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, subdomainTenant } from "../lib/api";
import { Field } from "../components/Field";
import { Spinner } from "../components/Spinner";
import { ioarkLogo } from "../components/Brand";

/** Self-service account unlock: prove identity with a security question answer
 *  plus a current MFA code, then the suspicious-activity lock is lifted. */
export default function UnlockAccount() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"start" | "verify" | "done">("start");
  const [username, setUsername] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    // On the bare host (control plane) target the system tenant, like the login screen.
    if (subdomainTenant() === null) api.setTenant("system");
    try {
      const r = await api.unlockStart(username.trim());
      setChallengeId(r.challenge_id);
      setQuestion(r.question);
      setPhase("verify");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api.unlockVerify(challengeId, answer, code);
      setPhase("done");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <img className="brand-logo-img" src={ioarkLogo} alt="ioark" />
          <hr className="brand-divider" />
          <h1>Unlock your account</h1>
        </div>

        {phase === "start" && (
          <form onSubmit={start} noValidate>
            <p style={{ fontSize: 13, marginTop: 0 }}>
              Enter your username or email. We'll ask one of your security questions
              and a code from your authenticator to confirm it's you.
            </p>
            <Field label="Username or email">
              <input autoFocus autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </Field>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={busy || !username.trim()}>
              {busy && <Spinner />}{busy ? "Checking…" : "Continue"}
            </button>
            <div className="hint" style={{ textAlign: "center", marginTop: 12 }}>
              <a onClick={() => nav("/")} style={{ cursor: "pointer", color: "var(--brand)" }}>
                Back to sign in</a>
            </div>
          </form>
        )}

        {phase === "verify" && (
          <form onSubmit={verify} noValidate>
            <Field label={question}>
              <input autoFocus autoComplete="off" value={answer}
                onChange={(e) => setAnswer(e.target.value)} />
            </Field>
            <Field label="Authenticator code">
              <input inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                style={{ letterSpacing: "8px", textAlign: "center", fontSize: "22px" }}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </Field>
            {err && <div className="error">{err}</div>}
            <button className="primary" disabled={busy || !answer.trim() || code.length !== 6}>
              {busy && <Spinner />}{busy ? "Unlocking…" : "Unlock account"}
            </button>
            <div className="hint" style={{ textAlign: "center", marginTop: 12 }}>
              <a onClick={() => nav("/")} style={{ cursor: "pointer", color: "var(--brand)" }}>
                Back to sign in</a>
            </div>
          </form>
        )}

        {phase === "done" && (
          <>
            <p style={{ fontSize: 14 }}>
              Your account has been unlocked. You can now sign in with your password.
            </p>
            <button className="primary" onClick={() => nav("/")}>Go to sign in</button>
          </>
        )}

        <div className="auth-footer">Protected by ioark</div>
      </div>
    </div>
  );
}
