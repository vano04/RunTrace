export type Lifecycle = "proposed" | "pending" | "running" | "completed" | "crashed"
export type Disposition = "kept" | "discarded" | "undecided"

export interface Project {
  id: string
  slug: string
  name: string
  description: string
  repository_url: string | null
  registry_endpoint: string
  current_baseline_run_id: string | null
  progress_metric_key: string
  progress_metric_direction: "lower_is_better" | "higher_is_better"
  created_at: string
  updated_at: string
  active_runs?: number
  experiment_count?: number
  worker_count?: number
}

export interface Experiment {
  id: string
  project_id: string
  display_id: string
  title: string
  hypothesis: string
  reasoning: string
  implementation_details: string
  configuration: Record<string, unknown>
  source: string
  source_model: string | null
  lifecycle: Lifecycle
  disposition: Disposition
  metric_mode: string
  priority: number
  claimed_by: string | null
  claimed_at: string | null
  archived_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface MetricSeries {
  latest: number
  min: number
  max: number
  count: number
  points: Array<{ value: number; step: number | null; timestamp: string }>
}

export interface Run {
  id: string
  project_id: string
  experiment_id: string | null
  display_id: string
  name: string
  lifecycle: Lifecycle
  disposition: Disposition
  hypothesis: string
  reasoning: string
  change_summary: string
  result_summary: string
  conclusion: string
  decision_changed: string
  evidence_used: Array<Record<string, unknown>>
  metric_mode: string
  command: string | null
  git_commit: string | null
  git_branch: string | null
  configuration: Record<string, unknown>
  tags: string[]
  started_at: string
  finished_at: string | null
  archived_at: string | null
  metrics?: Record<string, MetricSeries>
  parameters?: Record<string, unknown>
  events?: Array<{ id: number; message: string; level: string; event_type: string | null; metadata?: Record<string, unknown>; timestamp: string }>
  artifacts?: Artifact[]
  result_visualization?: ExperimentResultVisualization | null
}

export interface Artifact {
  id: string
  name: string
  size: number
  content_type: string
  metadata?: Record<string, unknown>
  created_at?: string
}

export type RTVisNodeType = "stack" | "grid" | "card" | "metric" | "table" | "chart" | "badge" | "text" | "separator" | "javascript"
export type RTVisChartType = "line" | "area" | "bar" | "scatter" | "heatmap"

export interface RTVisColumn {
  key: string
  label: string
  format: "text" | "number" | "date"
}

export interface RTVisNode {
  type: RTVisNodeType
  title?: string | null
  description?: string | null
  children?: RTVisNode[]
  columns_count?: number
  dataset?: string | null
  columns?: RTVisColumn[]
  chart?: RTVisChartType | null
  x?: string | null
  y?: string | null
  series?: string | null
  value?: string | number | null
  label?: string | null
  field?: string | null
  aggregate?: "first" | "last" | "min" | "max" | "avg" | "sum" | "count"
  content?: string | null
  markup?: string | null
  styles?: string | null
  script?: string | null
  height?: number
}

export interface RTVisDataset {
  source: "inline" | "runtrace"
  rows?: Array<Record<string, unknown>>
  query?: "runs" | "experiments" | null
  filters?: Record<string, unknown>
}

export interface RTVisSpec {
  $schema: "https://runtrace.dev/schemas/rtvis/v1.json"
  version: 1
  title: string
  description: string
  datasets: Record<string, RTVisDataset>
  view: RTVisNode
}

export interface Visualization {
  id: string
  project_id: string
  name: string
  description: string
  spec_version: number
  spec: RTVisSpec
  visible: boolean
  sort_order: number
  revision: number
  source_run_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  resolved_datasets: Record<string, Array<Record<string, unknown>>>
}

export interface ExperimentResultVisualizationType {
  id: string | null
  key: string
  name: string
  description: string
  spec_version?: number
  spec: RTVisSpec | null
  builtin: boolean
  created_by?: string
}

export interface ExperimentResultVisualization {
  key: string
  name: string
  description: string
  spec: RTVisSpec
  resolved_datasets: Record<string, Array<Record<string, unknown>>>
}

export interface VisualizationDocument {
  format: "runtrace-visualization"
  version: 1
  visualization: { name: string; description: string; spec: RTVisSpec }
}

export interface Dashboard {
  project: Project
  experiments: Experiment[]
  active_runs: Run[]
  history: Run[]
  archived: Array<Experiment | Run>
  baseline: Run | null
  program: { content: string; version: number }
  exclusions: string[]
  counts: Record<string, number>
  worker_count: number
  available_metrics: string[]
  available_tags: string[]
  tag_definitions: TagDefinition[]
  visualizations: Visualization[]
  result_visualization_types: ExperimentResultVisualizationType[]
}

export interface TagDefinition {
  id: string
  name: string
  rule_key: string | null
  created_at: string
  updated_at: string
}

export interface ProgressPoint {
  run_id: string
  display_id: string
  name: string
  timestamp: string
  timestamp_is_inferred?: boolean
  raw_value: number
  best_value: number
  is_improvement: boolean
  improvement: number
  best_improvement: number
  baseline_value: number
  final_step: number | null
  tags: string[]
}

export interface ProgressData {
  metric: string
  label: string
  unit: string | null
  window: string
  direction: string
  baseline: number | null
  best: number | null
  series: ProgressPoint[]
}

export interface SearchResult {
  kind: "experiment" | "run"
  id: string
  display_id: string
  title: string
  lifecycle: Lifecycle
  disposition: Disposition
  hypothesis: string
  reasoning: string
  conclusion: string
  result_summary: string
  archived: boolean
  tags: string[]
  score: number
  timestamp: string
  metric_value: number | null
  semantic_score?: number
  match_type?: "keyword" | "semantic" | "hybrid"
}
