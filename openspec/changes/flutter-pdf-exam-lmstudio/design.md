# Design

## Layout and runtime

- New folder `artifacts/Continuity-Flutter-Exam-LMStudio/`. It is independent of the Web-Test1 kit so either folder can be copied to a USB stick alone; no shared runtime dependency between kits. Patterns proven in Web-Test1 (sessions, drafts, language guard, BOM handling) are re-implemented in this kit's own `lib/`, not imported across kits.
- Contents: `Start-Flutter-Exam.cmd` (UTF-8 console, `chcp 65001`), `Flutter-Exam.ps1` (REPL), `lib/FlutterExam.ps1` (logic, dot-sourced), `lib/LmStudio.ps1` (HTTP client), `tools/pdf/` (`pdftotext`, `pdftoppm` + DLLs copied from the LM Studio kit), `tests/`, `README.md`, and `manifest.json` with SHA-256 for every shipped file.
- The model and LM Studio runtime are not duplicated. The kit expects LM Studio installed from `Harness-LMStudio-Offline-Kit` (its `OFFLINE-SETUP.md`) with the server on loopback. `Start-Flutter-Exam.cmd` checks `GET /v1/models`; if the server is down it tries the local `lms server start` CLI when present, otherwise it prints the exact offline setup steps. It never downloads anything.
- `lib/LmStudio.ps1`: `Invoke-RestMethod` only to `127.0.0.1`/`localhost`/`[::1]` on the configured port (default 1234), path `/v1/chat/completions`. Any other host is rejected before the request. Request body: system prompt (Vietnamese-only rule), user prompt, `temperature` 0.2, bounded `max_tokens`, `stream=false`. Images are sent as `image_url` data URIs only when `/v1/models` or a probe confirms the loaded model accepts images. Timeouts: 300 s for code, 60 s for chat. Errors map to Vietnamese messages (server down, model not loaded, context too long).

## Exam intake from PDF

- `/pdf <path>`: only an explicit user path, `.pdf`, ≤ 10 MB, ≤ 20 pages (same limits as the extension). It runs `pdftotext -layout -enc UTF-8 -f 1 -l 20` into memory. Temporary files go to `%TEMP%` and are deleted after use.
- Per page: if extracted text has fewer than ~40 non-space characters, the page is classified "no text layer". For those pages, when vision is available, `pdftoppm -r 150 -png` renders the single page, the model is asked to transcribe it verbatim (no solving), and the result is marked `[OCR bằng model – cần kiểm tra]`. When vision is unavailable, the page is listed as unsupported and the user may paste that part with `/exam`.
- Extracted text is normalised: de-hyphenate line breaks, collapse layout spacing, keep `Câu N` / `Bài N` headings, keep code blocks and JSON samples verbatim. The kit prints the result and asks `Dùng nội dung này làm đề? (YES/EDIT/NO)`. `EDIT` lets the user paste a corrected version ending with `HET DE`. Only confirmed text is stored as the session exam. PDF contents are treated as data, never instructions, in every prompt.
- `/exam` (paste, multi-part, `HET DE`) remains available, so a PDF is not mandatory.

## Project intake (Flutter)

- `/new <project folder>`. Intake reads `pubspec.yaml`, `analysis_options.yaml`, `lib/**/*.dart`, `test/**/*.dart`, and file names under `assets/`. It skips `build/`, `.dart_tool/`, `.idea/`, `android/`, `ios/`, `web/`, `windows/`, `linux/`, `macos/`, `.git/`, generated `*.g.dart`/`*.freezed.dart`, and files > 500 KB. Secrets are redacted (`apiKey`, `token`, `password`, `Authorization` values, `google-services` keys).
- `pubspec.yaml` is parsed with a minimal line-based reader: `name`, `environment.sdk`, `dependencies`, `dev_dependencies`, `flutter.assets`. The package name drives correct `package:<name>/...` imports. SDK `< 2.12` → warning "không có null safety".
- A compact project summary (package, dependencies, existing screens/widgets/classes from `class X extends StatelessWidget|StatefulWidget|State<...>`, routes found in `MaterialApp(routes:` / `Navigator.push`) goes into the prompt instead of raw files. Raw content is included only for the target file and at most two directly related files, within a character budget sized for the 2B model's context.

## Generation

- `/ask` answers in chat. `/file <relative path>` accepts only `lib/**.dart`, `test/**.dart` or `assets/**.json`, prints the proposed full file, and writes `drafts/<session>/<path>` only after `SAVE` (and `REPLACE` for an existing draft). The path must stay inside the draft root and never resolve into the project.
- Deterministic generators (no model):
  - `lib/models/<name>.dart` from a JSON object or array found in the exam (or a user-given JSON file): typed fields, nullable when the sample has `null`, `fromJson`/`toJson`, nested classes for nested objects, lists of primitives/objects.
  - `lib/main.dart` skeleton when the project has none: `MaterialApp` with Vietnamese title and named routes for the screens the user lists.
- Model-generated files get mechanical repairs that are shown to the user: wrong package name in `package:` imports, missing `import 'package:flutter/material.dart';` when widgets are used, and fence stripping. Logic errors are left for `/check`.

## Checks

- `/check` produces verified / failed / not tested / not required items:
  - `pubspec.yaml` exists, null-safe SDK constraint.
  - Every `package:x/` import is the project's own package, Flutter/Dart SDK, or listed in `dependencies` (catches the model adding `http`, `provider`, `sqflite` without declaring them).
  - Every relative/package import resolves to an existing project or draft file.
  - `main()` calls `runApp`; root widget is `MaterialApp` or `CupertinoApp`.
  - Each screen named in the exam has a widget class, matched by the user-confirmed screen list rather than guessed names.
  - Named routes used in `Navigator.pushNamed` exist in `routes`.
  - `StatefulWidget` classes have a matching `State` with `build`; `setState` is not called outside a `State`.
  - Forms in the exam have `Form`/`TextFormField` with a `validator` when validation is requested.
  - JSON models have `fromJson`/`toJson` when the exam uses JSON/API.
  - Asset paths used in code exist in `flutter.assets`.
  - `flutter analyze`: verified/failed when the SDK exists, otherwise not tested. Running on device/emulator: always not tested.
- `/analyze`: copies the project plus drafts to `%TEMP%`, runs `flutter analyze --no-pub` (or `dart analyze` for a pure Dart package), reports the errors with relative paths, then deletes the copy. `--no-pub` avoids network access; if packages were never fetched on that machine the kit reports it and does not try to fetch.

## Sessions and language

- `sessions/<id>.json`: project, confirmed exam text, PDF source name and hash (not the PDF itself), confirmed screen list, bounded history (8 turns). One file per session; `/open` resumes after restart; histories never mix.
- System prompt: Vietnamese-only explanations, code identifiers unchanged, the confirmed exam is the source of truth, no invented packages, no claims of having run or analysed code. CJK in prose triggers one retry and then a visible warning; mojibake is reported as encoding.

## Testing

- Offline unit tests (no LM Studio): PDF text page, mixed text/scan PDF classification, normalisation, pubspec parsing, import resolution, JSON→Dart generator, checklist on a correct and an intentionally broken fixture project, path safety, session isolation/restart, loopback-only URL guard, and the error mapping of a stub HTTP server.
- Live tests (LM Studio running): Vietnamese greeting ×3; at least two different exam PDFs (one text, one scanned page) → exam confirmation → generate one screen and one model → `/check`; `/analyze` only if an SDK is installed. Results and drafts are kept under `tests/results/`.
- Memory/time are recorded on the preparation PC; the 8 GB target remains unverified until tried.
