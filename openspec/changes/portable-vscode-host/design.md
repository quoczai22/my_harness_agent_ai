# Design

Stage an explicitly selected local VS Code installation into `vscode/`, create a `vscode/data/` portable profile, and install/configure the Continuity VSIX within that profile. The launcher calls `%~dp0vscode/Code.exe` directly after starting relative-path Ollama. Source learning files remain bounded Python-only exports.
