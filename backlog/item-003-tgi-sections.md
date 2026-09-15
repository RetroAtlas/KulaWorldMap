# 3. The objects' geometry

## What and why

Drawing the objects as themselves rather than as markers is the largest visual step the map has left. Their meshes are in `/HIRO/HIRO.GGI`, and [docs/ggi.md](../docs/ggi.md) settles the container, the two model tables, that the second table's index is the object type with a row per level of detail and a slot per colour or tier, the model format down to the triangle flag, and that the meshes are vertex-coloured with the shading baked in and carry no textures at all. `tools/kula_ggi.py` reads every model and draws them all on one sheet in their own colours, where each is recognisable: the balls, the wheel, the corkscrew, the stars, the teleporters, the EXIT cross, keys, pills, gems, coins, sunglasses and the five fruit.

```bash
python3 tools/kula_ggi.py --sheet          # out/ggi/models.png, models.md
```

The viewer draws them, from `public/objects.json`, stood on their faces and turning where the game turns them. What is left is what a sitting in the emulator settles.

## What is still to find

1. **Which way a thing on a side face is turned.** The `facing` field is quarter turns on the face, fixed on a block's top by LEVEL 62's arrows in play; on the four sides and the underside the map turns from a tangent it chose, and an arrow on a side face in play would say whether the game's tangent is the same. Whether the wheel rolls along or across its field is the same question.
2. **Where a pickup hangs.** The map sets a model's lowest vertex just off its face. The game's height above the block is not read; in play it is not much.

## Ruled out

The TGI's unread sections as the home of the geometry. Section 5 there is quads for the blocks, and the objects never were in the artwork file.
