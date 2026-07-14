#!/bin/sh
set -eu

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  compose down -v
  export RUNTRACE_DEV=true
  compose up -d --build
else
  rm -f data/runtrace.db
  echo "Removed native data/runtrace.db. Restart the API with RUNTRACE_SEED_DEMO=true to reseed the demo."
fi
