# Disable registration via `REGISTER` env var

## Purpose

The app currently lets anyone hit `/login` and self-register a new account. For a self-hosted, personal deployment, the owner wants a way to fully turn registration off via a `REGISTER=false` environment variable on the `server` service in docker-compose, without needing to rebuild or redeploy the frontend.

## Constraint

The frontend is a static SPA built once into a Docker image (`nginx/Dockerfile` runs `npm run build`), so `import.meta.env.VITE_*` values are baked in at build time. A `REGISTER` var set on a container at *runtime* (docker-compose `environment:`) is invisible to already-built frontend JS. The backend, on the other hand, is a long-running Node process that reads `process.env` live — so it's the natural single source of truth.

## Design

- `REGISTER` env var lives only on the `server` service. Default (unset) is **enabled** — existing deployments keep working without changes.
- Backend enforces the block for real: `POST /api/auth/register` returns `403 { error: "Registration is disabled" }` when `process.env.REGISTER === "false"`. This holds regardless of what the frontend does (e.g. a direct `curl`).
- Backend exposes the flag via a new public, unauthenticated endpoint: `GET /api/auth/config` → `{ registrationEnabled: boolean }`.
- Frontend (`AuthContext.tsx`) fetches `/api/auth/config` once on mount and stores `registrationEnabled` in context, defaulting to `true` while loading or if the fetch fails (harmless default — the backend still enforces the real rule either way, this only controls whether the UI *offers* the option).
- Frontend (`LoginPage.tsx`) only renders the "Need an account? Register" toggle (and the ability to switch into register mode) when `registrationEnabled` is `true`.
- `docker-compose.yml` and `docker-compose.prod.yml`: add `REGISTER: ${REGISTER:-true}` to the `server` service's `environment:` block, following the existing `${VAR:-default}` convention already used for `SEARXNG_URL` etc.

## Out of scope

- No admin UI toggle — this is a deploy-time/ops setting only, matching how the user framed the request (docker-compose env var).
- No change to login, existing accounts, or JWT behavior.

## Verification

1. Set `REGISTER=false` in the server environment, restart the server.
2. `curl http://localhost/api/auth/config` → `{ "registrationEnabled": false }`.
3. `curl -X POST http://localhost/api/auth/register -d '{"username":"x","password":"password123"}' -H 'Content-Type: application/json'` → `403`.
4. Reload the login page in the browser → "Need an account? Register" toggle is gone.
5. Unset `REGISTER` (or set to `true`), restart, confirm both the endpoint and the UI toggle revert to enabled.
