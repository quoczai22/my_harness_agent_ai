# Harden Trusted Agent Execution

## Problem

The initial Trusted Agent implementation exposes a guarded gateway but does not connect it to an agent command path. Its create operation can overwrite an existing file, inline completion lacks debounce, and tests do not exercise real create/replace transactions.

## Goal

Make the promised local capabilities real and safely enforceable: a visible local agent command invokes guarded edits, creates never overwrite, inline suggestions debounce and use Qwen FIM markers, and end-to-end tests prove the policy.
