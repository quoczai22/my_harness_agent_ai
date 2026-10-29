# Requirements

- Retrieval SHALL remain local to the opened workspace.
- It SHALL prefer exact matches, then similar-token matches.
- It SHALL bound file count, snippet size, and total prompt bytes.
- It SHALL exclude ignored/sensitive/binary paths.
- Chat SHALL show which retrieved files informed the answer.
