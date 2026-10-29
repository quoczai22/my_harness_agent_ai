# Requirements

1. A build script SHALL assemble one portable folder holding LM Studio's installer, its AVX2 CPU runtime, the Qwen3.5-2B model and vision projector, and the Flutter kit with its SDK, pub cache and PDF tools. It SHALL copy only from the verified local kits, never download, and write a bundle manifest with hashes.
2. One launcher (`CHAY-DE-THI.cmd`) SHALL, on first run and without Internet or admin rights, verify the bundle, install LM Studio per user if missing, stage the CPU runtime, point LM Studio at the bundled models, start the loopback server, load the model and open the Flutter kit.
3. Every step SHALL be idempotent: later runs SHALL skip completed steps and reach the kit prompt quickly.
4. The launcher SHALL stop with a clear Vietnamese message when a hard requirement is missing (x64, AVX2, bundle integrity, LM Studio install failed, model not loadable) and SHALL warn about soft limits (RAM under 8 GB, low disk space).
5. Before changing LM Studio's settings file the launcher SHALL back it up. It SHALL change nothing outside LM Studio's per-user folders and the bundle, and SHALL delete nothing it did not create.
6. The bundle folder and anything containing exam content SHALL stay out of git.
7. Tests SHALL cover the decision logic offline, a real bundle build, and a second-run launch on the preparation PC. First-run installation on a clean PC SHALL be reported as not verified until the field trial runs it.
