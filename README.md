# FulfillOps Backend

NestJS API for the FulfillOps warehouse workflow. This is an independent
repository from `fulfillops-frontend`; open both in VS Code with
`../FulfillOps.code-workspace`.

## Run

```bash
npm install
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