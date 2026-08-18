# Security policy

This document describes how WatchFlame is secured and how to report a security issue.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Email **watchflame.wildfire@gmail.com** with details and reproduction steps. I'll aim to address valid reports promptly.

## Architecture & trust model

- **No authentication.** The site is read-only and stores no user accounts or personal data server-side. The browser's geolocation stays on the client and is sent only as transient lat/lon query parameters to fetch local data.
- **The backend is a thin proxy** over public government and satellite APIs, with caching. Secrets (NASA FIRMS, OpenWeatherMap, Copernicus) live only in host environment variables and are never committed. The browser only ever sees the intended-public values (`NEXT_PUBLIC_API_URL`, a domain-locked MapTiler key).

## What's protected

- **CORS** is restricted to an explicit origin allowlist in production, and the site refuses to start with a wildcard origin or missing required secrets.
- **Rate limiting** (per IP) caps abuse, with tighter limits on the endpoints that fan out to paid or quota-limited upstreams. This is the main defense against cost-and-quota exhaustion of an unauthenticated public API.
- **Input validation** on every route (pydantic bounds). The `/fires` bounding box is validated and canonicalized so untrusted text never reaches an upstream URL.
- **Request body size** is capped. **Security headers** (nosniff, frame-deny, referrer, permissions, HSTS) are sent on every response, along with a Content-Security-Policy on the web frontend.
- **Safe failure.** Unhandled errors return a generic body with no stack traces. A logging redaction filter scrubs secrets from logs as a backstop.
- **Supply chain.** See the dedicated section below.

## Supply chain & dependency integrity

A few defenses against compromised, typosquatted, or AI-hallucinated ("slopsquatted") packages:

- **Real, deliberately chosen dependencies.** The manifests use only well-known package names, each checked before it is added, so a typosquatted or made-up name never slips in (the real `scikit-learn`, not the lookalike `sklearn`).
- **Locked, hash-verified installs.** `web/package-lock.json` pins exact npm versions with SHA-512 integrity hashes, so a tampered re-publish fails to install. Python dependencies are audited in CI with `pip-audit` and can be installed with hash verification on deploy.
- **Secret and advisory scanning.** `gitleaks` runs in CI to catch committed secrets, and Dependabot watches both ecosystems for known vulnerabilities.

## Model artifact

The ignition model ships as a committed `joblib` file loaded from a fixed path ([api/models/ignition_model.joblib](api/models/ignition_model.joblib)). joblib deserialization can execute code, so the artifact is trusted because of how it is produced: it comes from the project's own training script, and its integrity is git's. It is never loaded from user input or an untrusted source.

## Out of scope

Denial-of-service via distributed traffic (handled at the hosting/CDN layer), the security of the upstream third-party APIs, and any issue requiring physical or host-level access. This is a demonstration project, not a production emergency service. See the disclaimer on the site.
