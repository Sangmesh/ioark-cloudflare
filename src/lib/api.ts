// Tenant resolution on the client:
//  - In production each tenant has its own subdomain (acme.iam.example.com) and
//    the backend derives the tenant from the Host header (X-Tenant is ignored).
//  - In dev (localhost) we send X-Tenant from the org chosen on the login screen.
//
// This must mirror the backend's Host->slug logic (iam-platform tenancy.py).
// Set VITE_BASE_DOMAIN to the tenant base domain (e.g. "iam.example.com") so we
// can reliably tell the control-plane host from a tenant subdomain and NOT
// mistake a platform host like `my-app.pages.dev` for a tenant.
const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN || "").toLowerCase();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export function subdomainTenant(): string | null {
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return null;

  if (BASE_DOMAIN) {
    // Bare base domain (or www) -> control plane, no tenant subdomain.
    if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;
    // acme.iam.example.com -> "acme"
    if (host.endsWith("." + BASE_DOMAIN)) {
      return host.slice(0, -(BASE_DOMAIN.length + 1)).split(".")[0] || null;
    }
    // Any other host (e.g. *.pages.dev preview) is treated as the control plane;
    // the tenant is then chosen on the login screen.
    return null;
  }

  // Local-dev fallback when VITE_BASE_DOMAIN isn't set: only *.localhost maps to
  // a tenant subdomain. (We deliberately do NOT infer a tenant from arbitrary
  // multi-label hosts, which would misfire on platform domains like pages.dev.)
  const parts = host.split(".");
  if (parts.length >= 2 && parts[parts.length - 1] === "localhost") return parts[0];
  return null;
}

export function currentTenant(): string {
  return subdomainTenant() ?? (localStorage.getItem("tenant") || "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = currentTenant();
  if (t) h["X-Tenant"] = t;
  return h;
}

// Build a `?a=1&b=2` query string, skipping empty/null/undefined values.
function qs(params?: Record<string, any>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: { ...headers(), ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || res.statusText) as Error & { status?: number };
    err.status = res.status;   // lets callers branch on e.g. 423 Locked
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  setTenant: (slug: string) => localStorage.setItem("tenant", slug.toLowerCase()),

  login: (username: string, password: string) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  mfaVerify: (code: string) =>
    req("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  mfaEnroll: () => req("/auth/mfa/enroll", { method: "POST" }),
  mfaActivate: (code: string) =>
    req("/auth/mfa/activate", { method: "POST", body: JSON.stringify({ code }) }),
  logout: () => req("/auth/logout", { method: "POST" }),
  logoutAll: () => req("/auth/logout-all", { method: "POST" }),
  changePassword: (current_password: string, new_password: string) =>
    req("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  forgotPassword: (email: string) =>
    req("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    req("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),

  // recovery: security questions + self-service account unlock
  setSecurityQuestions: (questions: { question: string; answer: string }[]) =>
    req("/auth/security-questions", { method: "POST", body: JSON.stringify({ questions }) }),
  unlockStart: (username: string) =>
    req("/auth/unlock/start", { method: "POST", body: JSON.stringify({ username }) }),
  unlockVerify: (challenge_id: string, answer: string, code: string) =>
    req("/auth/unlock/verify", {
      method: "POST", body: JSON.stringify({ challenge_id, answer, code }),
    }),
  me: () => req("/me"),

  // public, host-scoped branding for the login screen (no auth)
  orgBranding: () => req("/public/org"),

  // self-service: device trust
  devices: () => req("/me/devices"),
  authorizeDevice: (name?: string, otp?: string) =>
    req("/me/devices", { method: "POST", body: JSON.stringify({ name: name || null, otp: otp || null }) }),
  registerDevice: (name?: string) =>
    req("/me/devices/register", { method: "POST", body: JSON.stringify({ name: name || null }) }),
  claimDevice: (code: string, otp?: string) =>
    req("/me/devices/claim", { method: "POST", body: JSON.stringify({ code, otp: otp || null }) }),
  revokeDevice: (id: string) => req(`/me/devices/${id}`, { method: "DELETE" }),
  setDeviceEnforcement: (enabled: boolean) =>
    req("/me/settings/device-enforcement", { method: "PUT", body: JSON.stringify({ enabled }) }),

  // WebAuthn / passkey strict device binding
  webauthnRegisterBegin: () => req("/me/webauthn/register/begin", { method: "POST" }),
  webauthnRegisterComplete: (cred: any) =>
    req("/me/webauthn/register/complete", { method: "POST", body: JSON.stringify(cred) }),
  webauthnAuthBegin: () => req("/me/webauthn/auth/begin", { method: "POST" }),
  webauthnAuthComplete: (cred: any) =>
    req("/me/webauthn/auth/complete", { method: "POST", body: JSON.stringify(cred) }),
  webauthnCredentials: () => req("/me/webauthn/credentials"),
  deleteWebauthnCredential: (id: string) =>
    req(`/me/webauthn/credentials/${id}`, { method: "DELETE" }),

  // tenant admin — directory (employees)
  users: (params?: Record<string, any>) => req("/admin/users" + qs(params)),
  user: (id: string) => req(`/admin/users/${id}`),
  createUser: (u: any) => req("/admin/users", { method: "POST", body: JSON.stringify(u) }),
  updateUser: (id: string, u: any) =>
    req(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(u) }),
  resetUserMfa: (id: string) => req(`/admin/users/${id}/reset-mfa`, { method: "POST" }),
  unlockUser: (id: string) => req(`/admin/users/${id}/unlock`, { method: "POST" }),
  // groups
  groups: (params?: Record<string, any>) => req("/admin/groups" + qs(params)),
  groupNames: () => req("/admin/groups/names"),
  group: (id: string) => req(`/admin/groups/${id}`),
  createGroup: (g: any) => req("/admin/groups", { method: "POST", body: JSON.stringify(g) }),
  updateGroup: (id: string, g: any) =>
    req(`/admin/groups/${id}`, { method: "PATCH", body: JSON.stringify(g) }),
  // applications
  apps: (params?: Record<string, any>) => req("/admin/applications" + qs(params)),
  appNames: () => req("/admin/applications/names"),
  app: (id: string) => req(`/admin/applications/${id}`),
  createApp: (a: any) => req("/admin/applications", { method: "POST", body: JSON.stringify(a) }),
  updateApp: (id: string, a: any) =>
    req(`/admin/applications/${id}`, { method: "PATCH", body: JSON.stringify(a) }),
  // system log
  audit: (params?: Record<string, any>) => req("/admin/audit" + qs(params)),

  // control plane (super admin)
  tenants: () => req("/tenants"),
  createTenant: (t: any) => req("/tenants", { method: "POST", body: JSON.stringify(t) }),
  lockedAccounts: () => req("/tenants/locked-accounts"),
  unlockTenantUser: (id: string) => req(`/tenants/users/${id}/unlock`, { method: "POST" }),
  rotateScim: (id: string) => req(`/tenants/${id}/rotate-scim`, { method: "POST" }),
};
