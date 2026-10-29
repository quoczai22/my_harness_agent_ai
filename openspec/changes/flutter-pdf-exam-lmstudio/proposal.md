# Proposal: Portable Flutter exam kit — PDF exam in, Dart draft files out, via LM Studio

## Why

The user no longer studies ASP.NET Core MVC + ADO.NET; the course is now Flutter application programming. Exam papers arrive as PDF files. The Web-Test1 kit (`artifacts/Continuity-Web-Test1-3GB`) cannot help: it accepts only pasted text, calls `llama-cli` directly rather than LM Studio, and every deterministic aid (SQL schema parser, Model generator, Razor layout extraction, ADO.NET checklist, `dotnet build`) is ASP.NET-specific.

## What

Build a new, independent portable terminal kit `artifacts/Continuity-Flutter-Exam-LMStudio` that:

1. Takes the exam as a PDF. It extracts text locally with the bundled `pdftotext`. When a page has no text layer (a scan), it can render that page with `pdftoppm` and ask the vision-capable local model to transcribe it. The user always reviews the extracted wording before it becomes the exam.
2. Runs inference only through LM Studio's loopback server (`http://127.0.0.1:1234/v1`), reusing the model and runtime already staged and hash-verified in `artifacts/Harness-LMStudio-Offline-Kit` (Qwen3.5-2B Q4_K_M + F16 mmproj, 1.98 GB). There is no `llama-cli`, Ollama or cloud fallback.
3. Reads the selected Flutter project (`pubspec.yaml`, `lib/**/*.dart`, `test/**/*.dart`, `assets` listing) and generates one user-named `.dart` file at a time. The file is shown in chat and saved as a separate draft only after `SAVE`. The project is never written.
4. Uses deterministic helpers where a small model is unreliable: pubspec parsing, the package name for `package:` imports, Dart model classes from JSON samples in the exam, and a static Flutter checklist. It runs `flutter analyze` on a temporary copy only when a Flutter SDK is present; otherwise that check is reported "not tested".
5. Keeps the proven Web-Test1 behaviours: one isolated session per exercise, Vietnamese-only answers with drift detection, UTF-8 BOM scripts for Windows PowerShell 5.1, and verified / failed / not tested reporting.

## Out of scope

- Writing into the user's project, running the app, emulators, device builds, or `flutter pub get` from the Internet.
- Shipping the Flutter SDK. It is optional and detected on the machine (see open question 3).
- Cloud models, Ollama, and changes to the Web-Test1 kit or the VS Code extension.
- Handwriting recognition. Scanned typed exams only, and only if measured accuracy is acceptable (task 3).

## User answers (2026-10-30)

1. Exam content: the user does not know. Keep the generic assumption below, and replace it with the authoritative notes once they are supplied.
2. Authoritative notes: they exist. The file still has to be supplied, then bundled as a hash-pinned snapshot.
3. Flutter SDK on the exam PC: unknown, and the user wants the kit to be prepared for both cases. A bundled offline SDK option needs a download approved by the user.
4. Project shape: unknown. Keep detecting null safety and warning on older projects.

## Open questions (assumptions used until the user answers)

1. **Exam content.** Assumed: UI screens with widgets/navigation/forms, local state (`StatefulWidget`/`setState`, optionally Provider), lists from in-memory or JSON data, and optionally an HTTP API or SQLite. Firebase is assumed absent. The checklist rules in the design follow this assumption and must be revised if wrong.
2. **Authoritative notes.** No Flutter equivalent of `Ghi-chep-MVC-ADO.NET.md` has been supplied. Until one is, the checklist is derived from the exam PDF itself plus generic Flutter rules. If the user supplies notes, they become the bundled authoritative snapshot (hash-pinned like the Web-Test1 spec).
3. **Flutter SDK on the exam machine.** Unknown. The current preparation PC has no `flutter`/`dart` on PATH. The kit must work without it and state clearly that analysis is "not tested".
4. **Target project shape.** Assumed: a standard `flutter create` project with null safety (Dart ≥ 3). Older pre-null-safety projects are detected and warned about, not supported.
