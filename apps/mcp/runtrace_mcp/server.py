from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP


BASE_URL = os.getenv("RUNTRACE_BASE_URL", "http://localhost:8000").rstrip("/")
mcp = FastMCP("RunTrace")


def request(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    with httpx.Client(base_url=BASE_URL, timeout=15) as client:
        response = client.request(method, path, json=payload)
        response.raise_for_status()
        return response.json() if response.content else None


@mcp.tool()
def get_project_context(project: str) -> dict[str, Any]:
    """Retrieve program.md, exclusions, baseline, metrics, proposals, and recent evidence for one project."""
    return request("GET", f"/api/v1/projects/{project}/context")


@mcp.tool()
def search_experiments(project: str, query: str, include_archived: bool = False, limit: int = 10) -> dict[str, Any]:
    """Search hypotheses, reasoning, changes, outcomes, and conclusions within a project."""
    return request("POST", "/api/v1/search", {"project": project, "query": query, "include_archived": include_archived, "limit": limit})


@mcp.tool()
def get_run(run_id: str) -> dict[str, Any]:
    """Retrieve a complete run, including metrics, events, parameters, and artifacts."""
    return request("GET", f"/api/v1/runs/{run_id}")


@mcp.tool()
def propose_experiment(project: str, title: str, hypothesis: str, reasoning: str = "", implementation_details: str = "", source_model: str | None = None, metric_mode: str = "curve") -> dict[str, Any]:
    """Add a proposed experiment to a project's shared registry without dispatching it."""
    return request("POST", f"/api/v1/projects/{project}/experiments", {"title": title, "hypothesis": hypothesis, "reasoning": reasoning, "implementation_details": implementation_details, "source": "agent", "source_model": source_model, "metric_mode": metric_mode})


@mcp.tool()
def claim_experiment(project: str, worker_id: str, experiment_id: str | None = None) -> dict[str, Any]:
    """Atomically claim a specific or next proposed experiment."""
    suffix = f"/{experiment_id}/claim" if experiment_id else "/claim"
    return request("POST", f"/api/v1/projects/{project}/experiments{suffix}", {"worker_id": worker_id})


@mcp.tool()
def create_run(project: str, name: str, hypothesis: str, reasoning: str = "", experiment_id: str | None = None, evidence_used: list[dict[str, Any]] | None = None, decision_changed: str = "", configuration: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create and start a tracked run, ideally citing retrieved evidence."""
    return request("POST", f"/api/v1/projects/{project}/runs", {"name": name, "hypothesis": hypothesis, "reasoning": reasoning, "experiment_id": experiment_id, "evidence_used": evidence_used or [], "decision_changed": decision_changed, "configuration": configuration or {}})


@mcp.tool()
def log_metric(run_id: str, name: str, value: float, step: int | None = None) -> dict[str, Any]:
    """Append one primary or diagnostic metric to a running run."""
    return request("POST", f"/api/v1/runs/{run_id}/metrics", {"metrics": [{"name": name, "value": value, "step": step}]})


@mcp.tool()
def log_event(run_id: str, message: str, level: str = "info", event_type: str | None = None) -> dict[str, Any]:
    """Append a structured event to a run."""
    return request("POST", f"/api/v1/runs/{run_id}/events", {"message": message, "level": level, "event_type": event_type})


@mcp.tool()
def finish_run(run_id: str, disposition: str, result_summary: str, conclusion: str) -> dict[str, Any]:
    """Finish a run and record its research disposition and reusable conclusion."""
    return request("POST", f"/api/v1/runs/{run_id}/finish", {"disposition": disposition, "result_summary": result_summary, "conclusion": conclusion})


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

