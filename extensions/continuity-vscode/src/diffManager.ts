import * as vscode from "vscode";
import { isSafeWorkspaceUri } from "./assistant/workspace";

import { parseStructuredProposal } from "./proposal";
export interface DiffApplicationResult { applied: boolean; message: string; }

export async function applyDiffWithConfirmation(targetUri: vscode.Uri, serializedProposal: string, userConfirmed: boolean): Promise<DiffApplicationResult> {
  if (!userConfirmed) return { applied: false, message: "Explicit Apply confirmation is required." };
  try {
    const proposal = parseStructuredProposal(serializedProposal);
    if (!await isSafeWorkspaceUri(targetUri)) return { applied: false, message: "Refusing to apply outside the active safe workspace." };
    const actualPath = vscode.workspace.asRelativePath(targetUri, false).replace(/\\/g, "/");
    const proposedPath = proposal.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (actualPath !== proposedPath) return { applied: false, message: "Refusing to apply: proposal target does not match the active file." };
    const document = await vscode.workspace.openTextDocument(targetUri);
    const source = document.getText();
    const index = source.indexOf(proposal.original);
    if (index < 0 || source.indexOf(proposal.original, index + proposal.original.length) >= 0) return { applied: false, message: "Refusing to apply: original text must match exactly once." };
    const edit = new vscode.WorkspaceEdit();
    edit.replace(targetUri, new vscode.Range(document.positionAt(index), document.positionAt(index + proposal.original.length)), proposal.replacement);
    return await vscode.workspace.applyEdit(edit) ? { applied: true, message: "Applied as an undoable editor edit. Save manually when ready." } : { applied: false, message: "VS Code rejected the workspace edit." };
  } catch (error) { return { applied: false, message: error instanceof Error ? error.message : "Invalid proposal." }; }
}