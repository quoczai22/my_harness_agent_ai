# Design

## Building the bundle (preparation PC, tracked script)

`artifacts/Continuity-Flutter-Exam-LMStudio/Build-Exam-Bundle.ps1` assembles `artifacts/Flutter-Exam-Bundle/`. The bundle folder is git-ignored and about 6.2 GB.

```
Flutter-Exam-Bundle/
  CHAY-DE-THI.cmd                         one click
  Setup-And-Run.ps1                       idempotent setup + launch
  DOC-TRUOC.md                            Vietnamese instructions
  bundle-manifest.json                    SHA-256 of installer, runtime and model files; file count and bytes for kit/sdk
  lmstudio/installer/LM-Studio-Windows-x64.exe
  lmstudio/runtime/llama.cpp-win-x86_64-avx2-2.62.1/
  lmstudio/models/gguf/Qwen3.5-2B-GGUF/   model + mmproj (layout LM Studio expects)
  lmstudio/MODEL-LICENSE.txt, MODEL-SOURCES.md
  kit/                                    Flutter kit incl. sdk/, tools/pdf/; without sessions, drafts, tests/results
  logs/
```

The build copies from the existing staged kits only. It never downloads anything, and it refuses to build if a source file is missing or its hash differs from the source manifests.

## `CHAY-DE-THI.cmd` → `Setup-And-Run.ps1`

Every step first checks whether it is already done, so later runs skip straight to the end. Each step is logged to `logs/setup-<time>.log` in Vietnamese.

1. **Machine check.**
   - Windows x64 and AVX2 (`IsProcessorFeaturePresent(40)`). Stop with a clear message if AVX2 is missing.
   - RAM: warn below 8 GB.
   - Free disk space: warn if the LM Studio install drive has less than 3 GB.
2. **Bundle integrity.** On the first run, verify SHA-256 of the installer, runtime and model files, and the kit file count and bytes against `bundle-manifest.json`. Later runs only re-check sizes, using a marker file `logs/verified.json`.
3. **Install LM Studio if absent.** Detect `%LOCALAPPDATA%\Programs\LM Studio\LM Studio.exe` and `%ProgramFiles%\LM Studio\LM Studio.exe`.
   - If neither exists, run the bundled installer with electron-builder NSIS options `/S /currentuser`: a per-user silent install that needs no admin rights.
   - Wait for the exe, up to 5 minutes. If the silent install fails, open the installer normally and wait for the user to finish.
4. **Bootstrap `lms`.** If `%USERPROFILE%\.lmstudio\bin\lms.exe` is missing, start LM Studio once and wait (up to 2 minutes) until it and `settings.json` exist.
5. **Stage the CPU runtime** if `lms runtime ls` does not list `llama.cpp-win-x86_64-avx2@2.62.1`. Reuse the verified logic of `install-lmstudio-runtime-offline.ps1`: metadata and AVX2 checks, copy into `.lmstudio\extensions\backends`, hash compare, recognition check.
6. **Model folder.** If `settings.json` → `downloadsFolder` is not the bundle's `lmstudio\models`:
   - back up `settings.json` once (`settings.json.bak-<time>`);
   - set the value;
   - restart the LM Studio server so the change takes effect.

   No model is copied or moved. If LM Studio is open and overwrites the setting, stop with an explanation rather than editing repeatedly.
7. **Start and load.**
   - `lms server start` on 127.0.0.1:1234.
   - `lms load qwen3.5-2b -y -c 8192`, with GPU left to LM Studio's automatic choice.
   - Confirm through `/api/v0/models` that the model is loaded and `type` is `vlm`.
8. **Launch** the Flutter kit (`kit\Flutter-Exam.ps1`) in the same window.

Safety:
- No downloads and no admin rights (per-user install).
- No changes outside LM Studio's own per-user folders and settings file, which is backed up before any change.
- No deletion of anything the script did not create.
- Network state is not changed; `DOC-TRUOC.md` tells the user to disconnect.

## Testing

- **Offline unit tests** for the pure decisions, with fake paths and a temp `HOME`:
  - LM Studio detection;
  - installer argument building;
  - settings update with backup, and no rewrite when already correct;
  - runtime-recognition parsing;
  - manifest verification (good, missing, tampered);
  - first-run versus later-run step selection.
- **Build test:** build the bundle on this PC, verify the manifest, and check that the result contains no sessions, drafts or exam files.
- **Second-run test on this PC:** LM Studio is already installed here, so the run must skip install, runtime and folder steps and reach a loaded model and the kit prompt.
- **Not testable here:** the silent install and first-run bootstrap on a clean PC. These become part of the existing field trial and are reported "not run" until then.
