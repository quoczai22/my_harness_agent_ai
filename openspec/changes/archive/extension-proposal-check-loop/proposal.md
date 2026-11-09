# Proposal: Check code proposals before Composer displays them

Chat currently passes a valid one-file model proposal directly to Composer without running a project check. Add a per-project `continuity.assistant.checkCommand` setting. If configured, apply the proposal only to a bounded temporary copy, run the check there, and let the model repair analyzer/build errors for at most two rounds. Composer shows the proposal and its actual check status. The real project remains untouched until the user's existing apply approval.
