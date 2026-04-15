export interface SSEOptions<T> {
  onMeta?: (meta: { traceId: string; provider: string; mode: string }) => void;
  onToken?: (token: string) => void;
  onResult?: (result: T) => void;
  onError?: (error: string) => void;
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
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      let event = currentEvent;
      let data = "";

      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) {
          event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          data = line.slice(6);
        }
      }

      if (!data) continue;

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
          case "error":
            options.onError?.(parsed.message ?? JSON.stringify(parsed));
            break;
        }
      } catch {
        // Non-JSON data, ignore
      }

      currentEvent = "";
    }
  }
}
