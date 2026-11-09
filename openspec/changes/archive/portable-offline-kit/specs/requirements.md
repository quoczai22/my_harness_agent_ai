# Requirements

- The exporter accepts explicitly selected folders and recursively exports safe `.py` learning files, including nested lab folders.
- It excludes `.env`, `.git`, `node_modules`, binaries, files outside selected roots, and files over configured limits.
- A manifest records relative paths, byte counts, and source roots; no secrets or chat global-storage data are included.
- The kit includes the current extension VSIX, a safe settings template, and double-click install/launch scripts.
- Packaging and tests must work offline and must not download models.
