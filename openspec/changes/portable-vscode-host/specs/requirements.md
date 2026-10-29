# Requirements

- Generated launcher must use only relative kit paths and never invoke `code` from PATH.
- VS Code profile must be stored within kit `vscode/data` and include Continuity configuration and extension.
- The kit must retain safe Python-only learning-library boundaries.
- Tests verify launcher content and required portable-host structure without downloading anything.
