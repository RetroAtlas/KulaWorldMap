# 9. Draw the objects as themselves

## What and why

An object draws as a coloured diamond with its type number in it. That is honest and readable, and it is as far as a marker can go: the map can say *there is a kind 0 / type 37 here* but not *there is a key here*.

The things have names and, since `tools/kula_ggi.py`, meshes; what blocks it is their textures and a renderer, which is [3](item-003-tgi-sections.md). A per-type glyph drawn by hand was the intermediate before the meshes were read, and is no longer worth the detour.
