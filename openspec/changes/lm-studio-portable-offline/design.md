# Design

Harness owns project sessions, prompt assembly, tool permissions, PDF extraction, style instructions, and agent loop. LM Studio provides local inference through its loopback HTTP server. The adapter accepts only loopback addresses and has no cloud fallback. Model paths are configured by the user or portable kit manifest; no runtime download is allowed.

The agent loop continues autonomously through known, authorized steps: plan the next action, call a permitted tool, inspect the result, and repeat until the task is complete or a real blocker appears. It asks the user only when a required choice cannot be inferred, a permission boundary requires human approval, or progress is blocked. Tool calls, file writes, and destructive actions remain subject to the existing Harness gates; the model cannot grant itself permission.

PDFs with extractable text are parsed locally, with bounded pages and characters. Scanned PDFs require an offline OCR or vision path and must produce a clear unsupported result if neither is installed. Images are passed only when the loaded model and LM Studio API report compatible vision support. A Markdown style file is loaded from the selected project, size bounded, and included as user-editable guidance in each prompt; it cannot override tool permissions.

Portable setup includes an LM Studio installer, model file, manifest with hashes and license, and instructions/scripts that use only local files. Sessions persist in Harness storage with model identity and context summaries, independent of LM Studio process lifetime. Inference context is bounded for 8 GB RAM and tested on a clean offline machine or equivalent network-disabled environment.
