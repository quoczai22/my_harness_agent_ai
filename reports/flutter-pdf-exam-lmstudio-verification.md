# Flutter PDF exam kit (LM Studio) — implementation verification (2026-10-30)

Kit: `artifacts/Continuity-Flutter-Exam-LMStudio`. Change: `openspec/changes/flutter-pdf-exam-lmstudio`.
Nothing was committed or pushed. The Web-Test1 kit, the VS Code extension and user projects were not modified. LM Studio was started for testing and returned to its previous state (server stopped, model unloaded).

## Authorization and open questions

The user asked to "do everything automatically until complete" right after the spec was written. No formal continuity spec-review checkpoint was recorded (continuity MCP tools were unavailable in this session). Open questions 1–4 in `proposal.md` are still unanswered; the implementation follows the stated assumptions (UI screens, forms, local state, JSON models; no Firebase; Flutter SDK optional; null-safe projects).

## What was built

- `lib/LmStudio.ps1`: loopback-only client (`Uri.IsLoopback`, no user info/query/other paths). HttpWebRequest with explicit UTF-8, because PowerShell 5.1 decodes charset-less JSON as Latin-1. `reasoning_effort: "none"` is required: without it Qwen3.5-2B spends the whole token budget in `reasoning_content` and returns empty `content`. Of four variants tried, it was the only one that worked. Model state and vision come from `/api/v0/models` (`type: vlm`, `state`). `lms server start` / `lms load` are used when the server is down; nothing is downloaded.
- PDF intake: `pdfinfo`/`pdftotext` (≤ 10 MB, ≤ 20 pages, form-feed page split). Pages with fewer than 40 non-space characters are treated as scans, rendered with `pdftoppm`, and transcribed by the vision model using a dedicated OCR system prompt. The result is always shown for YES/EDIT/NO confirmation.
- Flutter intake: pubspec reader, file discovery that skips build/platform/generated files, secret redaction, project summary.
- Deterministic generators: JSON→Dart models (`fromJson`/`toJson`, int/double merge, nullability across samples, nested objects, lists, Dart keyword renaming) and `main.dart` with named routes. Prompt rules (routes, validator requirement, existing models, allowed packages) come from the same functions `/check` uses.
- `/check` (11 static items plus analyze/run status) and `/analyze` (temp copy, `--no-pub`, only when the SDK exists and `pub get` has been run before).

## Evidence

- Offline self-test: **120/120** (`Flutter-Exam.ps1 -SelfTest`). Includes a stub loopback HTTP server, a stub Flutter SDK, three PDFs (text, scan, mixed), and correct, broken and empty Flutter fixtures.
- Live runs (`-SelfTest -Live`, LM Studio 0.4.x, `qwen3.5-2b` Q4_K_M + vision, 8192 context), final report in `tests/results/live-20261030-013524.md`, drafts in `tests/results/drafts-*/`:
  - Greeting `chao`: Vietnamese in every run, short after the system-prompt fix (5/5 extra checks without code).
  - Scanned exam page: word recall **0.987 and 1.0**, about 1 s per page.
  - Text PDF exam 01, 2 runs (model + 3 screens + `main.dart`): **0 failed static checks** in both.
  - Scanned exam 02, 2 runs (model + 2 screens + `main.dart`): 1 failed check each, a hallucinated import (`package:cupertino_icons.dart`, `../routes/login_route.dart`), correctly reported.
  - Generation time: 2–7 s per file on this PC.
- Bugs found by live runs and fixed:
  1. The vision model *solved* the exam instead of transcribing it (recall 0.65–0.70, output was Dart code). Fixed with a separate OCR system prompt, detection of solved output, one strict retry, and otherwise "page not read". Model code is never stored as exam text.
  2. Route names differed between model-written navigation and generated `main.dart`. Fixed with a shared route table in the prompt.
  3. The model used `TextField` despite validation requirements (4/4 runs). Fixed with explicit rules in the prompt; afterwards validator checks passed in all runs.
  4. `/check` crashed on truncated output and on malformed import URIs. Both are now handled and tested.

## Limitations for the reviewer

- **Static checks are not compilation.** No Flutter/Dart SDK exists on this PC and none was downloaded. A manual read of a generated `add_product_screen.dart` that passed every static check found at least three compile errors: comparing `double?` from `tryParse` with `<= 0`, using `context` in a `StatelessWidget` helper method, and no button calling the save method. Generated screens must go through `/analyze` on a machine with the SDK, or `flutter analyze` in the IDE.
- JSON→Dart models and `main.dart` are deterministic and reviewed by hand, but also not compiler-verified.
- Scan transcription was measured on one clean synthetic page (Arial 30 px at 150 dpi). Real phone photos, skew, low resolution and handwriting are untested.
- The 8 GB RAM target, school hardware and a clean offline PC are untested. LM Studio itself must be installed from the LM Studio kit.
- `tools/pdf` is Poppler (GPL), copied from the LM Studio kit, which has no license file for it. A license notice should be added before redistribution.
