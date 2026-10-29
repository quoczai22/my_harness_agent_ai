# Requirements

1. A clean target SHALL mean a Windows PC with 8 GB RAM, no Flutter, Dart or Git executable in PATH before setup, and LM Studio installed from the staged LM Studio kit. Network disconnection during installation and inference SHALL be recorded as evidence.
2. The trial SHALL use at least one PDF built from phone photos and a human-confirmed transcript as ground truth.
3. The report SHALL include OCR word recall, critical-fact accuracy, peak RAM by phase, response time, compile and checklist outcomes, and any unsupported step.
4. The trial tooling SHALL not download dependencies, alter project code, or delete shared temporary files.
5. Stage 1 SHALL deliver measurement tooling and checklist now. Stage 2 SHALL run only after the user supplies the 8 GB target PC and phone-photo PDF; until then the trial outcomes SHALL say `not run` rather than infer a pass.

