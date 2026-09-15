# 3. The objects' geometry

## What and why

Drawing the objects as themselves rather than as markers is the largest visual step the map has left. Their meshes are in `/HIRO/HIRO.GGI`, and [docs/ggi.md](../docs/ggi.md) settles the container, the two model tables, that the second table's index is the object type with a row per level of detail and a slot per colour or tier, the model format down to the triangle flag, and that the meshes are vertex-coloured with the shading baked in and carry no textures at all. `tools/kula_ggi.py` reads every model and draws them all on one sheet in their own colours, where each is recognisable: the balls, the wheel, the corkscrew, the stars, the teleporters, the EXIT cross, keys, pills, gems, coins, sunglasses and the five fruit.

```bash
python3 tools/kula_ggi.py --sheet          # out/ggi/models.png, models.md
```

## What is still to find

1. **Which star is which.** The first table's entries 20 to 24 are the five things that move, types 50 to 56; the wheel, the hexagonal ball and the corkscrew are unmistakable, and the three-pointed and four-pointed stars are types 50 and 52 in an order the disc does not give. The same emulator sitting that names them names their models.
2. **The fruit rule.** Types 43 to 47 are the five fruit in the walkthrough's order, and LEVEL 1's fruit is type 46, the bananas, where the walkthrough finds an apple: in play the fruit shown follows the player's progress. The map can draw the type's own model and say so, or draw the first fruit everywhere; a decision, not a finding.
3. **The viewer.** With no textures to sample, a polygon is a fill in its corners' colours, which canvas 2D does cheaply: the objects can be drawn straight into the scene, back to front with the blocks, behind a toggle beside the markers. Item 9 is this.

## Ruled out

The TGI's unread sections as the home of the geometry. Section 5 there is quads for the blocks, and the objects never were in the artwork file.
