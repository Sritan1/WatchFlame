import type { NextConfig } from "next";

// Origin of the FastAPI backend, derived from the public API URL so CSP
// connect-src can allowlist exactly it (and nothing else). Empty when running
// against mocks.
const API_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_API_URL
      ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
      : "";
  } catch {
    return "";
  }
})();

const MAPTILER = "https://api.maptiler.com https://*.maptiler.com";

// Vercel Web Analytics. In production the script and beacon are first-party
// (/_vercel/insights/*), covered by 'self'. Only in DEV does the SDK load its
// debug script and beacon from this CDN, so allow it in dev only (prod stays tight).
const VERCEL_ANALYTICS = "https://va.vercel-scripts.com";

// 'unsafe-eval' is needed only by the dev toolchain (HMR and react-refresh). The
// production bundle doesn't use eval, so keep it OUT of the prod CSP.
const DEV = process.env.NODE_ENV !== "production";

// Content-Security-Policy, ENFORCED since 2026-07-19. Verified zero console
// violations on the live production site first, then flipped the header name
// from the report-only variant to the enforcing "Content-Security-Policy". The
// app relies on MapTiler tiles, browser geolocation and Next's inline hydration
// bootstrap, all of which the directives below allow.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: ${MAPTILER}`,
  // 'unsafe-inline' covers Next's inline hydration bootstrap. 'unsafe-eval' is
  // added in dev only (HMR), never in production.
  `script-src 'self' 'unsafe-inline'${DEV ? ` 'unsafe-eval' ${VERCEL_ANALYTICS}` : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN} ${MAPTILER}${DEV ? ` ${VERCEL_ANALYTICS}` : ""}`.trim(),
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses browser geolocation, so it gets same-origin only.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
