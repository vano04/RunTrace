# Deployment guide

The included Compose stack is the supported single-host deployment baseline. It runs PostgreSQL, the API, and the web app with persistent named volumes. Review this guide and `auth.md` before making the instance reachable outside localhost.

## Deployment modes

Normal mode is empty, persistent, and protected by browser passkeys:

```bash
docker compose up -d --build
```

Development mode is unauthenticated and seeds an empty database:

```bash
RUNTRACE_DEV=true docker compose up -d --build
```

Development mode is for a trusted workstation only. It is not a production authentication option.

## Production checklist

Before exposing RunTrace on a network:

1. Put the web service behind a TLS-terminating reverse proxy and use a stable hostname.
2. Set `RUNTRACE_WEBAUTHN_RP_ID` to that hostname and `RUNTRACE_WEBAUTHN_ORIGINS` to its exact `https://` origin before enrolling the owner.
3. Set `RUNTRACE_CORS_ORIGINS` to the same public origin.
4. Replace the example PostgreSQL credentials in `docker-compose.yml` or supply an environment-specific Compose override and secret management.
5. Keep PostgreSQL and the API private to the host or internal network where possible. The checked-in Compose file publishes the API on port 8000 for local development and diagnostics.
6. Keep `RUNTRACE_DEV=false` and `RUNTRACE_SEED_DEMO=false`.
7. Arrange database and artifact-volume backups, then test restoration.
8. Create separate expiring agent tokens for each CLI or MCP host and store them in that host's secret manager.
9. Add resource limits, log collection, and monitoring appropriate to the host.

## Environment

Compose accepts these deployment values from the shell or a local `.env` file:

```env
RUNTRACE_DEV=false
RUNTRACE_CORS_ORIGINS=https://runtrace.example.com
RUNTRACE_WEBAUTHN_RP_ID=runtrace.example.com
RUNTRACE_WEBAUTHN_RP_NAME=RunTrace
RUNTRACE_WEBAUTHN_ORIGINS=https://runtrace.example.com
RUNTRACE_SESSION_TTL_HOURS=168
RUNTRACE_SETUP_LINK_TTL_HOURS=24
RUNTRACE_CLAIM_TIMEOUT_SECONDS=300
RUNTRACE_MAX_ARTIFACT_SIZE=10485760
```

Do not commit a populated `.env` file. Passkeys are bound to the RP ID and public origin, so changing either after enrollment makes existing credentials unusable.

## Persistence and backups

Compose uses three named volumes:

- `runtrace-postgres` for PostgreSQL data;
- `runtrace-artifacts` for uploaded run artifacts.
- `runtrace-models` for the optional, regenerable embedding-model cache.

`docker compose down` preserves both. `docker compose down -v` deletes them permanently.

Back up PostgreSQL with the database's standard logical or physical backup tooling and back up the artifact volume at a matching point in time. A usable restore needs both stores. Test the process against a separate Compose project before relying on it.

## Upgrades

Before upgrading:

1. read the incoming changes and migration files;
2. back up the database and artifacts;
3. build the new images;
4. let the API container run `alembic upgrade head` during startup;
5. verify `/health`, sign-in, project access, and a representative artifact download.

Do not run two application versions against the same database during a schema migration unless that release explicitly supports rolling upgrades.

## Demo reset

`./scripts/reset-demo.sh` destroys the current Compose volumes, rebuilds the stack with `RUNTRACE_DEV=true`, and inserts demo records into the empty database. It is intentionally destructive and should never be part of deployment automation.

## Verification

```bash
docker compose config
RUNTRACE_DEV=true docker compose config
curl --fail http://localhost:8000/health
```

For repository-level tests and builds, use the commands in the root `README.md`.
