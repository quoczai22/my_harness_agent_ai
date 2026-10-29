# Proposal: One folder, one click for the Flutter exam kit

The user asked: "put everything that needs installing into one folder, then a .bat or .ps1 so one run brings it up". Today the setup takes two kit folders and about ten manual steps: verify the kit, run the installer, open LM Studio, stage the runtime, point the model folder, start the server, load the model, then start the Flutter kit.

Build a single portable folder `Flutter-Exam-Bundle` holding LM Studio's installer, its CPU runtime, the Qwen3.5-2B model and vision projector, and the Flutter kit with its bundled SDK, pub cache and PDF tools. Add one launcher, `CHAY-DE-THI.cmd`. On first run it sets everything up offline. On later runs it only starts the server, loads the model and opens the kit. Re-running it is always safe.

Out of scope: other kits (ASP.NET, Lite, portable VS Code), the VS Code extension, GPU setups, CPUs without AVX2, and any download. The field trial on a clean 8 GB PC stays the acceptance gate for portability. This change only automates setup.
