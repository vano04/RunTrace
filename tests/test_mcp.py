import pytest

from runtrace_mcp import server


@pytest.mark.parametrize(
    ("tool", "args", "expected"),
    [
        (server.list_projects, (), ("GET", "/api/v1/projects", None)),
        (server.get_project_context, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/context", None)),
        (server.search_experiments, ("dense-optimizer", "spectral", True, 7), ("POST", "/api/v1/search", {"project": "dense-optimizer", "query": "spectral", "include_archived": True, "limit": 7})),
        (server.get_run, ("RUN-168",), ("GET", "/api/v1/runs/RUN-168", None)),
        (server.list_tags, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/tags", None)),
        (server.create_tag, ("dense-optimizer", "nightly"), ("POST", "/api/v1/projects/dense-optimizer/tags", {"name": "nightly"})),
        (server.update_tag, ("dense-optimizer", "tag_1", "overnight"), ("PATCH", "/api/v1/projects/dense-optimizer/tags/tag_1", {"name": "overnight"})),
        (server.delete_tag, ("dense-optimizer", "tag_1"), ("DELETE", "/api/v1/projects/dense-optimizer/tags/tag_1", None)),
        (server.get_visualization_guide, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/visualizations/guide", None)),
        (server.get_result_visualization_guide, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/result-visualizations/guide", None)),
        (server.list_result_visualization_types, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/result-visualizations", None)),
        (server.create_result_visualization_type, ("dense-optimizer", "methods", "Methods", {"version": 1}, "Top methods"), ("POST", "/api/v1/projects/dense-optimizer/result-visualizations", {"key": "methods", "name": "Methods", "description": "Top methods", "spec": {"version": 1}, "created_by": "agent"})),
        (server.delete_result_visualization_type, ("dense-optimizer", "methods"), ("DELETE", "/api/v1/projects/dense-optimizer/result-visualizations/methods", None)),
        (server.list_visualizations, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/visualizations", None)),
        (server.get_visualization, ("dense-optimizer", "vis_1"), ("GET", "/api/v1/projects/dense-optimizer/visualizations/vis_1", None)),
        (server.preview_visualization, ("dense-optimizer", {"version": 1}), ("POST", "/api/v1/projects/dense-optimizer/visualizations/preview", {"version": 1})),
        (server.generate_visualization, ("dense-optimizer", "Loss", {"version": 1}, "A chart", None), ("POST", "/api/v1/projects/dense-optimizer/visualizations", {"name": "Loss", "description": "A chart", "spec": {"version": 1}, "created_by": "agent"})),
        (server.update_visualization, ("dense-optimizer", "vis_1", {"version": 1}, "Loss v2", None, False, 2), ("PATCH", "/api/v1/projects/dense-optimizer/visualizations/vis_1", {"spec": {"version": 1}, "name": "Loss v2", "visible": False, "sort_order": 2})),
        (server.delete_visualization, ("dense-optimizer", "vis_1"), ("DELETE", "/api/v1/projects/dense-optimizer/visualizations/vis_1", None)),
        (server.export_visualization, ("dense-optimizer", "vis_1"), ("GET", "/api/v1/projects/dense-optimizer/visualizations/vis_1/export", None)),
        (server.import_visualization, ("dense-optimizer", {"format": "runtrace-visualization"}, None), ("POST", "/api/v1/projects/dense-optimizer/visualizations/import", {"document": {"format": "runtrace-visualization"}, "created_by": "agent"})),
        (server.propose_experiment, ("dense-optimizer", "Test cap", "Caps help", "Prior evidence", "Add flag", "gpt", "scalar"), ("POST", "/api/v1/projects/dense-optimizer/experiments", {"title": "Test cap", "hypothesis": "Caps help", "reasoning": "Prior evidence", "implementation_details": "Add flag", "source": "agent", "source_model": "gpt", "metric_mode": "scalar"})),
        (server.claim_experiment, ("dense-optimizer", "worker-1", None), ("POST", "/api/v1/projects/dense-optimizer/experiments/claim", {"worker_id": "worker-1"})),
        (server.claim_experiment, ("dense-optimizer", "worker-1", "EXP-021"), ("POST", "/api/v1/projects/dense-optimizer/experiments/EXP-021/claim", {"worker_id": "worker-1"})),
        (server.create_run, ("dense-optimizer", "Retry", "Faster", "Because", "EXP-021", [{"run_id": "RUN-168"}], "Used evidence", {"steps": 2}), ("POST", "/api/v1/projects/dense-optimizer/runs", {"name": "Retry", "hypothesis": "Faster", "reasoning": "Because", "experiment_id": "EXP-021", "evidence_used": [{"run_id": "RUN-168"}], "decision_changed": "Used evidence", "configuration": {"steps": 2}})),
        (server.log_metric, ("RUN-174", "loss", 3.2, 10), ("POST", "/api/v1/runs/RUN-174/metrics", {"metrics": [{"name": "loss", "value": 3.2, "step": 10}]})),
        (server.log_metrics, ("RUN-174", [{"name": "loss", "value": 3.2, "step": 10}, {"name": "time", "value": 4.1}]), ("POST", "/api/v1/runs/RUN-174/metrics", {"metrics": [{"name": "loss", "value": 3.2, "step": 10}, {"name": "time", "value": 4.1}]})),
        (server.log_event, ("RUN-174", "Checkpoint", "warning", "checkpoint"), ("POST", "/api/v1/runs/RUN-174/events", {"message": "Checkpoint", "level": "warning", "event_type": "checkpoint"})),
        (server.finish_run, ("RUN-174", "kept", "3.2", "Better"), ("POST", "/api/v1/runs/RUN-174/finish", {"disposition": "kept", "result_summary": "3.2", "conclusion": "Better"})),
        (server.crash_run, ("RUN-174", "CUDA failure"), ("POST", "/api/v1/runs/RUN-174/crash", {"error_summary": "CUDA failure"})),
        (server.set_baseline, ("dense-optimizer", "RUN-174", "worker-1"), ("POST", "/api/v1/projects/dense-optimizer/baseline", {"run_id": "RUN-174", "actor": "worker-1"})),
    ],
)
def test_every_mcp_tool_uses_the_expected_api_contract(monkeypatch, tool, args, expected):
    calls = []

    def fake_request(method, path, payload=None):
        calls.append((method, path, payload))
        return {"ok": True}

    monkeypatch.setattr(server, "request", fake_request)
    assert tool(*args) == {"ok": True}
    assert calls == [expected]


def test_mcp_http_errors_are_not_silenced(monkeypatch):
    class Response:
        content = b"{}"

        def raise_for_status(self):
            raise RuntimeError("backend failed")

        def json(self):
            return {}

    class Client:
        def __init__(self, **_): pass
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def request(self, *_args, **_kwargs): return Response()

    monkeypatch.setattr(server.httpx, "Client", Client)
    with pytest.raises(RuntimeError, match="backend failed"):
        server.request("GET", "/health")


def test_start_experimenting_fetches_context_and_returns_claim_first_loop(monkeypatch):
    monkeypatch.setattr(server, "request", lambda method, path, payload=None: {"project": {"slug": "dense-optimizer"}, "claimable_experiments": [{"display_id": "EXP-021"}]})
    result = server.start_experimenting("dense-optimizer", "worker-1", "continuous")
    assert result["context"]["project"]["slug"] == "dense-optimizer"
    assert result["loop"]["repeat"] is True
    assert "claim" in result["next_action"].lower()
    assert result["loop"]["claim_limit"] == 1
    assert result["loop"]["tracking_owner_required"] is True

    with pytest.raises(ValueError, match="loop_mode"):
        server.start_experimenting("dense-optimizer", "worker-1", "forever-ish")


def test_mcp_resolves_saved_credentials_for_each_request(monkeypatch):
    captured = []

    class Response:
        content = b'{"ok": true}'
        def raise_for_status(self): pass
        def json(self): return {"ok": True}

    class Client:
        def __init__(self, **kwargs): captured.append(kwargs)
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def request(self, *_args, **_kwargs): return Response()

    credentials = iter([
        ("https://one.example", "rt_one"),
        ("https://two.example", "rt_two"),
    ])
    monkeypatch.setattr(server, "resolve_connection", lambda: next(credentials))
    monkeypatch.setattr(server.httpx, "Client", Client)

    server.request("GET", "/health")
    server.request("GET", "/health")

    assert captured[0]["base_url"] == "https://one.example"
    assert captured[0]["headers"] == {"Authorization": "Bearer rt_one"}
    assert captured[1]["base_url"] == "https://two.example"
    assert captured[1]["headers"] == {"Authorization": "Bearer rt_two"}
