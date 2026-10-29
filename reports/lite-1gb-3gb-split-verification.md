# Standalone Lite kits — split verification (2026-09-23)

The kits are independent folders with the same entry points: `Start-Chat.cmd`, `Read-Word.cmd`, `Read-PDF.cmd`, and `Review-File.cmd`. Each folder contains its own llama.cpp runtime, tools, learning-library copy, sessions directory, and exactly one model.

| Kit | Size | Model SHA-256 | Automated verification |
| --- | ---: | --- | --- |
| `artifacts/Continuity-Lite-Terminal-Kit-1GB/` | 1.05 GiB | `F530705D447660A4336C329981AF164B471B60B974B1D808D57E8EC9FE23B239` | Two consecutive runs, 13/13 each |
| `artifacts/Continuity-Lite-Terminal-Kit-3GB/` | 2.73 GiB | `72491FEBB8B149ABACFD15A5E94E354B5FB6BDA6BAFFC292F9AEC270B94596C8` | One additional run, 13/13; two consecutive runs had already passed before this split |

The 13 checks per run cover model presence and short inference, PDF text extraction, Word question answering, PDF question answering, Python review, and chat startup. A real multi-turn DOCX session on the 1GB kit answered question 1 (2 + 2 = 4), explained the answer on follow-up, and answered the next numbered question (3 + 3 = 6). The same flow had already passed on the 3GB kit.

An initial 1GB regression failed because its Python review falsely claimed it could not access the supplied file. Its prompt was corrected and the full regression passed twice afterwards. These checks demonstrate functional operation on this machine, not equal answer quality or guaranteed performance on the school's hardware. The 1GB model has lower reasoning capacity, especially for long documents and harder code.

Synthetic test fixtures were removed after testing. No existing user sessions or learning-library files were deleted. Neither kit was committed or pushed. Human implementation review remains pending.
