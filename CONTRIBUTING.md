# Contributing to StockSight

Thank you for taking the time to improve StockSight. Contributions of code,
documentation, bug reports, and product feedback are welcome.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.
For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Before You Start

- Search existing issues and pull requests so duplicate work can be avoided.
- For a substantial change, open an issue first to describe the problem and
  proposed direction.
- Keep pull requests focused on one coherent change.

## Local Setup

Use the setup instructions in the root [README](README.md). The project has a
FastAPI backend and a React/Vite frontend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cd ../frontend
npm ci
```

Copy the example environment files before running the services. Never commit
`.env`, `.env.local`, API keys, database credentials, or generated databases.

## Development Guidelines

- Follow the existing module boundaries and naming conventions.
- Keep provider and model credentials on the backend; never expose them in the
  frontend bundle.
- Update the relevant documentation when an endpoint, environment variable,
  prompt contract, or deployment setting changes.
- Preserve validation at the API and persistence boundaries.
- Add a succinct comment only when the intent cannot be understood from the
  code itself.

## Verification

Run the checks relevant to your change before opening a pull request:

```bash
cd frontend
npm run build
```

For backend changes, start the API and run the smoke checks documented in
[the API reference](docs/API.md):

```bash
curl http://localhost:8000/api/health
curl 'http://localhost:8000/api/quote?symbol=AAPL'
```

The repository does not currently ship an automated test or lint command. If
you add one, document it here and include it in the pull request description.

## Pull Requests

A good pull request should:

- explain the user-visible problem and the chosen solution;
- describe configuration, schema, or migration changes;
- list the commands used to verify the change;
- include screenshots or a short recording for visible UI changes;
- call out known limitations and follow-up work.

Maintainers may ask for revisions, tests, or documentation before merging.
Contributions are accepted under the [MIT License](LICENSE).
