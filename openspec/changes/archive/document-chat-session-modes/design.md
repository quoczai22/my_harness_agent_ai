# Design

`Read-Word.cmd` accepts only a user-supplied `.docx` path and uses a kit-bundled local extractor. It writes derived text under `sessions/documents/` and invokes the existing local model with a bounded document prompt.

`Start-Chat.cmd` remains ordinary chat. Document launchers use a distinct session namespace so their saved artifacts cannot be mistaken for ordinary chat history. This change does not add OCR, image understanding, automatic source edits, network calls, or persistent conversational memory across launcher invocations.

