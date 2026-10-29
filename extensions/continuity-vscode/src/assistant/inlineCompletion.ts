import type * as vscode from "vscode";
import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, validateOllamaEndpoint } from "../assistant";
import { ensureLocalOllamaService } from "../ollamaClient";

export const MAX_INLINE_PREFIX_BYTES = 4 * 1024;
export const MAX_INLINE_SUFFIX_BYTES = 1 * 1024;
export const DEFAULT_INLINE_TIMEOUT_MS = 20_000;

export interface InlineContext {
  prefix: string;
  suffix: string;
  languageId: string;
}

export interface DocumentLike {
  getText(): string;
  offsetAt(position: any): number;
  languageId: string;
  uri?: any;
}

/**
 * Extracts bounded prefix and suffix around cursor position.
 */
export function extractBoundedContext(
  document: DocumentLike,
  position: any,
  maxPrefixBytes: number = MAX_INLINE_PREFIX_BYTES,
  maxSuffixBytes: number = MAX_INLINE_SUFFIX_BYTES
): InlineContext {
  const fullText = document.getText();
  const offset = document.offsetAt(position);

  const rawPrefix = fullText.slice(0, offset);
  const rawSuffix = fullText.slice(offset);

  const prefixBytes = Buffer.from(rawPrefix, "utf8");
  const boundedPrefix =
    prefixBytes.length <= maxPrefixBytes
      ? rawPrefix
      : prefixBytes.subarray(prefixBytes.length - maxPrefixBytes).toString("utf8");

  const suffixBytes = Buffer.from(rawSuffix, "utf8");
  const boundedSuffix =
    suffixBytes.length <= maxSuffixBytes
      ? rawSuffix
      : suffixBytes.subarray(0, maxSuffixBytes).toString("utf8");

  return {
    prefix: boundedPrefix,
    suffix: boundedSuffix,
    languageId: document.languageId
  };
}

export interface QueryInlineOptions {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  autoStart?: boolean;
}

/**
 * Requests completion from local Ollama endpoint strictly on 127.0.0.1 loopback.
 */
export async function queryInlineCompletion(
  context: InlineContext,
  options: QueryInlineOptions = {}
): Promise<string> {
  const endpoint = options.endpoint ?? DEFAULT_OLLAMA_HOST;
  const validation = validateOllamaEndpoint(endpoint);
  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(validation.error ?? "Security violation: Invalid Ollama endpoint.");
  }

  if (options.signal?.aborted) return "";

  await ensureLocalOllamaService({ autoStart: options.autoStart });
  const model = options.model?.trim() || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_INLINE_TIMEOUT_MS;
  const targetUrl = `${validation.normalizedUrl}/api/generate`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const prompt = context.prefix;
  const suffix = context.suffix;

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          stop: ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "<|endoftext|>", "<|im_end|>"]
        }
      })
    });

    if (!response.ok) {
      return "";
    }

    const json = (await response.json()) as { response?: string };
    return json.response ?? "";
  } catch (err: any) {
    if (err?.name === "AbortError" || options.signal?.aborted) {
      return "";
    }
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export class ContinuityInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private currentAbortController?: AbortController;
  public debounceMs: number = 250;
  public lastDiagnostic = "idle";

  constructor(
    private readonly isEnabled: () => boolean,
    private readonly getModel: () => string,
    private readonly isSafeUri?: (uri: any) => Promise<boolean>,
    debounceMs: number = 150,
    private readonly getAutoStart: () => boolean = () => true
  ) {
    this.debounceMs = debounceMs;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    if (!this.isEnabled()) {
      this.lastDiagnostic = "disabled";
      return null;
    }

    // Cancel any previous in-flight request
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }

    if (token.isCancellationRequested) {
      this.lastDiagnostic = "cancelled";
      return null;
    }

    // Debounce wait
    if (this.debounceMs > 0) {
      this.lastDiagnostic = "debouncing";
      await new Promise(resolve => setTimeout(resolve, this.debounceMs));
      if (token.isCancellationRequested) {
        this.lastDiagnostic = "cancelled";
        return null;
      }
    }

    // Validate safe workspace file if validator provided
    if (this.isSafeUri && !(await this.isSafeUri(document.uri))) {
      this.lastDiagnostic = "unsafe target path";
      return null;
    }

    const abortController = new AbortController();
    this.currentAbortController = abortController;

    token.onCancellationRequested(() => {
      abortController.abort();
    });

    const ctx = extractBoundedContext(document, position);
    if (!ctx.prefix.trim() && !ctx.suffix.trim()) {
      this.lastDiagnostic = "empty context";
      return null;
    }

    const model = this.getModel();
    this.lastDiagnostic = "requesting local Ollama";
    try {
      const completion = await queryInlineCompletion(ctx, {
        model,
        signal: abortController.signal,
        autoStart: this.getAutoStart()
      });

      if (!completion || abortController.signal.aborted || token.isCancellationRequested) {
        this.lastDiagnostic = abortController.signal.aborted || token.isCancellationRequested ? "cancelled" : "no completion";
        return null;
      }

      this.lastDiagnostic = "completed";
      return [
        {
          insertText: completion,
          range: { start: position, end: position } as any
        } as vscode.InlineCompletionItem
      ];
    } catch (err: any) {
      if (abortController.signal.aborted || token.isCancellationRequested) {
        this.lastDiagnostic = "cancelled";
      } else {
        this.lastDiagnostic = `error: ${err?.message ? err.message.slice(0, 50) : "unknown"}`;
      }
      return null;
    }
  }
}
