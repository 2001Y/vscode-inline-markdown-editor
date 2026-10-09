# Cloud verification, 2026-10-09

Status: **release candidate only; not published or GUI-qualified**.

## Source and version

- Baseline: `7fa8c5b4790c91ab3d19f40e7e24fe4c19d145d6`, PR #16 (`codex/inlinemark-reset-recovery`).
- Marketplace `2001y.inlinemark` was checked directly on 2026-10-09: latest version `0.1.2`.
- GitHub Releases API lists `v0.1.0` as the only release.
- Candidate manifest and lockfile are advanced together to `0.1.3`; the already published `0.1.2` must not be overwritten.
- Candidate changes beyond the baseline are version metadata and four regression tests, with no production behavior changes.

## Passed in cloud

Environment: Debian 13 x86_64, Node.js 24.19.0, npm 11.9.0.

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build` (also repeated by packaging)
- `npm run test:unit`: **79 passed, 0 failed**, including three mocked-host Reset confirmation/cancel/dismiss cases and a real SyncClient repeated-Reset/fresh-Unicode-edit test.
- `npm run package`: 28-file VSIX, 2,443,315 bytes.
- Archive checks: publisher/version correct; required extension entrypoint present; packaged README equals source; no source maps, test files or verification logs bundled.

The host confirmation tests mock the VS Code dialog API. The Unicode test checks UTF-16 edit transport, **not physical Japanese IME composition**.

## Blocked and not passed

- `npm test`: typecheck and unit tests passed, but downloaded VS Code 1.141.0 exited with SIGTRAP because no X server / DISPLAY was available. This is a failed host-check command, not a passing smoke test.
- System Xvfb installation was unavailable without root. The installed Xorg dummy driver could not open its local sockets. No sandbox or security settings were disabled.
- An ordinary sandbox-preserving headless Chromium launch also failed to create its socket (`EPERM`).
- Real VS Code Reset cancel/confirm, rapid clicks, physical IME composition, reopening, and exact-VSIX installation remain unverified in this environment.
- Minimum VS Code 1.105.0 compatibility was not run.
- No repository CI workflow exists for this branch. Empty status results must not be described as CI success.

## Publication

No GitHub release or Marketplace update was made. GitHub connector repository push permission is available, but the connector exposes no release creation/asset upload operation. The local GitHub CLI is unauthenticated. Marketplace publication credentials are not configured. No credentials were searched for or generated.

Candidate VSIX SHA-256:

`84dd3690583e5211cef85ba2f2e8df7f2c4aa523beafd4f7a27119bf50f5607a`

Before release, finish real VS Code UI/installation verification and use an authenticated publication route. A VSIX build alone does not satisfy the release checklist.
