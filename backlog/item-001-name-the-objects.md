# 1. Score the names against the game

The 32 object types and the block kinds are named from Syonyx's Roll Away walkthrough (GameFAQs, 2006, not in the repo), and the names are checked by arithmetic: with the points curated in `annotations.json`, `python3 tools/kula_score.py --guide <walkthrough.txt>` reproduces the walkthrough's maximum score exactly on 185 of the 209 levels it rates, holds more on the other 24, which is what an unreachable coin leaves, and never less. Two names rest on play alone and are unchecked: the coin tiers' colours, and which of the two directional captivator types, 50 and 52, is which.

## Sketch

A sitting in the emulator. `?survey` on the viewer takes down what a level really shows, cell and face, and exports the marks, so a name is scored against the game rather than confirmed by it. `OBJ LEVEL` covers 23 of the 30 types on one floor: `python3 tools/kula_warp.py --cheat` prints the cheat that reaches it, and `python3 tools/kula_objlevel.py` writes its floor plan with the curated name beside each object, to be checked rather than filled in. The seven types the catalogue misses are placed 125 times between them and have to be checked on a real level.

## Ruled out

**Guessing from the field statistics.** `tools/kula_kinds.py` narrows what a type could be but cannot settle it, and a wrong name is worse than a number: the one name that was guessed, a blue coin for type 0, was a bare top face with the object on another side.
