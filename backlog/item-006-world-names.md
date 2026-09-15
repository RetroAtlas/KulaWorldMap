# 6. Names for the ten worlds

## What and why

The sidebar reads `HIRO`, `ATLANT`, `HAZE`, which are the disc's directory names. That is not laziness in the viewer: it is all the game has. The executable's only mention of a world is the path it loads a pack from (`\ATLANT\ATLANT`), verified 2026-09-05 by scanning its strings, so **the disc supplies no player-facing world name at all.**

So this waits on a source outside the disc, which is the whole of the question: the manual, the box, or the name players use. `annotations.json` under `worlds` is where it goes, and the viewer already falls back to the id, so the gap costs nothing until there is something true to put there.

## Ruled out

**Inventing them.** Eight of the ten ids suggest an obvious theme and it would read fine, which is exactly the risk. This project's whole claim is that what it says comes off the disc.

**The PAL manual** (the English scan on archive.org, read 2026-09-15). It calls them "the many continents" and names none.

**The disc's music.** The soundtrack is fourteen tracks in the four XA files under `/XA`, and the game's Discogs entry lists them untitled; the names on fan uploads (Egypt, Hills, Inca, ...) are the uploaders', not the disc's.

**The Cutting Room Floor's Roll Away page** names levels and hidden exits by number and worlds not at all. The Japanese release's ball designer, offered "between worlds", is the one place a world might be named on screen, and nobody has looked.
