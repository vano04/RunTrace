from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    ExclusionVersion,
    Experiment,
    MetricDefinition,
    ProgramVersion,
    Project,
    Run,
    RunEvent,
    RunMetric,
    TagDefinition,
    WorkerObservation,
    now_utc,
)


def dt(day: int, hour: int = 18, minute: int = 0) -> datetime:
    return datetime(2026, 7, day, hour, minute, tzinfo=timezone.utc)


def seed_demo(session: Session) -> None:
    if session.scalar(select(Project.id).limit(1)):
        return

    dense = Project(
        id="proj_dense_optimizer",
        slug="dense-optimizer",
        name="Dense Optimizer",
        description="Improve validation loss while keeping step-time overhead below 20%.",
        repository_url="https://github.com/example/dense-optimizer",
    )
    flash = Project(
        id="proj_flash_attention",
        slug="flash-attention-kernel",
        name="Flash Attention Kernel",
        description="Reduce H100 forward-pass latency while preserving numerical parity.",
    )
    sparse = Project(
        id="proj_sparse_router",
        slug="sparse-router",
        name="Sparse Router",
        description="Improve routing balance without degrading downstream validation quality.",
    )
    session.add_all([dense, flash, sparse])
    session.flush()
    session.add_all([
        TagDefinition(project_id=project.id, name=name, rule_key=rule_key)
        for project in (dense, flash, sparse)
        for name, rule_key in (("early stop", "autoresearch_early_stop"), ("long run", "autoresearch_long_run"))
    ])

    program = """# Dense Optimizer

Improve validation loss without increasing step time by more than 20%.

## Evaluation
- Primary: validation loss at step 1000
- Guardrail: wall-clock runtime vs current main baseline
- Keep only reproducible improvements

## Implementation
Use feature flags for experimental paths. Record config, commit, metrics, and conclusion for every run.
"""
    session.add(ProgramVersion(project_id=dense.id, version=1, content=program, actor="demo-seed"))
    session.add(ExclusionVersion(project_id=dense.id, version=1, rules=["Do not use SVD", "Do not try Newton–Schulz"], actor="demo-seed"))
    session.add(MetricDefinition(project_id=dense.id, key="validation_loss", label="Validation loss", direction="lower_is_better", role="primary", comparability_key="dense-v1"))
    session.add(MetricDefinition(project_id=dense.id, key="step_time", label="Step time", unit="ms", direction="lower_is_better", role="guardrail", comparability_key="dense-v1"))

    proposals = [
        Experiment(id="exp_021", project_id=dense.id, display_id="EXP-021", title="Adaptive cap schedule", hypothesis="Test whether late-step relaxation avoids the runtime penalty", reasoning="RUN-169 improved loss but exceeded the runtime guardrail. Relax the cap only after convergence stabilizes.", implementation_details="""Start strict, relax after step 600, and compare against RUN-168.

```diff
--- a/optimizer/spectral.py
+++ b/optimizer/spectral.py
@@ -42,2 +42,3 @@
-cap = config.cap
+progress = min(step / config.relax_step, 1.0)
+cap = lerp(config.cap_start, config.cap_end, progress)
```""", configuration={"cap_start": 0.85, "cap_end": 1.0, "relax_step": 600}, source="agent", source_model="GPT-5.6 Sol", lifecycle="proposed", metric_mode="curve", priority=10),
        Experiment(id="exp_022", project_id=dense.id, display_id="EXP-022", title="Low-rank spectral estimate", hypothesis="Evaluate low-rank approximation to further cut runtime", reasoning="Use RUN-169 as evidence that full power iteration is too expensive; preserve only dominant directions.", implementation_details="""Rank-8 approximation with two iterations.

```diff
--- a/optimizer/estimate.py
+++ b/optimizer/estimate.py
@@ -18,2 +18,2 @@
-estimate = full_power_iteration(weights, iterations=4)
+estimate = low_rank_power_iteration(weights, rank=8, iterations=2)
```""", configuration={"rank": 8, "iterations": 2, "schedule": "baseline"}, source="agent", source_model="GPT-5.6 Sol", lifecycle="pending", claimed_by="autoresearch/Jul4", claimed_at=now_utc(), metric_mode="curve", priority=20),
        Experiment(id="exp_023", project_id=dense.id, display_id="EXP-023", title="Cache normalized rows", hypothesis="Speed up row normalization via cache reuse", reasoning="Avoid repeating the memory-heavy cache layout from RUN-170.", implementation_details="Invalidate cached rows when update norm exceeds the threshold.", configuration={"cache": True, "invalidate_delta": 0.015}, source="experiments.md", lifecycle="proposed", metric_mode="timings", dependency_ids=["EXP-021"], priority=30),
        Experiment(id="exp_024", project_id=dense.id, display_id="EXP-024", title="Fused cap and normalization kernel", hypothesis="Fuse the cap and normalization passes to remove one memory round trip", reasoning="The retained spectral cap is memory-bound, making fusion a low-risk timing experiment.", implementation_details="""Fuse both operations behind a feature flag.

```diff
--- a/kernels/optimizer.py
+++ b/kernels/optimizer.py
@@ -73,2 +73,2 @@
-normalized = normalize_rows(weights)
-capped = spectral_cap(normalized, cap)
+capped = fused_normalize_and_cap(weights, cap)
```""", configuration={"feature_flag": "fused_normalize_cap", "warmup_steps": 20}, source="agent", source_model="GPT-5.6 Sol", lifecycle="pending", claimed_by="autoresearch/Jul5", claimed_at=now_utc(), metric_mode="timings", priority=40),
    ]
    session.add_all(proposals)

    runs = [
        Run(id="run_168", project_id=dense.id, display_id="RUN-168", name="Scheduled spectral cap", lifecycle="completed", disposition="kept", hypothesis="A scheduled spectral cap will improve convergence within the runtime guardrail", reasoning="Row normalization regressed in RUN-166, so constrain singular values without Newton–Schulz.", change_summary="Added a scheduled cap behind optimizer.spectral_cap.", result_summary="3.28 · runtime +14%", conclusion="The scheduled cap is reproducible and remains within the 20% guardrail.", decision_changed="Used a direct cap instead of repeating row normalization from RUN-166.", evidence_used=[{"run_id": "RUN-166", "lesson": "Row normalization alone regressed validation loss."}], metric_mode="curve", git_commit="a23f61c", git_branch="autoresearch/Jul4", started_at=dt(7, 17), finished_at=dt(7, 18, 12)),
        Run(id="run_169", project_id=dense.id, display_id="RUN-169", name="Full power iteration", lifecycle="completed", disposition="discarded", hypothesis="Full power iteration will improve the spectral estimate", reasoning="Test the quality ceiling before optimizing cost.", change_summary="Four power iterations per optimizer step.", result_summary="3.27 · runtime +78%", conclusion="Quality improved slightly, but runtime makes the approach unusable.", metric_mode="curve", git_commit="b17c9aa", git_branch="autoresearch/Jul5", started_at=dt(8, 19), finished_at=dt(8, 20, 21)),
        Run(id="run_170", project_id=dense.id, display_id="RUN-170", name="Row cache prototype", lifecycle="crashed", disposition="undecided", hypothesis="Caching normalized rows will reduce step time", reasoning="Reuse normalized values between small updates.", result_summary="Process exited 137", conclusion="The unbounded cache exhausted worker memory; future caching must use eviction.", metric_mode="timings", git_commit="c9287fd", git_branch="autoresearch/Jul7", started_at=dt(9, 21), finished_at=dt(9, 23, 43)),
        Run(id="run_171", project_id=dense.id, display_id="RUN-171", name="Scheduled power iteration", lifecycle="completed", disposition="kept", hypothesis="Schedule approximation work only when the spectrum changes", reasoning="RUN-169 showed quality value but unacceptable cost.", result_summary="3.29 · runtime +18%", conclusion="Scheduling recovers most of the quality gain within the runtime guardrail.", metric_mode="curve", git_commit="d6f14ce", git_branch="autoresearch/Jul9", started_at=dt(10, 15), finished_at=dt(10, 16, 57)),
        Run(id="run_173", project_id=dense.id, display_id="RUN-173", name="4-step approximation", lifecycle="completed", disposition="discarded", hypothesis="Four approximation steps will reach full-estimate quality", reasoning="Extend RUN-171's scheduled estimate.", result_summary="3.30 · runtime +31%", conclusion="Extra iterations do not justify the runtime cost.", metric_mode="curve", git_commit="e84ab10", git_branch="autoresearch/Jul12", started_at=dt(12, 20), finished_at=dt(12, 21, 18)),
        Run(id="run_174", project_id=dense.id, display_id="RUN-174", name="Live 2-step spectral approximation", lifecycle="running", disposition="undecided", hypothesis="Preserve the spectral quality gain with lower runtime", reasoning="RUN-169 proves full estimation is too slow; RUN-171 shows scheduling works. Try two low-cost iterations.", change_summary="Two scheduled approximation steps with cap reuse.", decision_changed="Reduced approximation depth from four to two because RUN-173 added cost without improving validation loss.", evidence_used=[{"run_id": "RUN-169", "lesson": "Full power iteration cost +78%."}, {"run_id": "RUN-173", "lesson": "Four steps cost +31% without quality benefit."}], metric_mode="curve", git_commit="f32bd91", git_branch="autoresearch/Jul14-live", configuration={"demo_metric_loop": True, "point_interval_seconds": 10, "max_step": 1000}, started_at=now_utc()),
    ]
    session.add_all(runs)
    session.flush()
    dense.current_baseline_run_id = "run_168"

    metric_values = {
        "run_168": [(0, 3.62), (125, 3.57), (250, 3.52), (375, 3.47), (500, 3.43), (625, 3.38), (750, 3.34), (875, 3.31), (1000, 3.28)],
        "run_169": [(0, 3.62), (125, 3.55), (250, 3.49), (375, 3.44), (500, 3.40), (625, 3.36), (750, 3.32), (875, 3.29), (1000, 3.27)],
        "run_171": [(0, 3.62), (125, 3.56), (250, 3.51), (375, 3.46), (500, 3.42), (625, 3.38), (750, 3.34), (875, 3.31), (1000, 3.29)],
        "run_173": [(0, 3.62), (125, 3.57), (250, 3.52), (375, 3.48), (500, 3.43), (625, 3.39), (750, 3.35), (875, 3.32), (1000, 3.30)],
        "run_174": [(0, 3.62)],
    }
    for run_id, points in metric_values.items():
        for step, value in points:
            session.add(RunMetric(run_id=run_id, name="validation_loss", value=value, step=step, timestamp=dt(13 if run_id == "run_174" else 12)))
    for step, value in [(0, 18.4), (1, 17.9), (2, 24.7), (3, 31.2)]:
        session.add(RunMetric(run_id="run_170", name="step_time", value=value, step=step, timestamp=dt(9, 22, step)))
    session.add_all([
        RunEvent(run_id="run_174", event_type="checkpoint", message="Checkpoint saved at step 700", timestamp=dt(13, 17, 42)),
        RunEvent(run_id="run_174", event_type="metric", message="Validation loss crossed 3.32", timestamp=dt(13, 17, 48)),
    ])
    for index in range(1, 7):
        session.add(WorkerObservation(project_id=dense.id, worker_id=f"worker-{index:02d}", last_seen_at=dt(13, 18, index)))

    for project, rules, program_text in [
        (flash, ["Do not change numerical precision", "Do not use architecture-specific intrinsics below SM90"], "# Flash Attention Kernel\n\nReduce H100 forward-pass latency while preserving numerical parity."),
        (sparse, ["Do not increase expert count", "Do not change the training dataset"], "# Sparse Router\n\nImprove routing balance without degrading downstream validation quality."),
    ]:
        session.add(ProgramVersion(project_id=project.id, version=1, content=program_text, actor="demo-seed"))
        session.add(ExclusionVersion(project_id=project.id, version=1, rules=rules, actor="demo-seed"))

    session.commit()
