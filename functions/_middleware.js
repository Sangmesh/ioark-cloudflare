// Cloudflare Pages Function — the edge reverse proxy that replaces nginx.
//
// Cloudflare Pages is a static host: it does NOT run this repo's Dockerfile or
// nginx.conf. Yet the SPA calls its API same-origin at `/api/*` (see
// src/lib/api.ts) and relies on something in front to forward those requests to
// the backend — exactly what nginx.conf did in the Docker deployment.
//
// This middleware plays that role. For the backend-bound path prefixes it
// forwards the request to BACKEND_ORIGIN, PRESERVING the original tenant Host
// (e.g. acme.iam.example.com) so the backend's Host-based tenant resolution
// keeps working (backend ignores X-Tenant in production — see
// iam-platform/backend/app/core/tenancy.py). Everything else falls through to
// the static SPA assets.
//
// Required Pages environment variable:
//   BACKEND_ORIGIN = https://api.example.com   (your public backend base URL)

const PROXY_RE = /^\/(api|authorize|oauth|scim|\.well-known|healthz)(\/|$)/;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Non-backend paths: serve the static SPA (with client-side routing fallback
  // provided by public/_redirects).
  if (!PROXY_RE.test(url.pathname)) return next();

  if (!env.BACKEND_ORIGIN) {
    return new Response(
      "Edge proxy misconfigured: BACKEND_ORIGIN environment variable is not set.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const backend = new URL(env.BACKEND_ORIGIN);

  // The host the browser used — carries the tenant subdomain. The backend
  // derives the tenant from this, so it must survive the hop.
  const originalHost = url.host;

  // Rewrite only the origin (scheme/host/port); keep path + query verbatim so
  // the backend still receives /api/... , /authorize?... , etc.
  const targetUrl = new URL(url.pathname + url.search, backend);

  const proxyReq = new Request(targetUrl.toString(), request);
  proxyReq.headers.set("Host", originalHost);
  proxyReq.headers.set("X-Forwarded-Host", originalHost);
  proxyReq.headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  // `redirect: manual` so OIDC 3xx (e.g. /authorize) are passed back to the
  // browser intact rather than being followed at the edge.
  return fetch(proxyReq, { redirect: "manual" });
}
