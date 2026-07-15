from runtrace.client import RunTrace


def test_sdk_buffers_metrics_during_network_outage(fresh_database):
    client = RunTrace(base_url="http://127.0.0.1:1", strict=False, timeout=0.01)
    result = client.request("POST", "/api/v1/runs/missing/metrics", {"metrics": [{"name": "loss", "value": 1.0}]}, buffer=True)
    assert result is None
    assert len(client._buffer) == 1


def test_sdk_covers_project_search_run_logging_and_artifacts(fresh_database, tmp_path):
    client = RunTrace(base_url="http://testserver", strict=True)
    client.client.close()
    client.client = fresh_database

    project = client.create_project("SDK Project", "sdk-project", "SDK coverage")
    assert project["slug"] == "sdk-project"
    assert client.search("sdk-project", "nothing")["count"] == 0

    artifact_path = tmp_path / "result.txt"
    artifact_path.write_text("result")
    with client.run("sdk-project", "Tracked SDK run", "SDK writes all data", tags=["sdk"], configuration={"total_steps": 1}) as tracked:
        assert tracked.id
        tracked.log_metric("score", 4.2, step=1)
        tracked.log_metrics({"latency": 8.0, "memory": 2.0}, step=1)
        tracked.log_param("rank", 4)
        tracked.log_params({"batch": 2})
        tracked.log_event("Measured", event_type="evaluation", metadata={"ok": True})
        tracked.log_reasoning("Evidence supports keeping it")
        tracked.set_tags(["sdk", "kept"])
        tracked.link_run("RUN-168", "baseline")
        artifact = tracked.log_artifact(str(artifact_path), metadata={"kind": "result"})
        assert artifact["name"] == "result.txt"
        tracked.log_text("stdout.log", "training complete")
        tracked.log_config({"learning_rate": 0.01})
        tracked.finish("success", "score 4.2", "SDK flow works")

    detail = fresh_database.get(f"/api/v1/runs/{tracked.id}").json()
    assert detail["lifecycle"] == "completed"
    assert detail["disposition"] == "kept"
    assert detail["metrics"]["score"]["latest"] == 4.2
    assert detail["parameters"]["tags"] == ["sdk", "kept"]
    assert detail["parameters"]["learning_rate"] == 0.01
    assert len(detail["events"]) == 3
    assert detail["artifacts"][0]["metadata"] == {"kind": "result"}
    assert {artifact["metadata"]["kind"] for artifact in detail["artifacts"]} == {"result", "log", "config"}


def test_sdk_context_manager_crashes_run_on_exception(fresh_database):
    client = RunTrace(base_url="http://testserver", strict=True)
    client.client.close()
    client.client = fresh_database
    try:
        with client.run("dense-optimizer", "Expected crash") as tracked:
            raise ValueError("boom")
    except ValueError:
        pass
    detail = fresh_database.get(f"/api/v1/runs/{tracked.id}").json()
    assert detail["lifecycle"] == "crashed"
    assert detail["result_summary"] == "boom"


def test_sdk_attaches_to_runtrace_run_id_without_creating_a_duplicate(fresh_database, monkeypatch):
    client = RunTrace(base_url="http://testserver", strict=True)
    client.client.close()
    client.client = fresh_database
    created = fresh_database.post(
        "/api/v1/projects/dense-optimizer/runs",
        json={"name": "Created by MCP", "hypothesis": "One execution has one run"},
    ).json()
    monkeypatch.setenv("RUNTRACE_RUN_ID", created["id"])

    with client.run("dense-optimizer", "SDK should attach") as tracked:
        assert tracked.id == created["id"]
        tracked.log_metric("loss", 3.1)
        tracked.finish("success", "loss 3.1", "Attached without duplication")

    runs = fresh_database.get("/api/v1/projects/dense-optimizer/runs").json()
    assert len([run for run in runs if run["id"] == created["id"]]) == 1
    detail = fresh_database.get(f"/api/v1/runs/{created['id']}").json()
    assert detail["metrics"]["loss"]["latest"] == 3.1
