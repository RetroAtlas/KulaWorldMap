# 4. What tells the five block styles apart

**Status:** open · **Effort:** small-medium · **Where:** the disc, plus `tools/mips.py`

## What and why

A lattice cell below `firstRecord` holds one of five styles, and the split across the game is lopsided: 4,517 of style 0, then 1,065, 527, 70 and 9 of styles 3, 2, 1 and 4. `tools/kula_tex.py` derives their textures from models 7 to 11 of the shared table, so the map draws them correctly, but what the numbers *mean* is not decoded: whether they are ice, or breakable, or something the ball behaves differently on.

Nine cells in the whole game are style 4. Whatever that is, it is worth a name.

## Sketch

Find the levels that place the rare styles and look at where they sit; then find the engine's dispatch on the cell value below 5, which is near the level walk at `0x00033f6c`.
