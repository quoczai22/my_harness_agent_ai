# Backlog: VS Code extension (`extensions/continuity-vscode`)

State on 2026-11-04: version 0.3.0 is installed in VS Code. It has bundled pdf.js PDF reading, an Attach PDF/Image button, OpenAI key commands, and Ollama auto-start that runs only when Ollama is the configured provider. The extension suite passes 66/66.

Rules for whoever picks an item (Codex or another agent):

- Follow `AGENTS.md`. Every item is its own openspec change, and the user must approve the spec before any code is written.
- `continuity` allows **one active change at a time**. Take items one by one, or work on a separate branch or worktree.
- Items 1, 2, 3 and 5 all touch `src/extension.ts` and `src/sidebarViews.ts`, so do them one after another.
- Never download anything (packages, VS Code, models) without the user's explicit permission.
- Never commit or push without the user's explicit permission.
- Run `npm test` before requesting implementation review, and state what was not verified.
- Scope is the extension only. The ASP.NET (Web-Test1) and Flutter exam kits were dropped; do not propose work on them.

Suggested order: **2 → 1 → 3 → 5**.

## High priority

1. **Switch provider and model from the extension.**
   - A command or status-bar item picks Ollama or LM Studio and a model from the list that provider reports.
   - Start the LM Studio server (`lms server start`) when LM Studio is selected and not running, the way Ollama is started today.
   - Done when switching needs no Settings editing, and model discovery and server start have tests.
2. **Correct the chat sender label.** It is hard-coded to "Ollama (qwen2.5-coder)". Done when it shows the real provider and model.
3. **Check proposals before showing them.**
   - A per-project "check command" setting, for example `dart analyze`, `dotnet build` or `python -m py_compile`.
   - Run it on a temporary copy that includes the proposed change.
   - Feed the errors back to the model for at most two repair rounds.
   - Never write to the project without the user's approval.
   - Done when the proposal shows the check result, with tests using a fake command. This loop is what raised clean-compile rates in the earlier Flutter kit.
4. **Integration tests in a real VS Code** (`@vscode/test-electron`): activation, commands, and the PDF attach path. Downloading the test VS Code needs the user's permission. Done when `npm run test:integration` runs.

## Medium priority

5. **Read scanned PDF pages with the vision model.** Render pages with pdf.js inside the chat webview and send the images to Qwen3.5-2B for transcription. Show the transcription for confirmation before using it as the exam. This is the "later phase" of the approved `extension-builtin-pdf-reading` change.
6. **Load the user's own method.**
   - A per-project `EXAM_RULES.md` or notes file, added to prompts within the context budget.
   - Its rules turned into machine checks where possible.
   - It must work for any language: Flutter, web, Python and so on.
7. **One-folder installer for the extension**, total ≤ 5 GB:
   - contents: VSIX, LM Studio installer, model;
   - one `.cmd` that installs the VSIX with `code --install-extension`, sets the provider and model settings (backing them up first), and starts LM Studio.
8. **Pick the best model within the 5 GB budget.**
   - Score a few candidates on one fixed exam set: coder 7B at Q4/Q3, and Qwen3.5-2B with vision.
   - Measure clean-compile rate, RAM and speed, on 8 GB and 16 GB machines where possible.
   - Downloading models needs the user's permission. The result sets the default model.

## Cleanup and quality

9. Silence pdf.js's `@napi-rs/canvas`, `DOMMatrix` and `Path2D` warnings, and remove the extra blank lines in extracted PDF text.
10. Check the `openaiModel` default `"gpt-6-astra"` (is it a real model?) and decide whether to keep the OpenAI summary path.
11. Rewrite the extension README: install, choose a provider, attach an exam, limits.
12. Add CI (GitHub Actions running the tests). Push the branch and open a PR only with the user's permission.
13. Deferred changes and the work orders in `tasks/active/` (Web-Test1, Lite kits, portable kits): the user decides whether to archive or delete them; the agent only carries out that decision.

## Prompt template (Vietnamese, for the user to paste)

```text
Đọc AGENTS.md và tasks/backlog/extension.md. Làm mục số <N>.
Chỉ sửa extensions/continuity-vscode. Trước khi viết code: tạo openspec change, đăng ký trong continuity và chờ tôi duyệt spec.
Không tải gì, không commit, không push nếu tôi chưa đồng ý. Chạy npm test trước khi xin duyệt implementation và báo rõ phần nào chưa kiểm chứng.
```
