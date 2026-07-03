/// <reference types="vite/client" />

declare module "*.png" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  // Tenant base domain, e.g. "iam.example.com". Used to derive the tenant slug
  // from the current host (see src/lib/api.ts subdomainTenant).
  readonly VITE_BASE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
