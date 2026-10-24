const APPLE = /Mac|iPhone|iPad|iPod/;
const APPLE_NAMES = { Ctrl: "Cmd", Alt: "Option" };

/** `text` with Ctrl and Alt named as an Apple keyboard names them when `platform` is an Apple platform. */
export function named(text, platform = globalThis.navigator?.platform ?? "") {
  if (!APPLE.test(platform)) return text;
  return text.replace(/\b(Ctrl|Alt)\b/g, (key) => APPLE_NAMES[key]);
}
