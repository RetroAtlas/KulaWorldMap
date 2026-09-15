# 3. The objects' geometry

## What and why

Drawing the objects as themselves rather than as markers is the largest visual step the map has left. Their meshes are in `/HIRO/HIRO.GGI`, and [docs/ggi.md](../docs/ggi.md) settles the container, the two model tables, that the second table's index is the object type with a row per level of detail and a slot per colour or tier, the model format down to the triangle flag, and that the meshes are vertex-coloured with the shading baked in and carry no textures at all. `tools/kula_ggi.py` reads every model and draws them all on one sheet in their own colours, where each is recognisable: the balls, the wheel, the corkscrew, the stars, the teleporters, the EXIT cross, keys, pills, gems, coins, sunglasses and the five fruit.

```bash
python3 tools/kula_ggi.py --sheet          # out/ggi/models.png, models.md
```

The viewer draws them, from `public/objects.json`, stood on their faces and turning where the game turns them. What is left is what a sitting in the emulator settles.

## What is still to find

1. **Which star is which.** The first table's entries 20 to 24 are the five things that move, types 50 to 56; the wheel, the hexagonal ball and the corkscrew are unmistakable, and the three-pointed and four-pointed stars are types 50 and 52 in an order the disc does not give. `MOVING` in `tools/kula_ggi.py` is the coin toss.
2. **Which way a thing is turned.** The map points a model's `+z` along its `facing` field, so the arrow's tip goes that way and the wheel's axle too, which is one convention for all and checked against nothing. The arrows of LEVEL 61 in play would settle the arrow; whether the wheel rolls along or across its field, the wheel.
3. **Where a pickup hangs.** The map sets a model's lowest vertex just off its face. The game's height above the block is not read.

## Ruled out

The TGI's unread sections as the home of the geometry. Section 5 there is quads for the blocks, and the objects never were in the artwork file.
