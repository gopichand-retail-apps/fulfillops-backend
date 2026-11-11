# FulfillOps Backend

![CI](https://github.com/gopichand-retail-apps/fulfillops-backend/actions/workflows/ci.yml/badge.svg)

[Architecture guide](docs/architecture.md) — source map, workflows, contracts, data, security, and checks.

## Repository layout and deployment boundary

This independent repository owns FulfillOps's NestJS / TypeScript API and authoritative Process memory state. The UI is the separate [fulfillops-frontend](https://github.com/gopichand-retail-apps/fulfillops-frontend) repository. Keep the current directory names, Git histories, origins, and independent builds.

The Vercel configuration belongs to the frontend only. This API has no verified Vercel deployment adapter. Process-local state is not durable and would split across instances. Do not deploy the local simulator as a public API or point it at real records.

Use Node **24.15.0**, npm, and the committed package-lock.json. From the full Retail Apps workspace, `./scripts/Start-Apps.ps1 -App FulfillOps` uses the correct built/native entry after setup. From this repository alone, build with npm.cmd run build, then run node dist/src/main.js.

Health: http://127.0.0.1:5202/api/v1/health. State resets on restart; there is no database to configure. The [API contract](openapi.json) and [canonical architecture](docs/architecture.md) describe the existing routes and trust boundaries. The architecture guide is inside this repository.

Known release gaps: All server state resets on API restart. The archived production entry and browser command are incorrect for this Windows setup; use dist/src/main.js and the workspace E2E adapter. Real warehouse authorization and durable state remain absent.

NestJS API for the FulfillOps warehouse workflow. This is an independent
repository from `fulfillops-frontend`; open both in VS Code with
`../FulfillOps.code-workspace`.

## Run

```bash
npm ci
npm run start:dev
```

The API binds to `127.0.0.1:5202`. Health check:
`GET http://127.0.0.1:5202/api/v1/health`.

## API

- `GET /api/v1/auth/profiles`
- `POST /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `GET /api/v1/summary`
- `GET /api/v1/orders?status=all&q=headphones&limit=50`
- `GET /api/v1/orders/:id`
- `GET /api/v1/returns`
- `POST /api/v1/orders/:id/actions`

Action requests require an HttpOnly `fulfillops_session` cookie,
`Idempotency-Key`, and an order version. The API lists synthetic profile IDs,
rejects unknown profiles, and derives action permissions from the server-side
session rather than a client-supplied role header. Sessions are held in memory
for up to eight hours; changing profiles revokes the previous session. Local
profile selection is unavailable in production. This is not a production
identity provider or multi-tenant ownership system.

Example allocation request:

```json
{
  "action": "allocate",
  "version": 1
}
```

First request `GET /api/v1/auth/profiles`, then `POST /api/v1/auth/session` with
`{ "profileId": "warehouse_manager" }`. The session cookie is returned as
`HttpOnly; SameSite=Lax`; it is never returned in JSON.

Every response includes a `requestId`. Errors use `{ code, message, requestId }`.
Request and workflow completion/failure events are emitted as JSON to stdout;
request and response bodies are not logged.

The complete OpenAPI contract is in [`openapi.json`](openapi.json).

## Verify

```bash
npm run format:check
npm run lint
npx tsc --noEmit -p tsconfig.build.json
npm run validate:openapi
FULFILLOPS_COVERAGE_DIRECTORY=/tmp/fulfillops-backend-coverage npm run test:cov -- --runInBand --coverageDirectory=/tmp/fulfillops-backend-coverage
FULFILLOPS_COVERAGE_DIRECTORY=/tmp/fulfillops-backend-coverage npm run coverage:check
npm run test:e2e -- --runInBand
npm audit --audit-level=moderate
npm run build
```

The coverage run includes source unit tests and the in-memory HTTP tests in
`test/app.e2e-spec.ts`. Jest enforces 95% in each metric for
`src/fulfillment/fulfillment.service.ts` and
`src/auth/demo-session.service.ts`. Run `npm run coverage:check` afterward to
enforce 90% aggregate statements, branches, functions, and lines and repeat the
95% critical-file checks against the generated report. Only `src/main.ts` and
Nest module-registration files are excluded as process-entrypoint/dependency-
injection wiring; controllers, DTOs, filters, middleware, repositories, and
domain logic remain measured.

The current full dependency audit reports eight low-severity paths to a
`deepmerge` advisory through development tooling (`@nestjs/cli` and Jest). The
suggested forced fix downgrades Nest CLI to an incompatible major version, so
it was not applied. CI scans the complete dependency graph and blocks
moderate-or-higher findings; `npm audit --omit=dev` reports no runtime
vulnerabilities. Recheck the advisory for a compatible upstream fix.

## Demo limits

Order data, idempotency records, and synthetic sessions are in memory and reset
on API restart. No database, real identity provider, carrier connection, or
PortfolioOps collector is configured. Shipment actions are simulations only.
