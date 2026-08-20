# Documentation

This directory contains the detailed, versioned documentation for StockSight AI. The root [README](../README.md) is intentionally limited to project context and a quick local start.

## Guides

- [API reference](API.md): endpoints, request/response shapes, validation, and smoke tests.
- [Configuration](CONFIGURATION.md): backend and frontend environment variables.
- [Architecture](ARCHITECTURE.md): request flow, modules, caching, and storage adapters.
- [Prompt contract](PROMPT.md): system prompt, user template, model call, and validation behavior.
- [Deployment](DEPLOYMENT.md): Supabase migration and Render Blueprint setup.
- [Security and limitations](SECURITY.md): implemented controls and release blockers.
- [Troubleshooting](TROUBLESHOOTING.md): common startup, provider, model, and deployment failures.

## Product and Requirements

- [Product requirements](PRD.md): product brief, user stories, data flow, risks, and milestones.
- [Implementation requirements](REQUIREMENTS.md): shipped behavior and planned hardening.

## Documentation Convention

Source code is authoritative for runtime behavior. When an endpoint, environment variable, prompt, or deployment setting changes, update the matching document in the same change. Keep the root README short and link to the detailed page instead of duplicating long API examples.
