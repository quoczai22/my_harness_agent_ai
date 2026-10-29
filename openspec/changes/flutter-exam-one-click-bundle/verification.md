# Verification: one-click Flutter exam bundle (2026-10-30)

Spec approved by the user ("Duyệt spec"); continuity `check_scope` returned IN_SCOPE for build, launcher and tests.

## Built

- `lib/BundleSetup.ps1`:
  - LM Studio detection (per-user and per-machine paths);
  - silent per-user installer arguments (`/S /currentuser`; the installer is electron-builder NSIS, confirmed from its registered uninstaller);
  - `lms runtime ls` parsing (runtime present, a GGUF engine selected);
  - `downloadsFolder` edit that backs up `settings.json` and changes only that value's text;
  - bundle manifest check: fast size check, or full SHA-256, plus a tree summary for the SDK.
- `Build-Exam-Bundle.ps1`:
  - verifies the Flutter kit (`manifest.json`) and the LM Studio kit (installer, 19 runtime files, model and projector by SHA-256);
  - copies only those files plus the kit (without sessions, drafts, results and templates);
  - writes `bundle-manifest.json`, then re-verifies the whole bundle.
  - Refuses to write into a non-empty folder that is not a previous bundle.
- `bundle-template/Setup-And-Run.ps1` + `CHAY-DE-THI.cmd` + `DOC-TRUOC.md`, copied to the bundle root.
- `Update-Kit-Manifest.ps1`: rebuilds `manifest.json` and excludes folders the bundle does not carry, so the kit inside the bundle verifies cleanly.

## Evidence

- Offline self-test **156/156**. The 13 new checks cover:
  - detection and installer arguments;
  - runtime parsing;
  - settings backup with exact-text preservation;
  - no second backup or change on rerun;
  - broken settings left untouched;
  - missing settings created;
  - bundle manifest: intact, same-size tampering (caught only by full hash), changed SDK tree, missing file.
- Real build on the preparation PC:
  - `artifacts/Flutter-Exam-Bundle`, **5.88 GB**: 208 hashed files plus `kit/sdk` (23,513 files);
  - full re-verification passed;
  - the kit inside the bundle passes its own integrity check (180 files);
  - no sessions, drafts or results are included.
- Launcher on this PC, where LM Studio is already installed per machine:
  - First run: 10–13 s. Full hash check; existing LM Studio and runtime detected; `downloadsFolder` changed with backup; models unloaded; model loaded. `llama-server --model` was confirmed to point to `Flutter-Exam-Bundle\lmstudio\models\...`.
  - Second run: 3 s. Fast check; every setup step skipped.
  - End-to-end run: the launcher opened the Flutter kit prompt.
  - Defect found and fixed: `lms daemon down` does not unload models, so a model still loaded from the previous folder was reused. The launcher now unloads models after changing the folder; this was re-verified as above.
- The preparation PC's LM Studio settings and loaded models were restored to their prior state after testing. The two backup files the test created remain in `%USERPROFILE%\.lmstudio`.

## Not verified (needs the field trial)

- Silent per-user install of LM Studio on a clean PC.
- The first-launch bootstrap of `lms` and `settings.json`.
- Runtime staging and selection when no runtime exists.
- Behaviour with 8 GB RAM.

This PC already had LM Studio installed, so these paths were not exercised. The field trial (`kit/FIELD-TRIAL.md`) should start from `CHAY-DE-THI.cmd` on the clean PC.
