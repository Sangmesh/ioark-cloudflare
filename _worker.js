// _worker.js — Cloudflare Workers entrypoint for the ioark SPA.
//
// It does TWO jobs (this is what nginx.conf did in the Docker deployment):
//
//  1. Reverse-proxy the backend paths (/api, /authorize, /oauth, /scim,
//     /.well-known, /healthz) to BACKEND_ORIGIN. The original tenant-bearing
//     Host (e.g. acme.iam.example.com) is forwarded so the backend's
//     Host-based tenant resolution keeps working — the backend IGNORES
//     X-Tenant in production (see iam-platform/backend/app/core/tenancy.py).
//     Keeping the API same-origin also means the SPA's cookie-based auth
//     (`credentials: "include"`) needs no CORS and no cookie changes.
//
//  2. Serve the Vite build (dist/) via the ASSETS binding declared in
//     wrangler.toml's [assets] block, with single-page-application fallback so
//     React Router deep links resolve on the client.
//
// Required variable: BACKEND_ORIGIN (wrangler.toml [vars], or override as a
// Workers variable/secret in the dashboard), e.g. https://api.example.com

const PROXY_RE = /^\/(api|authorize|oauth|scim|\.well-known|healthz)(\/|$)/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── 1. Backend reverse proxy ────────────────────────────────────────────
    if (PROXY_RE.test(url.pathname)) {
      if (!env || !env.BACKEND_ORIGIN) {
        return new Response(
          'BACKEND_ORIGIN is not configured. Set it in wrangler.toml [vars] or ' +
          'as a Workers variable in the Cloudflare dashboard.',
          { status: 500, headers: { 'content-type': 'text/plain' } },
        );
      }
      const backend = new URL(env.BACKEND_ORIGIN);
      // Rewrite only the origin; keep path + query so the backend still sees
      // /api/... , /authorize?... , etc.
      const target = new URL(url.pathname + url.search, backend);

      const proxyReq = new Request(target.toString(), request);
      // Preserve the tenant identity for the backend's Host-based resolution.
      proxyReq.headers.set('Host', url.host);
      proxyReq.headers.set('X-Forwarded-Host', url.host);
      proxyReq.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      // `redirect: manual` so OIDC 3xx (e.g. /authorize) pass back to the
      // browser intact instead of being followed at the edge.
      return fetch(proxyReq, { redirect: 'manual' });
    }

    // ── 2. Static SPA assets (with SPA fallback) ────────────────────────────
    if (!env || !env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      const keys = env ? Object.keys(env).join(', ') || '(none)' : '(env is undefined)';
      return new Response(
        'ASSETS binding is missing. wrangler.toml [assets] section may not ' +
        'have been honoured by the deploy. Available env keys: ' + keys,
        { status: 500, headers: { 'content-type': 'text/plain' } },
      );
    }

    try {
      const res = await env.ASSETS.fetch(request);
      // Workers Assets returns 404 for unknown paths; for client-side routing
      // serve index.html instead — but only for extension-less routes (requests
      // for *.js, *.css, *.png, etc. keep their 404).
      if (res.status === 404 && !url.pathname.includes('.')) {
        const indexRequest = new Request(url.origin + '/index.html', request);
        return await env.ASSETS.fetch(indexRequest);
      }
      return res;
    } catch (e) {
      if (!url.pathname.includes('.')) {
        try {
          const indexRequest = new Request(url.origin + '/index.html', request);
          return await env.ASSETS.fetch(indexRequest);
        } catch (_) {/* fall through */}
      }
      return new Response('Asset fetch error: ' + (e && e.message ? e.message : String(e)),
        { status: 500, headers: { 'content-type': 'text/plain' } });
    }
  }
};
