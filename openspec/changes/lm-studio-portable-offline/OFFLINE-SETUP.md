# Offline LM Studio kit: preparation and acceptance

**Use LM Studio Desktop, not Bionic.** Bionic is a separate agent app. This Harness adapter expects LM Studio's local server on `127.0.0.1:1234`. On the official download page, use the **Download LM Studio** section rather than the prominent Bionic download. The headless `llmster` option may work later, but this kit has not verified it.

The 3 GB limit applies to **model weights and vision projector together**. It does not include LM Studio, its llama.cpp runtime, the VS Code extension, or PDF tools. Those must also be carried for installation without Internet.

## Verified model on the preparation PC

Qwen3.5-2B Q4_K_M GGUF (1,312,164,352 bytes) plus its F16 vision projector (668,226,656 bytes) is the initial model. The upstream Qwen3.5-2B model is Apache-2.0 and supports image-text input. The quantized GGUF distribution is third-party; both downloaded files match the publishers' SHA-256 hashes. LM Studio 0.4.27 loaded this pair and answered code, image, and PDF-text probes. The 8 GB target-PC and clean offline installation remain unverified. See `MODEL-SOURCES.md` for provenance.

References:

- Upstream model and license: https://huggingface.co/Qwen/Qwen3.5-2B
- Candidate GGUF file list: https://huggingface.co/gguf/Qwen3.5-2B-GGUF/tree/main
- LM Studio offline behavior: https://lmstudio.ai/docs/app/offline
- LM Studio import layout: https://lmstudio.ai/docs/app/advanced/import-model
- LM Studio local API: https://lmstudio.ai/docs/developer/openai-compat

## Prepare at home with Internet

1. Download the Windows LM Studio installer and install the llama.cpp runtime while online. Keep the installer and a copy of the installed CPU runtime in the kit. The runtime snapshot has not yet been proven sufficient to install on a clean PC.
2. Download one GGUF and the matching vision projector. Check combined byte size is at most 3,000,000,000 bytes. Record SHA-256 hashes, source URLs, and license in `MODEL-SOURCES.md` and generate `manifest.json`.
3. Point LM Studio's **Library → My Models → Change** setting at the kit's `models/` folder. This lets LM Studio use the single portable copy and avoids duplicating model files. The kit uses the expected `models/gguf/Qwen3.5-2B-GGUF/` directory structure, with the projector beside the main GGUF.
4. Put the installer, required runtime files, model files, model license, VS Code extension, PDF extractor and all its DLL dependencies, and this guide into a portable folder. The installer/runtime and PDF tool must be verified on a clean offline PC.
   Run the kit verifier with `-WriteManifest` while preparing and again without that flag after copying. It expects `models/`, `installer/`, `runtime/`, `tools/pdf/pdftotext.exe`, and `MODEL-LICENSE.txt` inside the kit.
5. In the extension settings, select `continuity.offlineAssistantProvider=lmstudio`, set `continuity.lmStudioModel` to the loaded model ID, and keep `continuity.lmStudioEndpoint=http://127.0.0.1:1234`. Put optional coding rules in `CODE_STYLE.md` at the project root.
   Run `scripts/probe-lmstudio.ps1` to list local model IDs; pass `-ModelId <id>` for a small coding probe before testing the extension.

## Offline acceptance on another Windows PC with 8 GB RAM

Disconnect network before installation. First run `powershell -File .\verify-lmstudio-kit.ps1 -KitRoot .` from inside the kit. Install LM Studio from `installer/`, select the kit's `models/` directory in Library, and check whether the bundled CPU runtime can be installed or recognized without a network download. Start the local server on `127.0.0.1:1234`, load the model with 4,096 context tokens and GPU off, then run a code task, an image request, and a PDF text request. Install `continuity-workflow.vsix` in VS Code and set `continuity.pdfTextExecutable` to the bundled `tools/pdf/pdftotext.exe`. Use `/image relative/path.png` and `/pdf relative/path.pdf` in assistant chat. Scanned PDFs require OCR or vision processing that is not yet available in the extension. Check memory use and repeat after reboot. The bundled runtime files are a preparation snapshot; their portability to a clean PC has not yet been verified. No acceptance claim should be made until this passes on the target hardware.

For a question about a document or image, add `|` and the question, for example `/pdf docs/spec.pdf | Generate a C# model from the requirements` or `/image assets/mockup.png | Describe the layout`. Use `/agent Explain how authentication works` to let Harness repeatedly read safe project files before answering. If it needs a required choice, answer in the same chat; the pending task is stored with that session and resumes. The agent loop has a six-step limit and cannot write files; proposed edits still use the existing review or trusted gateway.

## Current implementation limits

The extension uses local chat completions for text and an image data URL for PNG/JPEG/WebP. Model support for images must be confirmed by a real request. PDF text extraction is limited to 20 pages, 40,000 characters, and 10 MB input. The `/agent` loop can autonomously read safe text files and ask a required question, but it cannot run commands or apply edits. The existing trusted proposal flow remains one bounded file proposal with one automatic repair attempt.
