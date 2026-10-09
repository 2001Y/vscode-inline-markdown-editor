# Release checklist

Record the exact source commit, environment, command, outcome and artifact hash. An old work log, a built VSIX, or an empty commit-status response is not proof that a release passed verification.

## Baseline and version

- [ ] Reconcile local branches, worktrees, stashes and unpushed commits without discarding them.
- [ ] Read the current Marketplace version for `2001y.inlinemark`; compare the manifest, lockfile and GitHub release history.
- [ ] Choose a strictly newer release version only after that comparison. Historical `0.1.3.vsix` references do not establish publication.
- [ ] Freeze the source commit to test and package. Keep release notes limited to confirmed changes.

## Automated checks

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm test
npm run package
```

`test:unit` compiles selected production TypeScript modules and tests patch reconstruction, ordering, UTF-16 offsets, protocol counters, edit-range validation and a mocked receive-to-host path that must reject out-of-bounds edits before conversion or applyEdit. The ESM cases also exercise selected real Tiptap Markdown parse/serialize paths and sync-client messages. They do **not** exercise a real extension host or prove byte-for-byte fidelity of all dialects.

`typecheck` validates both packages with strict TypeScript settings and is required by `npm test` and `npm run package`. `npm test` additionally runs the extension-host smoke tests. A VS Code download failure or missing display is blocked verification, not a test pass. Record the resolved VS Code version; also verify the minimum supported version before claiming compatibility.

## Markdown round-trip and synchronization

For each fixture, compare the exact source before opening, after opening without edits, after saving, after one local edit, and after undo/redo. Distinguish expected canonicalization from unexpected changes; do not use the diff-engine tests as evidence of lossless serialization.

- [ ] LF / CRLF, with and without final newline, blank lines, trailing spaces.
- [ ] Frontmatter, unknown directives, inline/block HTML, Mermaid, tables and nested lists.
- [ ] Japanese IME, emoji and combining characters; copy/paste and multi-block selections.
- [ ] External file edits, two editor panels, version mismatch, delayed acknowledgement, timeout/retry, reset and reopen.
- [ ] Invalid ranges never reach WorkspaceEdit, including out-of-document offsets; failed requests receive an appropriate response.
- [ ] No stale session/update replaces newer document content or undoes a user decision.

## UI and security

- [ ] Handles, menus, drag/drop, indent/outdent, table selection/resize/copy for every affected block type.
- [ ] With a collapsed caret, drag the grip of paragraph A before C in an A/B/C fixture; verify B/A/C, save/reopen, and one-step undo. Check adjacent-drop no-op, ordinary selected-text dragging, and modifier-copy preserving the source. A grip drag must retain its block payload after native event propagation.
- [ ] Keyboard-only menu navigation, Escape/cancel focus return, repeated clicks and delayed responses.
- [ ] Physically click a code-block language label, press End, type `:a.ts`, then press Enter and save. The label must retain the caret while typing; code text must remain unchanged; reopening must preserve the filename. Repeat with an empty code block, Escape cancellation, and normal code-body editing. Programmatic focus/fill alone does not cover the label-selection regression.
- [ ] Preview toggle, hidden/reopened tabs, theme/width changes and loading recovery.
- [ ] Remote images off by default, dangerous URL handling, workspace image boundaries and HTML sandbox defaults.
- [ ] Long-document input/scroll/external-update measurements. Report fixture size and measured timings instead of unqualified performance claims.

## Distribution and publication

- [ ] Source and packaged README agree; image/license/language links work.
- [ ] Inspect VSIX contents and manifest: required JS/CSS/fonts/assets included; private fixtures, logs and source maps not accidentally bundled.
- [ ] Install the exact VSIX in a clean VS Code profile and test opening, editing, saving and returning to the text editor.
- [ ] Attach a hash and source commit to the release record; explain known limitations.
- [ ] Publish only when the target/version and publication authority are established.
- [ ] Verify Marketplace reflection and installation of the published version, then check the GitHub release link and artifact.

Prepare publicity from the verified release results. Posting to social accounts or contacting communities requires an approved destination and message.
