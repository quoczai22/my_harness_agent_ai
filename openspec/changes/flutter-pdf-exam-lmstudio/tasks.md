# Tasks

- [ ] Resolve open questions 1–4 with the user (exam content, authoritative notes, SDK on exam machine, project shape); update design/checklist if assumptions change.
- [x] Stage the independent kit folder: launcher, REPL, `lib/`, PDF tools copied from the LM Studio kit, manifest with hashes; BOM-encoded PowerShell scripts.
- [x] Implement the loopback-only LM Studio client with server/model detection, vision capability probe, timeouts and Vietnamese error mapping.
- [x] Implement PDF intake: text extraction, no-text-page detection, optional vision transcription, normalisation, and user confirmation/correction before storing the exam. Measure transcription accuracy on a scanned sample; disable the vision path by default if it is not usable.
- [x] Implement Flutter project intake: pubspec reader, file discovery with skips, secret redaction, compact project summary.
- [x] Implement `/ask` and `/file` with safe drafts, the JSON→Dart model generator, the `main.dart` skeleton, and mechanical import repairs.
- [x] Implement `/check` and `/analyze` (temporary copy, `--no-pub`, SDK detection).
- [x] Offline tests with fixtures (text PDF, scanned PDF, correct and broken Flutter projects); live tests on two exam PDFs; report results and limitations; request implementation review.
