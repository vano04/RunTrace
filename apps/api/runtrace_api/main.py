from __future__ import annotations

import asyncio
import json
import re
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import and_, delete, desc, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from .config import ROOT, settings
from .database import SessionLocal, get_db
from .models import (
    Artifact,
    AuditEvent,
    ExclusionVersion,
    Experiment,
    MetricDefinition,
    ProgramVersion,
    Project,
    Run,
    RunEvent,
    RunMetric,
    RunParameter,
    WorkerObservation,
    now_utc,
)
from .schemas import (
    BaselineUpdate,
    ClaimRequest,
    ContextUpdate,
    EventCreate,
    ExclusionsUpdate,
    ExperimentCreate,
    ExperimentRead,
    MetricBatch,
    ParameterBatch,
    ProgressSettingsUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    RunCrash,
    RunCreate,
    RunFinish,
    RunRead,
    SearchRequest,
)
from .seed import seed_demo


@asynccontextmanager
async def lifespan(_: FastAPI):
    startup()
    yield


app = FastAPI(
    title="RunTrace API",
    version="0.1.0",
    description="Project-scoped experiment memory and supervision for autonomous research agents.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def startup() -> None:
    settings.artifact_path.mkdir(parents=True, exist_ok=True)
    migration_config = Config(str(ROOT / "alembic.ini"))
    migration_config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(migration_config, "head")
    if settings.seed_demo:
        with SessionLocal() as session:
            seed_demo(session)


def get_project(session: Session, identifier: str) -> Project:
    project = session.scalar(select(Project).where(or_(Project.slug == identifier, Project.id == identifier)))
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def get_experiment(session: Session, project: Project, identifier: str, include_deleted: bool = False) -> Experiment:
    query = select(Experiment).where(
        Experiment.project_id == project.id,
        or_(Experiment.id == identifier, Experiment.display_id == identifier),
    )
    if not include_deleted:
        query = query.where(Experiment.deleted_at.is_(None))
    item = session.scalar(query)
    if not item:
        raise HTTPException(404, "Experiment not found")
    return item


def get_run(session: Session, identifier: str) -> Run:
    item = session.scalar(
        select(Run)
        .options(selectinload(Run.metrics), selectinload(Run.events), selectinload(Run.parameters), selectinload(Run.artifacts))
        .where(or_(Run.id == identifier, Run.display_id == identifier), Run.deleted_at.is_(None))
    )
    if not item:
        raise HTTPException(404, "Run not found")
    return item


def next_display_id(session: Session, project_id: str, model: type[Experiment] | type[Run], prefix: str) -> str:
    values = session.scalars(select(model.display_id).where(model.project_id == project_id)).all()
    numbers = [int(match.group(1)) for value in values if (match := re.fullmatch(rf"{prefix}-(\d+)", value))]
    floor = 23 if prefix == "EXP" else 174
    return f"{prefix}-{max([floor, *numbers]) + 1:03d}"


def audit(session: Session, project_id: str, action: str, subject_type: str, subject_id: str, actor: str, request_id: str | None, payload: dict | None = None) -> None:
    if request_id and session.scalar(select(AuditEvent.id).where(AuditEvent.request_id == request_id, AuditEvent.action == action)):
        return
    session.add(AuditEvent(project_id=project_id, action=action, subject_type=subject_type, subject_id=subject_id, actor=actor, request_id=request_id, payload=payload or {}))


def latest_program(session: Session, project_id: str) -> ProgramVersion | None:
    return session.scalar(select(ProgramVersion).where(ProgramVersion.project_id == project_id).order_by(desc(ProgramVersion.version)).limit(1))


def latest_exclusions(session: Session, project_id: str) -> ExclusionVersion | None:
    return session.scalar(select(ExclusionVersion).where(ExclusionVersion.project_id == project_id).order_by(desc(ExclusionVersion.version)).limit(1))


def available_metric_names(session: Session, project_id: str) -> list[str]:
    return list(
        session.scalars(
            select(RunMetric.name)
            .join(Run, Run.id == RunMetric.run_id)
            .where(Run.project_id == project_id, Run.deleted_at.is_(None))
            .distinct()
            .order_by(RunMetric.name)
        )
    )


def metric_summary(run: Run) -> dict:
    grouped: dict[str, list[RunMetric]] = {}
    for point in sorted(run.metrics, key=lambda item: (item.step or 0, item.timestamp)):
        grouped.setdefault(point.name, []).append(point)
    return {
        name: {
            "latest": points[-1].value,
            "min": min(point.value for point in points),
            "max": max(point.value for point in points),
            "count": len(points),
            "points": [{"value": p.value, "step": p.step, "timestamp": p.timestamp} for p in points],
        }
        for name, points in grouped.items()
    }


def run_payload(run: Run, detail: bool = False) -> dict:
    payload = RunRead.model_validate(run).model_dump()
    if detail:
        payload.update(
            metrics=metric_summary(run),
            parameters={item.name: item.value for item in run.parameters},
            events=[{"id": item.id, "message": item.message, "level": item.level, "event_type": item.event_type, "metadata": item.metadata_json, "timestamp": item.timestamp} for item in sorted(run.events, key=lambda event: event.timestamp)],
            artifacts=[{"id": item.id, "name": item.name, "content_type": item.content_type, "size": item.size, "metadata": item.metadata_json, "created_at": item.created_at} for item in run.artifacts],
        )
    return payload


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "runtrace-api"}


@app.post("/api/v1/projects", response_model=ProjectRead, status_code=201)
def create_project(body: ProjectCreate, session: Session = Depends(get_db)) -> Project:
    if session.scalar(select(Project.id).where(Project.slug == body.slug)):
        raise HTTPException(409, "Project slug already exists")
    project = Project(**body.model_dump())
    session.add(project)
    session.flush()
    session.add(ProgramVersion(project_id=project.id, version=1, content=f"# {project.name}\n", actor="human"))
    session.add(ExclusionVersion(project_id=project.id, version=1, rules=[], actor="human"))
    session.commit()
    session.refresh(project)
    return project


@app.get("/api/v1/projects")
def list_projects(session: Session = Depends(get_db)) -> list[dict]:
    projects = session.scalars(select(Project).order_by(Project.name)).all()
    result = []
    for project in projects:
        active = session.scalar(select(func.count()).select_from(Run).where(Run.project_id == project.id, Run.lifecycle == "running")) or 0
        experiment_count = session.scalar(select(func.count()).select_from(Experiment).where(Experiment.project_id == project.id, Experiment.deleted_at.is_(None))) or 0
        worker_count = session.scalar(select(func.count()).select_from(WorkerObservation).where(WorkerObservation.project_id == project.id)) or 0
        result.append({**ProjectRead.model_validate(project).model_dump(), "active_runs": active, "experiment_count": experiment_count, "worker_count": worker_count})
    return result


@app.get("/api/v1/projects/{project}", response_model=ProjectRead)
def read_project(project: str, session: Session = Depends(get_db)) -> Project:
    return get_project(session, project)


@app.patch("/api/v1/projects/{project}", response_model=ProjectRead)
def update_project(project: str, body: ProjectUpdate, session: Session = Depends(get_db)) -> Project:
    current = get_project(session, project)
    current.description = body.description.strip()
    audit(session, current.id, "project.updated", "project", current.id, "human", None, {"description": current.description})
    session.commit()
    session.refresh(current)
    return current


@app.get("/api/v1/projects/{project}/settings")
def read_project_settings(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    return {
        "metric_name": current.progress_metric_key,
        "direction": current.progress_metric_direction,
        "available_metrics": available_metric_names(session, current.id),
    }


@app.put("/api/v1/projects/{project}/settings")
def update_project_settings(project: str, body: ProgressSettingsUpdate, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    metric_name = body.metric_name.strip()
    if not metric_name:
        raise HTTPException(422, "Metric name cannot be blank")
    current.progress_metric_key = metric_name
    current.progress_metric_direction = body.direction
    definition = session.scalar(select(MetricDefinition).where(MetricDefinition.project_id == current.id, MetricDefinition.key == metric_name))
    if definition:
        definition.direction = body.direction
    else:
        session.add(MetricDefinition(project_id=current.id, key=metric_name, label=metric_name, direction=body.direction, role="primary"))
    audit(session, current.id, "project.progress_metric_updated", "project", current.id, "human", None, {"metric_name": metric_name, "direction": body.direction})
    session.commit()
    return {"metric_name": metric_name, "direction": body.direction, "available_metrics": available_metric_names(session, current.id)}


@app.get("/api/v1/projects/{project}/experiments", response_model=list[ExperimentRead])
def list_experiments(
    project: str,
    lifecycle: str | None = None,
    include_archived: bool = False,
    session: Session = Depends(get_db),
) -> list[Experiment]:
    current = get_project(session, project)
    query = select(Experiment).where(Experiment.project_id == current.id, Experiment.deleted_at.is_(None))
    if lifecycle:
        query = query.where(Experiment.lifecycle == lifecycle)
    if not include_archived:
        query = query.where(Experiment.archived_at.is_(None))
    return list(session.scalars(query.order_by(Experiment.priority, Experiment.created_at)))


@app.post("/api/v1/projects/{project}/experiments", response_model=ExperimentRead, status_code=201)
def create_experiment(project: str, body: ExperimentCreate, x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> Experiment:
    current = get_project(session, project)
    item = Experiment(project_id=current.id, display_id=next_display_id(session, current.id, Experiment, "EXP"), **body.model_dump())
    session.add(item)
    session.flush()
    audit(session, current.id, "experiment.proposed", "experiment", item.id, body.source_model or body.source, x_request_id, {"display_id": item.display_id})
    session.commit()
    session.refresh(item)
    return item


@app.post("/api/v1/projects/{project}/experiments/claim", response_model=ExperimentRead)
def claim_next(project: str, body: ClaimRequest, session: Session = Depends(get_db)) -> Experiment:
    current = get_project(session, project)
    for _ in range(5):
        candidate = session.scalar(
            select(Experiment.id)
            .where(Experiment.project_id == current.id, Experiment.lifecycle == "proposed", Experiment.archived_at.is_(None), Experiment.deleted_at.is_(None))
            .order_by(Experiment.priority, Experiment.created_at)
            .limit(1)
        )
        if not candidate:
            raise HTTPException(404, "No claimable experiments")
        claimed_at = now_utc()
        result = session.execute(
            update(Experiment)
            .where(Experiment.id == candidate, Experiment.lifecycle == "proposed", Experiment.archived_at.is_(None), Experiment.deleted_at.is_(None))
            .values(lifecycle="pending", claimed_by=body.worker_id, claimed_at=claimed_at, updated_at=claimed_at)
        )
        if result.rowcount == 1:
            audit(session, current.id, "experiment.claimed", "experiment", candidate, body.worker_id, body.request_id)
            session.commit()
            return get_experiment(session, current, candidate)
        session.rollback()
    raise HTTPException(409, "Claim conflict; retry")


@app.post("/api/v1/projects/{project}/experiments/{identifier}/claim", response_model=ExperimentRead)
def claim_experiment(project: str, identifier: str, body: ClaimRequest, session: Session = Depends(get_db)) -> Experiment:
    current = get_project(session, project)
    item = get_experiment(session, current, identifier)
    claimed_at = now_utc()
    result = session.execute(
        update(Experiment)
        .where(Experiment.id == item.id, Experiment.lifecycle == "proposed", Experiment.archived_at.is_(None), Experiment.deleted_at.is_(None))
        .values(lifecycle="pending", claimed_by=body.worker_id, claimed_at=claimed_at, updated_at=claimed_at)
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(409, "Experiment is no longer claimable")
    audit(session, current.id, "experiment.claimed", "experiment", item.id, body.worker_id, body.request_id)
    session.commit()
    return get_experiment(session, current, item.id)


def set_archive_state(project: str, identifier: str, archived: bool, actor: str, request_id: str | None, session: Session) -> Experiment:
    current = get_project(session, project)
    item = get_experiment(session, current, identifier)
    item.archived_at = now_utc() if archived else None
    audit(session, current.id, "experiment.archived" if archived else "experiment.restored", "experiment", item.id, actor, request_id)
    session.commit()
    session.refresh(item)
    return item


@app.post("/api/v1/projects/{project}/experiments/{identifier}/archive", response_model=ExperimentRead)
def archive_experiment(project: str, identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> Experiment:
    return set_archive_state(project, identifier, True, x_actor, x_request_id, session)


@app.post("/api/v1/projects/{project}/experiments/{identifier}/restore", response_model=ExperimentRead)
def restore_experiment(project: str, identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> Experiment:
    return set_archive_state(project, identifier, False, x_actor, x_request_id, session)


@app.delete("/api/v1/projects/{project}/experiments/{identifier}", status_code=204)
def delete_experiment(project: str, identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> None:
    current = get_project(session, project)
    item = get_experiment(session, current, identifier)
    item.deleted_at = now_utc()
    audit(session, current.id, "experiment.deleted", "experiment", item.id, x_actor, x_request_id)
    session.commit()


@app.get("/api/v1/projects/{project}/program")
def read_program(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    version = latest_program(session, current.id)
    return {"content": version.content if version else "", "version": version.version if version else 0, "created_at": version.created_at if version else None}


@app.put("/api/v1/projects/{project}/program")
def update_program(project: str, body: ContextUpdate, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    previous = latest_program(session, current.id)
    version = ProgramVersion(project_id=current.id, version=(previous.version if previous else 0) + 1, content=body.content, actor=body.actor)
    session.add(version)
    audit(session, current.id, "program.updated", "project", current.id, body.actor, body.request_id, {"version": version.version})
    session.commit()
    return {"content": version.content, "version": version.version, "created_at": version.created_at}


@app.get("/api/v1/projects/{project}/exclusions")
def read_exclusions(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    version = latest_exclusions(session, current.id)
    return {"rules": version.rules if version else [], "version": version.version if version else 0, "created_at": version.created_at if version else None}


@app.put("/api/v1/projects/{project}/exclusions")
def update_exclusions(project: str, body: ExclusionsUpdate, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    previous = latest_exclusions(session, current.id)
    rules = [rule.strip() for rule in body.rules if rule.strip()]
    version = ExclusionVersion(project_id=current.id, version=(previous.version if previous else 0) + 1, rules=rules, actor=body.actor)
    session.add(version)
    audit(session, current.id, "exclusions.updated", "project", current.id, body.actor, body.request_id, {"version": version.version, "count": len(rules)})
    session.commit()
    return {"rules": version.rules, "version": version.version, "created_at": version.created_at}


@app.post("/api/v1/projects/{project}/runs", status_code=201)
def create_run(project: str, body: RunCreate, x_actor: str = Header("agent"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    experiment = None
    if body.experiment_id:
        experiment = get_experiment(session, current, body.experiment_id)
        if experiment.lifecycle not in {"pending", "proposed"}:
            raise HTTPException(409, "Experiment cannot be started from its current lifecycle")
        experiment.lifecycle = "running"
    item = Run(project_id=current.id, display_id=next_display_id(session, current.id, Run, "RUN"), **body.model_dump())
    if experiment:
        item.experiment_id = experiment.id
    session.add(item)
    session.flush()
    audit(session, current.id, "run.started", "run", item.id, x_actor, x_request_id, {"display_id": item.display_id})
    session.commit()
    return run_payload(get_run(session, item.id), detail=True)


@app.get("/api/v1/projects/{project}/runs")
def list_runs(project: str, lifecycle: str | None = None, include_archived: bool = False, session: Session = Depends(get_db)) -> list[dict]:
    current = get_project(session, project)
    query = select(Run).options(selectinload(Run.metrics), selectinload(Run.events), selectinload(Run.parameters), selectinload(Run.artifacts)).where(Run.project_id == current.id, Run.deleted_at.is_(None))
    if not include_archived:
        query = query.where(Run.archived_at.is_(None))
    if lifecycle:
        query = query.where(Run.lifecycle == lifecycle)
    return [run_payload(item, detail=False) for item in session.scalars(query.order_by(desc(Run.created_at)))]


@app.post("/api/v1/runs/{identifier}/archive")
def archive_run(identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    run.archived_at = now_utc()
    audit(session, run.project_id, "run.archived", "run", run.id, x_actor, x_request_id)
    session.commit()
    return run_payload(get_run(session, run.id), detail=True)


@app.post("/api/v1/runs/{identifier}/restore")
def restore_run(identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    run.archived_at = None
    audit(session, run.project_id, "run.restored", "run", run.id, x_actor, x_request_id)
    session.commit()
    return run_payload(get_run(session, run.id), detail=True)


@app.delete("/api/v1/runs/{identifier}", status_code=204)
def delete_run(identifier: str, x_actor: str = Header("human"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> None:
    run = get_run(session, identifier)
    run.deleted_at = now_utc()
    audit(session, run.project_id, "run.deleted", "run", run.id, x_actor, x_request_id)
    session.commit()


@app.get("/api/v1/runs/{identifier}")
def read_run(identifier: str, session: Session = Depends(get_db)) -> dict:
    return run_payload(get_run(session, identifier), detail=True)


@app.post("/api/v1/runs/{identifier}/metrics", status_code=202)
def log_metrics(identifier: str, body: MetricBatch, x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    if run.lifecycle != "running":
        raise HTTPException(409, "Metrics can only be appended to a running run")
    if x_request_id and session.scalar(select(AuditEvent.id).where(AuditEvent.request_id == x_request_id, AuditEvent.action == "run.metrics_logged")):
        return {"accepted": 0, "idempotent_replay": True}
    for point in body.metrics:
        session.add(RunMetric(run_id=run.id, name=point.name, value=point.value, step=point.step, timestamp=point.timestamp or now_utc(), context=point.context))
    audit(session, run.project_id, "run.metrics_logged", "run", run.id, "agent", x_request_id, {"count": len(body.metrics)})
    session.commit()
    return {"accepted": len(body.metrics), "idempotent_replay": False}


@app.post("/api/v1/runs/{identifier}/events", status_code=201)
def log_event(identifier: str, body: EventCreate, session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    event = RunEvent(run_id=run.id, message=body.message, level=body.level, event_type=body.event_type, metadata_json=body.metadata, timestamp=body.timestamp or now_utc())
    session.add(event)
    session.commit()
    session.refresh(event)
    return {"id": event.id, "message": event.message, "level": event.level, "event_type": event.event_type, "metadata": event.metadata_json, "timestamp": event.timestamp}


@app.post("/api/v1/runs/{identifier}/parameters", status_code=202)
def log_parameters(identifier: str, body: ParameterBatch, session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    for name, value in body.parameters.items():
        existing = session.scalar(select(RunParameter).where(RunParameter.run_id == run.id, RunParameter.name == name))
        if existing:
            existing.value = value
        else:
            session.add(RunParameter(run_id=run.id, name=name, value=value))
    session.commit()
    return {"accepted": len(body.parameters)}


@app.post("/api/v1/runs/{identifier}/finish")
def finish_run(identifier: str, body: RunFinish, x_actor: str = Header("agent"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    if run.lifecycle != "running":
        if x_request_id and session.scalar(select(AuditEvent.id).where(AuditEvent.request_id == x_request_id, AuditEvent.action == "run.completed")):
            return run_payload(run, detail=True)
        raise HTTPException(409, "Run is not running")
    run.lifecycle = "completed"
    run.disposition = body.disposition
    run.result_summary = body.result_summary
    run.conclusion = body.conclusion
    run.finished_at = now_utc()
    if run.experiment:
        run.experiment.lifecycle = "completed"
        run.experiment.disposition = body.disposition
    audit(session, run.project_id, "run.completed", "run", run.id, x_actor, x_request_id, {"disposition": body.disposition})
    session.commit()
    return run_payload(get_run(session, run.id), detail=True)


@app.post("/api/v1/runs/{identifier}/crash")
def crash_run(identifier: str, body: RunCrash, x_actor: str = Header("agent"), x_request_id: str | None = Header(None), session: Session = Depends(get_db)) -> dict:
    run = get_run(session, identifier)
    run.lifecycle = "crashed"
    run.disposition = "undecided"
    run.result_summary = body.error_summary
    run.finished_at = now_utc()
    if run.experiment:
        run.experiment.lifecycle = "crashed"
    audit(session, run.project_id, "run.crashed", "run", run.id, x_actor, x_request_id, {"error_summary": body.error_summary})
    session.commit()
    return run_payload(get_run(session, run.id), detail=True)


@app.post("/api/v1/projects/{project}/baseline")
def set_baseline(project: str, body: BaselineUpdate, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    run = get_run(session, body.run_id)
    if run.project_id != current.id or run.lifecycle != "completed":
        raise HTTPException(409, "Baseline must be a completed run in this project")
    previous = current.current_baseline_run_id
    current.current_baseline_run_id = run.id
    audit(session, current.id, "baseline.changed", "run", run.id, body.actor, body.request_id, {"previous_run_id": previous})
    session.commit()
    return {"run": run_payload(run), "previous_run_id": previous}


@app.post("/api/v1/runs/{identifier}/artifacts", status_code=201)
async def upload_artifact(
    identifier: str,
    file: UploadFile = File(...),
    metadata: str = Form("{}"),
    session: Session = Depends(get_db),
) -> dict:
    run = get_run(session, identifier)
    content = await file.read(settings.max_artifact_size + 1)
    if len(content) > settings.max_artifact_size:
        raise HTTPException(413, "Artifact exceeds configured size limit")
    safe_name = Path(file.filename or "artifact.bin").name
    if safe_name in {"", ".", ".."}:
        raise HTTPException(400, "Invalid artifact name")
    try:
        metadata_json = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Artifact metadata must be JSON") from exc
    run_dir = settings.artifact_path / run.id
    run_dir.mkdir(parents=True, exist_ok=True)
    storage_path = run_dir / f"{uuid4().hex}-{safe_name}"
    storage_path.write_bytes(content)
    item = Artifact(run_id=run.id, name=safe_name, content_type=file.content_type or "application/octet-stream", size=len(content), storage_path=str(storage_path), metadata_json=metadata_json)
    session.add(item)
    session.commit()
    session.refresh(item)
    return {"id": item.id, "name": item.name, "content_type": item.content_type, "size": item.size, "metadata": item.metadata_json, "created_at": item.created_at}


@app.get("/api/v1/artifacts/{artifact_id}/download")
def download_artifact(artifact_id: str, session: Session = Depends(get_db)) -> FileResponse:
    item = session.get(Artifact, artifact_id)
    if not item:
        raise HTTPException(404, "Artifact not found")
    path = Path(item.storage_path).resolve()
    root = settings.artifact_path.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Artifact content not found")
    return FileResponse(path, media_type=item.content_type, filename=item.name)


def search_records(session: Session, body: SearchRequest) -> list[dict]:
    project = get_project(session, body.project)
    terms = [term.lower() for term in re.findall(r"[\w-]+", body.query) if len(term) > 1]
    experiments = session.scalars(select(Experiment).where(Experiment.project_id == project.id, Experiment.deleted_at.is_(None))).all()
    runs = session.scalars(select(Run).where(Run.project_id == project.id, Run.deleted_at.is_(None))).all()
    records: list[dict] = []
    for item in experiments:
        if not body.include_archived and item.archived_at:
            continue
        if body.lifecycle and item.lifecycle != body.lifecycle:
            continue
        haystack = " ".join([item.display_id, item.title, item.hypothesis, item.reasoning, item.implementation_details, json.dumps(item.configuration)]).lower()
        if terms and not all(term in haystack for term in terms):
            continue
        score = sum(haystack.count(term) for term in terms) if terms else 1
        records.append({"kind": "experiment", "id": item.id, "display_id": item.display_id, "title": item.title, "lifecycle": item.lifecycle, "disposition": item.disposition, "hypothesis": item.hypothesis, "reasoning": item.reasoning, "conclusion": "", "result_summary": "", "archived": bool(item.archived_at), "score": score})
    for item in runs:
        if item.archived_at and not body.include_archived:
            continue
        if body.lifecycle and item.lifecycle != body.lifecycle:
            continue
        if body.dispositions and item.disposition not in body.dispositions:
            continue
        haystack = " ".join([item.display_id, item.name, item.hypothesis, item.reasoning, item.change_summary, item.result_summary, item.conclusion, item.decision_changed, json.dumps(item.configuration), json.dumps(item.evidence_used)]).lower()
        if terms and not all(term in haystack for term in terms):
            continue
        score = sum(haystack.count(term) for term in terms) if terms else 1
        records.append({"kind": "run", "id": item.id, "display_id": item.display_id, "title": item.name, "lifecycle": item.lifecycle, "disposition": item.disposition, "hypothesis": item.hypothesis, "reasoning": item.reasoning, "conclusion": item.conclusion, "result_summary": item.result_summary, "decision_changed": item.decision_changed, "evidence_used": item.evidence_used, "archived": bool(item.archived_at), "score": score, "finished_at": item.finished_at})
    def sort_timestamp(record: dict) -> float:
        finished_at = record.get("finished_at")
        if not finished_at:
            return 0.0
        if finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)
        return finished_at.timestamp()

    records.sort(key=lambda record: (record["score"], sort_timestamp(record)), reverse=True)
    return records[: body.limit]


@app.post("/api/v1/search")
def search(body: SearchRequest, session: Session = Depends(get_db)) -> dict:
    results = search_records(session, body)
    return {"query": body.query, "project": body.project, "count": len(results), "results": results}


@app.get("/api/v1/projects/{project}/search")
def search_get(project: str, q: str = "", include_archived: bool = False, limit: int = Query(10, ge=1, le=100), session: Session = Depends(get_db)) -> dict:
    return search(SearchRequest(project=project, query=q, include_archived=include_archived, limit=limit), session)


@app.get("/api/v1/projects/{project}/context")
def project_context(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    program = latest_program(session, current.id)
    exclusions = latest_exclusions(session, current.id)
    baseline = get_run(session, current.current_baseline_run_id) if current.current_baseline_run_id else None
    metrics = session.scalars(select(MetricDefinition).where(MetricDefinition.project_id == current.id)).all()
    proposals = session.scalars(select(Experiment).where(Experiment.project_id == current.id, Experiment.lifecycle == "proposed", Experiment.archived_at.is_(None), Experiment.deleted_at.is_(None)).order_by(Experiment.priority)).all()
    evidence = session.scalars(select(Run).where(Run.project_id == current.id, Run.lifecycle.in_(["completed", "crashed"]), Run.archived_at.is_(None), Run.deleted_at.is_(None)).order_by(desc(Run.finished_at)).limit(5)).all()
    version_material = f"{current.updated_at}|{program.version if program else 0}|{exclusions.version if exclusions else 0}|{current.current_baseline_run_id}"
    return {
        "project": ProjectRead.model_validate(current).model_dump(),
        "program": {"content": program.content if program else "", "version": program.version if program else 0},
        "exclusions": exclusions.rules if exclusions else [],
        "baseline": run_payload(baseline) if baseline else None,
        "metric_definitions": [{"key": item.key, "label": item.label, "unit": item.unit, "direction": item.direction, "role": item.role, "comparability_key": item.comparability_key} for item in metrics],
        "claimable_experiments": [ExperimentRead.model_validate(item).model_dump() for item in proposals],
        "recent_evidence": [run_payload(item) for item in evidence],
        "context_version": str(abs(hash(version_material))),
        "operations": {"registry": f"/api/v1/projects/{current.slug}", "claim": f"/api/v1/projects/{current.slug}/experiments/claim"},
    }


@app.get("/api/v1/projects/{project}/progress")
def progress(project: str, metric: str | None = None, window: str = "30d", session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    metric = metric or current.progress_metric_key
    definition = session.scalar(select(MetricDefinition).where(MetricDefinition.project_id == current.id, MetricDefinition.key == metric))
    direction = current.progress_metric_direction if metric == current.progress_metric_key else (definition.direction if definition else "lower_is_better")
    cutoff = None
    if window == "7d":
        cutoff = now_utc() - timedelta(days=7)
    elif window == "30d":
        cutoff = now_utc() - timedelta(days=30)
    runs = session.scalars(select(Run).options(selectinload(Run.metrics)).where(Run.project_id == current.id, Run.lifecycle == "completed", Run.archived_at.is_(None), Run.deleted_at.is_(None)).order_by(Run.finished_at)).all()
    values = []
    for run in runs:
        finished_at = run.finished_at
        if finished_at and finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)
        if cutoff and finished_at and finished_at < cutoff:
            continue
        points = [point for point in run.metrics if point.name == metric]
        if points:
            latest = max(points, key=lambda point: (point.step or 0, point.timestamp))
            values.append((run, latest.value))
    if not values:
        return {"metric": metric, "label": definition.label if definition else metric, "unit": definition.unit if definition else None, "window": window, "direction": direction, "baseline": None, "best": None, "series": []}
    baseline = values[0][1]
    series = []
    best = baseline
    for run, value in values:
        is_improvement = not series or (value > best if direction == "higher_is_better" else value < best)
        if is_improvement:
            best = value
        if baseline == 0:
            improvement = 0.0
            best_improvement = 0.0
        elif direction == "higher_is_better":
            improvement = (value - baseline) / abs(baseline) * 100
            best_improvement = (best - baseline) / abs(baseline) * 100
        else:
            improvement = (baseline - value) / abs(baseline) * 100
            best_improvement = (baseline - best) / abs(baseline) * 100
        series.append({"run_id": run.id, "display_id": run.display_id, "timestamp": run.finished_at, "raw_value": value, "best_value": best, "is_improvement": is_improvement, "improvement": round(improvement, 4), "best_improvement": round(best_improvement, 4), "baseline_value": baseline})
    return {"metric": metric, "label": definition.label if definition else metric, "unit": definition.unit if definition else None, "window": window, "direction": direction, "baseline": baseline, "best": best, "series": series}


@app.get("/api/v1/projects/{project}/dashboard")
def dashboard(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    experiments = session.scalars(select(Experiment).where(Experiment.project_id == current.id, Experiment.deleted_at.is_(None)).order_by(Experiment.priority)).all()
    runs = session.scalars(select(Run).options(selectinload(Run.metrics), selectinload(Run.events), selectinload(Run.parameters), selectinload(Run.artifacts)).where(Run.project_id == current.id, Run.deleted_at.is_(None)).order_by(desc(Run.created_at))).all()
    active_experiments = [item for item in experiments if not item.archived_at]
    archived = [item for item in experiments if item.archived_at]
    active_runs = [item for item in runs if item.lifecycle == "running" and not item.archived_at]
    history = [item for item in runs if item.lifecycle in {"completed", "crashed"} and not item.archived_at]
    archived_runs = [item for item in runs if item.archived_at]
    baseline = get_run(session, current.current_baseline_run_id) if current.current_baseline_run_id else None
    program = latest_program(session, current.id)
    exclusions = latest_exclusions(session, current.id)
    counts = Counter(item.lifecycle for item in active_experiments)
    counts.update(item.lifecycle for item in active_runs)
    counts.update(item.disposition for item in history)
    counts["crashed"] = len([item for item in history if item.lifecycle == "crashed"])
    workers = session.scalar(select(func.count()).select_from(WorkerObservation).where(WorkerObservation.project_id == current.id)) or 0
    return {
        "project": ProjectRead.model_validate(current).model_dump(),
        "experiments": [ExperimentRead.model_validate(item).model_dump() for item in active_experiments],
        "archived": [ExperimentRead.model_validate(item).model_dump() for item in archived] + [run_payload(item, detail=True) for item in archived_runs],
        "active_runs": [run_payload(item, detail=True) for item in active_runs],
        "history": [run_payload(item, detail=True) for item in history],
        "baseline": run_payload(baseline, detail=True) if baseline else None,
        "program": {"content": program.content if program else "", "version": program.version if program else 0},
        "exclusions": exclusions.rules if exclusions else [],
        "counts": dict(counts),
        "worker_count": workers,
        "available_metrics": available_metric_names(session, current.id),
    }


@app.get("/api/v1/runs/{identifier}/stream")
async def stream_run(identifier: str):
    async def events():
        last_metric_id = 0
        last_event_id = 0
        while True:
            with SessionLocal() as session:
                run = session.scalar(select(Run).where(or_(Run.id == identifier, Run.display_id == identifier)))
                if not run:
                    yield "event: error\ndata: {\"message\":\"Run not found\"}\n\n"
                    return
                metrics = session.scalars(select(RunMetric).where(RunMetric.run_id == run.id, RunMetric.id > last_metric_id).order_by(RunMetric.id)).all()
                log_events = session.scalars(select(RunEvent).where(RunEvent.run_id == run.id, RunEvent.id > last_event_id).order_by(RunEvent.id)).all()
                for point in metrics:
                    last_metric_id = point.id
                    yield f"event: metric\ndata: {json.dumps({'id': point.id, 'name': point.name, 'value': point.value, 'step': point.step, 'timestamp': point.timestamp.isoformat()})}\n\n"
                for event in log_events:
                    last_event_id = event.id
                    yield f"event: event\ndata: {json.dumps({'id': event.id, 'message': event.message, 'level': event.level, 'event_type': event.event_type, 'timestamp': event.timestamp.isoformat()})}\n\n"
                yield f"event: status\ndata: {json.dumps({'lifecycle': run.lifecycle, 'disposition': run.disposition, 'updated_at': run.updated_at.isoformat()})}\n\n"
                if run.lifecycle != "running":
                    return
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
