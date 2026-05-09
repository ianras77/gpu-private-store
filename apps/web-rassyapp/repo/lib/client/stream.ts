export type StreamEvent =
  | { type: "token"; value: string }
  | { type: "final"; value: string; why?: Record<string, unknown> | null }
  | { type: "notification"; message: string }
  | { type: "error"; message: string };

export async function streamChat(
  payload: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
  endpoint = "/api/chat/stream"
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || "Stream failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let lineBreak = buffer.indexOf("\n");
    while (lineBreak !== -1) {
      const line = buffer.slice(0, lineBreak).trim();
      buffer = buffer.slice(lineBreak + 1);
      if (line.length > 0) {
        const event = JSON.parse(line) as StreamEvent;
        onEvent(event);
      }
      lineBreak = buffer.indexOf("\n");
    }
  }
}
