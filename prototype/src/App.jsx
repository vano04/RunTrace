import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowLeft,
  ArrowCounterClockwise,
  ArrowSquareOut,
  BookOpenText,
  CaretDown,
  ChartLineUp,
  Check,
  ClockCounterClockwise,
  Code,
  Copy,
  Database,
  DotsThreeVertical,
  Eye,
  FileArrowUp,
  FileText,
  Flag,
  FolderSimple,
  Folders,
  GearSix,
  FloppyDisk,
  MagnifyingGlass,
  Plus,
  Pulse,
  Rows,
  ShieldSlash,
  SidebarSimple,
  StackSimple,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react";

const initialProposals = [
  {
    id: "EXP-021",
    name: "Adaptive cap schedule",
    status: "Proposed",
    hypothesis: "Test whether late-step relaxation avoids the runtime penalty",
    source: "GPT-5.6 Sol",
    details:
      "Start with a strict spectral cap, then relax it after step 600. Compare quality and wall time with RUN-168.",
    config: "cap_start=0.85 · cap_end=1.0 · relax_step=600",
    metricMode: "curve",
  },
  {
    id: "EXP-022",
    name: "Low-rank spectral estimate",
    status: "Pending",
    hypothesis: "Evaluate low-rank approximation to further cut runtime",
    source: "worker-05 · queued",
    details:
      "Approximate the dominant singular directions with rank 8 before applying the cap. Keep the current schedule fixed.",
    config: "rank=8 · iterations=2 · schedule=baseline",
    metricMode: "curve",
  },
  {
    id: "EXP-023",
    name: "Cache normalized rows",
    status: "Proposed",
    dependency: "blocked by EXP-021",
    hypothesis: "Speed up row normalization via cache reuse",
    source: "experiments.md",
    details:
      "Reuse normalized rows when the update norm remains under the invalidation threshold.",
    config: "cache=true · invalidate_delta=0.015",
    metricMode: "timings",
  },
];

const historySeed = [
  {
    id: "RUN-173",
    name: "4-step approximation",
    result: "3.30 · runtime +31%",
    decision: "Discarded",
    finished: "Jul 12, 2026  9:18 PM",
  },
  {
    id: "RUN-171",
    name: "Scheduled power iteration",
    result: "3.29 · runtime +18%",
    decision: "Kept",
    finished: "Jul 10, 2026  4:57 PM",
  },
  {
    id: "RUN-170",
    name: "Row cache prototype",
    result: "Process exited 137",
    decision: "Crashed",
    finished: "Jul 9, 2026  11:43 PM",
  },
  {
    id: "RUN-169",
    name: "Full power iteration",
    result: "3.27 · runtime +78%",
    decision: "Discarded",
    finished: "Jul 8, 2026  8:21 PM",
  },
  {
    id: "RUN-168",
    name: "Scheduled spectral cap",
    result: "3.28 · runtime +14%",
    decision: "Kept",
    finished: "Jul 7, 2026  6:12 PM",
  },
  {
    id: "RUN-166",
    name: "Row normalization only",
    result: "3.61 · quality regressed",
    decision: "Discarded",
    finished: "Jul 6, 2026  10:34 PM",
  },
];

const runningExperiment = {
  id: "RUN-174",
  name: "2-step spectral approximation",
  status: "Running",
  step: 742,
  total: 1000,
  hypothesis: "Preserve the spectral quality gain with lower runtime",
  source: "worker-03 · DeepSeek V4 Pro",
  metricMode: "curve",
};

const initialBaseline = {
  id: "RUN-168",
  name: "Scheduled spectral cap",
  loss: "3.28",
  runtime: "+14%",
  finished: "Jul 12, 2026",
};

const initialProgramMd = `# Dense Optimizer

Improve validation loss without increasing step time by more than 20%.

## Evaluation
- Primary: validation loss at step 1000
- Guardrail: wall-clock runtime vs current main baseline
- Keep only reproducible improvements

## Implementation
Use feature flags for experimental paths. Record config, commit, metrics, and conclusion for every run.`;

const alternateProjectSeeds = {
  "flash-attention-kernel": {
    proposals: [
      { id: "EXP-006", name: "Warp-specialized reduction", status: "Proposed", hypothesis: "Reduce synchronization overhead in the epilogue", source: "program.md", details: "Move the final reduction into warp-specialized lanes.", config: "warp_specialize=true · tile=128", metricMode: "timings" },
      { id: "EXP-007", name: "128×64 tile sweep", status: "Pending", hypothesis: "Improve H100 occupancy without increasing spills", source: "worker-02 · queued", details: "Compare two block shapes under identical sequence lengths.", config: "tiles=128x64,128x128", metricMode: "timings" },
    ],
    baseline: { id: "RUN-005", name: "Vectorized shared-memory load", loss: "42.8 µs", runtime: "−11%", finished: "Jul 13, 2026" },
    rules: ["Do not change numerical precision", "Do not use architecture-specific intrinsics below SM90"],
    program: "# Flash Attention Kernel\n\nReduce H100 forward-pass latency while preserving numerical parity.\n\n## Evaluation\n- Primary: median kernel time\n- Guardrail: max absolute error\n- Benchmark fixed sequence-length buckets",
  },
  "sparse-router": {
    proposals: [],
    baseline: { id: "RUN-012", name: "Capacity-aware top-2 routing", loss: "1.84", runtime: "+3%", finished: "Jul 11, 2026" },
    rules: ["Do not increase expert count", "Do not change the training dataset"],
    program: "# Sparse Router\n\nImprove routing balance without degrading downstream validation quality.\n\n## Evaluation\n- Primary: routing entropy\n- Guardrail: validation loss",
  },
};

const metricModeLabels = {
  curve: "Loss curve",
  timings: "Timing metrics",
  scalar: "Scalar metrics",
  none: "No graph",
};

const API_ROOT = "/api/v1";

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `RunTrace request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function slugifyProjectName(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseExperimentsMarkdown(markdown) {
  const sections = markdown
    .split(/^#{2,3}\s+/m)
    .slice(1)
    .map((section) => section.trim())
    .filter(Boolean);
  return sections.map((section) => {
    const [heading, ...bodyLines] = section.split("\n");
    const body = bodyLines.join("\n").trim();
    const paragraphs = body.split(/\n\s*\n/).map((item) => item.replace(/^[-*]\s+/gm, "").trim()).filter(Boolean);
    return {
      name: heading.trim(),
      hypothesis: paragraphs[0] || `Evaluate ${heading.trim()}`,
      source: "experiments.md",
      config: paragraphs.slice(1).join(" · "),
      metricMode: "curve",
    };
  });
}

async function copyText(text, notify) {
  try {
    await navigator.clipboard.writeText(text);
    notify("Copied to clipboard");
  } catch {
    notify("Clipboard access is unavailable");
  }
}

const titleCase = (value = "") => value.charAt(0).toUpperCase() + value.slice(1);

function mapExperiment(item) {
  return {
    backendId: item.id,
    id: item.display_id,
    name: item.title,
    status: titleCase(item.lifecycle),
    hypothesis: item.hypothesis,
    source: item.source_model || item.source,
    details: [item.reasoning, item.implementation_details].filter(Boolean).join(" ") || item.hypothesis,
    config: Object.keys(item.configuration || {}).length ? JSON.stringify(item.configuration) : "No configuration supplied",
    metricMode: item.metric_mode,
    dependency: item.dependency_ids?.length ? `blocked by ${item.dependency_ids.join(", ")}` : undefined,
  };
}

function mapRun(item) {
  const finished = item.finished_at
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.finished_at))
    : "In progress";
  return {
    backendId: item.id,
    id: item.display_id,
    name: item.name,
    result: item.result_summary || "Awaiting result",
    decision: item.lifecycle === "crashed" ? "Crashed" : titleCase(item.disposition),
    status: titleCase(item.lifecycle),
    hypothesis: item.hypothesis,
    details: item.reasoning,
    conclusion: item.conclusion,
    decisionChanged: item.decision_changed,
    evidenceUsed: item.evidence_used || [],
    config: Object.keys(item.configuration || {}).length ? JSON.stringify(item.configuration) : "No configuration supplied",
    metricMode: item.metric_mode || "curve",
    finished,
    metrics: item.metrics || {},
    events: item.events || [],
    source: item.host_metadata?.hostname || item.git_branch || "agent",
    totalSteps: item.configuration?.total_steps || item.configuration?.steps || null,
  };
}

function nextExperimentId(proposals, archived) {
  const ids = [...proposals, ...archived]
    .filter((item) => item.id?.startsWith("EXP-"))
    .map((item) => Number(item.id.replace("EXP-", "")))
    .filter(Number.isFinite);
  return `EXP-${String(Math.max(23, ...ids) + 1).padStart(3, "0")}`;
}

const statusMeta = {
  Proposed: { className: "proposed", label: "Proposed" },
  Pending: { className: "pending", label: "Pending" },
  Running: { className: "running", label: "Running" },
  Kept: { className: "kept", label: "Kept" },
  Discarded: { className: "discarded", label: "Discarded" },
  Crashed: { className: "crashed", label: "Crashed" },
};

function StatusDot({ value, compact = false }) {
  const meta = statusMeta[value] ?? statusMeta.Discarded;
  return (
    <span className={`status ${meta.className} ${compact ? "compact" : ""}`} aria-label={meta.label} title={meta.label}>
      <span className="status-dot" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

function MetricModeIcon({ mode = "none" }) {
  const meta = {
    curve: { Icon: ChartLineUp, label: "Loss curve" },
    timings: { Icon: Timer, label: "Timing metrics" },
    scalar: { Icon: Pulse, label: "Scalar metrics" },
    none: { Icon: Rows, label: "No graph" },
  }[mode];
  const Icon = meta.Icon;
  return <span className="metric-mode-icon" title={meta.label} aria-label={meta.label}><Icon size={17} /></span>;
}

function MetricCurve({ points, baselineValue, metricName }) {
  if (!points.length) return <div className="progress-empty"><span>No {metricName} points have been reported.</span></div>;
  const maxStep = Math.max(1, ...points.map((point, index) => point.step ?? index));
  const values = points.map((point) => point.value);
  if (Number.isFinite(Number(baselineValue))) values.push(Number(baselineValue));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.15, Math.abs(high || 1) * 0.01);
  const minY = low - padding;
  const range = Math.max(high + padding - minY, 0.000001);
  const yFor = (value) => 160 - ((value - minY) / range) * 142;
  const pointString = points.map((point, index) => {
    const step = point.step ?? index;
    return `${(38 + (step / maxStep) * 578).toFixed(1)},${yFor(point.value).toFixed(1)}`;
  }).join(" ");
  const baselineY = Number.isFinite(Number(baselineValue)) ? yFor(Number(baselineValue)) : null;

  return (
    <svg className="loss-curve" viewBox="0 0 640 190" role="img" aria-label={`${metricName} curve through step ${maxStep}`}>
      <title>{metricName} curve through step {maxStep}</title>
      {[18, 65, 112, 160].map((y) => <line key={y} x1="38" y1={y} x2="616" y2={y} className="chart-grid" />)}
      <text x="5" y="22">{(high + padding).toPrecision(3)}</text><text x="5" y="164">{minY.toPrecision(3)}</text>
      <text x="34" y="184">0</text><text x="588" y="184">{maxStep}</text>
      {baselineY != null && <line x1="38" x2="616" y1={baselineY} y2={baselineY} className="curve baseline-curve" />}
      <polyline points={pointString} className="curve current-curve" />
      <circle cx={38 + ((points.at(-1).step ?? points.length - 1) / maxStep) * 578} cy={yFor(points.at(-1).value)} r="4" className="curve-point" />
    </svg>
  );
}

function ProgressChart({ projectSlug, metricName, metricDirection }) {
  const [timeWindow, setTimeWindow] = useState("30d");
  const [remoteSeries, setRemoteSeries] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  useEffect(() => {
    setRemoteSeries(null);
    setLoadState("loading");
    api(`/projects/${projectSlug}/progress?metric=${encodeURIComponent(metricName)}&window=${timeWindow}`)
      .then((payload) => {
        setRemoteSeries({
          label: payload.metric,
          unit: payload.unit,
          direction: payload.direction,
          best: payload.best,
          values: payload.series.map((point) => ({
            id: point.display_id,
            date: new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(point.timestamp)),
            rawValue: point.raw_value,
            bestValue: point.best_value,
            isImprovement: point.is_improvement,
          })),
        });
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [metricName, projectSlug, timeWindow]);
  const series = remoteSeries || { label: metricName, unit: null, direction: metricDirection, best: null, values: [] };
  const visibleCount = timeWindow === "7d" ? 3 : timeWindow === "30d" ? 8 : series.values.length;
  const values = series.values.slice(-visibleCount);
  const rawMin = Math.min(...values.flatMap((point) => [point.rawValue, point.bestValue]));
  const rawMax = Math.max(...values.flatMap((point) => [point.rawValue, point.bestValue]));
  const observedRange = rawMax - rawMin;
  const padding = observedRange > 0 ? observedRange * 0.18 : Math.max(Math.abs(rawMax || 1) * 0.01, 0.001);
  const chartMin = rawMin - padding;
  const chartMax = rawMax + padding;
  const chartRange = Math.max(0.000001, chartMax - chartMin);
  const yFor = (value) => 178 - ((value - chartMin) / chartRange) * 138;
  const coordinates = values.map((point, index) => ({
    ...point,
    x: 58 + (index / Math.max(1, values.length - 1)) * 850,
    observedY: yFor(point.rawValue),
    bestY: yFor(point.bestValue),
  }));
  const stepPath = coordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.bestY.toFixed(1)}`;
    return `${path} H ${point.x.toFixed(1)}${point.isImprovement ? ` V ${point.bestY.toFixed(1)}` : ""}`;
  }, "");
  const areaPath = coordinates.length ? `M ${coordinates[0].x.toFixed(1)} 178 L ${coordinates[0].x.toFixed(1)} ${coordinates[0].bestY.toFixed(1)} ${stepPath.replace(/^M [^H]+/, "")} L ${coordinates.at(-1).x.toFixed(1)} 178 Z` : "";
  const directionLabel = series.direction === "higher_is_better" ? "higher is better" : "lower is better";
  const formatValue = (value) => value == null ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })}${series.unit ? ` ${series.unit}` : ""}`;

  return (
    <section className="progress-panel" aria-labelledby="progress-title">
      <header className="progress-panel-head">
        <div><h2 id="progress-title">Autoresearch progress</h2><p>Best-so-far <code>{metricName}</code> · orange dots are non-improving runs</p></div>
        <div className="chart-controls single-control">
          <label><span>Window</span><select value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)}><option value="7d">7 days</option><option value="30d">30 days</option><option value="all">All time</option></select></label>
        </div>
      </header>
      <div className="progress-chart-wrap">
        {loadState === "loading" ? <div className="progress-empty"><strong>Loading progress…</strong></div> : loadState === "error" ? <div className="progress-empty"><strong>Progress could not be loaded.</strong><span>Check the API connection and try again.</span></div> : coordinates.length ? <>
          <div className="progress-value"><strong>{formatValue(series.best)}</strong><span><code>{metricName}</code> · {directionLabel}</span></div>
          <svg className="progress-chart" viewBox="0 0 940 220" role="img" aria-label={`Best-so-far ${metricName} is ${formatValue(series.best)}; orange dots show non-improving runs`}>
            <title>Best-so-far {metricName} over {timeWindow === "all" ? "all time" : timeWindow}</title>
            {[40, 86, 132, 178].map((y, index) => <g key={y}><line x1="58" y1={y} x2="908" y2={y} className="chart-grid" /><text x="8" y={y + 4}>{Number(chartMax - (index / 3) * chartRange).toLocaleString("en-US", { maximumFractionDigits: 3 })}</text></g>)}
            <path d={areaPath} className="progress-area" />
            <path d={stepPath} className="progress-line" />
            {coordinates.filter((point) => point.isImprovement).map((point) => <circle key={`best-${point.id}`} cx={point.x} cy={point.bestY} r="4.5" className="progress-dot improvement"><title>{point.id} · {point.date}: new best {formatValue(point.bestValue)}</title></circle>)}
            {coordinates.filter((point) => !point.isImprovement).map((point) => <circle key={`observed-${point.id}`} cx={point.x} cy={point.observedY} r="6" className="progress-dot regression"><title>{point.id} · {point.date}: {formatValue(point.rawValue)} did not improve on {formatValue(point.bestValue)}</title></circle>)}
            <text x="58" y="207">{values[0]?.date}</text><text x="864" y="207">{values.at(-1)?.date}</text>
          </svg>
        </> : <div className="progress-empty"><strong>No completed runs report <code>{metricName}</code> yet.</strong><span>Emit this exact metric name from Python or an autoresearch agent to populate the chart.</span></div>}
      </div>
    </section>
  );
}

function IconButton({ label, children, onClick, className = "" }) {
  return (
    <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ExperimentMenu({ item, canSetBaseline = false, onSetBaseline, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef(null);
  const runAction = (action) => {
    setOpen(false);
    action(item);
  };
  const toggle = () => {
    if (open) return setOpen(false);
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = 120;
    setPosition({
      top: rect.bottom + menuHeight < window.innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - menuHeight - 5),
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setOpen(true);
  };

  return (
    <div className={`experiment-menu ${open ? "open" : ""}`}>
      <button ref={triggerRef} type="button" className="experiment-menu-trigger" aria-label={`More actions for ${item.id}`} aria-expanded={open} title="More actions" onClick={toggle}><DotsThreeVertical size={21} weight="bold" /></button>
      {open && createPortal(<div className="experiment-menu-popover" role="menu" style={{ position: "fixed", ...position }}>
        <button type="button" role="menuitem" disabled={!canSetBaseline} title={canSetBaseline ? "" : "Available after completion"} onClick={() => runAction(onSetBaseline)}><Flag size={17} /> Set as baseline</button>
        <button type="button" role="menuitem" onClick={() => runAction(onArchive)}><Archive size={17} /> Archive</button>
        <button type="button" role="menuitem" className="delete-action" onClick={() => runAction(onDelete)}><Trash size={17} /> Delete</button>
      </div>, document.body)}
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const modal = modalRef.current;
    const focusable = () => [...modal.querySelectorAll("button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex='-1'])")];
    (modal.querySelector("[autofocus]") || focusable()[0])?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") return onCloseRef.current();
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={modalRef}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <p className="modal-eyebrow">{eyebrow}</p>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={20} weight="bold" />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <time className="sidebar-time" dateTime={now.toISOString()}>
      {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(now)}
    </time>
  );
}

function AppSidebar({ activeNav, setActiveNav, mobileOpen, setMobileOpen, projectName }) {
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: ChartLineUp },
    { id: "search", label: "Search", icon: MagnifyingGlass },
    { id: "archive", label: "Archive", icon: Archive },
    { id: "settings", label: "Settings", icon: GearSix },
  ];

  return (
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand-row">
        <StackSimple size={29} weight="fill" aria-hidden="true" />
        <span>RunTrace</span>
        <IconButton label="Close navigation" className="mobile-close" onClick={() => setMobileOpen(false)}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="nav-scope"><button aria-label="Back to projects" title="Back to projects" onClick={() => { setActiveNav("project-list"); setMobileOpen(false); }}><ArrowLeft size={17} /></button><div><span>Project</span><strong>{projectName}</strong></div></div>
      <nav className="primary-nav" aria-label="Primary navigation">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={activeNav === item.id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setActiveNav(item.id);
                setMobileOpen(false);
              }}
            >
              <Icon size={24} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />
      <div className="project-mini">
        <span className="mini-label">Project</span>
        <strong>{projectName}</strong>
        <span className="project-state"><span /> Active</span>
      </div>
      <div className="host-meta">
        <Database size={20} />
        <span>Self-hosted</span>
      </div>
      <LiveClock />
    </aside>
  );
}

export function DashboardHeading({ description }) {
  return <div className="dashboard-heading"><h1>Dashboard</h1><p className={description ? "project-goal" : "project-goal empty"}>{description || "No project goal set yet. Add one in Settings."}</p></div>;
}

function Dashboard({ projectName, projectDescription, projectSlug, progressMetric, progressDirection, proposals, setProposals, archived, deletedIds, history, activeRun, counts, workerCount, createProposal, archiveExperiment, deleteExperiment, baseline, setExperimentBaseline, rules, saveRules, notify }) {
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [form, setForm] = useState({ name: "", hypothesis: "", source: "Human proposal", config: "", metricMode: "curve" });
  const [importedProposals, setImportedProposals] = useState([]);
  const [ruleDraft, setRuleDraft] = useState(rules.join("\n"));

  const proposedCount = proposals.filter((item) => item.status === "Proposed").length;
  const pendingCount = proposals.filter((item) => item.status === "Pending").length;
  const visibleRun = activeRun || (projectSlug === "dense-optimizer" ? runningExperiment : null);
  const metricPoints = visibleRun?.metrics?.validation_loss?.points || [];
  const latestPoint = visibleRun?.latestMetric || metricPoints.at(-1);
  const visibleStep = latestPoint?.step || visibleRun?.step || 742;
  const visibleLoss = latestPoint?.value || visibleRun?.metrics?.validation_loss?.latest || 3.31;
  const runningVisible = Boolean(visibleRun) && !archived.some((item) => item.id === visibleRun.id) && !deletedIds.includes(visibleRun.id);
  const activeHistory = useMemo(
    () => history.filter((item) => !archived.some((entry) => entry.id === item.id) && !deletedIds.includes(item.id)),
    [archived, deletedIds, history],
  );

  const filteredHistory = useMemo(() => {
    const base = showAll ? activeHistory : activeHistory.slice(0, 4);
    return historyFilter === "All" ? base : base.filter((item) => item.decision === historyFilter);
  }, [activeHistory, historyFilter, showAll]);

  const submitProposal = async (event) => {
    event.preventDefault();
    try {
      const proposal = await createProposal(form);
      setProposals((items) => [...items, proposal]);
      setModal(null);
      setForm({ name: "", hypothesis: "", source: "Human proposal", config: "", metricMode: "curve" });
      notify(`${proposal.id} added to the shared registry`);
    } catch (error) {
      notify(error.message);
    }
  };

  const importExperiments = async () => {
    if (!importedProposals.length) {
      notify("Choose an experiments.md file with at least one ## experiment heading");
      return;
    }
    try {
      const imported = await Promise.all(importedProposals.map(createProposal));
      setProposals((items) => [...items, ...imported]);
      setModal(null);
      setImportedProposals([]);
      notify(`Imported ${imported.length} proposal${imported.length === 1 ? "" : "s"} from experiments.md`);
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <>
      <div className="page-heading-row">
        <DashboardHeading description={projectDescription} />
        <div className="header-tools">
          <div className="registry-meta">
            <Database size={20} />
            <div>
              <strong>Shared experiment registry</strong>
              <span>Queried by {workerCount} connected workers</span>
            </div>
          </div>
          <button className="rules-button" onClick={() => { setRuleDraft(rules.join("\n")); setModal("rules"); }} aria-label={`Research exclusions, ${rules.length} rules`} title="Research exclusions">
            <ShieldSlash size={20} />
            <span className="rules-badge">{rules.length}</span>
          </button>
        </div>
      </div>

      <ProgressChart projectSlug={projectSlug} metricName={progressMetric} metricDirection={progressDirection} />

      <section className="baseline-strip" aria-label="Current baseline">
        <div className="baseline-main">
          <span className="field-label">Current baseline&nbsp; · &nbsp;<strong>main</strong></span>
          <button className="link-button" onClick={() => setModal("baseline")}>{baseline.id}&nbsp; · &nbsp;{baseline.name}</button>
        </div>
        <div className="baseline-stat">
          <span className="field-label"><code>{progressMetric}</code></span>
          <strong>{baseline.loss}</strong>
        </div>
        <div className="baseline-stat">
          <span className="field-label">Kept</span>
          <time>{baseline.finished}</time>
        </div>
        <button className="text-action baseline-action" onClick={() => setModal("baseline")}>
          <ArrowSquareOut size={19} /> View baseline
        </button>
      </section>

      <div className="status-summary" aria-label="Experiment counts">
        <button onClick={() => document.querySelector("#queue")?.scrollIntoView({ behavior: "smooth" })}><StatusDot value="Proposed" compact /><strong>{proposedCount}</strong><span>proposed</span></button>
        <button onClick={() => document.querySelector("#queue")?.scrollIntoView({ behavior: "smooth" })}><StatusDot value="Pending" compact /><strong>{pendingCount}</strong><span>pending</span></button>
        <button onClick={() => runningVisible && setModal("live")}><StatusDot value="Running" compact /><strong>{runningVisible ? 1 : 0}</strong><span>running</span></button>
        <button onClick={() => setHistoryFilter(historyFilter === "Kept" ? "All" : "Kept")}><StatusDot value="Kept" compact /><strong>{counts.kept ?? 0}</strong><span>kept</span></button>
        <button onClick={() => setHistoryFilter(historyFilter === "Discarded" ? "All" : "Discarded")}><StatusDot value="Discarded" compact /><strong>{counts.discarded ?? 0}</strong><span>discarded</span></button>
        <button onClick={() => setHistoryFilter(historyFilter === "Crashed" ? "All" : "Crashed")}><StatusDot value="Crashed" compact /><strong>{counts.crashed ?? 0}</strong><span>crashed</span></button>
      </div>

      <section className="queue-section" id="queue">
        <header className="section-heading">
          <div>
            <h2>Shared experiment queue</h2>
            <p>Workers query and claim proposed experiments independently.</p>
          </div>
          <div className="section-actions">
            <button className="button primary" onClick={() => setModal("add")}><Plus size={21} /> Add experiment</button>
            <button className="button secondary" onClick={() => { setImportedProposals([]); setModal("import"); }}><FileArrowUp size={20} /> Import experiments.md</button>
          </div>
        </header>

        <div className="table-shell queue-table-shell">
          <table className="data-table queue-table">
            <thead>
              <tr>
                <th className="drag-col" aria-label="Order" />
                <th className="number-col">#</th>
                <th>Status</th>
                <th>Experiment</th>
                <th>Hypothesis / reason</th>
                <th>Source / owner</th>
                <th className="action-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runningVisible && <tr className="running-row">
                <td className="drag-cell"><Rows size={16} /></td>
                <td>1</td>
                <td>
                  <StatusDot value="Running" />
                  <span className="status-detail">{visibleRun.totalSteps ? `${visibleStep} / ${visibleRun.totalSteps}` : `step ${visibleStep}`}</span>
                </td>
                <td><button className="experiment-link" onClick={() => setModal("live")}><MetricModeIcon mode={visibleRun.metricMode} />{visibleRun.id}&nbsp; · &nbsp;{visibleRun.name}</button></td>
                <td>{visibleRun.hypothesis}</td>
                <td className="owner-cell"><span>{visibleRun.source}</span></td>
                <td><div className="row-actions-wrap"><IconButton label={`Open live run ${visibleRun.id}`} onClick={() => setModal("live")}><Eye size={19} /></IconButton><ExperimentMenu item={visibleRun} onSetBaseline={setExperimentBaseline} onArchive={archiveExperiment} onDelete={setDeleteCandidate} /></div></td>
              </tr>}
              {proposals.map((proposal, index) => (
                <tr key={proposal.id} className={proposal.status === "Pending" ? "pending-row" : ""}>
                  <td className="drag-cell"><Rows size={16} /></td>
                  <td>{index + 2}</td>
                  <td>
                    <StatusDot value={proposal.status} />
                    {proposal.dependency && <span className="status-detail">{proposal.dependency}</span>}
                  </td>
                  <td><button className="experiment-link" onClick={() => setSelected(proposal)}><MetricModeIcon mode={proposal.metricMode} />{proposal.id}&nbsp; · &nbsp;{proposal.name}</button></td>
                  <td>{proposal.hypothesis}</td>
                  <td className="owner-cell">{proposal.source === "experiments.md" ? <><span>Imported from</span><span>experiments.md</span></> : proposal.source}</td>
                  <td>
                    <div className="row-actions-wrap">
                      <IconButton label={`View details for ${proposal.id}`} onClick={() => setSelected(proposal)}><Eye size={19} /></IconButton>
                      <ExperimentMenu item={proposal} onSetBaseline={setExperimentBaseline} onArchive={archiveExperiment} onDelete={setDeleteCandidate} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-section" id="history">
        <header className="history-heading">
          <div className="history-title-wrap">
            <h2>Recent experiments</h2>
            {historyFilter !== "All" && (
              <button className="active-filter" onClick={() => setHistoryFilter("All")}>{historyFilter} <X size={14} /></button>
            )}
          </div>
          <button className="view-all-link" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show recent" : "View all"}</button>
        </header>
        <div className="table-shell">
          <table className="data-table history-table">
            <thead><tr><th>Experiment</th><th>Result</th><th>Decision</th><th>Finished</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {filteredHistory.map((item) => (
                <tr key={item.id}>
                  <td><button className="experiment-link" onClick={() => setSelected({ ...item, history: true })}><MetricModeIcon mode={item.id === "RUN-170" ? "timings" : "curve"} />{item.id}&nbsp; · &nbsp;{item.name}</button></td>
                  <td>{item.result}</td>
                  <td><StatusDot value={item.decision} /></td>
                  <td><time>{item.finished}</time></td>
                  <td><ExperimentMenu item={{ ...item, history: true }} canSetBaseline onSetBaseline={setExperimentBaseline} onArchive={archiveExperiment} onDelete={setDeleteCandidate} /></td>
                </tr>
              ))}
              {filteredHistory.length === 0 && <tr><td colSpan="5" className="empty-row">{historyFilter === "All" ? "No completed experiments yet." : `No ${historyFilter.toLowerCase()} experiments in this view.`}</td></tr>}
            </tbody>
          </table>
        </div>
        <button className="completed-disclosure" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show recent experiments" : "View all completed experiments"}
          <CaretDown size={19} className={showAll ? "rotate" : ""} />
        </button>
      </section>

      {modal === "add" && (
        <Modal title="Add proposed experiment" eyebrow="Shared registry" onClose={() => setModal(null)}>
          <form className="proposal-form" onSubmit={submitProposal}>
            <label>Experiment name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Adaptive momentum decay" /></label>
            <label>Hypothesis<textarea value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} placeholder="What should this experiment teach us?" /></label>
            <div className="form-row">
              <label>Source<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option>Human proposal</option><option>GPT-5.6 Sol</option><option>experiments.md</option></select></label>
              <label>Result display<select value={form.metricMode} onChange={(e) => setForm({ ...form, metricMode: e.target.value })}><option value="curve">Loss curve</option><option value="timings">Timing metrics</option><option value="scalar">Scalar metrics</option><option value="none">No graph</option></select></label>
            </div>
            <label>Configuration<input value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} placeholder="flags, params, branch" /></label>
            <p className="form-note">This creates a proposal in the registry. Workers decide independently when to query and claim it.</p>
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit"><Plus size={19} /> Add proposal</button></div>
          </form>
        </Modal>
      )}

      {modal === "import" && (
        <Modal title="Import experiments.md" eyebrow="Proposal source" onClose={() => setModal(null)}>
          <label className="import-panel">
            <FileArrowUp size={34} />
            <div><strong>Choose experiments.md</strong><span>{importedProposals.length ? `${importedProposals.length} proposed experiment${importedProposals.length === 1 ? "" : "s"} detected` : "Each ## heading becomes a proposal"}</span></div>
            <input type="file" accept=".md,text/markdown,text/plain" onChange={async (event) => {
              const file = event.target.files?.[0];
              setImportedProposals(file ? parseExperimentsMarkdown(await file.text()) : []);
            }} />
          </label>
          {importedProposals.length > 0 && <div className="import-preview"><code>## {importedProposals[0].name}</code><p>{importedProposals[0].hypothesis}</p>{importedProposals.length > 1 && <span>+ {importedProposals.length - 1} more</span>}</div>}
          <p className="form-note">Importing adds proposals only. It does not dispatch work to any connected machine.</p>
          <div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={!importedProposals.length} onClick={importExperiments}><FileArrowUp size={19} /> Import {importedProposals.length || ""} proposal{importedProposals.length === 1 ? "" : "s"}</button></div>
        </Modal>
      )}

      {modal === "rules" && (
        <Modal title="Research exclusions" eyebrow="Agent retrieval context" onClose={() => setModal(null)}>
          <div className="rules-editor">
            <div className="rules-callout"><ShieldSlash size={24} /><p>These constraints are returned with project context whenever an agent queries RunTrace.</p></div>
            <label htmlFor="research-rules">One exclusion per line</label>
            <textarea id="research-rules" value={ruleDraft} onChange={(event) => setRuleDraft(event.target.value)} placeholder={"Do not use SVD\nDo not try Newton–Schulz"} />
            <p className="form-note">Use plain research constraints, not worker-control instructions.</p>
          </div>
          <div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" onClick={async () => { const nextRules = ruleDraft.split("\n").map((rule) => rule.trim()).filter(Boolean); await saveRules(nextRules); setModal(null); notify(`${nextRules.length} research exclusions saved`); }}><Check size={18} /> Save exclusions</button></div>
        </Modal>
      )}

      {modal === "baseline" && (
        <Modal title={`${baseline.id} · ${baseline.name}`} eyebrow="Current baseline · main" onClose={() => setModal(null)} wide>
          <div className="detail-grid">
            <div><span className="field-label">Research decision</span><StatusDot value="Kept" /></div>
            <div><span className="field-label">Validation loss</span><strong className="large-value">{baseline.loss}</strong></div>
            <div><span className="field-label">Runtime vs prior</span><strong className="large-value">{baseline.runtime}</strong></div>
          </div>
          <div className="detail-copy"><h3>Why this became the baseline</h3><p>The scheduled cap preserved nearly all of the quality gain from full power iteration while reducing the runtime penalty from +78% to +14%.</p></div>
          <div className="code-line"><Code size={19} /><code>main @ 6d3a9f1 · cap_schedule=cosine · max_power_steps=4</code></div>
        </Modal>
      )}

      {modal === "live" && (
        <Modal title={`${visibleRun.id} · ${visibleRun.name}`} eyebrow="Live experiment · worker-03" onClose={() => setModal(null)} wide>
          <div className="live-progress-head"><StatusDot value="Running" /><span>Step {visibleStep}{visibleRun.totalSteps ? ` of ${visibleRun.totalSteps}` : ""}</span><strong>{visibleLoss} {progressMetric}</strong></div>
          {visibleRun.totalSteps && <div className="progress-track"><span style={{ width: `${Math.min(100, visibleStep / visibleRun.totalSteps * 100)}%` }} /></div>}
          <div className="metric-visual" aria-label="Validation loss curve">
            <div className="metric-visual-head"><span><ChartLineUp size={18} /> {progressMetric}</span><div><i className="legend-current" />Current <i className="legend-baseline" />Baseline</div></div>
            <MetricCurve points={metricPoints} baselineValue={baseline.loss} metricName={progressMetric} />
          </div>
          <div className="detail-copy"><h3>Hypothesis</h3><p>{visibleRun.hypothesis}</p></div>
          <div className="event-list">{visibleRun.events.length ? visibleRun.events.slice(-4).reverse().map((event) => <span key={event.id}><Pulse size={18} /> {event.message}</span>) : <span><ClockCounterClockwise size={18} /> Waiting for run events</span>}</div>
        </Modal>
      )}

      {selected && (
        <Modal title={`${selected.id} · ${selected.name}`} eyebrow={selected.history ? "Completed experiment" : `${selected.status} experiment`} onClose={() => setSelected(null)} wide>
          {selected.history ? (
            <>
              <div className="detail-grid"><div><span className="field-label">Decision</span><StatusDot value={selected.decision} /></div><div><span className="field-label">Result</span><strong>{selected.result}</strong></div><div><span className="field-label">Finished</span><time>{selected.finished}</time></div></div>
              <div className="detail-copy"><h3>Conclusion</h3><p>{selected.decision === "Kept" ? "This experiment improved the project baseline and its change was retained on main." : selected.decision === "Crashed" ? "The process exited before producing a research conclusion. Logs and environment metadata were preserved." : "The evidence did not justify replacing the current baseline. The result remains searchable for future agents."}</p></div>
            </>
          ) : (
            <>
              <div className="detail-grid"><div><span className="field-label">Lifecycle</span><StatusDot value={selected.status} /></div><div><span className="field-label">Result display</span><strong className="metric-mode-label"><MetricModeIcon mode={selected.metricMode} />{metricModeLabels[selected.metricMode]}</strong></div><div><span className="field-label">Dependency</span><strong>{selected.dependency || "None"}</strong></div></div>
              <div className="detail-copy"><h3>Reasoning and implementation</h3><p>{selected.details}</p></div>
              <div className="code-line"><Code size={19} /><code>{selected.config}</code><IconButton label="Copy configuration" onClick={() => copyText(selected.config, notify)}><Copy size={18} /></IconButton></div>
              <p className="form-note">Available through the project API and MCP tools. Any participating worker may claim it atomically.</p>
            </>
          )}
          <div className="modal-actions"><button className="button danger" onClick={() => { archiveExperiment(selected); setSelected(null); }}><Archive size={18} /> Archive experiment</button></div>
        </Modal>
      )}

      {deleteCandidate && (
        <Modal title={`Delete ${deleteCandidate.id}?`} eyebrow="Permanent project action" onClose={() => setDeleteCandidate(null)}>
          <div className="delete-confirm"><Trash size={28} /><p>This removes the experiment from {projectName}, search, and agent retrieval. Archive it instead if you may need the research record later.</p></div>
          <div className="modal-actions"><button className="button secondary" onClick={() => setDeleteCandidate(null)}>Cancel</button><button className="button danger" onClick={() => { deleteExperiment(deleteCandidate); setDeleteCandidate(null); }}><Trash size={18} /> Delete permanently</button></div>
        </Modal>
      )}
    </>
  );
}

function SearchView({ projectSlug, notify }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api(`/projects/${projectSlug}/search?q=${encodeURIComponent(query)}&limit=20`)
        .then((payload) => setResults(payload.results))
        .catch((error) => notify(error.message));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [notify, projectSlug, query]);
  return (
    <div className="utility-view">
      <h1>Search experiment memory</h1>
      <div className="search-box"><MagnifyingGlass size={22} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try “spectral runtime” or “row cache”" /></div>
      <p className="result-count">{results.length} records across proposals and completed runs</p>
      <div className="search-results">
        {results.map((item) => <article key={`${item.kind}-${item.id}`}><span className="record-id">{item.display_id}</span><h2>{item.title}</h2><p>{item.conclusion || item.reasoning || item.hypothesis || item.result_summary}</p><StatusDot value={item.lifecycle === "crashed" ? "Crashed" : titleCase(item.disposition === "undecided" ? item.lifecycle : item.disposition)} /></article>)}
      </div>
    </div>
  );
}

function ArchiveView({ archived, restoreExperiment }) {
  return (
    <div className="utility-view archive-view">
      <div className="archive-heading"><div><h1>Archived experiments</h1><p className="utility-lede">Hidden from the default dashboard and excluded from agent retrieval.</p></div><Archive size={30} /></div>
      {archived.length === 0 ? (
        <div className="archive-empty"><Archive size={34} /><h2>No archived experiments</h2><p>Archive a proposal or completed run when you want agents to stop considering that branch of research.</p></div>
      ) : (
        <div className="archive-list">
          {archived.map((item) => (
            <article key={item.id} className="archive-row">
              <MetricModeIcon mode={item.metricMode || (item.id === "RUN-170" ? "timings" : "curve")} />
              <div><span className="record-id">{item.id}</span><h2>{item.name}</h2><p>{item.hypothesis || item.result}</p></div>
              <button className="button secondary" onClick={() => restoreExperiment(item)}><ArrowCounterClockwise size={18} /> Restore</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsView({ project, rules, programMd, progressMetric, progressDirection, availableMetrics, workerCount, saveProjectContext, notify }) {
  const [goalDraft, setGoalDraft] = useState(project.description || "");
  const [programDraft, setProgramDraft] = useState(programMd);
  const [rulesDraft, setRulesDraft] = useState(rules.join("\n"));
  const [metricDraft, setMetricDraft] = useState(progressMetric);
  const [directionDraft, setDirectionDraft] = useState(progressDirection);
  const bootstrapCall = `runtrace.get_project_context({ project: "${project.slug}" })`;
  useEffect(() => {
    setGoalDraft(project.description || "");
    setProgramDraft(programMd);
    setRulesDraft(rules.join("\n"));
    setMetricDraft(progressMetric);
    setDirectionDraft(progressDirection);
  }, [programMd, progressDirection, progressMetric, project.description, project.slug, rules]);
  const persistProjectContext = async () => {
    const nextRules = rulesDraft.split("\n").map((rule) => rule.trim()).filter(Boolean);
    try {
      await saveProjectContext(goalDraft, programDraft, nextRules, metricDraft.trim(), directionDraft);
      notify("Project autoresearch context saved");
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <div className="utility-view settings-view">
      <h1>Settings</h1>
      <p className="utility-lede">Define the project context returned when an autoresearch agent connects.</p>
      <section className="settings-section project-goal-setting"><div><h2>Project goal / description</h2><p>Keep the objective visible on the dashboard for everyone working in this project.</p></div><textarea value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} aria-label="Project goal or description" placeholder="What is this project trying to improve?" /></section>
      <section className="program-section">
        <header><div><span className="record-id">PROGRAM.MD</span><h2>Autoresearch program</h2><p>The durable objective, evaluation contract, and boundaries for this project.</p></div><FileText size={28} /></header>
        <textarea value={programDraft} onChange={(event) => setProgramDraft(event.target.value)} aria-label="program.md contents" spellCheck="false" />
      </section>
      <section className="settings-section"><div><h2>Autoresearch progress metric</h2><p>Use the exact metric name emitted in Python or reported by an autoresearch agent.</p></div><div className="metric-settings-control"><label><span>Metric name</span><input list="available-progress-metrics" value={metricDraft} onChange={(event) => setMetricDraft(event.target.value)} placeholder="val_loss" spellCheck="false" required /><datalist id="available-progress-metrics">{availableMetrics.map((metric) => <option key={metric} value={metric} />)}</datalist></label><label><span>Optimization direction</span><select value={directionDraft} onChange={(event) => setDirectionDraft(event.target.value)}><option value="lower_is_better">Lower is better</option><option value="higher_is_better">Higher is better</option></select></label></div></section>
      <section className="settings-section settings-rules"><div><h2>Research exclusions</h2><p>One project-specific constraint per line. Returned with every agent query.</p></div><textarea value={rulesDraft} onChange={(event) => setRulesDraft(event.target.value)} aria-label="Project research exclusions" /></section>
      <section className="bootstrap-section"><div><span className="record-id">AGENT BOOTSTRAP</span><h2>Retrieve project context</h2><p>This tool call returns program.md, the current baseline, exclusions, and claimable proposals in one payload.</p></div><div className="bootstrap-call"><code>{bootstrapCall}</code><IconButton label="Copy tool call" onClick={() => copyText(bootstrapCall, notify)}><Copy size={18} /></IconButton></div></section>
      <section className="settings-section"><div><h2>Registry endpoint</h2><p>Read and write project experiments through the API or MCP server.</p></div><div className="endpoint"><code>{window.location.origin}{API_ROOT}/projects/{project.slug}</code><IconButton label="Copy registry endpoint" onClick={() => copyText(`${window.location.origin}${API_ROOT}/projects/${project.slug}`, notify)}><Copy size={18} /></IconButton></div></section>
      <section className="settings-section"><div><h2>Connected workers</h2><p>Workers appear after querying or claiming an experiment. They are not controlled from this page.</p></div><strong className="connected-count">{workerCount} observed</strong></section>
      <div className="settings-save"><button className="button primary" onClick={persistProjectContext}><FloppyDisk size={18} /> Save project context</button></div>
    </div>
  );
}

const projectRecords = [
  { name: "Dense Optimizer", slug: "dense-optimizer", description: "Optimizer quality and runtime research", active: 5, updated: "2m ago" },
  { name: "Flash Attention Kernel", slug: "flash-attention-kernel", description: "CUDA kernel timing and memory experiments", active: 2, updated: "34m ago" },
  { name: "Sparse Router", slug: "sparse-router", description: "Routing quality and capacity-factor studies", active: 0, updated: "Jul 11" },
];

export function ProjectListView({ onSelect, onCreate, onDocs, projectRecords }) {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", description: "", repository_url: "" });
  const projects = projectRecords.filter((project) => `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await onCreate({ ...form, repository_url: form.repository_url || null });
      setShowCreate(false);
      setForm({ name: "", slug: "", description: "", repository_url: "" });
    } catch {
      // The app-level notifier presents the API error while keeping the form open.
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="utility-view project-list-view">
      <div className="project-list-brand"><StackSimple size={25} weight="fill" /><strong>RunTrace</strong></div>
      <div className="project-list-heading"><div><h1>Projects</h1><p>Choose an autoresearch workspace.</p></div><div className="project-list-actions"><button className="button secondary" onClick={onDocs}><BookOpenText size={19} /> Docs</button><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={19} /> New project</button></div></div>
      <div className="search-box"><MagnifyingGlass size={21} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" /></div>
      <div className="project-list" aria-label="Projects">
        {projects.map((project) => (
          <button key={project.slug} onClick={() => onSelect(project)}>
            <span className="project-list-icon"><FolderSimple size={22} /></span>
            <span className="project-list-copy"><strong>{project.name}</strong><small>{project.description}</small></span>
            <span className="project-list-meta"><strong>{project.active ?? project.active_runs ?? 0}</strong><small>active</small></span>
            <time>{project.updated || new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(project.updated_at))}</time>
            <ArrowSquareOut size={18} />
          </button>
        ))}
        {projects.length === 0 && <div className="project-list-empty">No projects match “{query}”.</div>}
      </div>
      {showCreate && <Modal title="Create project" eyebrow="Autoresearch workspace" onClose={() => setShowCreate(false)}>
        <form className="proposal-form" onSubmit={submit}>
          <label>Project name<input autoFocus required value={form.name} onChange={(event) => { const name = event.target.value; setForm((current) => ({ ...current, name, slug: current.slug === slugifyProjectName(current.name) ? slugifyProjectName(name) : current.slug })); }} placeholder="e.g. Compiler Optimizer" /></label>
          <label>Project slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm({ ...form, slug: slugifyProjectName(event.target.value) })} placeholder="compiler-optimizer" /></label>
          <label>Project goal / description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What is this project trying to improve?" /></label>
          <label>Repository URL <span className="optional-label">optional</span><input type="url" value={form.repository_url} onChange={(event) => setForm({ ...form, repository_url: event.target.value })} placeholder="https://github.com/org/repo" /></label>
          <p className="form-note">RunTrace creates a versioned program.md and exclusions list for the project. You can configure its metric contract next.</p>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="button primary" type="submit" disabled={creating || !form.name || !form.slug}>{creating ? "Creating…" : "Create project"}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

function DocsView({ onBack }) {
  const [section, setSection] = useState("start");
  const docs = {
    start: { title: "Getting started", content: "1. Create or select a project.\n2. Set its goal, progress metric, and program in Settings.\n3. Add proposals or let agents claim experiments.\n4. Track results and keep reusable conclusions." },
    api: { title: "Agent retrieval API", content: `GET ${API_ROOT}/projects/{project}/context\n\nPOST ${API_ROOT}/projects/{project}/experiments/claim\n\nPOST ${API_ROOT}/projects/{project}/runs` },
    metrics: { title: "Metrics", content: `Append metrics with:\nPOST ${API_ROOT}/runs/{run_id}/metrics\n\nEach project chooses an exact metric name and optimization direction in Settings. The dashboard plots strict best-so-far values from completed runs.` },
  };
  return (
    <div className="utility-view project-list-view docs-view">
      <div className="project-list-brand"><StackSimple size={25} weight="fill" /><strong>RunTrace</strong></div>
      <div className="global-docs-heading"><div><h1>Docs</h1><p className="utility-lede">Reference material for RunTrace projects, agents, and experiment tracking.</p></div><button className="button secondary" onClick={onBack}><ArrowLeft size={18} /> Back to projects</button></div>
      <nav className="docs-index" aria-label="Project documentation">
        <button className={section === "start" ? "active" : ""} onClick={() => setSection("start")}><FileText size={21} /><span><strong>Getting started</strong><small>Create a project and define its research contract</small></span><ArrowSquareOut size={17} /></button>
        <button className={section === "api" ? "active" : ""} onClick={() => setSection("api")}><BookOpenText size={21} /><span><strong>Agent retrieval API</strong><small>Project context, claims, and result-writing schema</small></span><ArrowSquareOut size={17} /></button>
        <button className={section === "metrics" ? "active" : ""} onClick={() => setSection("metrics")}><ChartLineUp size={21} /><span><strong>Metrics</strong><small>Progress and baseline comparison semantics</small></span><ArrowSquareOut size={17} /></button>
      </nav>
      <section className="docs-content"><div><BookOpenText size={26} /><h2>{docs[section].title}</h2></div><pre>{docs[section].content}</pre></section>
    </div>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [selectedProject, setSelectedProject] = useState(projectRecords[0]);
  const [projects, setProjects] = useState(projectRecords);
  const [proposals, setProposals] = useState(initialProposals);
  const [archived, setArchived] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [history, setHistory] = useState(historySeed);
  const [activeRun, setActiveRun] = useState(runningExperiment);
  const [counts, setCounts] = useState({ kept: 7, discarded: 5, crashed: 1 });
  const [workerCount, setWorkerCount] = useState(6);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [rules, setRules] = useState(["Do not use SVD", "Do not try Newton–Schulz"]);
  const [programMd, setProgramMd] = useState(initialProgramMd);
  const [progressMetric, setProgressMetric] = useState("validation_loss");
  const [progressDirection, setProgressDirection] = useState("lower_is_better");
  const [availableMetrics, setAvailableMetrics] = useState(["validation_loss", "step_time"]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const hydrateProject = useCallback(async (project) => {
    const payload = await api(`/projects/${project.slug}/dashboard`);
    setSelectedProject({ ...project, ...payload.project });
    setProposals(payload.experiments.filter((item) => ["proposed", "pending"].includes(item.lifecycle)).map(mapExperiment));
    setArchived(payload.archived.map((item) => item.display_id.startsWith("EXP-") ? mapExperiment(item) : mapRun(item)));
    setHistory(payload.history.map(mapRun));
    setActiveRun(payload.active_runs[0] ? mapRun(payload.active_runs[0]) : null);
    setCounts(payload.counts || {});
    setWorkerCount(payload.worker_count || 0);
    setRules(payload.exclusions || []);
    setProgramMd(payload.program?.content || "");
    setProgressMetric(payload.project.progress_metric_key || "validation_loss");
    setProgressDirection(payload.project.progress_metric_direction || "lower_is_better");
    setAvailableMetrics(payload.available_metrics || []);
    if (payload.baseline) {
      const mapped = mapRun(payload.baseline);
      const [resultValue = "—"] = mapped.result.split(" · ");
      setBaseline({
        id: mapped.id,
        backendId: mapped.backendId,
        name: mapped.name,
        loss: payload.baseline.metrics?.validation_loss?.latest ?? resultValue,
        runtime: mapped.result.match(/runtime\s+(.+)$/)?.[1] || "—",
        finished: mapped.finished,
      });
    } else {
      setBaseline({ id: "—", name: "No baseline selected", loss: "—", runtime: "—", finished: "—" });
    }
    setDeletedIds([]);
  }, []);

  useEffect(() => {
    api("/projects")
      .then((items) => {
        setProjects(items);
        const preferred = items.find((item) => item.slug === selectedProject.slug) || items[0];
        if (preferred) return hydrateProject(preferred);
      })
      .catch(() => notify("API unavailable — showing the local prototype data"));
  }, [hydrateProject, notify]);

  useEffect(() => {
    if (!activeRun?.backendId) return undefined;
    const source = new EventSource(`${API_ROOT}/runs/${activeRun.backendId}/stream`);
    source.addEventListener("metric", (event) => {
      const point = JSON.parse(event.data);
      setActiveRun((current) => current ? { ...current, latestMetric: point } : current);
    });
    source.addEventListener("status", (event) => {
      const status = JSON.parse(event.data);
      if (status.lifecycle !== "running") {
        source.close();
        hydrateProject(selectedProject).catch((error) => notify(error.message));
      }
    });
    return () => source.close();
  }, [activeRun?.backendId, hydrateProject, notify, selectedProject]);

  const createProposal = async (form) => {
    const source = form.source === "Human proposal" ? "human" : form.source === "experiments.md" ? "experiments.md" : "agent";
    const created = await api(`/projects/${selectedProject.slug}/experiments`, {
      method: "POST",
      body: JSON.stringify({
        title: form.name || "Untitled experiment",
        hypothesis: form.hypothesis || "Hypothesis pending",
        reasoning: form.hypothesis || "",
        configuration: form.config ? { raw: form.config } : {},
        source,
        source_model: source === "agent" ? form.source : null,
        metric_mode: form.metricMode,
      }),
    });
    return mapExperiment(created);
  };

  const archiveExperiment = async (item) => {
    try {
      const path = item.id.startsWith("RUN-") ? `/runs/${item.backendId || item.id}/archive` : `/projects/${selectedProject.slug}/experiments/${item.backendId || item.id}/archive`;
      await api(path, { method: "POST", body: "{}" });
      setArchived((entries) => entries.some((entry) => entry.id === item.id) ? entries : [...entries, item]);
      setProposals((entries) => entries.filter((entry) => entry.id !== item.id));
      setHistory((entries) => entries.filter((entry) => entry.id !== item.id));
      if (activeRun?.id === item.id) setActiveRun(null);
      notify(`${item.id} archived and excluded from agent retrieval`);
    } catch (error) {
      notify(error.message);
    }
  };

  const restoreExperiment = async (item) => {
    try {
      const path = item.id.startsWith("RUN-") ? `/runs/${item.backendId || item.id}/restore` : `/projects/${selectedProject.slug}/experiments/${item.backendId || item.id}/restore`;
      await api(path, { method: "POST", body: "{}" });
      await hydrateProject(selectedProject);
      notify(`${item.id} restored to the active registry`);
    } catch (error) {
      notify(error.message);
    }
  };

  const deleteExperiment = async (item) => {
    try {
      const path = item.id.startsWith("RUN-") ? `/runs/${item.backendId || item.id}` : `/projects/${selectedProject.slug}/experiments/${item.backendId || item.id}`;
      await api(path, { method: "DELETE" });
      setDeletedIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id]);
      setArchived((entries) => entries.filter((entry) => entry.id !== item.id));
      setProposals((entries) => entries.filter((entry) => entry.id !== item.id));
      setHistory((entries) => entries.filter((entry) => entry.id !== item.id));
      notify(`${item.id} deleted from this project`);
    } catch (error) {
      notify(error.message);
    }
  };

  const setExperimentBaseline = async (item) => {
    try {
      await api(`/projects/${selectedProject.slug}/baseline`, { method: "POST", body: JSON.stringify({ run_id: item.backendId || item.id }) });
      const [loss = "—"] = (item.result || "").split(" · ");
      const runtime = item.result?.match(/runtime\s+(.+)$/)?.[1] || "—";
      setBaseline({ id: item.id, backendId: item.backendId, name: item.name, loss, runtime, finished: item.finished || "Today" });
      notify(`${item.id} is now the main baseline`);
    } catch (error) {
      notify(error.message);
    }
  };

  const saveRules = async (nextRules) => {
    await api(`/projects/${selectedProject.slug}/exclusions`, { method: "PUT", body: JSON.stringify({ rules: nextRules }) });
    setRules(nextRules);
  };

  const saveProjectContext = async (goal, program, nextRules, metricName, direction) => {
    if (!metricName) throw new Error("Enter the exact metric name used by your runs");
    const [updatedProject] = await Promise.all([
      api(`/projects/${selectedProject.slug}`, { method: "PATCH", body: JSON.stringify({ description: goal }) }),
      api(`/projects/${selectedProject.slug}/program`, { method: "PUT", body: JSON.stringify({ content: program }) }),
      api(`/projects/${selectedProject.slug}/exclusions`, { method: "PUT", body: JSON.stringify({ rules: nextRules }) }),
      api(`/projects/${selectedProject.slug}/settings`, { method: "PUT", body: JSON.stringify({ metric_name: metricName, direction }) }),
    ]);
    setSelectedProject((current) => ({ ...current, ...updatedProject }));
    setProjects((items) => items.map((item) => item.slug === updatedProject.slug ? { ...item, ...updatedProject } : item));
    setProgramMd(program);
    setRules(nextRules);
    setProgressMetric(metricName);
    setProgressDirection(direction);
    setAvailableMetrics((items) => items.includes(metricName) ? items : [...items, metricName].sort());
  };

  const selectProject = async (project) => {
    setActiveNav("dashboard");
    try {
      await hydrateProject(project);
    } catch (error) {
      notify(error.message);
    }
  };

  const createProject = async (form) => {
    try {
      const created = await api("/projects", { method: "POST", body: JSON.stringify(form) });
      setProjects((items) => [...items.filter((item) => item.slug !== created.slug), created].sort((a, b) => a.name.localeCompare(b.name)));
      await hydrateProject(created);
      setActiveNav("settings");
      notify(`${created.name} created — define its research program and progress metric`);
      return created;
    } catch (error) {
      notify(error.message);
      throw error;
    }
  };

  const globalView = activeNav === "project-list" || activeNav === "global-docs";

  return (
    <div className={`app-shell ${globalView ? "project-list-mode" : ""}`}>
      {!globalView && <AppSidebar activeNav={activeNav} setActiveNav={setActiveNav} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} projectName={selectedProject.name} />}
      <main className="main-content">
        {!globalView && <button className="mobile-menu" onClick={() => setMobileOpen(true)}><SidebarSimple size={22} /> <StackSimple size={22} weight="fill" /> RunTrace</button>}
        {activeNav === "dashboard" && <Dashboard projectName={selectedProject.name} projectDescription={selectedProject.description} projectSlug={selectedProject.slug} progressMetric={progressMetric} progressDirection={progressDirection} proposals={proposals} setProposals={setProposals} archived={archived} deletedIds={deletedIds} history={history} activeRun={activeRun} counts={counts} workerCount={workerCount} createProposal={createProposal} archiveExperiment={archiveExperiment} deleteExperiment={deleteExperiment} baseline={baseline} setExperimentBaseline={setExperimentBaseline} rules={rules} saveRules={saveRules} notify={notify} />}
        {activeNav === "search" && <SearchView projectSlug={selectedProject.slug} notify={notify} />}
        {activeNav === "archive" && <ArchiveView archived={archived} restoreExperiment={restoreExperiment} />}
        {activeNav === "settings" && <SettingsView project={selectedProject} rules={rules} programMd={programMd} progressMetric={progressMetric} progressDirection={progressDirection} availableMetrics={availableMetrics} workerCount={workerCount} saveProjectContext={saveProjectContext} notify={notify} />}
        {activeNav === "project-list" && <ProjectListView onSelect={selectProject} onCreate={createProject} onDocs={() => setActiveNav("global-docs")} projectRecords={projects} />}
        {activeNav === "global-docs" && <DocsView onBack={() => setActiveNav("project-list")} />}
      </main>
      {toast && <div className="toast" role="status"><Check size={18} weight="bold" />{toast}</div>}
    </div>
  );
}
