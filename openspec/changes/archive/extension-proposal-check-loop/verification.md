# Verification: proposal check loop (2026-11-04)

The user approved revised spec checkpoint `cp_1793807503122_vd1zt`. Its implementation notes called for Trust/Cancel tasks, 64 KiB output truncation without treating that threshold as a command failure, and explicit copy-limit errors. All five continuity scope checks returned `IN_SCOPE` before code changes.

## Implemented

- Version and lockfile updated to 0.3.3. The extension declares limited untrusted-workspace support and restricts `continuity.assistant.checkCommand`. The project-scoped command defaults to empty; timeout defaults to 120 seconds and accepts 1–300.
- Checks run only in trusted workspaces after the exact command string is confirmed. Approved SHA-256 hashes are stored in `workspaceState` under a key derived from the canonical workspace path; a changed command asks again.
- A proposed one-file edit is applied to a uniquely owned temporary project copy. Copy limits are 2,000 files, 2 MiB per file and 50 MiB total; `.git`, `node_modules`, `build`, `dist`, symlinks and sensitive/derived folders are skipped. A limit breach identifies the limit. Cleanup runs on every path and reports the directory path if it fails.
- The command is tokenized into executable and arguments, with `{files}` expansion, and run by `execFile` with `shell: false`. Displayed/forwarded output is truncated at 64 KiB (an additional 16 MiB internal hard buffer ceiling prevents runaway output). The model receives at most 4,000 diagnostic characters per repair. At most two model repairs are attempted, and each revised proposal must target the same file and match its original text exactly once.
- A cancellable VS Code progress notification wraps checking. Timeout or cancellation requests full-tree termination via `taskkill /T /F /PID` on Windows, waits for completion, and cleans the copy. Composer displays passed, unresolved error, not configured, Trust/approval block, or cancelled; it never auto-applies a proposal.

## Checks

- Final `npm test` in `extensions/continuity-vscode`: **86/86 passed**. Tests use a fake local check script and cover immediate pass, one-repair pass, failure after two repairs, >64 KiB output truncation, timeout, mid-check cancellation, source unchanged, cleanup, copy-limit error, untrusted workspace and unapproved command. Added tests confirm Windows `.cmd`/ENOENT guidance prevents model repair and nested `sessions`/`.vscode` remain in the temporary copy while root-level ones are omitted. Manifest and UI wiring are also checked.
- Final `npm run package`: succeeded; VSIX 0.3.3 has 205 files and is 1.56 MB.
- `code --install-extension continuity-workflow.vsix --force`: succeeded. `code --list-extensions --show-versions` reports `quoczai22.continuity-vscode@0.3.3`.
- `git diff --check`: passed.

## Not verified / limits

- Interactive approval, progress/Cancel and Composer display in an actual VS Code window were not exercised after installing 0.3.3; open windows may need **Developer: Reload Window**.
- The reviewer reported independent live checks before this revision: a passing `node --check`, one successful repair, a 2-second timeout that killed a grandchild process, cancellation after about 1 second, removed temporary directories, and unchanged source. I did not rerun those live scenarios after this revision. The automated timeout/cancel tests inject a process-tree terminator.
- A user-approved arbitrary executable runs with the user's OS permissions. The extension sets its working directory to the copy and does not itself write the real project, but this is not an OS sandbox: a command or project script that deliberately writes an absolute path could still affect real files. Trust and exact-command confirmation are the explicit guardrails.

No download, commit or push was performed.

## Revision after rejected implementation review

- On Windows, `.cmd`/`.bat` commands are rejected before `execFile`; ENOENT/EINVAL spawn failures, including synchronous spawn errors, show: `Trên Windows không chạy được .cmd/.bat khi không có shell; hãy dùng file .exe (ví dụ dart.exe analyze, dotnet build, node path/to/tsc.js)`. These execution failures do not enter model repair. The setting description gives the same guidance; tests cover `.cmd`, ENOENT and EINVAL classification.
- `sessions` and `.vscode` are omitted only at the project root. Their nested occurrences are copied within the existing size and sensitivity limits.
- `proposalCheck.ts` now returns a typed `kind` (`checker` or `execution`) for failed checks. Composer uses that field, so no error-classification regex is duplicated in `sidebarViews.ts`.
