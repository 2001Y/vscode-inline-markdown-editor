# Contributing to inlineMark

## Report a reproducible issue

Include your OS, VS Code version, inlineMark version, and a small synthetic Markdown file. Give exact steps, expected behavior, actual behavior, and whether the source changed unexpectedly. For synchronization issues, say whether another editor or process modified the same file.

Do not upload private documents, credentials, or logs containing document text. Debug mode can log content; inspect and redact logs before sharing them.

## Develop a focused fix

1. Preserve existing local changes and work from a separate branch.
2. Run `npm ci`, then reproduce the issue before editing.
3. Add an appropriate regression test and make the smallest coherent change.
4. Run `npm run lint`, `npm run build`, `npm run test:unit`, `npm test`, and `npm run package`.
5. Explain the root cause, changed behavior, and which checks passed, failed, or could not run in the PR.

The documentation source for the packaged extension is `README/README.md`. Run `npm run copy-readme -w packages/extension` after updating it and include both files. The root README is a short repository entry point.

Pure text-patch/protocol tests live in `test/unit`; they are not a substitute for Markdown-codec or UI testing. New sync, selection, IME, drag, preview, or Markdown serialization changes also need the relevant checks in [the release checklist](docs/release-checklist.md).

Keep dependency-major upgrades and architecture migrations separate from routine fixes. Do not publish a VSIX or change a version as part of an unrelated patch.
