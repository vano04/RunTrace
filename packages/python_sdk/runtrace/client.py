from __future__ import annotations

import atexit
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time
import uuid
import warnings
from collections import deque
from pathlib import Path
from typing import Any

import httpx
import psutil


def _git(args: list[str], cwd: str) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=cwd, text=True, stderr=subprocess.DEVNULL, timeout=2).strip()
    except (OSError, subprocess.SubprocessError):
        return None


def _metadata(cwd: str) -> dict[str, Any]:
    return {
        "host_metadata": {
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
            "cpu_count": psutil.cpu_count(),
            "memory_bytes": psutil.virtual_memory().total,
        },
        "environment_metadata": {
            "python": sys.version.split()[0],
            "executable": sys.executable,
            "argv": sys.argv,
        },
        "git_commit": _git(["rev-parse", "HEAD"], cwd),
        "git_branch": _git(["branch", "--show-current"], cwd),
        "git_dirty": bool(_git(["status", "--porcelain"], cwd)),
    }


class RunTrace:
    def __init__(self, base_url: str = "http://localhost:8000", api_key: str | None = None, strict: bool = False, timeout: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.strict = strict
        self.client = httpx.Client(base_url=self.base_url, timeout=timeout, headers={"Authorization": f"Bearer {api_key}"} if api_key else {})
        self._buffer: deque[tuple[str, str, dict[str, Any], str]] = deque(maxlen=2000)
        self._lock = threading.Lock()
        atexit.register(self.flush)

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None, *, buffer: bool = False, request_id: str | None = None) -> Any:
        request_id = request_id or str(uuid.uuid4())
        try:
            response = self.client.request(method, path, json=payload, headers={"X-Request-ID": request_id})
            response.raise_for_status()
            return response.json() if response.content else None
        except (httpx.HTTPError, OSError):
            if buffer:
                with self._lock:
                    self._buffer.append((method, path, payload or {}, request_id))
                warnings.warn(f"RunTrace is unavailable; buffered {method} {path}", RuntimeWarning, stacklevel=2)
                return None
            if self.strict:
                raise
            return None

    def flush(self) -> int:
        sent = 0
        with self._lock:
            pending = list(self._buffer)
        for method, path, payload, request_id in pending:
            try:
                response = self.client.request(method, path, json=payload, headers={"X-Request-ID": request_id})
                response.raise_for_status()
            except (httpx.HTTPError, OSError):
                break
            with self._lock:
                if self._buffer and self._buffer[0][3] == request_id:
                    self._buffer.popleft()
            sent += 1
        return sent

    def search(self, project: str, query: str, limit: int = 10, include_archived: bool = False) -> dict[str, Any] | None:
        return self.request("POST", "/api/v1/search", {"project": project, "query": query, "limit": limit, "include_archived": include_archived})

    def create_project(self, name: str, slug: str, description: str = "") -> dict[str, Any] | None:
        return self.request("POST", "/api/v1/projects", {"name": name, "slug": slug, "description": description})

    def run(self, project: str, name: str, hypothesis: str = "", reasoning: str = "", tags: list[str] | None = None, **kwargs: Any) -> "Run":
        return Run(self, project, name, hypothesis, reasoning, tags or [], kwargs)


class Run:
    def __init__(self, client: RunTrace, project: str, name: str, hypothesis: str, reasoning: str, tags: list[str], options: dict[str, Any]):
        self.client = client
        self.project = project
        self.name = name
        self.hypothesis = hypothesis
        self.reasoning = reasoning
        self.tags = tags
        self.options = options
        self.id: str | None = None
        self.display_id: str | None = None
        self._finished = False

    def __enter__(self) -> "Run":
        cwd = self.options.pop("working_directory", os.getcwd())
        payload = {
            "name": self.name,
            "hypothesis": self.hypothesis,
            "reasoning": self.reasoning,
            "working_directory": cwd,
            "command": " ".join(sys.argv),
            "configuration": {"tags": self.tags},
            **_metadata(cwd),
            **self.options,
        }
        created = self.client.request("POST", f"/api/v1/projects/{self.project}/runs", payload)
        if not created:
            if self.client.strict:
                raise RuntimeError("RunTrace server unavailable")
            return self
        self.id = created["id"]
        self.display_id = created["display_id"]
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        if exc is not None:
            self.abort(str(exc))
        elif not self._finished:
            self.finish("undecided")
        return False

    def _send(self, path: str, payload: dict[str, Any], *, buffer: bool = True) -> Any:
        if not self.id:
            return None
        return self.client.request("POST", f"/api/v1/runs/{self.id}/{path}", payload, buffer=buffer)

    def log_metric(self, name: str, value: float, step: int | None = None, timestamp: str | None = None) -> None:
        self.log_metrics({name: value}, step=step, timestamp=timestamp)

    def log_metrics(self, values: dict[str, float], step: int | None = None, timestamp: str | None = None) -> None:
        self._send("metrics", {"metrics": [{"name": name, "value": value, "step": step, "timestamp": timestamp} for name, value in values.items()]})

    def log_param(self, name: str, value: Any) -> None:
        self.log_params({name: value})

    def log_params(self, values: dict[str, Any]) -> None:
        self._send("parameters", {"parameters": values})

    def log_event(self, message: str, level: str = "info", event_type: str | None = None, metadata: dict[str, Any] | None = None) -> None:
        self._send("events", {"message": message, "level": level, "event_type": event_type, "metadata": metadata or {}})

    def log_reasoning(self, text: str, stage: str = "during") -> None:
        self.log_event(text, event_type=f"reasoning.{stage}")

    def set_tags(self, tags: list[str]) -> None:
        self.tags = tags
        self.log_param("tags", tags)

    def link_run(self, run_id: str, relationship: str) -> None:
        self.log_event(f"Linked {run_id} as {relationship}", event_type="run.relationship", metadata={"run_id": run_id, "relationship": relationship})

    def log_artifact(self, path: str, name: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any] | None:
        if not self.id:
            return None
        artifact_path = Path(path)
        try:
            with artifact_path.open("rb") as handle:
                response = self.client.client.post(
                    f"/api/v1/runs/{self.id}/artifacts",
                    files={"file": (name or artifact_path.name, handle)},
                    data={"metadata": json.dumps(metadata or {})},
                )
                response.raise_for_status()
                return response.json()
        except (OSError, httpx.HTTPError):
            if self.client.strict:
                raise
            warnings.warn(f"RunTrace could not upload artifact {artifact_path}", RuntimeWarning, stacklevel=2)
            return None

    def finish(self, outcome: str, result_summary: str | None = None, conclusion: str | None = None) -> None:
        disposition = {"success": "kept", "partial_success": "kept", "failure": "discarded", "inconclusive": "undecided"}.get(outcome, outcome)
        self._send("finish", {"disposition": disposition, "result_summary": result_summary or "", "conclusion": conclusion or ""}, buffer=False)
        self._finished = True

    def abort(self, reason: str | None = None) -> None:
        self._send("crash", {"error_summary": reason or "Run aborted"}, buffer=False)
        self._finished = True


_default = RunTrace(base_url=os.getenv("RUNTRACE_BASE_URL", "http://localhost:8000"), api_key=os.getenv("RUNTRACE_API_KEY"))


def configure(base_url: str = "http://localhost:8000", api_key: str | None = None, strict: bool = False) -> RunTrace:
    global _default
    _default = RunTrace(base_url=base_url, api_key=api_key, strict=strict)
    return _default


def run(project: str, hypothesis: str, reasoning: str = "", name: str | None = None, tags: list[str] | None = None, **kwargs: Any) -> Run:
    return _default.run(project, name or hypothesis[:80], hypothesis, reasoning, tags, **kwargs)


def search(project: str, query: str, limit: int = 10) -> dict[str, Any] | None:
    return _default.search(project, query, limit)


def create_project(name: str, slug: str, description: str = "") -> dict[str, Any] | None:
    return _default.create_project(name, slug, description)
