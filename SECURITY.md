# Security policy

Ember Watch is a personal portfolio project. It takes security seriously despite
having no commercial SLA — this document describes the model and how to report
an issue.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Email
**watchflame.wildfire@gmail.com** with details and reproduction steps. I'll
acknowledge within a few days and aim to address valid reports promptly.

## Architecture & trust model

- **No authentication.** The app is read-only and stores no user accounts or
  personal data server-side. The browser's geolocation stays on the client and
  is sent only as transient lat/lon query parameters to fetch local data.
- **The backend is a thin proxy** over public government / satellite APIs, with
  caching. Secrets (NASA FIRMS, OpenWeatherMap, Copernicus) live only in host
  environment variables and are never committed. The browser only ever sees the
  intended-public values (`NEXT_PUBLIC_API_URL`, a domain-locked MapTiler key).

## What's protected

- **CORS** is restricted to an explicit origin allowlist in production; the app
  refuses to start with a wildcard origin or missing required secrets.
- **Rate limiting** (per IP) caps abuse, with tighter limits on the endpoints
  that fan out to paid / quota-limited upstreams — the main defense against
  cost-and-quota exhaustion of an unauthenticated public API.
- **Input validation** on every route (pydantic bounds); the `/fires` bounding
  box is validated and canonicalized so untrusted text never reaches an
  upstream URL.
- **Request body size** is capped; **security headers** (nosniff, frame-deny,
  referrer, permissions, HSTS) are sent on every response, plus a
  Content-Security-Policy on the web app.
- **Safe failure** — unhandled errors return a generic body (no stack traces);
  a logging redaction filter scrubs secrets from logs as a backstop.
- **Supply chain** — `pip-audit` / `npm audit` and `gitleaks` run in CI, with
  Dependabot watching both ecosystems.

## Out of scope

Denial-of-service via distributed traffic (handled at the hosting/CDN layer),
the security of the upstream third-party APIs, and any issue requiring physical
or host-level access. This is a demonstration app, not a production emergency
service — see the in-app disclaimer.
