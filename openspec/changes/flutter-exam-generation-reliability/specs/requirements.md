# Requirements

1. If the confirmed exam requires input validation, the kit SHALL detect generated screens missing `Form`, `TextFormField`, `validator` or a validation gate before offering SAVE.
2. The kit SHALL attempt a bounded targeted repair for such screens, reanalyze the result, and report any unmet requirement explicitly.
3. For undefined names, repair prompts SHALL include exact analyzer evidence and real declarations from the current code or project. Automatic substitutions SHALL require a unique safe match; otherwise the unresolved error SHALL remain visible.
4. Code generation SHALL preserve `finish_reason=length` as truncation evidence, strip an unmatched opening Markdown fence, and never insert conversational truncation warnings into Dart source.
5. A known incomplete file (length stop or structural imbalance) SHALL be continued only through a bounded, validated path or flagged clearly; it SHALL NOT be treated as complete input to compile-repair. The user SHALL still be allowed to SAVE after seeing the warning.
6. The kit SHALL keep the two-round model repair ceiling and the user-controlled SAVE decision. It SHALL run without network access.
7. Verification SHALL run at least three repetitions per exam for baseline and changed kit on identical fixtures/settings, report each run and min–max ranges for file and project clean compilation, and distinguish checklist success from compilation. No test may claim app behavior was executed.

