export type ServerEvent = { event: string; data: string };

/** Incremental SSE parser for fetch streams. The caller validates each JSON payload. */
export class ServerEventParser {
  private decoder = new TextDecoder();
  private buffer = "";

  feed(bytes: Uint8Array): ServerEvent[] {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    return this.take(false);
  }

  finish(): ServerEvent[] {
    this.buffer += this.decoder.decode();
    return this.take(true);
  }

  private take(final: boolean): ServerEvent[] {
    const events: ServerEvent[] = [];
    while (true) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) break;
      const record = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const event = this.parse(record);
      if (event) events.push(event);
    }
    if (final && this.buffer.trim()) {
      const event = this.parse(this.buffer);
      if (event) events.push(event);
    }
    if (final) this.buffer = "";
    return events;
  }

  private parse(record: string): ServerEvent | null {
    let event = "message";
    const data: string[] = [];
    for (const line of record.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trimStart();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return data.length ? { event, data: data.join("\n") } : null;
  }
}
