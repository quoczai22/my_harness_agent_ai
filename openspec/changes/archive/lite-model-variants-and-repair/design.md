# Design

Copy the existing user supplied 1.5B Q4 file into the kit and verify it by local inference. Download official Qwen 3B Q4 and Q6 plus 7B Q3 GGUF files to distinct names, verify their SHA256 values against official source metadata, and smoke test each with the bundled llama-cli. Expose selection through one shared kit-relative model selector used by chat, Word, and PDF launchers. Default to the verified 3B Q6 file. Reject missing or failed model files explicitly. Do not silently fall back to the broken 7B file.
