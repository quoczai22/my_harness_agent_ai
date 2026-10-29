# Requirements

1. LM Studio inference SHALL use a loopback endpoint and SHALL NOT require Internet access at runtime.
2. The portable kit SHALL install from local files and verify model integrity without downloading dependencies.
3. The selected model artifact SHALL be no larger than 3 GB; the target host SHALL have 8 GB RAM.
4. Harness SHALL retain sessions and coding-style Markdown across LM Studio restarts and model reloads.
5. PDF text SHALL be extracted locally with size limits; scanned PDFs and images SHALL require an available local vision/OCR capability or return an explicit limitation.
6. Agent tools and file writes SHALL remain under existing Harness permission and review gates.
7. The existing Ollama provider SHALL continue to work.
8. The agent loop SHALL continue authorized work without asking for routine confirmations; it SHALL request user input only for unresolved required choices, human approval gates, or actual blockers, and SHALL resume after the input is provided.
