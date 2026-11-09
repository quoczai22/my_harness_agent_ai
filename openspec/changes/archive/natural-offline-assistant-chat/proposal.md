# Natural Offline Assistant Chat

## Problem

The current Offline Assistant prompt can cause the local model to emit only a machine-readable JSON edit proposal. The Chat view then feels unlike a coding assistant because it lacks a natural explanation, review, or answer.

## Goal

Require a helpful natural-language response in Chat and treat a structured edit proposal as an optional, separately parsed Composer payload.

## Out of scope

- Automatic changes or saves.
- Cloud providers, telemetry, or non-loopback endpoints.
