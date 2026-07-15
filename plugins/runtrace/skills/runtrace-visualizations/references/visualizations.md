# RunTrace visualizations

Choose one scope before authoring RTVis.

## Project dashboard

Use for project-level or cross-run widgets. Call `get_visualization_guide`, inspect built-ins and saved widgets, and avoid duplicating an existing progress, baseline, queue, history, curve, or metric view. Use inline data for supplied portable rows and RunTrace queries for live project data. Preview non-trivial specs, then save with `generate_visualization`.

## Experiment result display

Use for a reusable view inside run details. Call `get_result_visualization_guide` and reuse a built-in or registered type when possible. If none fits, create a type with `create_result_visualization_type`; its key becomes the experiment or run `metric_mode`.

Result types must use a `runtrace` dataset with query `run_metrics`. Available fields are `name`, `value`, `step`, `timestamp`, and metric context fields. Useful filters include `latest_per_name`, `sort_by`, `order`, and `limit`. Design for repeated use across runs; never embed one run's values as inline rows.

For either scope, prefer trusted layout, card, metric, table, badge, and chart nodes. Use isolated, network-disabled JavaScript only when trusted nodes cannot express the interaction. Preserve the versioned wrapper during export and import.
