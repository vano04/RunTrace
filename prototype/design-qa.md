# RunTrace Project Dashboard — Design QA

- Source visual truth: `/Users/personal/Projects/RunTrace/prototype/public/reference/runtrace-project-dashboard.png`
- Browser-rendered implementation: `/Users/personal/Projects/RunTrace/prototype/screenshots/dashboard-exact-1487x1058.png`
- Full-view comparison: `/Users/personal/Projects/RunTrace/prototype/screenshots/design-comparison-exact.png`
- Focused queue comparison: `/Users/personal/Projects/RunTrace/prototype/screenshots/design-comparison-queue-exact.png`
- Focused history comparison: `/Users/personal/Projects/RunTrace/prototype/screenshots/design-comparison-history-exact.png`
- Mobile evidence: `/Users/personal/Projects/RunTrace/prototype/screenshots/dashboard-mobile-v2.png`
- Viewport: 1487 × 1058 for the final source/implementation comparison; 390 × 844 responsive viewport with a full-page capture for the mobile check.
- State: default Dense Optimizer project dashboard with three proposed experiments, one running experiment, and recent research decisions.
- Browser verification: Codex in-app browser against the local Vite application.

## Full-view comparison evidence

The source and implementation were opened individually with `view_image`, then placed together in a same-size, side-by-side comparison. The implementation preserves the source's fixed 236px left rail, white canvas, main-column proportions, baseline strip, status summary, queue-first hierarchy, running-row treatment, recent-history table, and bottom disclosure. Both artifacts were compared at 1487 × 1058 without browser chrome.

## Focused comparison evidence

The queue/header and recent-history regions were separately cropped from the combined comparison because their table copy and icon alignment are too small to judge reliably from the full-frame image alone. The focused evidence confirms matching column order, row count, copy, semantic status color, action placement, divider rhythm, and the selected blue rail on the running experiment.

## Required fidelity surfaces

- Fonts and typography: Inter matches the reference's neutral UI sans; IBM Plex Mono is used for breadcrumbs, IDs, table labels, timestamps, and configuration metadata. Heading scale, weights, line height, and wrapping are consistent with the source.
- Spacing and layout rhythm: Sidebar width, 47px main inset, baseline proportions, queue/header spacing, 69px queue rows, compact history rows, fine separators, and near-zero elevation track the source. No persistent control is clipped at the native viewport.
- Colors and visual tokens: White base, near-black text, muted gray metadata, `#1258e6` accent blue, and distinct amber/blue/green/gray/red status colors match the visual target. There are no gradients or glass effects.
- Image quality and asset fidelity: The target is code-native product UI and contains no raster content assets. Phosphor supplies all visible interface icons; no placeholder, CSS-drawn, handcrafted SVG, emoji, or text-glyph icons are used. The generated concept is retained in the project as the accepted source visual.
- Copy and content: Above-the-fold copy matches the accepted concept: project title, passive shared-registry label, six-worker context, baseline, counts, shared queue explanation, proposed/running states, source/owner fields, and the recent kept/discarded/crashed history. No controller toggle, worker start/stop control, or approval gate was introduced.

## Five-point fidelity ledger

1. Navigation and frame: fixed white sidebar, active blue Projects item, project card, self-hosted metadata, and content frame match the concept.
2. Header and baseline: breadcrumb, title, passive registry context, four-part baseline strip, and view-baseline action match the source order and proportions.
3. Queue anatomy: status, experiment, hypothesis, source/owner, and action columns match; RUN-174 is visibly selected and EXP-021 through EXP-023 remain proposed.
4. Research semantics: lifecycle colors remain separate from Kept/Discarded/Crashed research decisions, matching both the source and product requirement.
5. History and finish: four recent rows, decision colors, timestamps, overflow controls, and completion disclosure match the source composition.
6. Responsive behavior: at 390px, the hierarchy, baseline, counts, primary actions, status/experiment columns, and decision history remain readable without page-level horizontal overflow.

## Interaction verification

- Added a new proposed experiment through the form and confirmed the queue count and EXP-024 row updated.
- Imported one proposal from `experiments.md` and confirmed it appeared in the registry without dispatching work.
- Opened RUN-174 and confirmed live step, metric, hypothesis, and event details.
- Opened EXP-021 and confirmed reasoning, implementation configuration, source, and lifecycle details.
- Searched for `row cache` and confirmed the matching experiment-memory result.
- Checked the browser console after the production-equivalent render; no warnings or errors were present.

## Comparison history

### Iteration 1

- [P2] Desktop mobile-close control leaked into the brand row.
  - Fix: increased selector specificity so the close control is hidden on desktop and only displayed inside the mobile breakpoint.
  - Post-fix evidence: `dashboard-exact-1487x1058.png` shows the clean brand row matching the source.
- [P2] Mobile tables preserved every desktop column, producing cramped and partially clipped rows.
  - Fix: introduced a mobile table contract that keeps lifecycle + experiment identity for the queue and experiment + decision for history; detail remains available through row links.
  - Post-fix evidence: `dashboard-mobile-v2.png` shows readable 390px rows with no page-level horizontal overflow.

### Final pass

No actionable P0, P1, or P2 visual or interaction differences remain.

## Remaining intentional deviation

- [P3] The generated concept's abstract RunTrace mark is represented with the closest matching Phosphor library glyph because no official logo asset exists. Its size, weight, and blue treatment match the source closely.

## Above-the-fold copy diff

Passed. No visible source labels were removed, renamed, or reordered. Interactive detail states add supporting copy only after user action and do not alter the default dashboard.

final result: passed
