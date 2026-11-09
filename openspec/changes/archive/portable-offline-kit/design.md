# Design

Build a bounded offline-kit generator first. It creates a staging directory with the VSIX, settings template, launch/install scripts, and a learning-library export manifest. Source folders are explicitly passed by the user; traversal includes `.py` files only, skips ignored/sensitive paths, and enforces file/count/total-byte limits.

The generated kit is installable without manual settings edits. Ollama/model bundling is represented by optional payload paths and verified locally; no model is downloaded or redistributed by the generator. A later packaging step may wrap the staged kit in a Windows installer.
