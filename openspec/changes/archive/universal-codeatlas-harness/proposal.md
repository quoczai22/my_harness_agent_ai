# Universal CodeAtlas Harness

Build a localhost-first, project-agnostic Harness workspace inspired by CodeAtlas. The first release focuses on understanding and navigating any explicitly selected project before provider-specific behavior is customized.

The application must not preload ASP.NET, Python, coursework, or any other domain profile. It discovers project structure from the selected workspace and keeps project and session context isolated.

Initial provider surfaces represent Codex/ChatGPT, Google Antigravity, and Ollama, but authentication and full autonomous execution are deliberately staged behind the project-map foundation.

Out of scope for this change: storing account passwords, scraping browser sessions, unrestricted filesystem scanning, autonomous file writes, public hosting, and hard-coded framework assumptions.
