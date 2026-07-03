// _worker.js — Cloudflare Workers entrypoint for the ioark SPA.
//
// It does TWO jobs (this is what nginx.conf did in the Docker deployment):
//
//  1. Reverse-proxy the backend paths (/api, /authorize, /oauth, /scim,
//     /.well-known, /healthz) to BACKEND_ORIGIN. Because ioark is MULTI-TENANT,
//     the backend must know which organization each request is for. In Docker
//     it read that from the Host header, but Cloudflare forces the subrequest
//     Host to the origin's own hostname (apis.ioark.online), so the backend
//     could only ever see "apis" -> "unknown organization 'apis'". Instead we
//     derive the tenant from the hostname the browser used and pass it in the
//     X-Tenant header, which Cloudflare forwards unchanged. (X-Forwarded-Host is
//     also set, for a cleaner backend that reads it directly.)
//
//     Backend requirement (env vars only, no code change):
//       ENVIRONMENT=dev            -> makes the backend honor X-Tenant
//       BASE_DOMAIN=edge.invalid   -> a value that is NOT a parent of
//                                     apis.ioark.online, so the backend stops
//                                     guessing the tenant from its own Host and
//                                     uses our X-Tenant instead.
//
//  2. Serve the Vite build (dist/) via the ASSETS binding, with
//     single-page-application fallback so React Router deep links resolve.
//
// Worker vars (wrangler.toml [vars] or dashboard):
//   BACKEND_ORIGIN      = https://apis.ioark.online
//   TENANT_BASE_DOMAIN  = ioark.online   (domain the SPA/tenant subdomains live under)

const PROXY_RE = /^\/(api|authorize|oauth|scim|\.well-known|healthz)(\/|$)/;
const CONTROL_PLANE = 'system';

// acme.ioark.online -> "acme"; ioark.online / www / workers.dev / unknown ->
// the control plane ("system"). Mirrors the backend's tenant slug rules.
function tenantFromHost(host, base) {
  host = (host || '').split(':')[0].toLowerCase();
  if (!host) return CONTROL_PLANE;
  base = (base || '').toLowerCase();
  if (base) {
    if (host === base || host === 'www.' + base) return CONTROL_PLANE;
    if (host.endsWith('.' + base)) {
      return host.slice(0, -(base.length + 1)).split('.')[0] || CONTROL_PLANE;
    }
  }
  return CONTROL_PLANE;
}

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
      const tenant = tenantFromHost(url.host, env.TENANT_BASE_DOMAIN);

      const buildProxyRequest = (targetUrl, req) => {
        const proxyReq = new Request(targetUrl.toString(), req);
        // Tell the backend which organization this request is for.
        proxyReq.headers.set('X-Tenant', tenant);
        proxyReq.headers.set('X-Forwarded-Host', url.host);
        proxyReq.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
        // Some backends also look at the Host header to derive the tenant.
        proxyReq.headers.set('Host', url.host);
        return proxyReq;
      };

      // Rewrite only the origin; keep path + query so the backend still sees
      // /api/... , /authorize?... , etc.
      const target = new URL(url.pathname + url.search, backend);
      const initialReq = buildProxyRequest(target, request.clone());

      // `redirect: manual` so OIDC 3xx (e.g. /authorize) pass back to the
      // browser intact instead of being followed at the edge.
      let res = await fetch(initialReq, { redirect: 'manual' });

      // Some deployments reject the tenantless upstream host with
      // "Unknown organization 'apis'". Retry against a tenant-scoped hostname
      // when that happens, while still preserving the X-Tenant header.
      if (res.status === 404) {
        const bodyText = await res.text();
        const shouldRetryTenantHost = bodyText.includes('Unknown organization') && tenant && tenant !== CONTROL_PLANE;
        if (shouldRetryTenantHost) {
          const tenantBackend = new URL(backend);
          tenantBackend.hostname = `${tenant}.${tenantBackend.hostname}`;
          const tenantTarget = new URL(url.pathname + url.search, tenantBackend);
          const fallbackReq = buildProxyRequest(tenantTarget, request.clone());
          res = await fetch(fallbackReq, { redirect: 'manual' });
        }
        if (res.status === 404) {
          return new Response(bodyText, {
            status: res.status,
            headers: res.headers,
          });
        }
      }

      return res;
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
