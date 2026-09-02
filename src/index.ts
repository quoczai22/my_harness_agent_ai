#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Store } from "./store.js";

const store = new Store(process.env.CONTINUITY_PROJECT_ID ?? "harness-agent");
const server = new McpServer({ name: "continuity-core", version: "0.1.0" });
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const failed = (error: unknown) => ({ content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true });
server.registerTool("get_status", { description: "Read the active workflow state.", inputSchema: {} }, async () => text(store.getStatus()));
server.registerTool("register_task", { description: "Register the scoped implementation tasks for a change.", inputSchema: { changeId: z.string().min(1), tasks: z.array(z.object({ id: z.string().min(1), description: z.string().min(1), keywords: z.array(z.string().min(1)).min(2) })).min(1) } }, async input => { try { return text(store.registerTask(input.changeId, input.tasks)); } catch (e) { return failed(e); } });
server.registerTool("request_checkpoint", { description: "Request the required human review checkpoint.", inputSchema: { changeId: z.string(), type: z.enum(["spec_review", "impl_review"]), payload: z.string().min(1) } }, async input => { try { return text(store.requestCheckpoint(input.changeId, input.type, input.payload)); } catch (e) { return failed(e); } });
server.registerTool("approve_checkpoint", { description: "Approve or reject a pending checkpoint.", inputSchema: { checkpointId: z.string(), decision: z.enum(["APPROVED", "REJECTED"]), reasoning: z.string().min(1) } }, async input => { try { return text(store.approveCheckpoint(input.checkpointId, input.decision, input.reasoning)); } catch (e) { return failed(e); } });
server.registerTool("check_scope", { description: "Check a proposed implementation action against the active task.", inputSchema: { taskId: z.string(), actionDescription: z.string().min(1), proposedBy: z.string().default("developer") } }, async input => { try { return text(store.checkScope(input.taskId, input.actionDescription, input.proposedBy)); } catch (e) { return failed(e); } });
server.registerTool("set_status", { description: "Advance one permitted workflow transition.", inputSchema: { stage: z.enum(["IDLE", "SPEC_READY", "CHECKPOINT_1", "IMPL_IN_PROGRESS", "IMPL_DONE", "CHECKPOINT_2", "DONE"]), note: z.string(), filesChanged: z.array(z.string()).optional() } }, async input => { try { return text(store.setStatus(input.stage, input.note, input.filesChanged)); } catch (e) { return failed(e); } });
server.registerTool("log_decision", { description: "Append a human or agent decision to the local audit log.", inputSchema: { actor: z.string(), decision: z.string(), reasoning: z.string() } }, async input => text(store.logDecision(input.actor, input.decision, input.reasoning)));
await server.connect(new StdioServerTransport());
