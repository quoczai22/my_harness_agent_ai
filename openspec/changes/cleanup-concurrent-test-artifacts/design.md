# Design

- Generate a unique state path inside `.continuity/` for each test invocation.
- Put all setup, worker execution, assertions, and cleanup inside `try`/`finally`.
- In cleanup, remove the dedicated state, lock, and state-prefix `*.tmp` files only.
- Add an assertion that no matching artifacts remain after the test.

This avoids deleting unrelated Continuity state while making Windows rename failures and interrupted child processes observable without contaminating the repository.
