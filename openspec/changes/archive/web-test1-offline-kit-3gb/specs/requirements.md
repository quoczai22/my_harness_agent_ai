# Requirements

1. One portable 3 GB folder runs offline without Ollama. It answers Vietnamese greetings in Vietnamese and preserves Unicode; foreign-language drift is detected separately from encoding errors.
2. Each exercise has an isolated, bounded session that survives restart without a file per turn.
3. The user pastes the exam wording into chat (possibly in parts) and selects a project folder. The kit waits for an explicit end-of-exam signal before drafting, then discovers relevant SQL, simple HTML/CSS/JS mockup, and ASP.NET Core MVC files in that folder without requiring their contents to be pasted. It skips build artifacts and redacts secrets. PDF import, OCR, and image interpretation are out of scope.
4. Before drafting, the kit identifies the real database, table names, primary/foreign keys, columns, and `IDENTITY` from SQL; it does not use fixed Movie/Category names.
5. Draft outputs use `.cshtml` for Razor layout/views, `.cs` for models/controllers with `Microsoft.Data.SqlClient` ADO.NET, and optional CSS/JS. With no supplied layout, the kit drafts a simple Bootstrap/HTML shared layout. With only partial sample pages, it extracts common elements into a new `_Layout.cshtml` and does not assume that file exists. Outputs are written to a separate folder; no source file is overwritten automatically.
6. The kit can check the supplied specification's list/search/create/edit/delete, JOIN-related name, and foreign-key dropdown requirements. It reports unverified items explicitly.
7. Tests cover pasted exam intake (including multi-part input), selected-folder intake at different absolute paths, bundled-spec availability without the original OneDrive path, no-layout Bootstrap fallback, partial-page extraction into `_Layout.cshtml`, Vietnamese behavior, session isolation/restart, variable SQL schemas, HTML-to-Razor output, safe draft export, and build detection. SQL Server/database changes are never executed automatically.

## Minimum user-visible output (revised 2026-10-08)

8. The user may ask for an answer/code directly in terminal chat or name one `.cs`/`.cshtml` file to generate. The file content is shown in chat before an explicit `SAVE` writes a separate draft. No project source is overwritten.
9. The user may attach an existing `.html` or `.cshtml` view by path. If none exists, a layout request produces a simple Bootstrap/HTML Razor view. Source-only .NET 8 MVC/ADO.NET exercise examples guide structure but do not override the actual exam or schema. MVC5 is detected and kept separate.
10. The minimal workflow does not promise a complete project from a single prompt. Build, database, and UI correctness must be reported as unverified unless actually tested.
