# 27. Custom textures for a level

## What and why

Choosing a world is the one texture choice the game offers a level: the ten `.TGI` files are the artwork, one a world, and a level wears the artwork of the world whose pack it lies in ([docs/tgi.md](../docs/tgi.md)).

The editor keeps to that, with `world` the project's one word for the look, and custom textures are a later slice.

A texture of one's own would mean rewriting a world's artwork on the disc and drawing a draft with it in the viewer, and both sides have constraints the artwork's reading settled, so the shape of the feature is known even though none of it is built.

## Sketch

**The artwork on the disc.** A world's `.TGI` is a 400-byte header and eleven sections, the last of them a list of VRAM uploads that the game replays with `LoadImage`; each world ships 56 textures as 64x64 pixels at 8bpp with three smaller levels at 4bpp, 32x32, 16x16 and 8x8, 224 uploads in all, and the renderer draws block faces from the 4bpp levels alone through 16-colour palettes that section 0 fogs by depth, 72 records of 99 palette ids each, while the 64x64 level and its 256-colour palette are what the smaller levels were cut from.

Each texture is paired with three palettes by section 6, one per lighting level, pre-shaded at the header's three fixed-point triples rather than lit at runtime, and the model table of section 5 that says which texture a face draws is byte-identical in all ten worlds, so a custom set replaces pixels under a fixed mapping and never the mapping.

A rewrite therefore takes a 64x64 picture per texture replaced, quantises it to 256 colours for the 8bpp level and to 16 for each 4bpp level, three times over for the three shades, cuts the three smaller levels, rebuilds the palettes parked at VRAM x=768 and the fog rows that section 0's ids point into, and writes the uploads back in the section's order so that the eleventh boundary still lands on the file's end, which is the parser's one check.

The file has to fit the sectors it has, since every file on the disc is followed at once by the next ([docs/disc.md](../docs/disc.md)), or move into `/3.00` as a pack does, with its directory record rewritten in both byte orders; the `.TGI` files run between 628 KB and 664 KB, so a rewrite that keeps every upload's size keeps the file's size too and fits in place.

**The viewer.** The map draws a world's textures from one atlas per world, `tex/<WORLD>.png`, a row per shade and every texture along the row in the order the file lists them, and `atlasFor(world)` is the one seam a face's texture comes through. A draft with textures of its own would carry an atlas built the same way from the pictures the author gave, keyed to the draft rather than to the world, and the hooks the editor already draws through would hand it to the painter in place of the world's; the skins table that picks a texture by index stays as it is, since the indices do not change.

**The project file.** Under the growth rule of [docs/editor.md](../docs/editor.md) the feature adds one optional key with a default on read, say `textures`, naming for each replaced texture its index 0 to 55 and the picture, as a data URL or a file beside the project, and a reader that does not know the key ignores it, so a project with textures still reads everywhere as a level in its world. Nothing of it goes into the level file, which has no word for a texture.

**The patch.** A level with textures is a patch of two files: the pack's sectors as now and the world's `.TGI` rewritten, some 310 to 325 sectors, so the PPF and the xdelta grow from a few kilobytes to the artwork's size, and every other level of that world wears the textures too, since the artwork is the world's and not the level's; the dialog would have to say so.

**Settled** by the artwork's reading: the sections, the upload list and its exact walk, the 56 textures and their four levels, the palette pairing and the three shades, the fixed model table, the depth fog's palette ids and the fades by depth in sections 1 to 4.

**Open**: how the 8bpp level is used, which the renderer never reads for a face and a near view may; what sections 7 to 9 hold, since a rewrite must leave them as they are and cannot yet say what it is leaving; how far quantising to 16 colours a texture and fogging by depth will carry a picture made for a screen; whether a texture may change size, which the fixed upload shapes and the fixed model table say it may not; and whether the console takes a `.TGI` moved into `/3.00`, which only play would settle, as [item 25](item-025-play-checks-for-the-editor.md) lists for the levels.
