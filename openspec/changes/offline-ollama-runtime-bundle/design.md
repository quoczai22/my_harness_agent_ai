# Design

The bundler accepts explicit runtime-installer and model-cache paths. It copies them into the kit only after size and manifest checks. The install script verifies VS Code, runs the supplied runtime installer with its documented silent option, restores the model cache to the target user's Ollama model directory, verifies the requested model with `ollama list`, then installs the VSIX and settings. It never downloads files or silently executes an arbitrary payload.
