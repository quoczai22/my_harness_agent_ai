# Proposal: Portable LM Studio offline assistant

Add an optional LM Studio provider to Harness Atlas so a prepared model folder can be carried to another Windows machine and used without Internet access. Target a model artifact of at most 3 GB and operation on an 8 GB RAM machine. Keep the existing Ollama path intact. Support coding, editable Markdown coding-style instructions, PDF text extraction, and image input when the chosen local model supports vision. The installer and runtime must report unsupported capabilities clearly rather than claiming every small model can perform them.

This change does not download a model or modify the machine during development. A separate setup plan must identify the exact model, quantization, license, total bundle size, and an offline installation check before recommending a distributable kit.
