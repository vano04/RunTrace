def test_project_creation_initializes_context_and_lists_project(fresh_database):
    created = fresh_database.post("/api/v1/projects", json={"name": "Compiler Optimizer", "slug": "compiler-optimizer", "description": "Compile faster"})
    assert created.status_code == 201
    assert fresh_database.post("/api/v1/projects", json={"name": "Duplicate", "slug": "compiler-optimizer"}).status_code == 409
    assert fresh_database.get("/health").json()["status"] == "ok"
    assert fresh_database.get("/api/v1/projects/compiler-optimizer").json()["description"] == "Compile faster"
    updated = fresh_database.patch(
        "/api/v1/projects/compiler-optimizer",
        json={"description": "Reduce compile time without changing output"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Reduce compile time without changing output"
    assert "compiler-optimizer" in {project["slug"] for project in fresh_database.get("/api/v1/projects").json()}
    assert fresh_database.get("/api/v1/projects/compiler-optimizer/program").json() == {
        "content": "# Compiler Optimizer\n", "version": 1, "created_at": fresh_database.get("/api/v1/projects/compiler-optimizer/program").json()["created_at"]
    }
    assert fresh_database.get("/api/v1/projects/compiler-optimizer/exclusions").json()["rules"] == []


def test_complete_experiment_and_run_lifecycle(fresh_database):
    proposed = fresh_database.post("/api/v1/projects/dense-optimizer/experiments", json={"title": "New cap", "hypothesis": "It is faster", "metric_mode": "scalar"})
    assert proposed.status_code == 201
    display_id = proposed.json()["display_id"]
    assert display_id in {item["display_id"] for item in fresh_database.get("/api/v1/projects/dense-optimizer/experiments").json()}

    claimed = fresh_database.post(f"/api/v1/projects/dense-optimizer/experiments/{display_id}/claim", json={"worker_id": "qa-worker"})
    assert claimed.json()["lifecycle"] == "pending"
    assert fresh_database.post(f"/api/v1/projects/dense-optimizer/experiments/{display_id}/claim", json={"worker_id": "other"}).status_code == 409

    run = fresh_database.post("/api/v1/projects/dense-optimizer/runs", json={"name": "New cap run", "experiment_id": display_id, "configuration": {"total_steps": 2}})
    assert run.status_code == 201
    run_id = run.json()["id"]
    assert fresh_database.post(f"/api/v1/runs/{run_id}/parameters", json={"parameters": {"rank": 4}}).json()["accepted"] == 1
    assert fresh_database.post(f"/api/v1/runs/{run_id}/parameters", json={"parameters": {"rank": 8}}).json()["accepted"] == 1
    assert fresh_database.post(f"/api/v1/runs/{run_id}/events", json={"message": "Started", "event_type": "status"}).status_code == 201
    first = fresh_database.post(f"/api/v1/runs/{run_id}/metrics", json={"metrics": [{"name": "score", "value": 2.0, "step": 1}]}, headers={"X-Request-ID": "metrics-1"})
    replay = fresh_database.post(f"/api/v1/runs/{run_id}/metrics", json={"metrics": [{"name": "score", "value": 99.0}]}, headers={"X-Request-ID": "metrics-1"})
    assert first.json()["accepted"] == 1
    assert replay.json() == {"accepted": 0, "idempotent_replay": True}
    detail = fresh_database.get(f"/api/v1/runs/{run_id}").json()
    assert detail["parameters"] == {"rank": 8}
    assert detail["metrics"]["score"]["latest"] == 2.0
    assert detail["events"][0]["message"] == "Started"

    finished = fresh_database.post(f"/api/v1/runs/{run_id}/finish", json={"disposition": "kept", "result_summary": "score 2", "conclusion": "Keep it"})
    assert finished.json()["lifecycle"] == "completed"
    assert fresh_database.post(f"/api/v1/runs/{run_id}/metrics", json={"metrics": [{"name": "score", "value": 3.0}]}).status_code == 409
    assert fresh_database.get("/api/v1/projects/dense-optimizer/dashboard").status_code == 200


def test_run_archive_restore_delete_and_crash(fresh_database):
    created = fresh_database.post("/api/v1/projects/dense-optimizer/runs", json={"name": "Crash test"}).json()
    run_id = created["id"]
    crashed = fresh_database.post(f"/api/v1/runs/{run_id}/crash", json={"error_summary": "out of memory"})
    assert crashed.json()["lifecycle"] == "crashed"
    assert fresh_database.post(f"/api/v1/runs/{run_id}/archive").json()["archived_at"]
    assert run_id not in {run["id"] for run in fresh_database.get("/api/v1/projects/dense-optimizer/runs").json()}
    assert fresh_database.post(f"/api/v1/runs/{run_id}/restore").json()["archived_at"] is None
    assert fresh_database.delete(f"/api/v1/runs/{run_id}").status_code == 204
    assert fresh_database.get(f"/api/v1/runs/{run_id}").status_code == 404


def test_artifact_validation_search_variants_and_settings(fresh_database):
    run_id = fresh_database.post("/api/v1/projects/dense-optimizer/runs", json={"name": "Artifact validation"}).json()["id"]
    invalid = fresh_database.post(f"/api/v1/runs/{run_id}/artifacts", files={"file": ("data.txt", b"x", "text/plain")}, data={"metadata": "not-json"})
    assert invalid.status_code == 400
    assert fresh_database.get("/api/v1/projects/dense-optimizer/search?q=spectral").json()["count"] > 0
    assert fresh_database.post("/api/v1/search", json={"project": "dense-optimizer", "query": "spectral", "limit": 2}).json()["count"] <= 2
    settings = fresh_database.get("/api/v1/projects/dense-optimizer/settings").json()
    assert settings["metric_name"] == "validation_loss"
    assert "validation_loss" in settings["available_metrics"]


def test_experiment_delete_and_claim_next(fresh_database):
    claimed = fresh_database.post("/api/v1/projects/dense-optimizer/experiments/claim", json={"worker_id": "next-worker"})
    assert claimed.status_code == 200
    assert claimed.json()["display_id"] == "EXP-021"
    assert fresh_database.delete("/api/v1/projects/dense-optimizer/experiments/EXP-023").status_code == 204
    assert "EXP-023" not in {item["display_id"] for item in fresh_database.get("/api/v1/projects/dense-optimizer/experiments?include_archived=true").json()}


def test_completed_run_stream_emits_metrics_and_terminal_status(fresh_database):
    response = fresh_database.get("/api/v1/runs/RUN-168/stream")
    assert response.status_code == 200
    assert "event: metric" in response.text
    assert 'event: status' in response.text
    assert '"lifecycle": "completed"' in response.text
