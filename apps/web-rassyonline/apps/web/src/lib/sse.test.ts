import { describe, expect, it } from "vitest";
import { ServerEventParser } from "./sse";

describe("ServerEventParser", () => {
  it("survives every byte boundary, CRLF, multiline data, and a final record", () => {
    const bytes = new TextEncoder().encode("event: text\r\ndata: {\"delta\":\"é\"}\r\n\r\nevent: note\ndata: one\ndata: two\n\nevent: complete\ndata: {}" );
    const parser = new ServerEventParser();
    const events = [];
    for (const byte of bytes) events.push(...parser.feed(new Uint8Array([byte])));
    events.push(...parser.finish());
    expect(events).toEqual([
      { event: "text", data: '{"delta":"é"}' },
      { event: "note", data: "one\ntwo" },
      { event: "complete", data: "{}" }
    ]);
  });
});
