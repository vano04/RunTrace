#!/bin/sh
set -eu

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is required." >&2
    exit 1
  fi
}

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if ! command -v git >/dev/null 2>&1; then
  echo "Git is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is not running." >&2
  exit 1
fi

echo "Updating RunTrace source..."
git pull --ff-only

echo "Rebuilding and restarting RunTrace..."
compose up -d --build --remove-orphans

echo "RunTrace update complete."
compose ps
