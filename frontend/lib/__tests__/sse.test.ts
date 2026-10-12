import { describe, expect, it } from "vitest";
import { createSseParser } from "../sse";

describe("createSseParser", () => {
  it("parses complete events and buffers partial ones across chunks", () => {
    const feed = createSseParser<{ type: string; content?: string }>();
    expect(feed('data: {"type":"delta","content":"Hel')).toEqual([]);
    expect(feed('lo"}\n\ndata: {"type":"done"}\n\n')).toEqual([
      { type: "delta", content: "Hello" },
      { type: "done" },
    ]);
  });

  it("skips malformed events without dropping the rest", () => {
    const feed = createSseParser<{ type: string }>();
    expect(feed('data: {oops}\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: "done" }]);
  });

  it("ignores non-data lines", () => {
    const feed = createSseParser<{ type: string }>();
    expect(feed(': keep-alive\n\ndata: {"type":"done"}\n\n')).toEqual([{ type: "done" }]);
  });
});
