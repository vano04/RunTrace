# RunTrace web application

This directory contains the maintained Next.js frontend for RunTrace. It is built by the root `docker-compose.yml` and proxies browser API requests to the FastAPI service through `INTERNAL_API_URL`.

## Develop locally

Start the API from the repository root, then run:

```bash
npm ci
npm run dev:https
```

Open <https://localhost:3000>. Next.js uses `mkcert` to generate and trust a
local certificate; the first run may ask for permission to install its local
certificate authority. The default API target is <http://localhost:8000> and
is proxied through the HTTPS web origin; override it when necessary:

```bash
INTERNAL_API_URL=http://127.0.0.1:8000 npm run dev:https
```

Use `npm run dev` when passkeys and other secure-context browser APIs are not
needed.

## Checks

```bash
npm run lint
npm run build
```

The production image uses the Next.js standalone output. Deployment, authentication, and environment configuration are documented in the repository [README](../../README.md) and [deployment guide](../../docs/README.md).
