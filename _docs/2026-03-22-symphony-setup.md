# Symphony setup notes

- Added a repository-root `WORKFLOW.md` so Symphony can load the repo-owned workflow contract described in the official spec and Elixir README.
- The workflow uses `LINEAR_API_KEY` as an environment-backed value, and the Linear project slug is fixed to `vscode-inline-markdown-editor-175c559a0114` after creating a repository-specific Linear project.
- The workspace bootstrap hook clones this repository into each Symphony workspace and runs `npm ci` so the monorepo dependencies are ready before the agent starts work.
- The prompt body tells the agent to read `AGENTS.md`, work primarily in `packages/extension` and `packages/webview`, and validate changes with the root npm scripts.
- Optional upstream Symphony skills were not vendored because the repo now has the workflow contract it needs, and the skills are only required if we later want to mirror the upstream Linear helper flows.

## Follow-up

- If this repository should target a different Linear project later, update `WORKFLOW.md` and replace the hard-coded project slug.
