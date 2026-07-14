import pytest

from runtrace_mcp import server


@pytest.mark.parametrize(
    ("tool", "args", "expected"),
    [
        (server.get_project_context, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/context", None)),
        (server.search_experiments, ("dense-optimizer", "spectral", True, 7), ("POST", "/api/v1/search", {"project": "dense-optimizer", "query": "spectral", "include_archived": True, "limit": 7})),
        (server.get_run, ("RUN-168",), ("GET", "/api/v1/runs/RUN-168", None)),
        (server.list_tags, ("dense-optimizer",), ("GET", "/api/v1/projects/dense-optimizer/tags", None)),
        (server.create_tag, ("dense-optimizer", "nightly"), ("POST", "/api/v1/projects/dense-optimizer/tags", {"name": "nightly"})),
        (server.update_tag, ("dense-optimizer", "tag_1", "overnight"), ("PATCH", "/api/v1/projects/dense-optimizer/tags/tag_1", {"name": "overnight"})),
        (server.delete_tag, ("dense-optimizer", "tag_1"), ("DELETE", "/api/v1/projects/dense-optimizer/tags/tag_1", None)),
        (server.propose_experiment, ("dense-optimizer", "Test cap", "Caps help", "Prior evidence", "Add flag", "gpt", "scalar"), ("POST", "/api/v1/projects/dense-optimizer/experiments", {"title": "Test cap", "hypothesis": "Caps help", "reasoning": "Prior evidence", "implementation_details": "Add flag", "source": "agent", "source_model": "gpt", "metric_mode": "scalar"})),
        (server.claim_experiment, ("dense-optimizer", "worker-1", None), ("POST", "/api/v1/projects/dense-optimizer/experiments/claim", {"worker_id": "worker-1"})),
        (server.claim_experiment, ("dense-optimizer", "worker-1", "EXP-021"), ("POST", "/api/v1/projects/dense-optimizer/experiments/EXP-021/claim", {"worker_id": "worker-1"})),
        (server.create_run, ("dense-optimizer", "Retry", "Faster", "Because", "EXP-021", [{"run_id": "RUN-168"}], "Used evidence", {"steps": 2}), ("POST", "/api/v1/projects/dense-optimizer/runs", {"name": "Retry", "hypothesis": "Faster", "reasoning": "Because", "experiment_id": "EXP-021", "evidence_used": [{"run_id": "RUN-168"}], "decision_changed": "Used evidence", "configuration": {"steps": 2}})),
        (server.log_metric, ("RUN-174", "loss", 3.2, 10), ("POST", "/api/v1/runs/RUN-174/metrics", {"metrics": [{"name": "loss", "value": 3.2, "step": 10}]})),
        (server.log_event, ("RUN-174", "Checkpoint", "warning", "checkpoint"), ("POST", "/api/v1/runs/RUN-174/events", {"message": "Checkpoint", "level": "warning", "event_type": "checkpoint"})),
        (server.finish_run, ("RUN-174", "kept", "3.2", "Better"), ("POST", "/api/v1/runs/RUN-174/finish", {"disposition": "kept", "result_summary": "3.2", "conclusion": "Better"})),
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
