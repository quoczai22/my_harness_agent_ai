# Normalize Completed Workflow Lifecycle

## Problem

Approving an implementation-review checkpoint leaves the change in `DONE` while its implementation tasks still report `pending`. This creates a contradictory state and prevents the next change from being registered without a manual reset.

## Goal

Finalize an accepted change atomically: record completion for its tasks, retain its audit history, clear the active-change pointer, and return the workflow to `IDLE`.

## Out of scope

- Changing checkpoint approval authority.
- Deleting archived tasks or checkpoint history.
- Automatically committing or pushing Git changes.
