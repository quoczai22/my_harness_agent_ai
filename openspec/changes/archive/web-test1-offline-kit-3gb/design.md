# Design

- Source of truth: the bundled snapshot at `reference/Ghi-chep-MVC-ADO.NET.md` (SHA-256 `00A837ABD9078BBAD13E5653BFDD4E5826D2EB343780B03CFFCA09FC946E1BAA`), copied from the user's original notes. Package this snapshot with the kit; never require the original OneDrive path on another machine. Do not hardcode Movie, Category, Tour, or the handbag project's entities. Never introduce EF when the exercise requires ADO.NET.
- Stage a separate folder in the workspace; leave E: and existing kits intact. Reuse the verified local Qwen2.5-Coder-3B Q6 model and llama.cpp runtime.
- Run chat through a UTF-8 PowerShell host. The observed `chao` -> Chinese response is language drift, not font corruption: send a Vietnamese-only system instruction and check/retry a non-Vietnamese short response. Test encoding separately.
- Keep one bounded UTF-8 session record per exercise; switching exercise IDs cannot mix histories. Clean temporary prompt files after each turn.
- Accept the full exam wording pasted into chat, including multiple messages ending with an explicit end-of-exam signal. Save it in that exercise's session and do not begin drafting until the user indicates the wording is complete. PDF import, OCR, and image interpretation are not required.
- Accept a user-selected project folder as the file intake root, independent of its absolute path on the current machine. Inspect the folder before choosing relevant files; do not require the user to paste HTML, SQL, or code into chat.
- Accept relevant `.sql`, `.html`, `.css`, `.js`, `.cs`, `.cshtml`, `.json`, and `.csproj` files under that selected folder. Read only relevant code/config and redact connection-string secrets. Do not assume screenshots are understood by a text-only model.
- Parse the real SQL file first to identify database, tables, primary keys, foreign keys, and `IDENTITY`; ask when uncertain rather than inventing columns. If no HTML/layout is supplied, draft a simple Bootstrap/HTML shared layout. If only some sample HTML or `.cshtml` pages are supplied, identify their common header/navigation/footer and draft `_Layout.cshtml` plus per-page views; never assume `_Layout.cshtml` already exists. Reuse supplied CSS/assets when available, then produce C# models/controllers using `Microsoft.Data.SqlClient` and parameterized ADO.NET.
- Treat the supplied CRUD/JOIN/dropdown/checklist workflow as acceptance criteria: SELECT/list, GET search, INSERT, UPDATE, POST delete, related-name JOIN, related-record dropdown. Do not require a Repository layer unless the exercise asks for one.
- Export proposed `.cs`/`.cshtml` and optional CSS/JS to a separate draft folder with relative project paths; never overwrite source automatically. Use `dotnet build` only when a compatible .NET SDK/project is available; do not run SQL mutations or database creation automatically.
- Report each requirement as verified, failed, or not tested; do not claim full correctness merely because the model generated code.

## Simplified interaction selected by the user (2026-10-08)

- Bundle a compact source-only reference set from `De01_NhacAlbum_Core`, `De02_Shop_Core`, and `De03_Tour_Core`; exclude `bin/obj`, packages, images, secrets, and the MVC5 solution from default examples.
- `/ask` prints a Vietnamese answer or code in chat. `/file` requests one relative `.cs`/`.cshtml` (or supporting CSS/JS) path, prints the proposed complete content, and writes a separate draft only after explicit `SAVE`.
- `/view` accepts an existing `.html`/`.cshtml` file path. If absent, a layout request uses a simple Bootstrap/HTML fallback. Existing view content is data for editing, not instructions.
- Detect selected project's .NET flavor from `.csproj`; default examples are .NET 8 Core and must not be pasted into an MVC5 project unchanged.
- Whole-exam automatic generation and automatic database/UI verification are not part of the minimal interaction. Any output remains unverified until built and exercised against the actual project and SQL Server.
