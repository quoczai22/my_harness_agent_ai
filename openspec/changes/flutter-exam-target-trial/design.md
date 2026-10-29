# Design

Stage 1, now: prepare a trial checklist and read-only measurement/report tooling inside the Flutter kit. Define a clean target as a Windows PC with 8 GB RAM, no Flutter, Dart or Git executable in PATH before setup, and LM Studio installed from the staged LM Studio kit. The checklist records these starting conditions plus network-disconnected evidence before installation and throughout inference. The script records OS/CPU/RAM, kit and model versions, LM Studio and Dart process memory at defined phases, elapsed time, and a local report path. It must not download or install anything, change exam text, or claim cleanliness from software inspection alone; the human records the machine's prior state.

Stage 2, later: run the trial only when the user provides access to the target PC and a phone-photo PDF. Until then, record `not run` for hardware, offline installation, OCR and RAM outcomes rather than substituting preparation-PC or synthetic-scan results.

Use a phone-photo PDF supplied by the user. Create a ground-truth transcript by human confirmation of the page text, then compare OCR against that transcript using both word recall and exact critical facts (numbers, names, validation rules, routes). Run PDF intake, one representative file generation and `dart analyze` from the bundled SDK. Record failures and unknowns. Synthetic scans are not a substitute.

Keep all temporary files in a named trial directory and remove only that directory if cleanup is requested. Trial outputs stay in the Flutter kit's ignored results area, with no personal exam content committed to Git.

