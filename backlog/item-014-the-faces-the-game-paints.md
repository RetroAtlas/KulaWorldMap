# 14. The faces the game paints

## What and why

Checked against the game on 2026-09-16, the map draws its special blocks, and the faces the hazards stand on, from its own hand rather than the disc's. In play a fire block, an ice block, a crumbling block, a vanishing block and an acid block each wear a texture of their own, and the map gives them a wash or a dashed outline over the world's stone. Spikes, moving spikes and lasers emerge from a plate of their own painted on the face (the moving spikes' plate shows four holes when they are down); the clock, type 8, is a clock face painted on the block; none of these plates is drawn. The moving platform is always two blocks long, not one, and wears its own texture, striped at the ends; the map draws it one block and plain, and the texture the map gives kind 4, the block that only OBJ LEVEL places (cell 12,11,17 there), is the platform's, where in play kind 4 is the acid block, green. Invisible blocks, seen through sunglasses, are a pale translucent blue.

Screenshots from play, in `out/shots/` (gitignored, so kept locally): `moving-spikes-up.png`, `moving-spikes-down.png`, `clock-switch-laser.png`, `laser-pair.png`, `acid-and-corkscrew.png`, `fire-and-ice.png`, `invisible-blocks-and-platform.png`, `moving-platform.png`. OBJ LEVEL places one of everything.

## Sketch

Each world's 56 textures are read (`tools/kula_tgi.py --textures`, [docs/tgi.md](../docs/tgi.md)) and the lattice's five styles are drawn from them through `public/tex/blocks.png`; which texture goes on which block face for everything else is the question docs/tgi.md leaves open. Kind 5's record names its two cells in its own fields ([annotations.json](../public/annotations.json)). Needs the disc.

## Ruled out

Nothing yet.
