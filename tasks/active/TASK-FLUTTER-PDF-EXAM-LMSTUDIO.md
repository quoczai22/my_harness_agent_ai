# Work Order: Flutter PDF Exam Kit via LM Studio

Build `artifacts/Continuity-Flutter-Exam-LMStudio`, a portable offline terminal kit: exam PDF in (text layer, optional local vision transcription for scanned pages, user confirmation), Flutter project intake, one `.dart` draft at a time via LM Studio on loopback, deterministic JSON→Dart models, `/check`, and `/analyze` only when a Flutter SDK exists. Change: `openspec/changes/flutter-pdf-exam-lmstudio`.

Do not modify the Web-Test1 kit, the VS Code extension, or user projects. No downloads, cloud calls, commit or push.

## Authorization note (2026-10-30)

The user asked to "automatically do everything until complete" while away, right after the spec was written. Implementation proceeds under the spec's stated assumptions for open questions 1–4. No formal continuity spec-review checkpoint was recorded because the continuity MCP tools are not available in this session; the user should confirm the spec and assumptions at implementation review.

## Implementation status (2026-10-30)

Implemented; awaiting spec confirmation (open questions 1–4) and implementation review. Offline self-test 120/120; live LM Studio runs on a text PDF and a scanned PDF exam recorded in the kit's `tests/results/`. Generated Dart is not compiler-verified (no Flutter SDK on this PC). Evidence and limitations: `reports/flutter-pdf-exam-lmstudio-verification.md`. No commit or push.
