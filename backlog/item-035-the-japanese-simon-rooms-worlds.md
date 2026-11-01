# 35. The Japanese Simon rooms' worlds

## What and why

The sidebar lists each Simon room under the world the game plays it in on the mode's first round, Hiro's room first, which is a reading of the US executable: its next-level routine steps the world word and the room's slot together from the first, so the k-th room is played in the k-th world on the first round, and the PAL executable does the same ("The Simon rooms" in [docs/motion.md](../docs/motion.md), [docs/tgi.md](../docs/tgi.md)). The Japanese executable, `SCPS_100.64`, holds no such list: its branch picks the next room by the player's progress and a counted word, so the world a room is played in there is open, and the map draws the Japanese rooms, which are the US rooms byte for byte, in the US worlds, as it draws any level the release file does not carry.

## What was read

Read off the Japanese disc with `python3 tools/mips.py --disc "$KULA_DISC_JP" --file /SCPS_100.64 --base 0x8000f800 --at 0x800428c0 --count 131`, and with `--at 0x80042da4 --count 56` for the two routines after the branch, and off the US disc with `python3 tools/mips.py --disc "$KULA_DISC" --file /SLUS_007.24 --base 0x8000f800 --at 0x80041934 --count 4`, and held to the disc by the `EXTRA` rows of `tools/kula_map_hand_jp.py`, which `python3 tools/kula_map.py --release jp` and `--check jp` verify against the executable:

- The branch, `0x800428c0` to `0x80042ac8`, makes the US branch's four tests, of the mode word at `0x8009f4ac` at 1, the level's mode at nothing, the outcome below nothing and the starter word at `0x8009f76c` at 1, and then keeps two tables of halfwords, one by world at `0x800a1f68` and one by room at `0x800a1f90`: it marks the world word's entry and the slot's entry with 1, counts the rooms marked and, once three are, picks no room and leaves the reload word as it stands.
- Under three it takes a word at `0x8009f530`, 1228 past gp, modulo the furthest level reached counted in worlds of fifteen for the world word, steps the world on past the worlds reached, back to the first, and past any world marked in its table, takes the same word modulo 10 for the slot, steps it on past the rooms marked, back to nothing past the tenth, and sets the reload word.
- The word at `0x8009f530` is counted up by one in the level loop (`0x8004184c` to `0x80041858`), between the loop's first and last placed checks with no return between, and no other instruction of the executable stores it by its address.
- The US level loop carries the same counter at `0x8004193c` and `0x80041940` on its word 1264 past gp, `0x800a3428`, which nothing else of the US executable reads or writes by its address, its listing scanned for `1264($gp)`, so the counter is in the US build too and the Japanese branch is what reads it.
- The menu that starts the mode sets the mode word and the starter word (`0x800481c4`, `0x800481d8`) and calls a routine (`0x80048218`, `0x80042da4` to `0x80042e38`) that clears twenty halfwords of each table and seeds the world word and the slot from the same word the same way, with nothing marked to step past, so the first room of a game is picked as the later ones are, where the US mode opens on its first room in Hiro.
- A routine at `0x80042e40` to `0x80042e80` counts the rooms marked and answers 1 where three or more are, which the end screen (`0x80015d4c`) and the menu code (`0x800499b4`) ask where the US tests the slot at nothing; the points' gate there is 3 where the US gate is 6, as the map's tuned rows say.
- Where no world is finished the furthest level reached is under 15, the divisor is nothing and what the processor's `div` leaves as the remainder is not specified, and once the first world's entry is marked the branch's loop over the table by world has no unmarked world under the worlds reached to stop at; what the game shows there is not read.

## Ruled out

A fixed list read off the executable, as the US and PAL builds give one: the Japanese branch steps no world from the first, and the world it picks is a remainder of a counted word by the player's progress, stepped past the worlds already played, so no table of the executable says which world a room opens in.

## What settles it

- What the counted word holds as the menu starts the mode and as each room ends: whether every pass of the level loop counts it, whether anything clears it in a block the listing does not name it in, and what the first rounds of a fresh save show in an emulator, the mode started from the menu with no world finished and again with one; the rooms' order then follows from the reading above.
- What the map should then say of a Japanese room: whether the sidebar's order, which lists a room under the world of its number, and the editor's slot row, which says a room is the one Simon mode plays in its world on its first round, speak for the Japanese disc too, where the room's world is the game's choice.
- Whether `copycat_worlds` in `tools/kula_skins.py`, which reads the path table's order as the worlds the rooms are played in on the first round, should name none for an executable whose branch picks otherwise; the build holds the committed rooms to it, and the Japanese rooms, being the US rooms byte for byte, pass.

Needs the Japanese disc for the reading and an emulator for the rounds.
