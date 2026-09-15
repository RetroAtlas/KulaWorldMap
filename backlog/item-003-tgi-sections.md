# 3. The objects' geometry

## What and why

Drawing the objects as themselves rather than as markers is the largest visual step the map has left. Their meshes are in `/HIRO/HIRO.GGI`, and [docs/ggi.md](../docs/ggi.md) settles the container, the two model tables, that the second table's index is the object type with a row per level of detail and a slot per colour or tier, and the model format down to the triangle flag. `tools/kula_ggi.py` reads every model and draws them all flat on one sheet, where each is recognisable: the balls, the wheel, the corkscrew, the stars, the teleporters, the EXIT cross, keys, pills, gems, coins, sunglasses and the five fruit.

```bash
python3 tools/kula_ggi.py --sheet          # out/ggi/models.png, models.md
```

## What is still to find

1. **The textures.** S6 (100 KB) with S2 and S3 (8 KB each) are the page and its palettes by size, and a texture record's two low bytes are numbers the loader turns into GPU words at `0x80022fd8`. Reading that routine, or matching S6 against the UVs the records carry, gives every polygon its pixels. `tools/kula_tgi.py` has the palette and 4/8bpp machinery to reuse.
2. **Which star is which.** The first table's entries 20 to 24 are the five things that move, types 50 to 56; the wheel, the hexagonal ball and the corkscrew are unmistakable, and the three-pointed and four-pointed stars are types 50 and 52 in an order the disc does not give. The same emulator sitting that names them names their models.
3. **The fruit rule.** Types 43 to 47 are the five fruit in the walkthrough's order, and LEVEL 1's fruit is type 46, the bananas, where the walkthrough finds an apple: in play the fruit shown follows the player's progress. The map can draw the type's own model and say so, or draw the first fruit everywhere; a decision, not a finding.
4. **The viewer.** Objects drawn as sprites pre-rendered per model and view bucket by a small software rasteriser, behind a toggle beside the markers, keeps the page dependency-free and the frame cheap; a WebGL path is the alternative if sprites read badly. Item 9 is this.

## Ruled out

The TGI's unread sections as the home of the geometry. Section 5 there is quads for the blocks, and the objects never were in the artwork file.
