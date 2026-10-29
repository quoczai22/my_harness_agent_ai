# Design

Add a kit preparation and installation script that validates a manifest, copies the supported LM Studio CPU runtime into the per-user backend directory after the app is installed, and checks that `lms runtime ls` recognizes it. Keep the target path explicit and fail closed on missing or incompatible files. Record the runtime version, LM Studio minimum version, and AVX2 CPU requirement. The 8 GB acceptance still requires a target-machine trial.

Add explicit export/import commands for assistant sessions in the VS Code extension. Export a versioned JSON file into a user-chosen location in the portable kit; import validates size and structure, shows the session count, and does not silently overwrite existing sessions. No automatic copying of project data or secrets.

Before an image request, query LM Studio's local `/api/v1/models` endpoint. Match the configured loaded model ID against the model key or loaded instance ID and require `capabilities.vision === true`. If capability data is missing or the model is not loaded, return a clear error. The HTTP client remains loopback-only.
