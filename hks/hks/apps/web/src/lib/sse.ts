import { trackError } from "@/lib/analytics";

export interface SSEOptions<T> {
  onMeta?: (meta: { traceId: string; provider: string; mode: string }) => void;
  onToken?: (token: string) => void;
  onResult?: (result: T) => void;
  onError?: (error: string) => void;
  // Chat-stream extras — optional so existing callers keep working.
  onActionStart?: (payload: {
    action: string;
    label?: string;
    params?: Record<string, unknown>;
  }) => void;
  onActionResult?: (payload: Record<string, unknown>) => void;
  onDone?: (payload: { disclaimer?: string; followUp?: string[] }) => void;
  onHandoff?: (payload: {
    consultation_id?: string;
    status?: string;
    reason?: string;
    confidence?: number;
    detail_url?: string;
  }) => void;
}

export async function fetchSSE<T>(
  url: string,
  init: RequestInit,
  options: SSEOptions<T>
): Promise<void> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text();
    options.onError?.(text || `HTTP ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    options.onError?.("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  // Carried across blocks so an ``event:`` line at the top of the stream
  // keeps applying to subsequent ``data:``-only blocks (valid per SSE
  // spec). ``processBlock`` only resets this when the block itself sets
  // a new ``event:``.
  let currentEvent = "";

  const signal = init.signal;
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal?.aborted) break;

      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (readErr) {
        // Network dropped mid-stream OR the BFF relay surfaced an upstream
        // error via ``controller.error``. Either way we must notify the
        // caller — returning silently leaves the UI stuck in a "streaming"
        // state forever. User-initiated aborts are treated as clean exits.
        if (!signal?.aborted) {
          const msg = `SSE reader error: ${readErr instanceof Error ? readErr.message : String(readErr)}`;
          trackError({ event: "error", error_type: "network_error", message: msg });
          options.onError?.(msg);
        }
        break;
      }

      if (value) {
        // Normalise CRLF so split("\n\n") and startsWith checks are reliable.
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      }

      if (done) {
        // Flush any bytes retained inside the UTF-8 decoder (multi-byte
        // characters — very common for Chinese — can straddle chunk
        // boundaries and, without this flush, the last character gets
        // replaced with U+FFFD or silently dropped, which then breaks
        // JSON.parse on the tail block).
        buffer += decoder.decode();
        if (buffer.trim()) {
          currentEvent = processBlock(buffer, currentEvent, options);
        }
        break;
      }

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        currentEvent = processBlock(part, currentEvent, options);
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // Already released.
    }
  }
}

/**
 * Parse one SSE block (the text between two blank lines), dispatch to the
 * appropriate callback, and return the event name to use for the *next*
 * block. Per the SSE spec a block without its own ``event:`` inherits the
 * most recently named event, so we only reset when this block sets one.
 */
function processBlock<T>(
  block: string,
  currentEvent: string,
  options: SSEOptions<T>
): string {
  let event = currentEvent;
  let eventSetInBlock = false;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      // Spec allows ``event:foo`` with no space; trim once.
      event = line.slice(6).trim();
      eventSetInBlock = true;
    } else if (line.startsWith("data:")) {
      // ``data: {...}`` and ``data:{...}`` are both valid; strip a single
      // leading space if present but keep any further indentation.
      let val = line.slice(5);
      if (val.startsWith(" ")) val = val.slice(1);
      dataLines.push(val);
    }
  }

  // Per SSE spec, multiple data lines are joined with "\n".
  const data = dataLines.join("\n");
  if (!data) {
    // Empty block (e.g. a keepalive comment or an ``event:``-only frame).
    return eventSetInBlock ? event : currentEvent;
  }

  try {
    const parsed = JSON.parse(data);

    switch (event) {
      case "meta":
        options.onMeta?.(parsed);
        break;
      case "token":
        options.onToken?.(parsed.content ?? parsed.token ?? "");
        break;
      case "result":
        options.onResult?.(parsed as T);
        break;
      case "action_start":
        options.onActionStart?.(parsed);
        break;
      case "action_result":
        options.onActionResult?.(parsed);
        break;
      case "done":
        options.onDone?.(parsed);
        break;
      case "handoff":
        options.onHandoff?.(parsed);
        break;
      case "error":
        options.onError?.(parsed.message ?? JSON.stringify(parsed));
        break;
    }
  } catch {
    // Non-JSON data — surface as an error rather than silently discarding.
    if (data.trim()) {
      const msg = "SSE parse error: non-JSON data received";
      trackError({ event: "error", error_type: "api_error", message: msg });
      options.onError?.(msg);
    }
  }

  // Only reset the carried event when this block explicitly declared one.
  return eventSetInBlock ? event : currentEvent;
}
