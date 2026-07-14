from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


Lifecycle = Literal["proposed", "pending", "running", "completed", "crashed"]
Disposition = Literal["kept", "discarded", "undecided"]
MetricMode = Literal["curve", "timings", "scalar", "none"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str = ""
    repository_url: str | None = None


class ProjectUpdate(BaseModel):
    description: str = Field(default="", max_length=2000)
    repository_url: str | None = Field(default=None, max_length=500)


class ProjectRead(ORMModel):
    id: str
    name: str
    slug: str
    description: str
    repository_url: str | None
    registry_endpoint: str
    current_baseline_run_id: str | None
    progress_metric_key: str
    progress_metric_direction: str
    created_at: datetime
    updated_at: datetime


class ExperimentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    hypothesis: str = Field(min_length=1)
    reasoning: str = ""
    implementation_details: str = ""
    configuration: dict[str, Any] = Field(default_factory=dict)
    source: str = "human"
    source_model: str | None = None
    metric_mode: MetricMode = "curve"
    dependency_ids: list[str] = Field(default_factory=list)
    priority: int = 100


class ExperimentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    hypothesis: str | None = Field(default=None, min_length=1)
    reasoning: str | None = None
    implementation_details: str | None = None
    configuration: dict[str, Any] | None = None
    metric_mode: MetricMode | None = None
    dependency_ids: list[str] | None = None
    priority: int | None = None


class ExperimentRead(ORMModel):
    id: str
    project_id: str
    display_id: str
    title: str
    hypothesis: str
    reasoning: str
    implementation_details: str
    configuration: dict[str, Any]
    source: str
    source_model: str | None
    lifecycle: Lifecycle
    disposition: Disposition
    metric_mode: MetricMode
    dependency_ids: list[str]
    priority: int
    claimed_by: str | None
    claimed_at: datetime | None
    archived_at: datetime | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ClaimRequest(BaseModel):
    worker_id: str = Field(min_length=1, max_length=200)
    request_id: str | None = None


class MetricPoint(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    value: float
    step: int | None = None
    timestamp: datetime | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class MetricBatch(BaseModel):
    metrics: list[MetricPoint] = Field(min_length=1, max_length=1000)


class EventCreate(BaseModel):
    message: str = Field(min_length=1)
    level: Literal["debug", "info", "warning", "error"] = "info"
    event_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = None


class ParameterBatch(BaseModel):
    parameters: dict[str, Any]


class RunCreate(BaseModel):
    experiment_id: str | None = None
    name: str = Field(min_length=1, max_length=300)
    hypothesis: str = ""
    reasoning: str = ""
    change_summary: str = ""
    decision_changed: str = ""
    evidence_used: list[dict[str, Any]] = Field(default_factory=list)
    metric_mode: MetricMode = "curve"
    command: str | None = None
    working_directory: str | None = None
    git_commit: str | None = None
    git_branch: str | None = None
    git_dirty: bool | None = None
    configuration: dict[str, Any] = Field(default_factory=dict)
    host_metadata: dict[str, Any] = Field(default_factory=dict)
    environment_metadata: dict[str, Any] = Field(default_factory=dict)
    parent_run_id: str | None = None
    source_run_id: str | None = None


class RunFinish(BaseModel):
    disposition: Disposition
    result_summary: str = ""
    conclusion: str = ""


class RunCrash(BaseModel):
    error_summary: str


class RunRead(ORMModel):
    id: str
    project_id: str
    experiment_id: str | None
    display_id: str
    name: str
    lifecycle: str
    disposition: str
    hypothesis: str
    reasoning: str
    change_summary: str
    result_summary: str
    conclusion: str
    decision_changed: str
    evidence_used: list[dict[str, Any]]
    metric_mode: str
    command: str | None
    working_directory: str | None
    git_commit: str | None
    git_branch: str | None
    git_dirty: bool | None
    configuration: dict[str, Any]
    host_metadata: dict[str, Any]
    environment_metadata: dict[str, Any]
    started_at: datetime
    finished_at: datetime | None
    archived_at: datetime | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ContextUpdate(BaseModel):
    content: str
    actor: str = "human"
    request_id: str | None = None


class ExclusionsUpdate(BaseModel):
    rules: list[str]
    actor: str = "human"
    request_id: str | None = None


class ProgressSettingsUpdate(BaseModel):
    metric_name: str = Field(min_length=1, max_length=120)
    direction: Literal["lower_is_better", "higher_is_better"] = "lower_is_better"


class TagWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class BaselineUpdate(BaseModel):
    run_id: str
    actor: str = "human"
    request_id: str | None = None


class SearchRequest(BaseModel):
    project: str
    query: str = ""
    include_archived: bool = False
    lifecycle: str | None = None
    dispositions: list[str] = Field(default_factory=list)
    include_tags: list[str] = Field(default_factory=list)
    exclude_tags: list[str] = Field(default_factory=list)
    limit: int = Field(default=10, ge=1, le=100)
