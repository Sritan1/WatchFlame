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
- **Supply chain** — see the dedicated section below.

## Supply chain & dependency integrity

Defenses against compromised, typosquatted, or AI-hallucinated ("slopsquatted")
packages:

- **Every dependency is a real, intentionally-chosen package.** The manifests
  ([api/requirements.txt](api/requirements.txt), [web/package.json](web/package.json))
  use only canonical, well-known names — e.g. the ML stack pins `scikit-learn`,
  never the `sklearn` dummy shim that is a known squat vector. New dependencies
  are verified to exist and to be the intended project before being added;
  AI-suggested package names are never trusted blindly.
- **npm installs are integrity-checked.** `web/package-lock.json` pins exact
  versions with SHA-512 integrity hashes, so a malicious re-publish under an
  existing version fails the install.
- **pip installs are auditable and hash-verifiable.** `pip-audit` (OSV) runs in
  CI against the production set; for deployment the pinned set is compiled with
  hashes and installed with integrity verification:

  ```bash
  # Generate ON the Linux deploy target: uvicorn[standard] pulls Unix-only
  # uvloop, so the hash lock must be produced on the platform it installs on
  # (a Windows-generated lock omits it). pip-tools is in requirements-dev.txt.
  pip-compile --generate-hashes -o requirements.lock api/requirements.txt
  pip install --require-hashes -r requirements.lock
  ```

- **Secret scanning** — `gitleaks` runs in CI; Dependabot watches both
  ecosystems for advisories.

## Model artifact

The ignition model ships as a committed `joblib` file loaded from a fixed path
([api/models/ignition_model.joblib](api/models/ignition_model.joblib)). joblib
deserialization can execute code, so the artifact is trusted **by construction**:
it is produced by the project's own training script and its integrity is the
repository's (git). It is never loaded from user input or an untrusted source.

## Out of scope

Denial-of-service via distributed traffic (handled at the hosting/CDN layer),
the security of the upstream third-party APIs, and any issue requiring physical
or host-level access. This is a demonstration app, not a production emergency
service — see the in-app disclaimer.
