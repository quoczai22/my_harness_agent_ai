# Flutter PDF exam kit (LM Studio) — implementation verification (2026-10-30)

Kit: `artifacts/Continuity-Flutter-Exam-LMStudio`. Change: `openspec/changes/flutter-pdf-exam-lmstudio`.
The Web-Test1 kit, the VS Code extension and user projects were not modified. LM Studio was started for testing and returned to its previous state (server stopped, model unloaded).

## Authorization and open questions

- The user asked to "do everything automatically until complete" right after the spec was written.
- User answers for open questions 1–4: exam content unknown; authoritative notes exist but have not been supplied yet; SDK on the exam PC unknown, so "prepare for it"; project shape unknown. The implementation keeps the generic assumptions until the notes arrive.
- The user approved downloading the Flutter SDK ("Cho phép tải"). That led to the bundled-SDK amendment in `design.md`.
- Continuity (2026-10-30): the user approved `lm-studio-portable-offline` ("duyệt"); afterwards the Flutter change was registered, its spec review was recorded as approved from the user's earlier instructions, and the implementation review `cp_1793301381073_3vdrj` was approved by the user ("Duyệt"); the change is closed.
- The user has no authoritative Flutter notes and adapts to each exam; the confirmed exam text is the source of truth.

## What was built

- `lib/LmStudio.ps1`: loopback-only client (`Uri.IsLoopback`). HttpWebRequest with explicit UTF-8, because PowerShell 5.1 decodes charset-less JSON as Latin-1. `reasoning_effort: "none"` is required: otherwise Qwen3.5-2B spends the whole token budget in `reasoning_content` and returns an empty `content`. Model state and vision come from `/api/v0/models`. `lms server start` / `lms load` are used when needed.
- PDF intake: `pdfinfo`/`pdftotext` (≤ 10 MB, ≤ 20 pages). Scanned pages are rendered with `pdftoppm` and transcribed by the vision model with a dedicated OCR prompt. Output that solves the exam instead of copying it is rejected. Everything is shown for YES/EDIT/NO confirmation.
- Flutter intake, JSON→Dart model generator and `main.dart` generator (reads real constructors). Prompt rules are shared with `/check`.
- Bundled Flutter 3.47.8 stable SDK (Dart 3.13.7, archive SHA-256 `11e19ea3…eb6e` matched the official `releases_windows.json`): 3.25 GB in `sdk/flutter`, plus a 113 MB offline pub cache (71 package versions).
  - Analysis calls `dart.exe` directly with process-local `FLUTTER_ROOT`/`PUB_CACHE`: `pub get --offline`, then `analyze --format=machine`, on a temporary copy.
  - It works **without git** (`flutter.bat` requires git) and without network.
- `/file` compile-repair loop. Each proposed `.dart` file is analyzed first. Then come IDE-style quick fixes from exact analyzer positions:
  - drop imports of missing files;
  - add `!` for nullable receivers and for `T?` passed where `T` is expected;
  - remove an invalid `const`.

  After that, up to two model rewrites get the failing lines and hints. Remaining errors are printed with the proposal, and the user still decides on `SAVE`.

## Evidence

- Offline self-test: **121/121** (`Flutter-Exam.ps1 -SelfTest`, about 30 s). It includes:
  - a stub loopback HTTP server and a stub SDK;
  - real compilation with the bundled SDK and git removed from PATH:
    - the correct fixture project compiles;
    - a pre-null-safety project is reported "not analyzable" rather than passing;
    - generated JSON models (nested, nullable, Dart keywords, mixed int/double lists) and `main.dart` (non-const and argument-requiring screens) compile;
    - a file with five real compile errors is fixed by quick fixes alone;
    - real analyzer errors drive the model repair loop.
- Live runs, final report `tests/results/live-20261030-020341.md`, drafts in `tests/results/drafts-*/`:
  - Greeting `chao`: Vietnamese and short in every run.
  - Scanned exam page: word recall **1.0** in both runs, about 1 s per page.
  - **Compilation after the repair loop: 9/10 AI-written files and 3/4 whole projects compile with no errors.**
    - Before the repair loop, in the same setup: 0/4 projects.
    - With model-only repair: 1/10 files, 0/4 projects. The 2B model returned the file unchanged.
  - Remaining failure: one `NoteListScreen` refers to a `notes` field that does not exist (4 errors). Neither the quick fixes nor two model rounds fixed it, and the kit reports the errors to the user.
  - One run's login screen still used `TextField` without a validator despite the rule. `/check` flagged it.
  - Time: 6–19 s per AI-written file including compile checks; whole-project analysis about 6 s.
- Bugs found by live runs and fixed: the OCR prompt solved the exam instead of copying it; route names differed from the generated `main.dart`; `TextField` was used instead of `Form`; `/check` crashed on truncated output or malformed imports; `main.dart` used `const` for non-const screens.

## Limitations for the reviewer

- "Compiles" is not "correct". The kit does not run the app. Behaviour (navigation, validation messages, data flow) must be checked with `flutter run` or in the IDE.
- Offline analysis only works for packages in the kit's pub cache (listed in `manifest.json`); other packages are reported "not analyzable". Pre-null-safety projects cannot be analyzed with Dart 3.
- Scan transcription was measured on one clean synthetic page. Phone photos, skew, low resolution and handwriting are untested.
- Not yet trialled: 8 GB RAM target, school hardware, a clean offline PC. The kit plus SDK is about 3.5 GB, and LM Studio with its model is installed separately from the LM Studio kit.
- Licenses: Poppler 26.09.0 (GPL) has `NOTICE.txt` and the GPLv2 text; texts for its dependency DLLs are not included. The Flutter SDK ships its own `LICENSE` files.
