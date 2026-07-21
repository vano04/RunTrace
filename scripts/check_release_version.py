from __future__ import annotations

import argparse
import json
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+(?:[.-][0-9A-Za-z.-]+)?")


def read_json(path: str) -> dict:
    return json.loads((ROOT / path).read_text())


def read_toml(path: str) -> dict:
    with (ROOT / path).open("rb") as handle:
        return tomllib.load(handle)


def require_version(label: str, actual: str, expected: str) -> None:
    if actual != expected:
        raise SystemExit(f"{label} version is {actual!r}; expected {expected!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify that every release surface uses one version.")
    parser.add_argument("--expected", help="Expected release version, normally derived from the tag.")
    args = parser.parse_args()

    project_version = read_toml("pyproject.toml")["project"]["version"]
    expected = args.expected or project_version
    if not VERSION_PATTERN.fullmatch(expected):
        raise SystemExit(f"Invalid release version: {expected!r}")
    require_version("pyproject.toml", project_version, expected)

    lock_packages = read_toml("uv.lock")["package"]
    locked_project = next(package for package in lock_packages if package["name"] == "mono-research")
    require_version("uv.lock", locked_project["version"], expected)

    web_package = read_json("apps/web/package.json")
    web_lock = read_json("apps/web/package-lock.json")
    require_version("apps/web/package.json", web_package["version"], expected)
    require_version("apps/web/package-lock.json", web_lock["version"], expected)
    require_version("apps/web/package-lock.json root package", web_lock["packages"][""]["version"], expected)

    api_source = (ROOT / "apps/api/mono_api/main.py").read_text()
    api_match = re.search(r"app = FastAPI\([\s\S]*?version=\"([^\"]+)\"", api_source)
    if api_match is None:
        raise SystemExit("Could not find the FastAPI application version")
    require_version("FastAPI metadata", api_match.group(1), expected)

    claude_plugin = read_json("plugins/mono/.claude-plugin/plugin.json")
    codex_plugin = read_json("plugins/mono/.codex-plugin/plugin.json")
    mcp_config = read_json("plugins/mono/.mcp.json")
    require_version("Claude plugin", claude_plugin["version"], expected)
    require_version("Codex plugin", codex_plugin["version"], expected)

    package_spec = f"mono-research[mcp]=={expected}"
    claude_args = claude_plugin["mcpServers"]["mono"]["args"]
    codex_args = mcp_config["mcpServers"]["mono"]["args"]
    if package_spec not in claude_args or package_spec not in codex_args:
        raise SystemExit(f"Plugin MCP launchers must use {package_spec!r}")

    compose = (ROOT / "docker-compose.ghcr.yml").read_text()
    compose_default = f"${{MONO_VERSION:-{expected}}}"
    if compose.count(compose_default) != 3:
        raise SystemExit(f"docker-compose.ghcr.yml must contain three defaults for {compose_default}")

    print(f"Release version consistency verified: {expected}")


if __name__ == "__main__":
    main()
