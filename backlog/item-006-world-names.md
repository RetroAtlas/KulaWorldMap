# 6. Names for the ten worlds

**Status:** blocked on a source · **Effort:** small · **Where:** `public/annotations.json`

## What and why

The sidebar reads `HIRO`, `ATLANT`, `HAZE`, which are the disc's directory names. That is not laziness in the viewer: it is all the game has. The executable's only mention of a world is the path it loads a pack from (`\ATLANT\ATLANT`), verified 2026-09-05 by scanning its strings, so **the disc supplies no player-facing world name at all.**

A friendlier name is therefore a curated override needing a source outside the disc: the manual, the box, or the name players use. `annotations.json` under `worlds` is where it goes, and the viewer already falls back to the id, so the gap costs nothing until there is something true to put there.

## Ruled out

**Inventing them.** Eight of the ten ids suggest an obvious theme and it would read fine, which is exactly the risk. This project's whole claim is that what it says comes off the disc.
