# Portable Offline Kit

> **Status:** Deferred 2026-09-08, implementation review rejected: the Ollama runtime/model payload was split into a separate change; archived during cleanup on 2026-11-09.

Provide a Windows one-click installer for the Continuity VS Code extension, its local configuration, an optional locally stored Ollama model bundle, and a user-selected export of Python learning material.

The installer must not copy arbitrary files, secrets, or VS Code global storage. It imports only eligible text files under user-selected source folders and records an auditable manifest.
