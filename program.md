# autoresearch

This is an experiment to have the LLM do its own research on
Manifold-Based-Muon.

The project trains a small GPT on cached FineWeb10B shards and compares
optimizer variants, especially Dense and Muon. The main research goal is to
improve the final validation loss without making the optimizer unnecessarily
complex.

Autoresearch commands run from the repository root. Configs under
`Data/configs` are execution inputs and local files under `Data/logs` are only
temporary spool files while a process is running. RunTrace is the durable
source of truth for experiment proposals, claims, resolved configuration,
parameters, live metrics and events, complete logs, generated artifacts,
outcomes, and conclusions. Do not treat the local log directory as the
experiment archive.

## RunTrace identity and connection

The RunTrace project must already exist. Use the project slug supplied by the
human or present in the active RunTrace context; never invent a slug. Use a
stable worker ID derived from the agreed run tag, for example
`autoresearch/may28-dense`.

Before doing research:

1. Call `get_project_context` for the project. This retrieves the current
   `program.md`, exclusions, baseline, metric definitions, claimable proposals,
   active work, and recent evidence.
2. Call `search_experiments` for the optimizer or mechanism being considered.
   Search again whenever a new idea may overlap prior work.
3. Treat RunTrace exclusions as hard constraints in addition to the constraints
   in this file.
4. If RunTrace is unavailable, report the connection failure clearly. Do not
   start an untracked experiment or claim that anything was recorded.
5. Never write API tokens, credentials, private data, or secrets into a
   hypothesis, configuration, event, artifact, result, or conclusion.

## RunTrace interfaces and ownership

Use the RunTrace MCP tools for project context, evidence search, shared queue
proposals and claims, and lightweight metric/event writes. Use the RunTrace
Python SDK or HTTP API for the complete run lifecycle when configuration,
parameters, log files, or other artifacts must be stored. The interface is an
implementation detail: all records belong to the same RunTrace project and run.

Create exactly one RunTrace run for each execution attempt. Do not create one
run through MCP and a second run through the SDK for the same process. Prefer a
Python SDK `Run` as the execution tracker because it captures Git/environment
metadata and supports:

- `log_config` for queryable parameters plus a versioned JSON config artifact;
- `log_params` for resolved or derived parameters not present in the config;
- `log_metric`/`log_metrics` for primary and diagnostic time series;
- `log_event` for checkpoints, decisions, warnings, cancellations, and errors;
- `log_text` for previewable stdout/stderr and reports;
- `log_artifact` for arbitrary generated files;
- `finish` for completed runs and `abort` for actual process crashes.

If an execution was created through `create_run`, attach all later writes and
uploads to the returned run ID through the RunTrace API. Never substitute a
made-up ID or silently fall back to an unrelated local record.

## Setup

To set up a new autoresearch session, work with the human to:

1. **Agree on a run tag**: propose a tag based on today's date and the goal
   (for example, `may28-dense`). The branch `autoresearch/<tag>` must not already
   exist unless the human explicitly wants to resume that session.
2. **Check shared state**: retrieve the RunTrace project context. If the shared
   queue contains relevant work, atomically claim it with `claim_experiment`
   using the stable worker ID before editing. Do not work on an experiment
   claimed by another worker. If a claimed experiment will not be run, return
   it with `release_experiment`.
3. **Create the branch**: create `autoresearch/<tag>` from the current baseline
   after checking `git status`. Do not discard or overwrite unrelated local
   changes.
4. **Read the in-scope files**: the repository is small. Read these files for
   full context:
   - `README.md` - repository context and run commands.
   - `cached_fineweb10B.py` - data preparation. Do not modify unless data
     loading is broken.
   - `train_gpt_simple.py` - model architecture, optimizer implementations,
     training loop, config/env plumbing, and diagnostics.
   - `Data/configs/default.yaml` - current Dense baseline config.
   - `Data/configs/muon.yaml` and `Data/configs/adamw.yaml` - comparison
     baselines.
5. **Verify data exists**: check that `fineweb10B/` contains
   `fineweb_train_*.bin` and `fineweb_val_*.bin`. If not, tell the human to run
   `uv run python cached_fineweb10B.py 20`.
6. **Review existing evidence**: summarize the current RunTrace baseline, best
   relevant completed runs, failed approaches, active claims, and exclusions.
   Cite actual RunTrace run or experiment IDs. Never invent IDs or results.
7. **Confirm and go**: confirm that the branch, data, RunTrace connection, and
   experiment scope are ready.

Once setup is confirmed, start the experiment loop.

## Experimentation

Experiments run with `torchrun`, using 1, 2, 4, or 8 GPUs. The script asserts
that the world size divides 8. Launch the current Dense baseline as:

```bash
uv run torchrun --standalone --nproc_per_node=$(nvidia-smi -L | wc -l) train_gpt_simple.py
```

Run comparison configs as:

```bash
TRAIN_CONFIG=Data/configs/muon.yaml uv run torchrun --standalone --nproc_per_node=$(nvidia-smi -L | wc -l) train_gpt_simple.py
```

**What you CAN do:**

- Modify `Data/configs/*.yaml` for existing hyperparameters and optimizer
  choices.
- Modify `train_gpt_simple.py` for real algorithmic changes, new config knobs,
  diagnostics, optimizer parameter grouping, model architecture changes, or bug
  fixes.
- Add new experiment configs under `Data/configs/` when that makes comparisons
  clearer.

**What you CANNOT do:**

- Modify the data preparation or validation target to make results look better.
- Install new packages or add dependencies unless the human explicitly
  approves.
- Commit logs, cached data, or other generated experiment artifacts during the
  active loop.
- Commit `Data/logs/` or cached datasets. Upload experiment logs and generated
  outputs to their RunTrace run instead. Config files under `Data/configs/` are
  runnable source and may be committed with the experiment, but every run must
  also store its exact resolved config in RunTrace.
- Reset or overwrite human changes unrelated to the current experiment.
- Delete, archive, retag, or otherwise rewrite unrelated RunTrace records.

**Configs vs direct code edits**: use both, but for different purposes. Configs
are the first-class interface for hyperparameter research: optimizer choice,
learning rates, cooldowns, microbatch sizes, Dense landing strength, momentum,
weight decay, normalization, clipping, and scalar/boolean settings. Directly
edit `train_gpt_simple.py` when the idea cannot be expressed through existing
config keys: new Dense update rules, new diagnostics, changed parameter
grouping, new optimizer components, model changes, or simplifications. If a
code edit adds tunable behavior, expose it through config unless it is truly
temporary.

**The goal is simple: get the lowest final `validation_loss`.** Training time
matters because this code descends from speedrun-style GPT training, but
optimizer quality is the main target unless the human or RunTrace project metric
definition says otherwise. The code must run without crashing and should not
blow up memory or runtime for a tiny gain.

**VRAM** is a soft constraint. Some increase is acceptable for meaningful
validation-loss gains, but it should not increase dramatically.

**Simplicity criterion**: all else being equal, simpler is better. A small
improvement that adds ugly complexity is not worth it. Conversely, removing
something and getting equal or better results is a simplification win. Weigh
complexity cost against improvement magnitude, and record that tradeoff in the
RunTrace conclusion.

## The first run

The first run of a new project must establish the unmodified Dense baseline. If
`get_project_context` already returns a valid baseline for the same code,
configuration, dataset, and evaluation protocol, do not duplicate it merely to
create a local row. Cite and use that RunTrace run as the baseline. Re-run the
baseline when comparability is uncertain or the code, data, environment, or
protocol has materially changed.

For a new baseline:

1. Commit the runnable baseline state if needed.
2. Start one tracked RunTrace run before launching training, preferably with
   the Python SDK. Record the exact hypothesis, why the baseline is needed, the
   Git commit and branch, config path, GPU/world size, train steps, and relevant
   environment details.
3. Save the returned run ID. All metrics and events for the process must use
   that actual ID.
4. Parse the active YAML and call `log_config` so RunTrace stores its resolved
   values as queryable parameters and a versioned config artifact. Also store
   derived values such as world size, effective batch size, dataset shard set,
   and command through `log_params` when they are not already represented.
5. Run:

```bash
uv run torchrun --standalone --nproc_per_node=$(nvidia-smi -L | wc -l) train_gpt_simple.py > Data/logs/run.log 2>&1
```

6. Log validation checkpoints to RunTrace as they appear.
7. Before finishing the run, upload the complete stdout/stderr spool as a
   previewable `training.log` artifact with kind `log`, plus any generated
   diagnostic files. On successful completion, log the final
   `validation_loss` and `train_time_s`, then finish with disposition `kept`, a
   concise result summary, and a reusable conclusion identifying it as the
   baseline.

If the project has no current baseline pointer after the run, report the new
baseline run ID so the human can select it as the project baseline in RunTrace.
Do not invent a baseline-setting tool.

## Output and metric logging

The script prints validation progress lines like:

```text
step:3350/3350 val_loss:3.28123 train_time:612.400s step_avg:182.81ms
```

The final line for `step:<train_steps>/<train_steps>` is the primary result.
Use stable RunTrace metric names:

- `validation_loss` for every validation checkpoint, with the training step;
- `train_time_s` for elapsed training time at each reported checkpoint, with
  the training step;
- `step_avg_ms` for average step time when present, with the training step;
- any new diagnostic under one stable, descriptive name used consistently
  across comparable runs.

Extract the last local result when needed with:

```bash
grep "val_loss:" Data/logs/run.log | tail -n 1
```

The local log is only a spool used to monitor the active process. Before every
run is finished or aborted, store its complete contents in RunTrace as a
previewable text artifact named `training.log` with kind `log`. If the file is
too large for the configured RunTrace artifact limit, upload a compressed full
log as an artifact and a previewable text tail containing the final metrics and
error context. Do not delete the only complete copy until RunTrace confirms the
upload.

Every run must also store:

- `config.json` via `log_config`, containing the fully resolved configuration
  actually used rather than merely a config path;
- the original YAML as a `config` artifact when preserving comments, anchors,
  or exact source formatting matters;
- queryable parameters for derived execution values such as Git commit, branch,
  command, world size, GPU type/count, effective batch size, train steps, and
  dataset identity;
- any plots, profiler output, diagnostic dumps, or reports needed to interpret
  the result, with a descriptive artifact name and kind.

Git still stores runnable source history. RunTrace stores the self-contained
record of what each process actually used and produced.

Dense currently emits only the shared validation timing/loss line. If you add
Dense diagnostics, use them to understand stability and coverage, but do not
optimize them instead of final validation loss.

## Watching runs and early cancellation

Do not blindly wait for every run to finish. While a run is active, periodically
check the log and process state. The run should keep printing training steps and
validation checkpoints. Log meaningful validation checkpoints to RunTrace as
they arrive.

If there is no new output for several expected step intervals, GPU utilization
drops to near zero while the process remains alive, or the same step appears
stuck for too long, terminate the whole `torchrun` process group. Record an
error event with `log_event`, including the last observed step and the stall or
failure reason.

Use judgment for early cancellation. The baseline and any run testing a new
mechanism should usually reach at least a few validation checkpoints because
early behavior can be noisy. After that, cancel a run if it is clearly
hopeless: validation loss is worse than the current best by a meaningful
margin; loss has flattened with deltas around `0.001` over multiple checkpoints
while still behind the best; or diagnostics show instability or non-finite
behavior is imminent. Do not cancel merely because one checkpoint is noisy.

Every created run must reach a terminal state:

- for an early cancellation or failed idea, log the latest available metrics
  and an explanatory event, then call `finish_run` with disposition
  `discarded`;
- for a process crash, upload the complete log first, record the exit status and
  concise stack-trace summary, then use the SDK `abort` operation or RunTrace
  crash API so the lifecycle is recorded as `crashed`. Use a discarded finish
  only if the active interface truly cannot record a crash, and state clearly
  that the process crashed;
- never leave a started run marked as running because the idea failed.

## RunTrace records

For every experiment, preserve in RunTrace:

- the actual Git commit and branch;
- config path, the fully resolved config artifact, and queryable material and
  derived parameter values;
- hypothesis and reasoning;
- prior evidence used, with real run IDs and the lesson taken from each;
- what decision that evidence changed;
- primary and diagnostic metrics at meaningful steps;
- cancellation, instability, crash, and debugging events;
- the complete stdout/stderr log and all result-bearing generated artifacts;
- disposition: `kept`, `discarded`, or `undecided` only when genuinely
  inconclusive;
- a concise result summary and a conclusion reusable by the next researcher.

Failures are evidence. Never hide, delete, or omit an unsuccessful run. Do not
use `0.00000` as a fake loss for crashes; record no primary metric when no valid
measurement exists and explain the failure in the event and conclusion.

Before choosing the next idea, call `get_project_context` again and search for
related evidence. Compare against the current RunTrace baseline and best
comparable completed run, not against memory or a local table.

## The experiment loop

The session runs on a dedicated branch such as
`autoresearch/may28-dense` or `autoresearch/may28-dense-gpu0`.

LOOP FOREVER:

1. Inspect Git state and retrieve fresh RunTrace project context.
2. Search RunTrace for prior attempts related to the next mechanism or
   hyperparameter.
3. If a relevant experiment is in the shared queue, claim it atomically before
   editing. Otherwise choose one clear idea. Optionally add it to the shared
   queue with `propose_experiment` and claim it when coordination benefits from
   an explicit proposal.
4. State one falsifiable hypothesis and the evidence behind it. Prefer a
   config-only change if the idea fits existing keys.
5. Edit `train_gpt_simple.py` only for algorithmic changes or new config knobs.
6. Commit the runnable experiment. Do not commit local logs or cached data.
7. Start exactly one RunTrace run before execution, preferably through the
   Python SDK. Link the claimed experiment ID when applicable. Include evidence
   used, the decision it changed, and the hypothesis and reasoning.
8. Parse and store the fully resolved active configuration with `log_config`.
   Store Git metadata, config path, command, hardware/world size, dataset
   identity, effective batch size, and other derived execution values as
   queryable parameters. Confirm these writes succeeded before training.
9. Run the experiment and redirect output to the temporary spool
   `Data/logs/run.log`:

   ```bash
   uv run torchrun --standalone --nproc_per_node=$(nvidia-smi -L | wc -l) train_gpt_simple.py > Data/logs/run.log 2>&1
   ```

10. Watch the process and log validation checkpoints and meaningful events to
   the active RunTrace run.
   Cancel only under the early-cancellation rules above.
11. Read the final result:

    ```bash
    grep "val_loss:" Data/logs/run.log | tail -n 1
    ```

12. If the output is empty, inspect the last 80 lines of the log, record the
    error in RunTrace, and attempt a fix. Reuse the same run only while repairing
    the same execution attempt before meaningful training begins; otherwise
    finish it and create a new run for the corrected attempt. If the idea is
    fundamentally broken after a few attempts, record that conclusion and move
    on.
13. Upload the complete spool as a previewable `training.log` RunTrace artifact.
    Upload all result-bearing diagnostic files, plots, traces, and reports with
    descriptive artifact kinds. Confirm the uploads before terminalizing the
    run.
14. Log final metrics and finish or abort the RunTrace run. Use `kept` only when
    a completed result improves the objective enough to justify its complexity
    and resource cost; otherwise use `discarded`. Use the crash/abort lifecycle
    for a crashed process. Use `undecided` only when the evidence is genuinely
    insufficient.
15. If validation loss improved and the tradeoff is acceptable, keep the
    experiment commit as the new branch state. If it did not, revert only the
    changes introduced by that experiment. Never revert unrelated human work.
16. Retrieve fresh context and search again before selecting the next idea so
    the next decision incorporates the result just recorded.

The branch advances through kept experiments. RunTrace preserves both kept and
discarded evidence so future agents do not repeat failed work.

**Timeout**: runs are not hard-coded to the original five-minute autoresearch
budget; they run for `training.train_steps` from the active config. If a run
clearly exceeds expected time by a large margin or hangs, terminate it, record
the evidence, finish the RunTrace run, and treat it as a failure.

**Crashes**: if a run crashes because of OOM, a typo, an invalid config, a
non-finite optimizer state, or another error, record the failure in RunTrace. If
it is simple to fix, fix it and re-run as described above. If the idea itself is
broken, preserve the conclusion and move on.

**NEVER STOP**: once the experiment loop has begun after initial setup, do not
pause to ask the human whether to continue. Do not ask whether this is a good
stopping point. Continue until manually stopped. If ideas run low, retrieve and
search RunTrace again, compare the strongest and weakest completed runs,
simplify successful mechanisms, test nearby values around the best config, add
Dense diagnostics, or propose a small config-exposed algorithmic variant.
