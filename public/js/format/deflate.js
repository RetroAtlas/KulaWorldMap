// pako's deflate is zlib's own deflate, byte for byte at every level, where the
// browser's compressor is not, and a level fits a slot on the disc or not by
// the byte, so the same bytes must come out in every browser.
import "../vendor/pako_deflate.min.js";

/** A zlib stream of the bytes, at the level given. */
export const deflate = (bytes, level) => globalThis.pako.deflate(bytes, { level });
