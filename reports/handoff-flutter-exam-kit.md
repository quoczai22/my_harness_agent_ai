# Handoff: Flutter PDF exam kit (state on 2026-10-30)

For the next agent working in this repository. Read `AGENTS.md` first; it defines the openspec + continuity workflow this project follows.

## 1. What the user wants

- The course is now **Flutter application programming**. ASP.NET (the Web-Test1 kit) and the older Lite/portable kits are dropped. Do **not** propose or start work on them unless the user asks; it was rejected as scope creep.
- At the exam the user gets the assignment as a **PDF** (text or scanned) and must produce Flutter code **offline**. They have **no authoritative notes**: they adapt to each exam, so the confirmed exam text is the only source of truth.
- Unknowns the kit must tolerate: exam content, project shape, and whether the exam PC has a Flutter SDK (so one is bundled).
- The user writes Vietnamese; the kit answers in Vietnamese. Ask before commit, push, downloads, and anything that changes continuity state on the user's behalf.

## 2. Current state

- Branch `codex/offline-assistant-release`, not pushed. Relevant commits: `ed78544` (Flutter kit), `28e0644` (bundled SDK + compile-repair loop), `090d57b`/`f1ddf6f` (review records), `e2edab8` (`.gitignore` for payloads), then the earlier approved work committed in `cc7d6b7`…`ee1b1ec`. Another agent added `2d9c261`/`28ebe86` (LM Studio portability closure, AVX2 check).
- Continuity (`.continuity/state.json`, not in git): stage **IDLE**, no active change, no pending checkpoint.
  - `flutter-pdf-exam-lmstudio`: spec and implementation **approved**; work order in `tasks/archive/`.
  - `lm-studio-portable-offline` and `lm-studio-portable-closure`: approved.
  - All other open changes (Web-Test1, Lite kits, portable kits, home console): **deferred**. Their work orders remain in `tasks/active/` because they were never accepted.
- Uncommitted: only `tasks/active/TASK-WEB-TEST1-OFFLINE-KIT-3GB.md` (deferral note) and this file.
- Continuity accepts **one active change at a time**. A second agent has worked in this same checkout concurrently. Check `get_status` and `git status` before acting, and never commit another agent's files.

## 3. The Flutter kit (`artifacts/Continuity-Flutter-Exam-LMStudio`)

| Path | Role |
|---|---|
| `Start-Flutter-Exam.cmd` → `Flutter-Exam.ps1` | REPL: `/new /open /sessions /pdf /exam /screens /files /summary /ask /file /drafts /check /analyze /status` |
| `lib/LmStudio.ps1` | Loopback-only LM Studio client (`127.0.0.1:1234`, model `qwen3.5-2b`, `config.json`) |
| `lib/FlutterExam.ps1` | Sessions, PDF intake, project intake, generators, checklist, analysis, repair loop |
| `tests/Test-FlutterExam.ps1` | `-SelfTest` (offline, 121 checks) and `-Live` (LM Studio) |
| `sdk/flutter`, `sdk/pub-cache` | Bundled Flutter 3.47.8 + offline packages (**not in git**, 3.4 GB) |
| `tools/pdf` | Poppler 26.09.0 exe/dll (**not in git**; `NOTICE.txt` + GPLv2 text are tracked) |

Flow:
1. `/pdf` reads the exam. Text pages use `pdftotext`. Scanned pages (fewer than 40 characters of text) are rendered with `pdftoppm` and transcribed by the vision model using a dedicated OCR system prompt. Output that solves the exam instead of copying it is rejected. The user confirms with YES/EDIT/NO before anything is stored.
2. `/screens` takes the class names the user confirms.
3. `/file <lib/...dart>` generates one file. Shown before `SAVE`; drafts go to `drafts/<session>/` and the project is never written.
   - No AI: `lib/models/*.dart` from JSON samples in the exam, and `lib/main.dart` with routes that follow the real screen constructors.
   - AI for other files, then a compile check with the bundled SDK on a temp copy:
     1. IDE-style quick fixes from `dart analyze --format=machine` positions;
     2. up to two model rewrites with the failing lines and hints;
     3. remaining errors are printed with the proposal.
   - Prompt rules (routes, validator requirement, existing models, allowed packages) come from the same functions `/check` uses.
4. `/check` runs static exam-driven checks. `/analyze` analyzes the whole project plus drafts.

## 4. Measured results (see `reports/flutter-pdf-exam-lmstudio-verification.md`)

- Offline self-test 121/121, including real compilation with git removed from PATH.
- Live runs (two exam PDFs × 2):
  - scanned page word recall 1.0;
  - after the repair loop, **9/10 AI-written files and 3/4 projects compile**;
  - before the repair loop: 0/4 projects; with model-only repair: no change, because the 2B model returned the file unchanged.
- Known weaknesses:
  - the model sometimes uses `TextField` without `Form`/`validator` (flagged by `/check`);
  - occasional invented fields (for example `notes`) that two repair rounds do not fix;
  - compiling is not correct behaviour: the kit never runs the app.
- Untested: school PC, 8 GB RAM, clean offline PC, phone photos of exam pages.

## 5. Restaging what is not in git

- Flutter SDK:
  - Source: `https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.47.8-stable.zip`, SHA-256 `11e19ea3409808fe3b3765ea8149640c299e58cce6eda7c9f38fc1b4a193eb6e` (from `releases_windows.json`).
  - Extract with `C:\Windows\System32\tar.exe -xf <zip> -C sdk` (Git Bash `tar` fails on `C:` paths).
- Pub cache:
  1. Set `FLUTTER_ROOT=sdk\flutter` and `PUB_CACHE=sdk\pub-cache`.
  2. Run `sdk\flutter\bin\cache\dart-sdk\bin\dart.exe --suppress-analytics pub get` in a temp project that depends on cupertino_icons, http, provider, shared_preferences, sqflite, path, intl and flutter_lints.
  3. Repeat with `cupertino_icons: ^1.0.2` and `flutter_lints` `^3`, `^4` and `^5`. Older `flutter create` projects pin those, and `pub get --offline` fails without them.
  4. `manifest.json` lists the cached packages.
- `tools/pdf`: copy from `artifacts/Harness-LMStudio-Offline-Kit/tools/pdf`.
- LM Studio and the model are installed from the LM Studio kit (`OFFLINE-SETUP.md`). Downloads need the user's explicit permission.

## 6. Pitfalls already paid for

- **Windows PowerShell 5.1:**
  - Save `.ps1` files with a UTF-8 BOM, or Vietnamese strings are read as ANSI.
  - `"$var?"` is a variable named `var?`; write `"${var}?"`.
  - PowerShell treats `‘` (U+2018) as a quote.
  - Assigning `if` output unwraps one-element arrays, and `PSCustomObject.Count` is `$null`; wrap in `@(...)`.
  - With `ErrorActionPreference=Stop`, any native stderr line throws; use `Invoke-NativeQuiet`.
  - `Invoke-RestMethod` decodes charset-less JSON as Latin-1; use `HttpWebRequest` with UTF-8.
- **Editor tooling in this environment:** it rewrites `\uXXXX` escapes into raw characters and can collapse `\\` in heredocs. Build such regexes from `[char]` codes, or write them via Python with `chr(92)`.
- **LM Studio + Qwen3.5-2B:** send `reasoning_effort: "none"`, otherwise `content` is empty (everything goes to `reasoning_content`). Vision is reported by `/api/v0/models` (`type: vlm`). Start with `lms server start`, `lms load qwen3.5-2b -y -c 8192`, and stop it afterwards.
- **Flutter offline:**
  - `flutter.bat` refuses to run without git. Call `dart.exe` directly with process-local `FLUTTER_ROOT` and `PUB_CACHE`.
  - The first run builds a snapshot (about 30 s); later analyses take about 6 s.
- **Continuity MCP:** the tools are not exposed to agents here. The scratchpad script used was a small Node client over stdio to `dist/index.js` (`@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`). Keep the stage rules in `src/store.ts` in mind.
- **Do not sweep `%TEMP%`.** Bulk deletes there are blocked as shared state. Clean only directories you created, by exact path.

## 7. How to verify before changing anything

```
powershell -NoProfile -ExecutionPolicy Bypass -File artifacts\Continuity-Flutter-Exam-LMStudio\Flutter-Exam.ps1 -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File artifacts\Continuity-Flutter-Exam-LMStudio\Flutter-Exam.ps1 -SelfTest -Live
npm test
cd extensions\continuity-vscode && npm test
```

Expected: 121/121 offline; the live run writes `tests/results/live-*.md`. The root suite last passed 51/51 and the extension 56/56 before the other agent's closure commits, which reported 58/58. Re-run them rather than trusting these numbers.

## 8. Sensible next steps (Flutter only, each as a new openspec change with spec review first)

1. Reduce the two observed model failures:
   - a deterministic `Form`/`TextFormField`/`validator` scaffold when the exam asks for validation;
   - a quick fix or hint for undefined members that lists the State's real fields.
2. A target-machine trial script: clean offline PC, 8 GB RAM, phone-photo PDFs. Measure OCR accuracy and RAM, and record the results.
3. Optional: a `/run`-free behaviour smoke check, for example widget tests generated for the confirmed screens and run with `flutter test` on the temp copy. This needs a spec decision, because it extends what the kit executes.
