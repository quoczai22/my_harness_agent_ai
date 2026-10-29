# Verification: Flutter exam target trial — stage 1 (2026-10-30)

Scope: `artifacts/Continuity-Flutter-Exam-LMStudio` only. Spec approved by the user ("Duyệt spec"); continuity `check_scope` returned IN_SCOPE for the trial tooling, OCR comparison and checklist tasks.

## Built

- `lib/FieldTrial.ps1`, read-only:
  - Machine conditions: OS, CPU, AVX2 via `IsProcessorFeaturePresent(40)`, RAM.
  - Network evidence from connection profiles, without sending traffic.
  - PATH evidence for `flutter`/`dart`/`git`.
  - Kit integrity against `manifest.json`, plus presence of the bundled SDK and PDF tools.
  - Per-phase measurement: a background runspace samples the working sets of LM Studio/llama/dart/PowerShell processes and the system's free memory.
  - OCR scoring against a human-confirmed transcript: word recall plus critical facts (class names, routes, JSON keys, numbers, `@`).
  - A verdict that is `run` only when every target condition is observed, otherwise `not run`.
- `Run-Field-Trial.ps1` / `.cmd`: runs LM Studio startup, PDF intake, one screen generation with the compile-repair loop, and a whole-project analysis. Everything it creates goes under `tests/results/trial-<time>/`, ignored by git: OCR output, a copied fixture project, drafts and `report.md`. The user's projects are never touched, nothing is downloaded, and no shared temp folder is deleted.
- `FIELD-TRIAL.md`: Vietnamese checklist covering target PC, offline LM Studio install, network off, phone-photo PDF, human transcript, how to run, and how to read the report.

## Evidence

- Offline self-test **143/143** (12 new checks):
  - critical-fact extraction;
  - perfect and misread transcripts;
  - target conditions → `run`;
  - preparation-PC conditions → `not run`, with each unmet condition listed;
  - phase sampling returns results and records errors without throwing;
  - integrity check of 181 manifest files.
- Dry run on the preparation PC, using the synthetic scanned fixture and its transcript without `-PhonePhoto`:
  - Verdict: **NOT RUN**. Unmet conditions: 15.63 GB RAM, Internet connected, git on PATH, not a phone-photo PDF. The run also exposed a stale `manifest.json`, which has since been regenerated and now verifies all files.
  - OCR word recall 1.0; critical facts 12/12.
  - Generated `LoginScreen`: compile errors 1 → 0 via one quick fix; the whole project compiled; checklist 9 passed, 1 failed.
  - Peak working set of kit processes: about 4.0 GB (llama-server about 3.0 GB, dartaotruntime about 0.5 GB). Lowest free RAM was 3.55 GB on this 16 GB PC. The model was already loaded, so model load time and memory were not measured.

## Not done (stage 2, needs the user)

- The field trial itself: a clean, disconnected Windows PC with 8 GB RAM and AVX2, LM Studio installed offline from the LM Studio kit, and a PDF built from phone photos of exam pages with a human-confirmed transcript. Until a report from such a run shows `RUN`, 8 GB fit, phone-photo OCR accuracy and offline operation on a clean PC remain **unverified**.
