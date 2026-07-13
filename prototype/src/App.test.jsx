import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardHeading, ExperimentMenu, LiveClock, ProjectListView, SettingsView, api, parseExperimentsMarkdown, slugifyProjectName } from "./App";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("project creation", () => {
  it("derives a valid slug and submits the complete project", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ slug: "compiler-optimizer" });
    const onDocs = vi.fn();
    render(<ProjectListView onSelect={vi.fn()} onCreate={onCreate} onDocs={onDocs} projectRecords={[]} />);

    await user.click(screen.getByRole("button", { name: /new project/i }));
    await user.type(screen.getByLabelText(/project name/i), "Compiler Optimizer");
    expect(screen.getByLabelText(/project slug/i)).toHaveValue("compiler-optimizer");
    await user.type(screen.getByLabelText(/description/i), "Reduce compile time safely");
    await user.type(screen.getByLabelText(/repository url/i), "https://github.com/example/compiler");
    await user.click(screen.getByRole("button", { name: /^create project$/i }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Compiler Optimizer",
      slug: "compiler-optimizer",
      description: "Reduce compile time safely",
      repository_url: "https://github.com/example/compiler",
    });

    await user.click(screen.getByRole("button", { name: "Docs" }));
    expect(onDocs).toHaveBeenCalledOnce();
  });
});

describe("project goal", () => {
  it("keeps the saved goal visible under the plain Dashboard title", () => {
    render(<DashboardHeading description="Reduce benchmark runtime without losing accuracy." />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Reduce benchmark runtime without losing accuracy.")).toBeInTheDocument();
  });

  it("saves an edited goal with the rest of the project context", async () => {
    const user = userEvent.setup();
    const saveProjectContext = vi.fn().mockResolvedValue(undefined);
    render(<SettingsView project={{ name: "Compiler Optimizer", slug: "compiler-optimizer", description: "Old goal" }} rules={[]} programMd={"# Compiler Optimizer\n"} progressMetric="validation_loss" progressDirection="lower_is_better" availableMetrics={["validation_loss"]} workerCount={0} saveProjectContext={saveProjectContext} notify={vi.fn()} />);

    const goal = screen.getByRole("textbox", { name: "Project goal or description" });
    await user.clear(goal);
    await user.type(goal, "New goal");
    await user.click(screen.getByRole("button", { name: /save project context/i }));

    await waitFor(() => expect(saveProjectContext).toHaveBeenCalledWith("New goal", "# Compiler Optimizer\n", [], "validation_loss", "lower_is_better"));
  });
});

describe("MVP data helpers", () => {
  it("parses every experiments.md heading into a persisted proposal payload", () => {
    const parsed = parseExperimentsMarkdown("# Ideas\n\n## Cache rows\nReuse normalized rows.\n\ncache=true\n\n## Sweep tiles\nTry two tile sizes.");
    expect(parsed).toEqual([
      expect.objectContaining({ name: "Cache rows", hypothesis: "Reuse normalized rows.", source: "experiments.md", config: "cache=true" }),
      expect.objectContaining({ name: "Sweep tiles", hypothesis: "Try two tile sizes.", source: "experiments.md" }),
    ]);
  });

  it("normalizes project slugs", () => {
    expect(slugifyProjectName("  GPU / Kernel #2  ")).toBe("gpu-kernel-2");
  });

  it("surfaces API error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: "Project slug already exists" }) }));
    await expect(api("/projects", { method: "POST", body: "{}" })).rejects.toThrow("Project slug already exists");
  });
});

describe("experiment actions", () => {
  it("keeps every menu action reachable outside a scrolling table", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<ExperimentMenu item={{ id: "EXP-024" }} onSetBaseline={vi.fn()} onArchive={onArchive} onDelete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "More actions for EXP-024" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledWith({ id: "EXP-024" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("live clock", () => {
  it("renders the current time and advances without a hard-coded timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T17:42:00Z"));
    render(<LiveClock />);
    const clock = screen.getByText(/July 13, 2026/);
    expect(clock).toHaveAttribute("datetime", "2026-07-13T17:42:00.000Z");

    act(() => {
      vi.setSystemTime(new Date("2026-07-13T17:43:00Z"));
      vi.advanceTimersByTime(30_000);
    });
    expect(clock).toHaveAttribute("datetime", "2026-07-13T17:43:30.000Z");
  });
});
