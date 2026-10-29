# Requirements

- Runtime installer and model payload must be explicit local paths and recorded with SHA-256 and byte counts.
- The generated install script refuses a missing or unexpected payload.
- Model cache restoration must target only the installing user's Ollama model directory and verify the requested model after startup.
- No network request, source-code export, secret export, commit, or push occurs.
