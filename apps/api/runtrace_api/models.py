from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from .database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("proj"))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    repository_url: Mapped[str | None] = mapped_column(String(500))
    registry_endpoint: Mapped[str] = mapped_column(String(500), default="http://localhost:8000/api/v1")
    current_baseline_run_id: Mapped[str | None] = mapped_column(String(64))
    progress_metric_key: Mapped[str] = mapped_column(String(120), default="validation_loss")
    progress_metric_direction: Mapped[str] = mapped_column(String(32), default="lower_is_better")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    experiments: Mapped[list[Experiment]] = relationship(back_populates="project", cascade="all, delete-orphan")
    runs: Mapped[list[Run]] = relationship(back_populates="project", cascade="all, delete-orphan")
    tag_definitions: Mapped[list[TagDefinition]] = relationship(back_populates="project", cascade="all, delete-orphan")


class TagDefinition(Base):
    __tablename__ = "tag_definitions"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tag"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    rule_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    project: Mapped[Project] = relationship(back_populates="tag_definitions")


class ProgramVersion(Base):
    __tablename__ = "project_program_versions"
    __table_args__ = (UniqueConstraint("project_id", "version"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("program"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(200), default="human")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class ExclusionVersion(Base):
    __tablename__ = "project_exclusion_versions"
    __table_args__ = (UniqueConstraint("project_id", "version"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("exclusions"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    rules: Mapped[list[str]] = mapped_column(JSON, default=list)
    actor: Mapped[str] = mapped_column(String(200), default="human")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MetricDefinition(Base):
    __tablename__ = "metric_definitions"
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("metricdef"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(120))
    label: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str | None] = mapped_column(String(40))
    direction: Mapped[str] = mapped_column(String(32), default="neutral")
    role: Mapped[str] = mapped_column(String(32), default="diagnostic")
    comparability_key: Mapped[str | None] = mapped_column(String(200))


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (
        UniqueConstraint("project_id", "display_id"),
        Index("ix_experiment_claim", "project_id", "lifecycle", "priority", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("exp"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    display_id: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(300))
    hypothesis: Mapped[str] = mapped_column(Text)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    implementation_details: Mapped[str] = mapped_column(Text, default="")
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(64), default="human")
    source_model: Mapped[str | None] = mapped_column(String(200))
    lifecycle: Mapped[str] = mapped_column(String(32), default="proposed")
    disposition: Mapped[str] = mapped_column(String(32), default="undecided")
    metric_mode: Mapped[str] = mapped_column(String(32), default="curve")
    dependency_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    claimed_by: Mapped[str | None] = mapped_column(String(200))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    project: Mapped[Project] = relationship(back_populates="experiments")
    runs: Mapped[list[Run]] = relationship(back_populates="experiment")


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (UniqueConstraint("project_id", "display_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("run"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    experiment_id: Mapped[str | None] = mapped_column(ForeignKey("experiments.id", ondelete="SET NULL"), index=True)
    display_id: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(300))
    lifecycle: Mapped[str] = mapped_column(String(32), default="running", index=True)
    disposition: Mapped[str] = mapped_column(String(32), default="undecided")
    hypothesis: Mapped[str] = mapped_column(Text, default="")
    reasoning: Mapped[str] = mapped_column(Text, default="")
    change_summary: Mapped[str] = mapped_column(Text, default="")
    result_summary: Mapped[str] = mapped_column(Text, default="")
    conclusion: Mapped[str] = mapped_column(Text, default="")
    decision_changed: Mapped[str] = mapped_column(Text, default="")
    evidence_used: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    metric_mode: Mapped[str] = mapped_column(String(32), default="curve")
    command: Mapped[str | None] = mapped_column(Text)
    working_directory: Mapped[str | None] = mapped_column(Text)
    git_commit: Mapped[str | None] = mapped_column(String(80))
    git_branch: Mapped[str | None] = mapped_column(String(300))
    git_dirty: Mapped[bool | None] = mapped_column(Boolean)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    host_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    environment_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    parent_run_id: Mapped[str | None] = mapped_column(String(64))
    source_run_id: Mapped[str | None] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    project: Mapped[Project] = relationship(back_populates="runs")
    experiment: Mapped[Experiment | None] = relationship(back_populates="runs")
    metrics: Mapped[list[RunMetric]] = relationship(back_populates="run", cascade="all, delete-orphan")
    events: Mapped[list[RunEvent]] = relationship(back_populates="run", cascade="all, delete-orphan")
    parameters: Mapped[list[RunParameter]] = relationship(back_populates="run", cascade="all, delete-orphan")
    artifacts: Mapped[list[Artifact]] = relationship(back_populates="run", cascade="all, delete-orphan")


class RunMetric(Base):
    __tablename__ = "run_metrics"
    __table_args__ = (Index("ix_run_metric_name_step", "run_id", "name", "step"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    value: Mapped[float] = mapped_column(Float)
    step: Mapped[int | None] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    run: Mapped[Run] = relationship(back_populates="metrics")


class RunParameter(Base):
    __tablename__ = "run_parameters"
    __table_args__ = (UniqueConstraint("run_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    value: Mapped[Any] = mapped_column(JSON)
    run: Mapped[Run] = relationship(back_populates="parameters")


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    level: Mapped[str] = mapped_column(String(32), default="info")
    event_type: Mapped[str | None] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    run: Mapped[Run] = relationship(back_populates="events")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("artifact"))
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(200), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    run: Mapped[Run] = relationship(back_populates="artifacts")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("audit"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    subject_type: Mapped[str] = mapped_column(String(80))
    subject_id: Mapped[str] = mapped_column(String(64))
    actor: Mapped[str] = mapped_column(String(200), default="human")
    request_id: Mapped[str | None] = mapped_column(String(200), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class WorkerObservation(Base):
    __tablename__ = "worker_observations"
    __table_args__ = (UniqueConstraint("project_id", "worker_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("worker"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    worker_id: Mapped[str] = mapped_column(String(200))
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SearchDocument(Base):
    __tablename__ = "search_documents"
    __table_args__ = (
        UniqueConstraint("document_type", "source_id"),
        Index("ix_search_document_project_type", "project_id", "document_type"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("search"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    document_type: Mapped[str] = mapped_column(String(32))
    source_id: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
