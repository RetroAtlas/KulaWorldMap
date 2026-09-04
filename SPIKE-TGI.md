# The .TGI files: what is decoded and what is not

Each world keeps its artwork in one `.TGI`, between 628 KB and 664 KB, and the map does not use any of it yet: blocks are drawn in a stand-in palette per world. This is the state of the reverse engineering, so the next attempt starts here rather than from the top.

`tools/kula_tgi.py` is the instrument. The questions left are visual ones, so the tool exists to dump the file and let you see whether a guess lines up:

```bash
python3 tools/kula_tgi.py --world HIRO --profile
python3 tools/kula_tgi.py --world HIRO --grey --start 203072
python3 tools/kula_tgi.py --world HIRO --palettes
```

## Settled

**The header is 400 bytes**, and holds parameters rather than an offset table. Among them are three triples that read as 4096-is-one fixed point: `0.7 0.6 0.6`, `0.9 0.8 0.8`, `1.2 1.1 1.1`. A triple shaped `(a, b, b)` for three brightness levels is what per-face lighting looks like on a cube, where one face catches the light and two are alike. Ahead of them sit two RGB triples in 0..255.

**The pixels are 8bpp indexed, with rows of 64 bytes.** Autocorrelation over the back half of the file puts the strongest period at 64 with a harmonic at 128, and rendering at that stride as greyscale produces flatly legible artwork: hazard chevrons, glowing orbs, brickwork, cobbles, an X, a target, a clock face. Nothing else read the same way produces anything but noise, and 16bpp in particular produces the concentric swirls that mark a wrong depth.

**Palettes are 256-entry BGR555 with bit 15 set on every entry**, 512 bytes each, in one contiguous run per world. Every world has such a run in the same region of the file, holding between 14 and 41 of them.

Smoothness alone does not find that run. Pixel data read as 16-bit values is smooth too, and two large stretches near the front of the file pass a smoothness test while being nothing of the kind, which is what the first pass here got wrong. What separates them is the top bit, set on all 256 entries of a real palette and on none of a false one, together with the count of distinct values: a palette holds 130 to 190, the impostors 17 to 72.

**Pixel data lies on both sides of the palette run**, not only after it. Contact sheets render clean tiles from well before the palettes and from well after.

## Not settled

- **Where the tile array starts, and how it is cut.** Maximising the discontinuity across a 4096-byte boundary puts the phase at 2368 modulo 4096, and sheets drawn on that phase are visibly cleaner than neighbouring ones. But the region does not divide into whole 4096-byte tiles up to the end of the file, so either the tiles are not all 64x64, or the array does not run to the end, or it is one continuous 64-wide strip that individual textures index into. The strip reading is the one to try first, because it needs no tile size at all.
- **Which palette belongs to which texture.** Colouring tile *i* with palette *i* gives believable colours on some and speckle on others, so the mapping is not the identity. There are far more tiles' worth of pixels than there are palettes.
- **How a block's faces reach the atlas.** A record's entity fields include values that recur across the game in a small set (`386`, `256`, `500`, `416`), which is the right shape for a texture or material id, but nothing yet ties one to an offset in the `.TGI`.
- **`HIRO.GGI` and `HIRO.SFX`** exist only for the first world and are not looked at.

## What would settle it

The executable. The lattice was pinned down by disassembling the loader rather than by guessing at sizes, and the same move is available here: find the code that reads the `.TGI` into VRAM, and the tile size, the palette mapping and the id scheme all fall out of it at once. `tools/mips.py` disassembles, and the file is loaded by name, so the string is a place to start.
