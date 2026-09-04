# 3. The TGI sections nobody has read

**Status:** open · **Effort:** large · **Where:** the disc, plus `tools/kula_tgi.py` and `tools/mips.py`

## What and why

[SPIKE-TGI.md](../SPIKE-TGI.md) settles the container, the VRAM page, the 56 textures, the 96 palettes, the texture/palette pairing and the 119-model table. Sections 0 to 5 and 7 to 9 are unread. Section 9 is 225 KB, the largest after the artwork itself, and the four 2 KB sections at 1 to 4 are suspiciously uniform.

Section 5 and 6 are quads, and a key or a piece of fruit is a solid, so the objects' real geometry is not in the model table. Section 9 is the space for it. Drawing the objects as themselves rather than as markers is what this unlocks, and it is the largest visual step the map has left.

```bash
python3 tools/kula_tgi.py --world HIRO --sections
```
