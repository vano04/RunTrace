from concurrent.futures import ThreadPoolExecutor
from datetime import datetime


def test_project_context_is_scoped_and_complete(fresh_database):
    response = fresh_database.get("/api/v1/projects/dense-optimizer/context")
    assert response.status_code == 200
    payload = response.json()
    assert payload["project"]["slug"] == "dense-optimizer"
    assert payload["program"]["version"] == 1
    assert "Do not use SVD" in payload["exclusions"]
    assert payload["baseline"]["display_id"] == "RUN-168"
    assert {item["display_id"] for item in payload["claimable_experiments"]} == {"EXP-021", "EXP-023"}
    assert all(item["project_id"] == "proj_dense_optimizer" for item in payload["claimable_experiments"])


def test_atomic_claim_allows_only_one_worker(fresh_database):
    def claim(worker):
        return fresh_database.post(
            "/api/v1/projects/dense-optimizer/experiments/EXP-021/claim",
            json={"worker_id": worker, "request_id": worker},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(claim, ["worker-a", "worker-b"]))

    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    assert winner["lifecycle"] == "pending"
    assert winner["claimed_by"] in {"worker-a", "worker-b"}


def test_archive_excludes_active_search_and_context_then_restore(fresh_database):
    archived = fresh_database.post("/api/v1/projects/dense-optimizer/experiments/EXP-023/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"]

    active = fresh_database.get("/api/v1/projects/dense-optimizer/experiments").json()
    assert "EXP-023" not in {item["display_id"] for item in active}
    context = fresh_database.get("/api/v1/projects/dense-optimizer/context").json()
    assert "EXP-023" not in {item["display_id"] for item in context["claimable_experiments"]}
    search = fresh_database.post("/api/v1/search", json={"project": "dense-optimizer", "query": "cache normalized rows"}).json()
    assert "EXP-023" not in {item["display_id"] for item in search["results"]}

    restored = fresh_database.post("/api/v1/projects/dense-optimizer/experiments/EXP-023/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None


def test_experiment_can_be_read_and_updated_in_place(fresh_database):
    original = fresh_database.get("/api/v1/projects/dense-optimizer/experiments/EXP-023")
    assert original.status_code == 200
    updated = fresh_database.patch(
        "/api/v1/projects/dense-optimizer/experiments/EXP-023",
        json={
            "title": "Cache normalized rows v2",
            "hypothesis": "Speed up row normalization with cache reuse",
            "reasoning": "Keep the cache bounded after the first pass.",
            "metric_mode": "curve",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["display_id"] == "EXP-023"
    assert updated.json()["title"] == "Cache normalized rows v2"
    assert fresh_database.get("/api/v1/projects/dense-optimizer/experiments/EXP-023").json()["reasoning"] == "Keep the cache bounded after the first pass."


def test_closed_loop_run_is_retrievable_as_new_evidence(fresh_database):
    created = fresh_database.post(
        "/api/v1/projects/dense-optimizer/runs",
        json={
            "name": "Evidence-aware two-step retry",
            "hypothesis": "Two steps preserve quality with less runtime",
            "reasoning": "RUN-173 showed four steps cost too much.",
            "decision_changed": "Reduced approximation depth from four to two.",
            "evidence_used": [{"run_id": "RUN-173", "lesson": "Runtime +31%"}],
        },
    )
    assert created.status_code == 201
    run_id = created.json()["id"]

    metrics = fresh_database.post(
        f"/api/v1/runs/{run_id}/metrics",
        json={"metrics": [{"name": "validation_loss", "value": 3.26, "step": 1000}]},
        headers={"X-Request-ID": "metric-batch-1"},
    )
    assert metrics.status_code == 202
    event = fresh_database.post(f"/api/v1/runs/{run_id}/events", json={"message": "Guardrail passed", "event_type": "evaluation"})
    assert event.status_code == 201
    finished = fresh_database.post(
        f"/api/v1/runs/{run_id}/finish",
        json={"disposition": "kept", "result_summary": "3.26 · runtime +12%", "conclusion": "Two steps outperform the baseline within the guardrail."},
    )
    assert finished.status_code == 200

    search = fresh_database.post("/api/v1/search", json={"project": "dense-optimizer", "query": "outperform baseline guardrail"})
    assert search.status_code == 200
    result = next(item for item in search.json()["results"] if item["id"] == run_id)
    assert result["evidence_used"][0]["run_id"] == "RUN-173"
    assert result["decision_changed"].startswith("Reduced approximation")


def test_artifact_name_cannot_escape_storage_root(fresh_database):
    created = fresh_database.post("/api/v1/projects/dense-optimizer/runs", json={"name": "Artifact test"}).json()
    response = fresh_database.post(
        f"/api/v1/runs/{created['id']}/artifacts",
        files={"file": ("../../secret.txt", b"safe demo artifact", "text/plain")},
        data={"metadata": "{}"},
    )
    assert response.status_code == 201
    artifact = response.json()
    assert artifact["name"] == "secret.txt"
    download = fresh_database.get(f"/api/v1/artifacts/{artifact['id']}/download")
    assert download.content == b"safe demo artifact"


def test_program_exclusion_and_baseline_changes_are_versioned(fresh_database):
    program = fresh_database.put("/api/v1/projects/dense-optimizer/program", json={"content": "# Dense Optimizer\n\nVersion two."})
    assert program.json()["version"] == 2
    exclusions = fresh_database.put("/api/v1/projects/dense-optimizer/exclusions", json={"rules": ["Do not use SVD", "  ", "Keep runtime below 20%"]})
    assert exclusions.json()["version"] == 2
    assert exclusions.json()["rules"] == ["Do not use SVD", "Keep runtime below 20%"]
    baseline = fresh_database.post("/api/v1/projects/dense-optimizer/baseline", json={"run_id": "RUN-171"})
    assert baseline.status_code == 200
    assert baseline.json()["run"]["display_id"] == "RUN-171"


def test_progress_normalizes_comparable_completed_runs(fresh_database):
    response = fresh_database.get("/api/v1/projects/dense-optimizer/progress?metric=validation_loss&window=30d")
    assert response.status_code == 200
    payload = response.json()
    assert payload["direction"] == "lower_is_better"
    assert len(payload["series"]) == 4
    assert [point["is_improvement"] for point in payload["series"]] == [True, True, False, False]
    assert [point["best_value"] for point in payload["series"]] == [3.28, 3.27, 3.27, 3.27]
    assert all("improvement" in point and "raw_value" in point for point in payload["series"])


def test_search_browse_results_include_sort_metadata(fresh_database):
    response = fresh_database.get("/api/v1/projects/dense-optimizer/search?limit=50")
    assert response.status_code == 200
    results = response.json()["results"]
    timestamps = [datetime.fromisoformat(item["timestamp"]) for item in results]
    assert timestamps == sorted(timestamps, reverse=True)
    run = next(item for item in results if item["display_id"] == "RUN-168")
    assert run["metric_value"] == 3.28
    assert all("timestamp" in item and "metric_value" in item for item in results)


def test_progress_metric_uses_exact_reported_name_from_project_settings(fresh_database):
    for index, value in enumerate([18.5, 17.2], start=1):
        created = fresh_database.post("/api/v1/projects/dense-optimizer/runs", json={"name": f"Compilation timing {index}"})
        assert created.status_code == 201
        run_id = created.json()["id"]
        response = fresh_database.post(f"/api/v1/runs/{run_id}/metrics", json={"metrics": [{"name": "compilation_time", "value": value}]})
        assert response.status_code == 202
        finished = fresh_database.post(f"/api/v1/runs/{run_id}/finish", json={"disposition": "discarded", "result_summary": f"{value}s", "conclusion": "Timing captured"})
        assert finished.status_code == 200

    saved = fresh_database.put(
        "/api/v1/projects/dense-optimizer/settings",
        json={"metric_name": "compilation_time", "direction": "lower_is_better"},
    )
    assert saved.status_code == 200
    assert saved.json()["metric_name"] == "compilation_time"
    assert "compilation_time" in saved.json()["available_metrics"]

    progress = fresh_database.get("/api/v1/projects/dense-optimizer/progress").json()
    assert progress["metric"] == "compilation_time"
    assert progress["best"] == 17.2
    assert [point["is_improvement"] for point in progress["series"]] == [True, True]
