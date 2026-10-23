# 30. Box and mirror tools

## What and why

Place lays one block a click, in the cell across the face clicked or on the floor through the grid, and a platform or a laser is a run laid in two clicks with a preview of every cell between ([docs/viewer.md](../docs/viewer.md)).

A floor of ten by ten is a hundred clicks, and a symmetric level is built twice over.

A box tool and a mirror tool were put aside for after the editor shipped.

## Sketch

**A box** is the run's shape over three axes: a first click sets one corner as a block would be laid, the pointer previews the cuboid to the hovered cell, every cell tinted where it may go and red where it may not, and the second click lays it, every cell the brush's kind and nothing on the faces.

The refusals are Place's, the edge and a taken cell, and the checks' caps bite sooner: 123 records is the level, so a box of five by five by five is over it on its own, and the preview counts before the click.

What the game builds of a box is its shell, since a cell sealed on every side has no face built and counts for nothing but a record; whether the tool lays the shell alone, which is what an author means by a box, or the solid, is the first decision.

**A mirror** reflects the level, or the selection, across a plane through the lattice: a cell's coordinate on the mirrored axis goes to 33 minus itself, since the inner lattice runs 1 to 32, the two faces along that axis swap, a facing, a quarter turn about the face's inward normal from the face's first tangent, is worked out again on the reflected face rather than copied, a run's two ends swap and the circuits keep their colours.

The settings record is no cell and the start is one object among the rest, so a mirrored copy laid beside the original has two starts, of which the game takes the last in record order, and the checks say so.

A copy doubles the record count against the cap; a mirror in place does not.

The writer rebuilds the lattice order and the links at every write, so nothing of the reflection reaches the file but the blocks.

Each is one undo step, as every tool's action is.

Open: which plane a mirror takes, through the lattice's middle or through the selected block, and which of the three axes; whether a mirror copies or moves; and what the stone turns hashed from a face's place and the captivators' shared dice, which follow the walk order, do to a mirrored look, which is nothing in the file and something on the screen.

Ruled out: nothing yet.
