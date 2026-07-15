from __future__ import annotations

from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP
from runtrace.credentials import resolve_connection


mcp = FastMCP("RunTrace")


def request(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    base_url, api_token = resolve_connection()
    headers = {"Authorization": f"Bearer {api_token}"} if api_token else {}
    with httpx.Client(base_url=base_url, timeout=15, headers=headers) as client:
        response = client.request(method, path, json=payload)
        response.raise_for_status()
        return response.json() if response.content else None


@mcp.tool()
def list_projects() -> list[dict[str, Any]]:
    """List projects available to the current credential so callers can retrieve canonical slugs instead of guessing."""
    return request("GET", "/api/v1/projects")


@mcp.tool()
def get_project_context(project: str) -> dict[str, Any]:
    """Retrieve context for a project slug or ID. Use list_projects when the canonical slug is unknown."""
    return request("GET", f"/api/v1/projects/{project}/context")


@mcp.tool()
def start_experimenting(project: str, worker_id: str, loop_mode: str = "continuous") -> dict[str, Any]:
    """Fetch live context and return a compact one-claim-at-a-time execution contract."""
    if loop_mode not in {"single", "continuous"}:
        raise ValueError("loop_mode must be 'single' or 'continuous'")
    context = request("GET", f"/api/v1/projects/{project}/context")
    return {
        "context": context,
        "worker_id": worker_id,
        "loop": {
            "mode": loop_mode,
            "repeat": loop_mode == "continuous",
            "claim_limit": 1,
            "tracking_owner_required": True,
            "cycle": ["search", "claim", "create_or_attach_one_run", "execute", "finish_or_crash", "refresh"],
            "stop_conditions": [
                "The user stops or pauses the loop.",
                "No relevant claimable experiment remains.",
                "Required authority, credentials, hardware, or project context is unavailable.",
                "A project exclusion or safety constraint prevents further work.",
            ],
        },
        "next_action": f"Choose exactly one tracking owner, search evidence, then claim one proposal as '{worker_id}'.",
    }


@mcp.tool()
def search_experiments(project: str, query: str, include_archived: bool = False, limit: int = 10, include_tags: list[str] | None = None, exclude_tags: list[str] | None = None) -> dict[str, Any]:
    """Search hypotheses, reasoning, changes, outcomes, and conclusions within a project."""
    payload: dict[str, Any] = {"project": project, "query": query, "include_archived": include_archived, "limit": limit}
    if include_tags:
        payload["include_tags"] = include_tags
    if exclude_tags:
        payload["exclude_tags"] = exclude_tags
    return request("POST", "/api/v1/search", payload)


@mcp.tool()
def list_tags(project: str) -> list[dict[str, Any]]:
    """List the available project tags, including rule-backed tags."""
    return request("GET", f"/api/v1/projects/{project}/tags")


@mcp.tool()
def create_tag(project: str, name: str) -> dict[str, Any]:
    """Register a new project tag."""
    return request("POST", f"/api/v1/projects/{project}/tags", {"name": name})


@mcp.tool()
def update_tag(project: str, tag_id: str, name: str) -> dict[str, Any]:
    """Rename a registered tag and update its explicit uses."""
    return request("PATCH", f"/api/v1/projects/{project}/tags/{tag_id}", {"name": name})


@mcp.tool()
def delete_tag(project: str, tag_id: str) -> None:
    """Delete a registered tag and remove its explicit uses."""
    return request("DELETE", f"/api/v1/projects/{project}/tags/{tag_id}")


@mcp.tool()
def get_visualization_guide(project: str) -> dict[str, Any]:
    """Return the project-dashboard visualization guide, including existing built-ins and widgets to avoid duplicating."""
    return request("GET", f"/api/v1/projects/{project}/visualizations/guide")


@mcp.tool()
def get_result_visualization_guide(project: str) -> dict[str, Any]:
    """Return the separate guide and registered types for reusable experiment-run result displays."""
    return request("GET", f"/api/v1/projects/{project}/result-visualizations/guide")


@mcp.tool()
def list_result_visualization_types(project: str) -> list[dict[str, Any]]:
    """List built-in and custom experiment result display types selectable instead of curve, timings, or scalar."""
    return request("GET", f"/api/v1/projects/{project}/result-visualizations")


@mcp.tool()
def create_result_visualization_type(project: str, key: str, name: str, spec: dict[str, Any], description: str = "") -> dict[str, Any]:
    """Create a reusable experiment result display backed by the current run's run_metrics dataset."""
    return request("POST", f"/api/v1/projects/{project}/result-visualizations", {"key": key, "name": name, "description": description, "spec": spec, "created_by": "agent"})


@mcp.tool()
def delete_result_visualization_type(project: str, key: str) -> None:
    """Delete an unused custom experiment result display type; built-ins and in-use types cannot be deleted."""
    return request("DELETE", f"/api/v1/projects/{project}/result-visualizations/{key}")


@mcp.tool()
def list_visualizations(project: str) -> list[dict[str, Any]]:
    """List custom visualizations saved to a project."""
    return request("GET", f"/api/v1/projects/{project}/visualizations")


@mcp.tool()
def get_visualization(project: str, visualization_id: str) -> dict[str, Any]:
    """Retrieve one saved visualization and its resolved project data."""
    return request("GET", f"/api/v1/projects/{project}/visualizations/{visualization_id}")


@mcp.tool()
def preview_visualization(project: str, spec: dict[str, Any]) -> dict[str, Any]:
    """Validate and resolve an RTVis specification without saving it."""
    return request("POST", f"/api/v1/projects/{project}/visualizations/preview", spec)


@mcp.tool()
def generate_visualization(project: str, name: str, spec: dict[str, Any], description: str = "", source_run_id: str | None = None) -> dict[str, Any]:
    """Validate and save an RTVis visualization authored by the host model for the supplied data or project query."""
    payload: dict[str, Any] = {"name": name, "description": description, "spec": spec, "created_by": "agent"}
    if source_run_id:
        payload["source_run_id"] = source_run_id
    return request("POST", f"/api/v1/projects/{project}/visualizations", payload)


@mcp.tool()
def update_visualization(project: str, visualization_id: str, spec: dict[str, Any] | None = None, name: str | None = None, description: str | None = None, visible: bool | None = None, sort_order: int | None = None) -> dict[str, Any]:
    """Update the content, presentation, or placement of a saved visualization."""
    payload = {key: value for key, value in {"spec": spec, "name": name, "description": description, "visible": visible, "sort_order": sort_order}.items() if value is not None}
    return request("PATCH", f"/api/v1/projects/{project}/visualizations/{visualization_id}", payload)


@mcp.tool()
def delete_visualization(project: str, visualization_id: str) -> None:
    """Delete a project visualization."""
    return request("DELETE", f"/api/v1/projects/{project}/visualizations/{visualization_id}")


@mcp.tool()
def export_visualization(project: str, visualization_id: str) -> dict[str, Any]:
    """Export a portable versioned RunTrace visualization document."""
    return request("GET", f"/api/v1/projects/{project}/visualizations/{visualization_id}/export")


@mcp.tool()
def import_visualization(project: str, document: dict[str, Any], name: str | None = None) -> dict[str, Any]:
    """Validate and import a portable RunTrace visualization document into a project."""
    payload: dict[str, Any] = {"document": document, "created_by": "agent"}
    if name:
        payload["name"] = name
    return request("POST", f"/api/v1/projects/{project}/visualizations/import", payload)


@mcp.tool()
def get_run(run_id: str) -> dict[str, Any]:
    """Retrieve a complete run, including metrics, events, parameters, and artifacts."""
    return request("GET", f"/api/v1/runs/{run_id}")


@mcp.tool()
def propose_experiment(project: str, title: str, hypothesis: str, reasoning: str = "", implementation_details: str = "", source_model: str | None = None, metric_mode: str = "curve") -> dict[str, Any]:
    """Add a proposal with a built-in or registered result display key to the shared registry."""
    return request("POST", f"/api/v1/projects/{project}/experiments", {"title": title, "hypothesis": hypothesis, "reasoning": reasoning, "implementation_details": implementation_details, "source": "agent", "source_model": source_model, "metric_mode": metric_mode})


@mcp.tool()
def claim_experiment(project: str, worker_id: str, experiment_id: str | None = None) -> dict[str, Any]:
    """Atomically claim a specific or next proposed experiment."""
    suffix = f"/{experiment_id}/claim" if experiment_id else "/claim"
    return request("POST", f"/api/v1/projects/{project}/experiments{suffix}", {"worker_id": worker_id})


@mcp.tool()
def release_experiment(project: str, experiment_id: str, worker_id: str) -> dict[str, Any]:
    """Return a pending claim to proposed when an autoresearch loop stops before starting a run."""
    return request("POST", f"/api/v1/projects/{project}/experiments/{experiment_id}/release", {"worker_id": worker_id})


@mcp.tool()
def create_run(project: str, name: str, hypothesis: str, reasoning: str = "", experiment_id: str | None = None, evidence_used: list[dict[str, Any]] | None = None, decision_changed: str = "", configuration: dict[str, Any] | None = None, metric_mode: str | None = None) -> dict[str, Any]:
    """Create and start a tracked run, citing evidence; claimed experiments inherit their result display unless overridden."""
    payload = {"name": name, "hypothesis": hypothesis, "reasoning": reasoning, "experiment_id": experiment_id, "evidence_used": evidence_used or [], "decision_changed": decision_changed, "configuration": configuration or {}}
    if metric_mode is not None:
        payload["metric_mode"] = metric_mode
    return request("POST", f"/api/v1/projects/{project}/runs", payload)


@mcp.tool()
def log_metric(run_id: str, name: str, value: float, step: int | None = None) -> dict[str, Any]:
    """Append one primary or diagnostic metric to a running run."""
    return request("POST", f"/api/v1/runs/{run_id}/metrics", {"metrics": [{"name": name, "value": value, "step": step}]})


@mcp.tool()
def log_metrics(run_id: str, metrics: list[dict[str, Any]]) -> dict[str, Any]:
    """Append multiple metric points to one running run in a single request."""
    return request("POST", f"/api/v1/runs/{run_id}/metrics", {"metrics": metrics})


@mcp.tool()
def log_event(run_id: str, message: str, level: str = "info", event_type: str | None = None) -> dict[str, Any]:
    """Append a structured event to a run."""
    return request("POST", f"/api/v1/runs/{run_id}/events", {"message": message, "level": level, "event_type": event_type})


@mcp.tool()
def finish_run(run_id: str, disposition: str, result_summary: str, conclusion: str) -> dict[str, Any]:
    """Finish a run and record its research disposition and reusable conclusion."""
    return request("POST", f"/api/v1/runs/{run_id}/finish", {"disposition": disposition, "result_summary": result_summary, "conclusion": conclusion})


@mcp.tool()
def crash_run(run_id: str, error_summary: str) -> dict[str, Any]:
    """Close an unexpectedly failed execution with the crashed lifecycle instead of disguising it as a completed result."""
    return request("POST", f"/api/v1/runs/{run_id}/crash", {"error_summary": error_summary})


@mcp.tool()
def set_baseline(project: str, run_id: str, actor: str = "agent") -> dict[str, Any]:
    """Select a completed run as the project baseline after confirming comparability."""
    return request("POST", f"/api/v1/projects/{project}/baseline", {"run_id": run_id, "actor": actor})


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
