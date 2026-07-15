from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RTVIS_SCHEMA_URL = "https://runtrace.dev/schemas/rtvis/v1.json"
MAX_DOCUMENT_BYTES = 1_000_000
MAX_DATASET_ROWS = 5_000
MAX_NODE_DEPTH = 10


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class RTVisDataset(StrictModel):
    source: Literal["inline", "runtrace"] = "inline"
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_DATASET_ROWS)
    query: Literal["runs", "experiments", "run_metrics"] | None = None
    filters: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_source(self) -> RTVisDataset:
        if self.source == "inline" and self.query is not None:
            raise ValueError("Inline datasets cannot declare a RunTrace query")
        if self.source == "runtrace" and self.query is None:
            raise ValueError("RunTrace datasets must declare a query")
        if self.source == "runtrace" and self.rows:
            raise ValueError("RunTrace datasets cannot include inline rows")
        return self


class RTVisColumn(StrictModel):
    key: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=120)
    format: Literal["text", "number", "date"] = "text"


class RTVisNode(StrictModel):
    type: Literal["stack", "grid", "card", "metric", "table", "chart", "badge", "text", "separator", "javascript"]
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    children: list[RTVisNode] = Field(default_factory=list, max_length=24)
    columns_count: int = Field(default=2, ge=1, le=4)
    dataset: str | None = Field(default=None, max_length=120)
    columns: list[RTVisColumn] = Field(default_factory=list, max_length=12)
    chart: Literal["line", "area", "bar", "scatter", "heatmap"] | None = None
    x: str | None = Field(default=None, max_length=120)
    y: str | None = Field(default=None, max_length=120)
    series: str | None = Field(default=None, max_length=120)
    value: str | float | int | None = None
    label: str | None = Field(default=None, max_length=160)
    field: str | None = Field(default=None, max_length=120)
    aggregate: Literal["first", "last", "min", "max", "avg", "sum", "count"] = "last"
    content: str | None = Field(default=None, max_length=2_000)
    markup: str | None = Field(default=None, max_length=100_000)
    styles: str | None = Field(default=None, max_length=50_000)
    script: str | None = Field(default=None, max_length=200_000)
    height: int = Field(default=360, ge=160, le=900)

    @model_validator(mode="after")
    def validate_node(self) -> RTVisNode:
        if self.type in {"stack", "grid", "card"} and not self.children:
            raise ValueError(f"{self.type} nodes must contain children")
        if self.type in {"table", "chart"} and not self.dataset:
            raise ValueError(f"{self.type} nodes must reference a dataset")
        if self.type == "table" and not self.columns:
            raise ValueError("Table nodes must declare columns")
        if self.type == "chart" and (not self.chart or not self.x or not self.y):
            raise ValueError("Chart nodes must declare chart, x, and y")
        if self.type == "chart" and self.chart == "heatmap" and not self.series:
            raise ValueError("Heatmap charts must declare series as the second categorical axis")
        if self.type == "metric" and self.aggregate != "count" and self.value is None and not self.field:
            raise ValueError("Metric nodes must declare a literal value or field")
        if self.type == "metric" and self.field and not self.dataset:
            raise ValueError("Metric nodes that use a field must reference a dataset")
        if self.type == "text" and self.content is None:
            raise ValueError("Text nodes must declare content")
        if self.type == "badge" and self.label is None:
            raise ValueError("Badge nodes must declare a label")
        if self.type == "javascript":
            if not self.markup or not self.script:
                raise ValueError("JavaScript nodes must declare markup and script")
            if re.search(r"<\s*script\b", self.markup, re.IGNORECASE):
                raise ValueError("Put executable code in the script field, not markup")
            if self.styles and re.search(r"@import\b", self.styles, re.IGNORECASE):
                raise ValueError("JavaScript widget styles cannot import external stylesheets")
        return self


class RTVisSpec(StrictModel):
    schema_url: Literal[RTVIS_SCHEMA_URL] = Field(default=RTVIS_SCHEMA_URL, alias="$schema")
    version: Literal[1] = 1
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1_000)
    datasets: dict[str, RTVisDataset] = Field(default_factory=dict, max_length=12)
    view: RTVisNode

    @model_validator(mode="after")
    def validate_document(self) -> RTVisSpec:
        names = set(self.datasets)

        def visit(node: RTVisNode, depth: int) -> None:
            if depth > MAX_NODE_DEPTH:
                raise ValueError(f"Visualization nodes cannot be nested deeper than {MAX_NODE_DEPTH} levels")
            if node.dataset and node.dataset not in names:
                raise ValueError(f"Unknown dataset: {node.dataset}")
            for child in node.children:
                visit(child, depth + 1)

        visit(self.view, 1)
        payload = self.model_dump(mode="json", by_alias=True)
        if len(json.dumps(payload, separators=(",", ":")).encode()) > MAX_DOCUMENT_BYTES:
            raise ValueError("Visualization document exceeds the 1 MB limit")
        return self


def normalized_spec(spec: RTVisSpec) -> dict[str, Any]:
    compact = spec.model_dump(mode="json", by_alias=True, exclude_none=True, exclude_defaults=True)
    datasets = {}
    for name, dataset in spec.datasets.items():
        if dataset.source == "inline":
            datasets[name] = {"source": "inline", "rows": dataset.rows}
        else:
            datasets[name] = {"source": "runtrace", "query": dataset.query}
            if dataset.filters:
                datasets[name]["filters"] = dataset.filters
    return {
        "$schema": RTVIS_SCHEMA_URL,
        "version": 1,
        "title": spec.title,
        "description": spec.description,
        "datasets": datasets,
        "view": compact["view"],
    }


def visualization_guide(saved_visualizations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "format": "RTVis",
        "version": 1,
        "schema_url": RTVIS_SCHEMA_URL,
        "json_schema": RTVisSpec.model_json_schema(by_alias=True),
        "rules": [
            "Check existing_dashboard before authoring. Do not recreate a built-in or saved visualization unless the user explicitly asks to replace it.",
            "Dashboard visualizations are project-level tracking views. Use the separate experiment result visualization guide for per-run result display types.",
            "Use shadcn-backed card, table, badge, and layout nodes when they fit.",
            "Use chart nodes for data marks; RunTrace applies project theme tokens automatically.",
            "Use a javascript node only when the trusted nodes cannot express the interaction.",
            "JavaScript widgets receive window.runtrace.datasets and window.runtrace.theme and run in an isolated, network-disabled iframe.",
            "Use the provided card, btn, badge, input, select, muted, and grid classes to mimic shadcn styling inside JavaScript widgets.",
            "Keep the first render useful and add only interactions represented by the schema.",
        ],
        "existing_dashboard": {
            "built_ins": [
                {"id": "autoresearch_progress", "location": "project dashboard", "description": "Interactive best-so-far percentage improvement over time with metric, window, and tag filters."},
                {"id": "baseline_summary", "location": "project dashboard", "description": "Current baseline run, primary metric, connected worker count, and registry status."},
                {"id": "experiment_queue", "location": "project dashboard", "description": "Shared proposed, claimed, and running experiment queue with lifecycle counts."},
                {"id": "completed_history", "location": "project dashboard", "description": "Recent completed and crashed runs with branch, result, and disposition."},
                {"id": "run_curve", "location": "run details", "description": "Interactive metric curve compared with the current baseline."},
                {"id": "run_metric_summary", "location": "run details", "description": "Latest value, point count, and range for every recorded metric, including timing and scalar modes."},
                {"id": "run_evidence", "location": "run details", "description": "Configuration, events, artifacts, conclusion, commit, and branch evidence."},
            ],
            "saved_custom_visualizations": saved_visualizations or [],
            "authoring_rule": "Create a dashboard widget only for additional cross-run or project-level tracking not covered above. Per-run result shapes belong to experiment result visualization types.",
        },
        "supported_nodes": ["stack", "grid", "card", "metric", "table", "chart", "badge", "text", "separator", "javascript"],
        "supported_charts": ["line", "area", "bar", "scatter", "heatmap"],
        "dataset_sources": {
            "inline": {"description": "Portable rows embedded in the document", "max_rows": MAX_DATASET_ROWS},
            "runtrace": {"queries": ["runs", "experiments"], "description": "Live project-scoped data resolved by RunTrace. Experiment result types use their separate guide and run_metrics query."},
        },
        "theme_tokens": ["background", "foreground", "card", "muted", "border", "primary", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
        "javascript_runtime": {
            "global": "window.runtrace",
            "fields": ["datasets", "theme"],
            "sandbox": "allow-scripts without same-origin or network access",
            "height_range": [160, 900],
        },
        "max_document_bytes": MAX_DOCUMENT_BYTES,
    }
