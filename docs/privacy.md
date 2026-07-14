# Plugin privacy

RunTrace is self-hosted software. The RunTrace project maintainers do not operate the instance you connect to and do not receive its projects, experiments, prompts, metrics, artifacts, credentials, or API tokens.

The Codex and Claude Code plugin starts a local MCP process and sends the tool calls you approve to the `RUNTRACE_BASE_URL` configured in the host environment. The instance operator controls that server, its storage, retention, logs, backups, and access policy. Review the operator's policy before sending sensitive data.

The plugin reads `RUNTRACE_API_TOKEN` from the process environment and uses it as an HTTP bearer token. It does not intentionally write that secret to RunTrace records. The first `uvx` launch downloads source and Python dependencies from GitHub and the Python package index; those services receive the network metadata normally associated with a download. Codex, Claude Code, GitHub, and PyPI are governed by their respective privacy policies.

Do not place secrets or private data in experiment hypotheses, events, parameters, artifacts, or conclusions. Report security or privacy issues through the repository's GitHub issue tracker without including sensitive data.
