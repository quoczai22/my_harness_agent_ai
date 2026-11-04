# Requirements

1. Every command contributed in `package.json` SHALL be registered at activation; a test SHALL enforce this.
2. The OpenAI key commands SHALL store or delete the key only in VS Code SecretStorage, never echo it, and change nothing on cancel.
3. Ollama SHALL be auto-started only when auto-start is enabled and a configured provider is Ollama.
4. The installed extension SHALL be the current build, version 0.2.1.
