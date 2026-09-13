# 4. What tells the five block styles apart

**Status:** resolved 2026-09-13 · **Effort:** small-medium · **Where:** the disc, plus `tools/mips.py`

**Resolution.** The style is the block's kind, and it is the same enumeration a record's kind word uses: 0 plain, 1 fire, 2 ice, 3 invisible. A block with something standing on it keeps its kind in the record instead of the cell, which is why the split looked lopsided: the 70 fire cells go with 62 kind-1 records, the 527 ice with 141 kind-2, the 1065 invisible with 216 kind-3, and each pair clusters in the same worlds. The walkthrough fixed which is which by introduction: LEVEL 35, its first fire, is style 1 and kind 1 and nothing else new; LEVEL 46, its first ice, is 29 style-2 blocks; LEVEL 31, its first invisible platform, is eight kind-3 records. Style 4 is one cell in each copy of `OBJ LEVEL` and nowhere else, so it is catalogue stock; what it is stays open, and the sketch below still applies to it. The viewer draws each kind over its skin and names it in the panel.

## What and why

A lattice cell below `firstRecord` holds one of five styles, and the split across the game is lopsided: 4,517 of style 0, then 1,065, 527, 70 and 9 of styles 3, 2, 1 and 4. `tools/kula_tex.py` derives their textures from models 7 to 11 of the shared table, so the map draws them correctly, but what the numbers *mean* is not decoded: whether they are ice, or breakable, or something the ball behaves differently on.

Nine cells in the whole game are style 4. Whatever that is, it is worth a name.

## Sketch

Find the levels that place the rare styles and look at where they sit; then find the engine's dispatch on the cell value below 5, which is near the level walk at `0x00033f6c`.
