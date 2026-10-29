# Lite Model Variants and Repair

The bundled 7B Q3 model produces nonsense in a direct 12-token smoke test. Add verified official Qwen GGUF models at roughly 1GB, 2GB, 3GB, and 4GB, and let the portable launchers select a model. Keep the existing broken file for diagnosis until review.

Also package the 3GB model with the same runtime, learning library, sessions, and launchers as a standalone folder for USB use.
