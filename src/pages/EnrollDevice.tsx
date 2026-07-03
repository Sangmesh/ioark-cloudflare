import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageLoader, Spinner } from "../components/Spinner";

/**
 * Landing page for the QR a user scans on a new (mobile) device. The QR encodes
 * /enroll?code=<enrollCode>. If the visitor isn't signed in on this device yet,
 * we bounce them through login (return_to brings them back). Once signed in they
 * acknowledge the device with a 6-digit authenticator code, which claims the
 * pre-registered device and authorizes THIS browser for app access.
 */
export default function EnrollDevice() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const code = (params.get("code") || "").trim().toUpperCase();
  const [state, setState] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!code) { setMsg("Missing enrollment code."); setState("error"); return; }
      // Must be signed in on THIS device first (/me is device-trust exempt).
      try { await api.me(); setState("ready"); }
      catch {
        window.location.href = `/?return_to=${encodeURIComponent(`/enroll?code=${code}`)}`;
      }
    })();
  }, []);

  async function confirm() {
    setMsg(""); setBusy(true);
    try {
      const d = await api.claimDevice(code, otp.trim());
      setName(d?.name || "");
      setState("done");
    } catch (e: any) {
      setMsg(e.message || "Could not authorize this device.");
    } finally { setBusy(false); }
  }

  if (state === "checking") return <PageLoader />;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><h1>Authorize this device</h1></div>

        {state === "ready" && (
          <>
            <p style={{ fontSize: 14 }}>
              To confirm it's you, enter the current 6-digit code from your authenticator app.
            </p>
            <input inputMode="numeric" maxLength={6} autoFocus placeholder="6-digit code"
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: "8px", textAlign: "center", fontSize: 22 }} />
            {msg && <div className="error">{msg}</div>}
            <button className="primary" onClick={confirm} disabled={busy || otp.length !== 6}>
              {busy && <Spinner />}Authorize this device
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <p style={{ fontSize: 14 }}>
              ✅ This device{name ? ` (“${name}”)` : ""} is now authorized. You can launch your
              applications from here.
            </p>
            <button className="primary" onClick={() => nav("/app")}>Go to my apps</button>
          </>
        )}

        {state === "error" && (
          <>
            <div className="error">{msg}</div>
            <button className="primary" onClick={() => nav("/profile")}>Open my profile</button>
          </>
        )}

        <div className="auth-footer">Protected by ioark</div>
      </div>
    </div>
  );
}
