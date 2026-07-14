# RunTrace web application

This directory contains the maintained Next.js frontend for RunTrace. It is built by the root `docker-compose.yml` and proxies browser API requests to the FastAPI service through `INTERNAL_API_URL`.

## Develop locally

Start the API from the repository root, then run:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The default API target is
<http://localhost:8000>; override it when necessary:

```bash
INTERNAL_API_URL=http://127.0.0.1:8000 npm run dev
```

## Checks

```bash
npm run lint
npm run build
```

The production image uses the Next.js standalone output. Deployment, authentication, and environment configuration are documented in the repository [README](../../README.md) and [deployment guide](../../docs/README.md).
