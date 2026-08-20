# Security Policy

This file describes how to report a security vulnerability in StockSight. The
runtime limitations and the hardening work still required for a public,
multi-user deployment are documented in
[`docs/SECURITY.md`](docs/SECURITY.md).

## Supported Versions

StockSight is currently an MVP. Security fixes are developed against the
latest commit on the `main` branch. Older commits and deployed instances may
not receive fixes.

## Reporting a Vulnerability

Please do not disclose a vulnerability in a public issue, pull request, or
discussion. Use GitHub's private vulnerability reporting channel for this
repository when available. If private reporting is unavailable, open a minimal
issue asking for a private contact method and do not include exploit details,
credentials, personal data, or reproduction steps.

Please include, when safe to share:

- the affected commit, endpoint, component, or deployment;
- a concise description of the impact;
- reproducible steps or a minimal proof of concept;
- any suggested mitigation.

## Response and Disclosure

The maintainer will acknowledge a report as soon as practical, investigate its
impact, and coordinate a fix or mitigation. Please allow reasonable time for a
fix before public disclosure. Do not include secrets or live user data in a
report; redact them and rotate compromised credentials immediately.

## Scope Notes

The hosted MVP may accept unauthenticated requests and client-supplied quote
data, as described in [`docs/SECURITY.md`](docs/SECURITY.md). Reports that
demonstrate a concrete security impact are welcome even when they involve a
known limitation; please distinguish an existing limitation from a newly
introduced vulnerability.
