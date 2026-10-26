# 33. The cheat for the chosen slot

## What and why

A row of the dialog's first step, The levels, says whose place the level takes and how the game reaches the slot it is going into ([docs/viewer.md](../docs/viewer.md)): a new game starts at the first slot, HIRO's LEVEL 1, the rest of a world's slots take a save that has got that far, which for a level put in HELL's last numbered slot is most of the game away, the finals come once the arcade is finished, and a Simon room's slot is the room Simon mode plays in its world on its first round.

Any level is a cheat away: the game loads a level from three words, the world at `800A340C` and `800A3410` and the slot at `800A3408`, and `python3 tools/kula_warp.py --cheat --level PACK#slot` prints the cheat that sets them, in the form DuckStation takes, with a second cheat that frees the camera ([docs/level-format.md](../docs/level-format.md)).

Printing the cheat for the chosen slot in the dialog was put aside for after the editor shipped.

## Sketch

The words are known and the step that would carry them exists, "Playing it", which already says where each emulator wants the patch: the cheat for each row's slot is three lines the page can write from the slot alone, the world's number in pack order and the slot, as the tool writes them.

What the tool knows and the page would have to: the cheat reaches the world packs only, since the three words name a world and a slot in it, and the finals are reached once the arcade is finished, by the flag at `0x800a3454` ([docs/motion.md](../docs/motion.md)), which the three words do not set, so a draft going into a finals pack gets no cheat; a draft going into a Simon room's slot gets none either, since the rooms' pack is named only in the mode the rooms are played in, 1 in the word at `0x800a33b0` ([docs/tgi.md](../docs/tgi.md)), which the three words do not set; and the PAL release keeps the words at `800A2EA4`, `800A2EA8` and `800A2EA0`, which matters with that disc among the map's three.

Each emulator takes cheats in a form of its own, and the tool writes DuckStation's form; the other emulators' forms are to be read from their documentation, as the patch paths were.

Open: whether the cheat is offered beside the patch for every slot but the first or only where the save would be long in coming, and whether the free-camera cheat goes with it as it does in the tool's output.

Ruled out: nothing; the three words belong to the game, and the dialog can carry them without the tool.
