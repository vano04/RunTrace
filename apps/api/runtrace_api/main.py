from __future__ import annotations

import asyncio
import json
import re
import shutil
from collections import Counter
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import and_, delete, desc, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from .config import ROOT, settings
from .auth import apply_owner_recovery_password, authenticate_request, router as auth_router
from .database import SessionLocal, get_db
from .embeddings import index_document, semantic_matches
from .models import (
    Artifact,
    AuditEvent,
    ExclusionVersion,
    Experiment,
    MetricDefinition,
    ProjectMembership,
    ProgramVersion,
    Project,
    Run,
    RunEvent,
    RunMetric,
    RunParameter,
    TagDefinition,
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
    ExperimentUpdate,
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
    TagWrite,
)
from .seed import seed_demo


@asynccontextmanager
async def lifespan(_: FastAPI):
    startup()
    demo_tasks = (
        [asyncio.create_task(demo_metric_loop()), asyncio.create_task(demo_claim_loop())]
        if settings.seed_demo
        else []
    )
    try:
        yield
    finally:
        for task in demo_tasks:
            task.cancel()
        for task in demo_tasks:
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title="RunTrace API",
    version="0.1.3",
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
app.middleware("http")(authenticate_request)
app.include_router(auth_router)

AUTORESEARCH_COMPLETION_STEP = 3350
AUTORESEARCH_EARLY_RUNTIME_SECONDS = 4000
AUTORESEARCH_LONG_RUNTIME_SECONDS = 6000
TEXT_ARTIFACT_SUFFIXES = {".cfg", ".conf", ".csv", ".env", ".ini", ".json", ".jsonl", ".log", ".md", ".out", ".stderr", ".stdout", ".toml", ".txt", ".yaml", ".yml"}


def startup() -> None:
    settings.artifact_path.mkdir(parents=True, exist_ok=True)
    if settings.auto_migrate:
        migration_config = Config(str(ROOT / "alembic.ini"))
        migration_config.set_main_option("sqlalchemy.url", settings.database_url)
        command.upgrade(migration_config, "head")
    if settings.owner_recovery_password:
        with SessionLocal() as session:
            apply_owner_recovery_password(session)
    if settings.seed_demo:
        with SessionLocal() as session:
            seed_demo(session)
            requeue_expired_claims(session)


async def demo_metric_loop() -> None:
    """Advance the seeded live run by one 100-step point every ten seconds."""
    while True:
        await asyncio.sleep(10)
        with SessionLocal() as session:
            run = session.scalar(select(Run).where(Run.id == "run_174", Run.lifecycle == "running"))
            if not run or not (run.configuration or {}).get("demo_metric_loop"):
                continue
            latest_step = session.scalar(select(func.max(RunMetric.step)).where(RunMetric.run_id == run.id, RunMetric.name == "validation_loss"))
            if latest_step is not None and latest_step >= 1000:
                session.execute(delete(RunMetric).where(RunMetric.run_id == run.id, RunMetric.name == "validation_loss"))
                next_step = 0
            else:
                next_step = (latest_step or 0) + 100
            value = round(3.62 - 0.00036 * next_step, 4)
            session.add(RunMetric(run_id=run.id, name="validation_loss", value=value, step=next_step, timestamp=now_utc(), context={"demo": True}))
            run.updated_at = now_utc()
            session.commit()


async def demo_claim_loop() -> None:
    """Keep the seeded autoresearch claims alive while the demo worker is running."""
    workers = {"exp_022": "autoresearch/Jul4", "exp_024": "autoresearch/Jul5"}
    while True:
        with SessionLocal() as session:
            claimed_at = now_utc()
            experiments = session.scalars(select(Experiment).where(Experiment.id.in_(workers))).all()
            for experiment in experiments:
                expected_worker = workers[experiment.id]
                if experiment.lifecycle == "pending" and experiment.claimed_by == expected_worker:
                    experiment.claimed_at = claimed_at
                    experiment.updated_at = claimed_at
            session.commit()
        await asyncio.sleep(max(10, settings.claim_timeout_seconds // 3))


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
        .where(Run.id == identifier, Run.deleted_at.is_(None))
    )
    if not item:
        matches = session.scalars(
            select(Run)
            .options(selectinload(Run.metrics), selectinload(Run.events), selectinload(Run.parameters), selectinload(Run.artifacts))
            .where(Run.display_id == identifier, Run.deleted_at.is_(None))
        ).all()
        if len(matches) > 1:
            raise HTTPException(409, "Run display ID is ambiguous; use the full run ID")
        item = matches[0] if matches else None
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


def requeue_expired_claims(session: Session, project_id: str | None = None) -> int:
    cutoff = now_utc() - timedelta(seconds=settings.claim_timeout_seconds)
    query = select(Experiment).where(
        Experiment.lifecycle == "pending",
        Experiment.claimed_at.is_not(None),
        Experiment.claimed_at < cutoff,
        Experiment.archived_at.is_(None),
        Experiment.deleted_at.is_(None),
    )
    if project_id:
        query = query.where(Experiment.project_id == project_id)
    expired = list(session.scalars(query))
    for item in expired:
        previous_worker = item.claimed_by
        item.lifecycle = "proposed"
        item.claimed_by = None
        item.claimed_at = None
        item.updated_at = now_utc()
        audit(session, item.project_id, "experiment.claim_expired", "experiment", item.id, "system", None, {"previous_worker": previous_worker})
    if expired:
        session.commit()
    return len(expired)


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


def _normalise_tags(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(tag).strip().lower() for tag in value if str(tag).strip()]


def run_final_step(run: Run) -> int | None:
    metric_steps = [point.step for point in run.metrics if point.step is not None]
    if metric_steps:
        return max(metric_steps)
    for key in ("final_step", "last_step", "completed_steps"):
        value = (run.configuration or {}).get(key)
        if isinstance(value, int):
            return value
    if (run.configuration or {}).get("source_file") != "results.tsv":
        return None
    text = " ".join([run.name, run.hypothesis, run.result_summary, run.conclusion]).lower()
    patterns = [
        r"(?:killed|crashed|stopped|terminated)(?:\s+early)?(?:\s+at)?\s+step\s*([0-9,]+)",
        r"(?:through|until|to)\s+step\s*([0-9,]+)",
        r"step\s*([0-9,]+).*?(?:killed|crashed|stopped|not run to completion)",
        r"\b([0-9][0-9,]{2,})-step\b",
    ]
    matches = [int(value.replace(",", "")) for pattern in patterns for value in re.findall(pattern, text)]
    return max(matches) if matches else None


def autoresearch_runtime_seconds(run: Run) -> float | None:
    if (run.configuration or {}).get("source_file") != "results.tsv":
        return None
    values = [point.value for point in run.metrics if point.name == "train_time_s"]
    return values[-1] if values else None


def tag_rule_names(run: Run) -> dict[str, str]:
    return {item.rule_key: item.name for item in run.project.tag_definitions if item.rule_key}


def run_tags(run: Run) -> list[str]:
    """Return explicit tags plus temporary autoresearch step-derived tags.

    The 3350-step convention lets existing autoresearch data become filterable
    before producers have been updated to emit explicit tags.
    """
    tags = set(_normalise_tags((run.configuration or {}).get("tags")))
    for parameter in run.parameters:
        if parameter.name == "tags":
            tags.update(_normalise_tags(parameter.value))
    final_step = run_final_step(run)
    rules = tag_rule_names(run)
    early_tag = rules.get("autoresearch_early_stop")
    long_tag = rules.get("autoresearch_long_run")
    if final_step is not None:
        if final_step < AUTORESEARCH_COMPLETION_STEP and early_tag:
            tags.add(early_tag)
        elif final_step > AUTORESEARCH_COMPLETION_STEP and long_tag:
            tags.add(long_tag)
    else:
        runtime = autoresearch_runtime_seconds(run)
        if runtime is not None and runtime < AUTORESEARCH_EARLY_RUNTIME_SECONDS and early_tag:
            tags.add(early_tag)
        elif runtime is not None and runtime > AUTORESEARCH_LONG_RUNTIME_SECONDS and long_tag:
            tags.add(long_tag)
    if (run.configuration or {}).get("source_file") == "results.tsv" and (run.configuration or {}).get("autoresearch_status") == "crash" and (not long_tag or long_tag not in tags) and early_tag:
        tags.add(early_tag)
    return sorted(tags)


def experiment_tags(experiment: Experiment) -> list[str]:
    return sorted(set(_normalise_tags((experiment.configuration or {}).get("tags"))))


def tag_payload(tag: TagDefinition) -> dict:
    return {"id": tag.id, "name": tag.name, "rule_key": tag.rule_key, "created_at": tag.created_at, "updated_at": tag.updated_at}


def register_tags(session: Session, project: Project, names: list[str]) -> bool:
    existing = {item.name for item in project.tag_definitions}
    changed = False
    for name in sorted(set(_normalise_tags(names)) - existing):
        session.add(TagDefinition(project_id=project.id, name=name))
        changed = True
    if changed:
        session.flush()
        session.refresh(project, attribute_names=["tag_definitions"])
    return changed


def replace_explicit_tag(value: object, old: str, new: str | None) -> list[str]:
    tags = _normalise_tags(value)
    replaced = [new if tag == old else tag for tag in tags if tag != old or new]
    return sorted(set(tag for tag in replaced if tag))


def rewrite_explicit_tag(session: Session, project: Project, old: str, new: str | None) -> None:
    experiments = session.scalars(select(Experiment).where(Experiment.project_id == project.id)).all()
    for item in experiments:
        configuration = dict(item.configuration or {})
        if old in _normalise_tags(configuration.get("tags")):
            configuration["tags"] = replace_explicit_tag(configuration.get("tags"), old, new)
            item.configuration = configuration
    runs = session.scalars(select(Run).options(selectinload(Run.parameters)).where(Run.project_id == project.id)).all()
    for item in runs:
        configuration = dict(item.configuration or {})
        if old in _normalise_tags(configuration.get("tags")):
            configuration["tags"] = replace_explicit_tag(configuration.get("tags"), old, new)
            item.configuration = configuration
        for parameter in item.parameters:
            if parameter.name == "tags" and old in _normalise_tags(parameter.value):
                parameter.value = replace_explicit_tag(parameter.value, old, new)


def matches_tag_filters(tags: list[str], include_tags: list[str], exclude_tags: list[str]) -> bool:
    tag_set = set(tags)
    included = {tag.strip().lower() for tag in include_tags if tag.strip()}
    excluded = {tag.strip().lower() for tag in exclude_tags if tag.strip()}
    return included.issubset(tag_set) and tag_set.isdisjoint(excluded)


def run_payload(run: Run, detail: bool = False) -> dict:
    payload = RunRead.model_validate(run).model_dump()
    payload["tags"] = run_tags(run)
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
def create_project(body: ProjectCreate, request: Request, session: Session = Depends(get_db)) -> Project:
    if session.scalar(select(Project.id).where(Project.slug == body.slug)):
        raise HTTPException(409, "Project slug already exists")
    project = Project(**body.model_dump())
    session.add(project)
    session.flush()
    principal = request.state.identity
    if not principal.dev:
        session.add(ProjectMembership(project_id=project.id, identity_id=principal.id, role="owner"))
    session.add_all([
        TagDefinition(project_id=project.id, name="early stop", rule_key="autoresearch_early_stop"),
        TagDefinition(project_id=project.id, name="long run", rule_key="autoresearch_long_run"),
    ])
    session.add(ProgramVersion(project_id=project.id, version=1, content=f"# {project.name}\n", actor="human"))
    session.add(ExclusionVersion(project_id=project.id, version=1, rules=[], actor="human"))
    session.commit()
    session.refresh(project)
    return project


@app.get("/api/v1/projects")
def list_projects(request: Request, session: Session = Depends(get_db)) -> list[dict]:
    principal = request.state.identity
    query = select(Project).order_by(Project.name)
    if not principal.dev and principal.role not in {"owner", "admin"}:
        query = query.join(ProjectMembership).where(ProjectMembership.identity_id == principal.id)
    if principal.token_project_ids is not None:
        query = query.where(Project.id.in_(principal.token_project_ids))
    projects = session.scalars(query).all()
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


@app.delete("/api/v1/projects/{project}", status_code=204)
def delete_project(project: str, request: Request, session: Session = Depends(get_db)) -> None:
    current = get_project(session, project)
    principal = request.state.identity
    if not principal.dev and principal.role not in {"owner", "admin"}:
        role = session.scalar(select(ProjectMembership.role).where(ProjectMembership.project_id == current.id, ProjectMembership.identity_id == principal.id))
        if role != "owner":
            raise HTTPException(403, "Project owner access is required")
    run_ids = list(session.scalars(select(Run.id).where(Run.project_id == current.id)))
    session.delete(current)
    session.commit()
    for run_id in run_ids:
        shutil.rmtree(settings.artifact_path / run_id, ignore_errors=True)


@app.patch("/api/v1/projects/{project}", response_model=ProjectRead)
def update_project(project: str, body: ProjectUpdate, session: Session = Depends(get_db)) -> Project:
    current = get_project(session, project)
    current.description = body.description.strip()
    if "repository_url" in body.model_fields_set:
        current.repository_url = body.repository_url.strip() if body.repository_url and body.repository_url.strip() else None
    audit(session, current.id, "project.updated", "project", current.id, "human", None, {
        "description": current.description,
        "repository_url": current.repository_url,
    })
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


@app.get("/api/v1/projects/{project}/tags")
def list_tags(project: str, session: Session = Depends(get_db)) -> list[dict]:
    current = get_project(session, project)
    experiments = session.scalars(select(Experiment).where(Experiment.project_id == current.id)).all()
    runs = session.scalars(select(Run).options(selectinload(Run.parameters)).where(Run.project_id == current.id)).all()
    observed = [tag for item in experiments for tag in experiment_tags(item)] + [tag for item in runs for tag in _normalise_tags((item.configuration or {}).get("tags"))]
    observed += [tag for item in runs for parameter in item.parameters if parameter.name == "tags" for tag in _normalise_tags(parameter.value)]
    if register_tags(session, current, observed):
        session.commit()
    return [tag_payload(item) for item in sorted(current.tag_definitions, key=lambda item: item.name)]


@app.post("/api/v1/projects/{project}/tags", status_code=201)
def create_tag(project: str, body: TagWrite, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    name = body.name.strip().lower()
    if session.scalar(select(TagDefinition.id).where(TagDefinition.project_id == current.id, TagDefinition.name == name)):
        raise HTTPException(409, "Tag already exists")
    item = TagDefinition(project_id=current.id, name=name)
    session.add(item)
    session.flush()
    audit(session, current.id, "tag.created", "tag", item.id, "human", None, {"name": name})
    session.commit()
    session.refresh(item)
    return tag_payload(item)


@app.patch("/api/v1/projects/{project}/tags/{tag_id}")
def update_tag(project: str, tag_id: str, body: TagWrite, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    item = session.scalar(select(TagDefinition).where(TagDefinition.project_id == current.id, TagDefinition.id == tag_id))
    if not item:
        raise HTTPException(404, "Tag not found")
    name = body.name.strip().lower()
    duplicate = session.scalar(select(TagDefinition.id).where(TagDefinition.project_id == current.id, TagDefinition.name == name, TagDefinition.id != item.id))
    if duplicate:
        raise HTTPException(409, "Tag already exists")
    old = item.name
    if old != name:
        rewrite_explicit_tag(session, current, old, name)
        item.name = name
        audit(session, current.id, "tag.updated", "tag", item.id, "human", None, {"old_name": old, "name": name})
    session.commit()
    session.refresh(item)
    return tag_payload(item)


@app.delete("/api/v1/projects/{project}/tags/{tag_id}", status_code=204)
def delete_tag(project: str, tag_id: str, session: Session = Depends(get_db)) -> None:
    current = get_project(session, project)
    item = session.scalar(select(TagDefinition).where(TagDefinition.project_id == current.id, TagDefinition.id == tag_id))
    if not item:
        raise HTTPException(404, "Tag not found")
    rewrite_explicit_tag(session, current, item.name, None)
    audit(session, current.id, "tag.deleted", "tag", item.id, "human", None, {"name": item.name, "rule_key": item.rule_key})
    session.delete(item)
    session.commit()


@app.get("/api/v1/projects/{project}/experiments", response_model=list[ExperimentRead])
def list_experiments(
    project: str,
    lifecycle: str | None = None,
    include_archived: bool = False,
    session: Session = Depends(get_db),
) -> list[Experiment]:
    current = get_project(session, project)
    requeue_expired_claims(session, current.id)
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
    register_tags(session, current, _normalise_tags(body.configuration.get("tags")))
    index_document(session, item)
    audit(session, current.id, "experiment.proposed", "experiment", item.id, body.source_model or body.source, x_request_id, {"display_id": item.display_id})
    session.commit()
    session.refresh(item)
    return item


@app.get("/api/v1/projects/{project}/experiments/{identifier}", response_model=ExperimentRead)
def read_experiment(project: str, identifier: str, session: Session = Depends(get_db)) -> Experiment:
    return get_experiment(session, get_project(session, project), identifier)


@app.patch("/api/v1/projects/{project}/experiments/{identifier}", response_model=ExperimentRead)
def update_experiment(
    project: str,
    identifier: str,
    body: ExperimentUpdate,
    x_actor: str = Header("human"),
    x_request_id: str | None = Header(None),
    session: Session = Depends(get_db),
) -> Experiment:
    current = get_project(session, project)
    item = get_experiment(session, current, identifier)
    changes = {key: value for key, value in body.model_dump(exclude_unset=True).items() if value is not None}
    if not changes:
        return item
    for key, value in changes.items():
        setattr(item, key, value)
    item.updated_at = now_utc()
    if "configuration" in changes:
        register_tags(session, current, _normalise_tags(item.configuration.get("tags")))
    index_document(session, item)
    audit(session, current.id, "experiment.updated", "experiment", item.id, x_actor, x_request_id, {"fields": sorted(changes)})
    session.commit()
    session.refresh(item)
    return item


@app.post("/api/v1/projects/{project}/experiments/claim", response_model=ExperimentRead)
def claim_next(project: str, body: ClaimRequest, session: Session = Depends(get_db)) -> Experiment:
    current = get_project(session, project)
    requeue_expired_claims(session, current.id)
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
    requeue_expired_claims(session, current.id)
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


@app.post("/api/v1/projects/{project}/experiments/{identifier}/release", response_model=ExperimentRead)
def release_experiment(project: str, identifier: str, body: ClaimRequest, session: Session = Depends(get_db)) -> Experiment:
    current = get_project(session, project)
    item = get_experiment(session, current, identifier)
    if item.lifecycle != "pending":
        raise HTTPException(409, "Only pending experiments can be released")
    if item.claimed_by and item.claimed_by != body.worker_id:
        raise HTTPException(409, "Experiment is claimed by another worker")
    item.lifecycle = "proposed"
    item.claimed_by = None
    item.claimed_at = None
    item.updated_at = now_utc()
    audit(session, current.id, "experiment.released", "experiment", item.id, body.worker_id, body.request_id)
    session.commit()
    session.refresh(item)
    return item


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
    register_tags(session, current, _normalise_tags(body.configuration.get("tags")))
    index_document(session, item)
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
    if "tags" in body.parameters:
        register_tags(session, run.project, _normalise_tags(body.parameters["tags"]))
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
        index_document(session, run.experiment)
    index_document(session, run)
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
        index_document(session, run.experiment)
    index_document(session, run)
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


@app.get("/api/v1/artifacts/{artifact_id}/preview")
def preview_artifact(artifact_id: str, session: Session = Depends(get_db)) -> dict:
    item = session.get(Artifact, artifact_id)
    if not item:
        raise HTTPException(404, "Artifact not found")
    path = Path(item.storage_path).resolve()
    root = settings.artifact_path.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "Artifact content not found")
    is_text = item.content_type.startswith("text/") or item.content_type in {"application/json", "application/x-yaml", "application/xml"} or path.suffix.lower() in TEXT_ARTIFACT_SUFFIXES
    if not is_text:
        raise HTTPException(415, "This artifact type cannot be previewed")
    limit = min(settings.max_artifact_size, 512_000)
    content = path.read_bytes()[: limit + 1]
    truncated = len(content) > limit
    return {"id": item.id, "name": item.name, "content_type": item.content_type, "content": content[:limit].decode("utf-8", errors="replace"), "truncated": truncated}


def search_records(session: Session, body: SearchRequest) -> list[dict]:
    project = get_project(session, body.project)
    terms = [term.lower() for term in re.findall(r"[\w-]+", body.query) if len(term) > 1]
    semantic = semantic_matches(session, project.id, body.query, body.limit) if body.query.strip() else {}
    experiments = session.scalars(select(Experiment).where(Experiment.project_id == project.id, Experiment.deleted_at.is_(None))).all()
    runs = session.scalars(select(Run).options(selectinload(Run.metrics), selectinload(Run.events), selectinload(Run.parameters), selectinload(Run.artifacts)).where(Run.project_id == project.id, Run.deleted_at.is_(None))).all()
    records: list[dict] = []
    for item in experiments:
        if not body.include_archived and item.archived_at:
            continue
        if body.lifecycle and item.lifecycle != body.lifecycle:
            continue
        tags = experiment_tags(item)
        if not matches_tag_filters(tags, body.include_tags, body.exclude_tags):
            continue
        haystack = " ".join([item.display_id, item.title, item.hypothesis, item.reasoning, item.implementation_details, json.dumps(item.configuration)]).lower()
        semantic_score = semantic.get(("experiment", item.id), 0.0)
        keyword_match = not terms or all(term in haystack for term in terms)
        if terms and not keyword_match and not semantic_score:
            continue
        keyword_score = sum(haystack.count(term) for term in terms) if keyword_match and terms else 0
        score = keyword_score + semantic_score * 10 if terms else 1
        records.append({"kind": "experiment", "id": item.id, "display_id": item.display_id, "title": item.title, "lifecycle": item.lifecycle, "disposition": item.disposition, "hypothesis": item.hypothesis, "reasoning": item.reasoning, "conclusion": "", "result_summary": "", "archived": bool(item.archived_at), "tags": tags, "score": round(score, 4), "semantic_score": round(semantic_score, 4), "match_type": "hybrid" if semantic_score and keyword_score else "semantic" if semantic_score else "keyword", "timestamp": item.created_at, "metric_value": None})
    for item in runs:
        if item.archived_at and not body.include_archived:
            continue
        if body.lifecycle and item.lifecycle != body.lifecycle:
            continue
        if body.dispositions and item.disposition not in body.dispositions:
            continue
        tags = run_tags(item)
        if not matches_tag_filters(tags, body.include_tags, body.exclude_tags):
            continue
        haystack = " ".join([item.display_id, item.name, item.hypothesis, item.reasoning, item.change_summary, item.result_summary, item.conclusion, item.decision_changed, json.dumps(item.configuration), json.dumps(item.evidence_used), json.dumps({parameter.name: parameter.value for parameter in item.parameters}), " ".join(event.message for event in item.events), " ".join(artifact.name + " " + json.dumps(artifact.metadata_json) for artifact in item.artifacts), " ".join(tags)]).lower()
        semantic_score = semantic.get(("run", item.id), 0.0)
        keyword_match = not terms or all(term in haystack for term in terms)
        if terms and not keyword_match and not semantic_score:
            continue
        keyword_score = sum(haystack.count(term) for term in terms) if keyword_match and terms else 0
        score = keyword_score + semantic_score * 10 if terms else 1
        metric_points = [point for point in item.metrics if point.name == project.progress_metric_key]
        latest_metric = max(metric_points, key=lambda point: (point.step or 0, point.timestamp)) if metric_points else None
        records.append({"kind": "run", "id": item.id, "display_id": item.display_id, "title": item.name, "lifecycle": item.lifecycle, "disposition": item.disposition, "hypothesis": item.hypothesis, "reasoning": item.reasoning, "conclusion": item.conclusion, "result_summary": item.result_summary, "decision_changed": item.decision_changed, "evidence_used": item.evidence_used, "archived": bool(item.archived_at), "tags": tags, "score": round(score, 4), "semantic_score": round(semantic_score, 4), "match_type": "hybrid" if semantic_score and keyword_score else "semantic" if semantic_score else "keyword", "finished_at": item.finished_at, "timestamp": item.finished_at or item.started_at, "metric_value": latest_metric.value if latest_metric else None})
    def sort_timestamp(record: dict) -> float:
        timestamp = record.get("timestamp")
        if not timestamp:
            return 0.0
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return timestamp.timestamp()

    records.sort(key=lambda record: (record["score"], sort_timestamp(record)), reverse=True)
    return records[: body.limit]


@app.post("/api/v1/search")
def search(body: SearchRequest, request: Request, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, body.project)
    principal = request.state.identity
    if principal.token_project_ids is not None and current.id not in principal.token_project_ids:
        raise HTTPException(403, "This API token is not authorized for this project")
    if not principal.dev and principal.role not in {"owner", "admin"} and not session.scalar(select(ProjectMembership.id).where(ProjectMembership.project_id == current.id, ProjectMembership.identity_id == principal.id)):
        raise HTTPException(403, "You do not have access to this project")
    results = search_records(session, body)
    return {"query": body.query, "project": body.project, "count": len(results), "results": results}


@app.get("/api/v1/projects/{project}/search")
def search_get(project: str, q: str = "", include_archived: bool = False, include_tag: list[str] = Query(default=[]), exclude_tag: list[str] = Query(default=[]), limit: int = Query(10, ge=1, le=100), session: Session = Depends(get_db)) -> dict:
    body = SearchRequest(project=project, query=q, include_archived=include_archived, include_tags=include_tag, exclude_tags=exclude_tag, limit=limit)
    results = search_records(session, body)
    return {"query": body.query, "project": body.project, "count": len(results), "results": results}


@app.get("/api/v1/projects/{project}/context")
def project_context(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    requeue_expired_claims(session, current.id)
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
def progress(project: str, metric: str | None = None, window: str = "all", include_tag: list[str] = Query(default=[]), exclude_tag: list[str] = Query(default=[]), session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    metric = metric or current.progress_metric_key
    definition = session.scalar(select(MetricDefinition).where(MetricDefinition.project_id == current.id, MetricDefinition.key == metric))
    direction = current.progress_metric_direction if metric == current.progress_metric_key else (definition.direction if definition else "lower_is_better")
    range_end = now_utc()
    cutoff = None
    if window != "all":
        window_match = re.fullmatch(r"(\d+)d", window)
        if not window_match or not 1 <= int(window_match.group(1)) <= 3650:
            raise HTTPException(422, "Window must be 'all' or a day range such as '7d' or '30d'")
        cutoff = range_end - timedelta(days=int(window_match.group(1)))
    runs = session.scalars(select(Run).options(selectinload(Run.metrics), selectinload(Run.parameters)).where(Run.project_id == current.id, Run.lifecycle == "completed", Run.archived_at.is_(None), Run.deleted_at.is_(None)).order_by(Run.finished_at)).all()
    values = []
    for run in runs:
        finished_at = run.finished_at
        if finished_at and finished_at.tzinfo is None:
            finished_at = finished_at.replace(tzinfo=timezone.utc)
        if cutoff and finished_at and finished_at < cutoff:
            continue
        tags = run_tags(run)
        if not matches_tag_filters(tags, include_tag, exclude_tag):
            continue
        points = [point for point in run.metrics if point.name == metric]
        if points:
            latest = max(points, key=lambda point: (point.step or 0, point.timestamp))
            values.append((run, latest.value, tags))
    if not values:
        return {"metric": metric, "label": definition.label if definition else metric, "unit": definition.unit if definition else None, "window": window, "direction": direction, "baseline": None, "best": None, "series": []}
    baseline = values[0][1]
    series = []
    best = baseline
    for run, value, tags in values:
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
        series.append({"run_id": run.id, "display_id": run.display_id, "name": run.name, "timestamp": run.finished_at, "timestamp_is_inferred": (run.configuration or {}).get("source_file") == "results.tsv", "raw_value": value, "best_value": best, "is_improvement": is_improvement, "improvement": round(improvement, 4), "best_improvement": round(best_improvement, 4), "baseline_value": baseline, "final_step": run_final_step(run), "tags": tags})
    return {"metric": metric, "label": definition.label if definition else metric, "unit": definition.unit if definition else None, "window": window, "direction": direction, "baseline": baseline, "best": best, "series": series}


@app.get("/api/v1/projects/{project}/dashboard")
def dashboard(project: str, session: Session = Depends(get_db)) -> dict:
    current = get_project(session, project)
    requeue_expired_claims(session, current.id)
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
    register_tags(session, current, [tag for item in experiments for tag in experiment_tags(item)] + [tag for item in runs for tag in _normalise_tags((item.configuration or {}).get("tags"))])
    session.commit()
    all_tags = sorted({item.name for item in current.tag_definitions})
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
        "available_tags": all_tags,
        "tag_definitions": [tag_payload(item) for item in sorted(current.tag_definitions, key=lambda item: item.name)],
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
