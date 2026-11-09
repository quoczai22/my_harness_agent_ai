# Design

Extract the explicit llama.cpp Windows CPU ZIP into `bin/`, stage the explicit GGUF model under `models/`, and generate a relative-path `Start-Chat.cmd` using `llama-cli.exe -m ... -c 1024 -n 256 -cnv`. Include the safe Python learning library and a review-file launcher. Verify the expected executables, GGUF magic, hashes, and no dependency on an installed Ollama/VS Code/PATH.
