// A stream inflated through the browser's own decompressor, a chunk at a time under a ceiling.

export const MOST = 1 << 20;

export async function inflate(bytes, format = "deflate", most = MOST) {
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream(format))
    .getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > most) {
      await reader.cancel();
      throw new Error(`the stream inflates to more than ${most} bytes`);
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
