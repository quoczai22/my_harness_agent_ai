# Requirements

1. The kit SHALL validate its files and stage a compatible CPU runtime from local files without network access; it SHALL report unsupported target CPUs or runtime mismatch.
2. The extension SHALL export and import session history through explicit commands using versioned, bounded data; import SHALL require user confirmation before replacing or merging sessions.
3. Image requests SHALL be sent only after the selected loaded LM Studio model reports vision capability through its local API; unavailable metadata SHALL produce a clear error.
4. Existing Ollama behavior and loopback restrictions SHALL remain intact.
5. Final acceptance SHALL include an offline 8 GB Windows target-machine trial; preparation-machine tests alone SHALL not claim that result.
