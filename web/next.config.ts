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

// Vercel Web Analytics — in production the script + beacon are first-party
// (/_vercel/insights/*), covered by 'self'. Only in DEV does the SDK load its
// debug script + beacon from this CDN, so allow it in dev only (prod stays tight).
const VERCEL_ANALYTICS = "https://va.vercel-scripts.com";

// 'unsafe-eval' is needed only by the dev toolchain (HMR / react-refresh). The
// production bundle doesn't use eval, so keep it OUT of the prod CSP.
const DEV = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Shipped as *report-only* for now: the app relies on
// MapTiler tiles + browser geolocation + Next's inline hydration bootstrap, so
// this is enforced only after verifying zero console violations in a real
// browser, then flipping the header name to "Content-Security-Policy".
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `img-src 'self' data: blob: ${MAPTILER}`,
  // 'unsafe-inline' for Next's inline hydration bootstrap; 'unsafe-eval' is
  // added in dev only (HMR), never in production.
  `script-src 'self' 'unsafe-inline'${DEV ? ` 'unsafe-eval' ${VERCEL_ANALYTICS}` : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN} ${MAPTILER}${DEV ? ` ${VERCEL_ANALYTICS}` : ""}`.trim(),
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  // Enforced — these are safe and never break legitimate functionality.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses browser geolocation, so allow it for same-origin only; deny
  // camera/microphone entirely.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // CSP in report-only mode until verified (see note above).
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
