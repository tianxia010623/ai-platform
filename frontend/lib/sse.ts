/** Incremental parser for a text/event-stream body made of `data: <json>`
 * events separated by blank lines. Feed it decoded text as it arrives; it
 * returns every complete event and keeps any partial one for the next call. */
export function createSseParser<T>() {
  let buffer = "";
  return function feed(text: string): T[] {
    buffer += text;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    const events: T[] = [];
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        events.push(JSON.parse(line.slice("data:".length).trim()) as T);
      } catch {
        // ignore a malformed event rather than killing the stream
      }
    }
    return events;
  };
}
