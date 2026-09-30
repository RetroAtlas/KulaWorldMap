# 12. The Time Trial's par times

## What and why

Time Trial plays the arcade levels against a target time per level, Easy, Medium and Hard, and the manual dares the player to beat the creators' own. Those targets are the one number per level the map does not show beside the time it has, and they are not in the level record: the trailer holds the time, and a cell and two numbers the game never reads, and nothing else on all 230 levels (measured 2026-09-15, `tools/kula_faces.py --kind 666`). So they are in the executable, computed or packed.

## Sketch

A scan of `SLUS_007.24` for a run of 150 plausible seconds as `u16` or `u8` found nothing (2026-09-15), so the table is not laid out that simply; the three difficulties may be one table scaled, or a base time per level with the difficulty applied in code. The way in is the Time Trial menu: find the string it draws the target with, and walk back from the routine that formats it to where the number comes from, with `tools/mips.py`.

## Ruled out

The level file, on every level; a bare table of 150 `u16` or `u8` in the executable.
