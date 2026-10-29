# Design

The console binds to `127.0.0.1` and reads Continuity state. A policy engine classifies actions as automatic (queue, summaries, tests) or approval-required (scope, cloud use, checkpoint, commit/push). Provider endpoints are fixed allowlisted localhost URLs; the cloud broker has no public listener and only runs after explicit opt-in.

The first MVP simulates lanes and records no mutations beyond existing Continuity APIs. It exposes provider health, queued work and audit evidence in a local UI.
