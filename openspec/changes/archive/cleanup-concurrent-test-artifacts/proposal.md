# Clean Up Concurrent Test Artifacts

## Problem

The concurrent Core test can leave atomic-save `*.tmp` files under `.continuity/`. These artifacts make a successful test run leave the workspace dirty and can obscure a real interrupted write.

## Goal

Make the isolated concurrent test clean every state, lock, and matching temporary artifact on both success and failure, and prove this with a regression assertion.

## Scope

- Update only the concurrent test cleanup behavior.
- Use a test-specific state-file prefix and remove only artifacts associated with that prefix.
- Preserve production locking and state behavior.
