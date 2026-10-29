# Offline kit provenance (2026-10-29)

The kit carries Qwen3.5-2B Q4_K_M plus the matching F16 vision projector. Both files were downloaded individually from the `gguf/Qwen3.5-2B-GGUF` repository. The upstream base model is `Qwen/Qwen3.5-2B` under Apache-2.0; its license is copied as `MODEL-LICENSE.txt`.

| File | Source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `qwen3.5-2b-Q4_K_M.gguf` | https://huggingface.co/gguf/Qwen3.5-2B-GGUF/blob/main/qwen3.5-2b-Q4_K_M.gguf | 1,312,164,352 | `9a3d0aa6c920f096441139b6a254542da855223fdad06855ea00c6c087fd713d` |
| `mmproj-qwen3.5-2b-F16.gguf` | https://huggingface.co/gguf/Qwen3.5-2B-GGUF/blob/main/mmproj-qwen3.5-2b-F16.gguf | 668,226,656 | `01c26fff8d4e7f7262e5c8aa45858070c708f1d5089ee8dbc27e31650412a5fc` |

Combined model size: **1,980,391,008 bytes** (under 3,000,000,000 bytes). Local SHA-256 hashes matched the publishers' file pages. LM Studio 0.4.27 recognized and loaded both files from the kit's model directory. It estimated 2.12 GiB memory at 4,096 context tokens with GPU off; this is an estimate, not a measured 8 GB target-PC result.

The Windows x64 LM Studio installer was downloaded from https://lmstudio.ai/download/latest/win32/x64. Its Authenticode signature was valid and signed by Element Labs Inc. The staged installer SHA-256 is `276ab657b6462a1540f1cda0d2f05c38e0ce6abb6def1b50297c3dbda899a4e9`.
