# The level editor

What the editor's files hold and what its writers put on the disc, reading by reading, with what each rests on.

The project file is the editor's permanent record of a level and this document is its specification, so that a reader outside this repo can read one; the level file is the game's own bytes, and the rules for writing it from a project and reading a project out of any file the game would load are here, with the words the game never reads named and the checks that hold both writers to the disc.

[level-format.md](level-format.md) is where the readings of the game's file come from, and `tools/kula_kwl.py` is the Python writer every figure here was measured with.

## The project file

A project is a JSON document in UTF-8, a byte-order mark passed over, with the extension `.kula.json`.

It spells the game's own structure in the game's own numbers: cells are lattice coordinates with `z` counting down, kinds and types are the numbers the game uses, faces are the game's six.

```json
{
  "format": "kula-world-level",
  "version": 1,
  "title": "Spiral",
  "author": "",
  "notes": "",
  "world": "HIRO",
  "into": "/HIRO/HIRO.PAK#0",
  "from": "/HIRO/HIRO.PAK#3",
  "time": 99,
  "hidden": false,
  "invisibleFromAfar": false,
  "circuits": { "1": "off" },
  "blocks": [
    { "cell": [17, 12, 17], "kind": 0, "faces": { "0": { "type": 30, "facing": 3 } } },
    { "cell": [17, 13, 17], "kind": 0, "faces": { "0": { "type": 37, "variant": 2 }, "5": { "type": 5, "facing": 4, "variant": 1 } } },
    { "cell": [17, 14, 17], "kind": 2 },
    { "cell": [20, 12, 17], "kind": 6 },
    { "cell": [21, 12, 17], "kind": 7, "phase": 1 },
    { "cell": [10, 12, 17], "kind": 5, "far": [10, 16, 17], "length": 2, "speed": 30 },
    { "cell": [10, 20, 14], "kind": 8, "far": [14, 20, 14], "colour": 3 }
  ]
}
```

| key | meaning | default on read |
| --- | --- | --- |
| `format`, `version` | the marker `kula-world-level` and the integer 1; a reader refuses any other marker | the marker is required; a `version` that is not a whole number is read as 1 with a line, and a higher one is read with a line saying the file is newer |
| `title`, `author`, `notes` | the author's, a title of up to 80 characters and the others of up to 2000; the game never shows them | `""`, and a longer text is cut to its most with a line |
| `world` | one of the ten disc ids, `HIRO`, `HILLS`, `INCA`, `ARCTIC`, `COWBOY`, `FIELD`, `ATLANT`, `HAZE`, `MARS`, `HELL`: the artwork, the ball and the music | `""`, which the checks name as an error and the file opener refuses, and a longer text is cut to 2000 with a line |
| `into` | the target slot on the disc, in the repo's `pack#index` form, a world pack's slot 0 to 19 or a finals pack's 0 or 1; the Simon rooms' pack is refused | none, and a longer text is cut to 2000 with a line |
| `from` | where a template came from, the shipped level's `pack#index` | none, and a longer text is cut to 2000 with a line |
| `time` | seconds, which the game multiplies by 50 into its clock | 99 |
| `hidden` | the settings record's type 1: the glass ball and translucent faces | `false` |
| `invisibleFromAfar` | the settings record's `f2` 1: invisible blocks show from afar and fade near the ball | `false` |
| `circuits` | per colour `"0"` to `"3"`, yellow, blue, green, red, `"on"` or `"off"`; a colour not named starts on | `{}` |
| `blocks` | the sparse lattice, one entry per placed cell | `[]` with a line where it is missing or not a list |

A block is `cell`, three coordinates each 1 to 32, and `kind`, 0 to 8: 0 plain, 1 fire, 2 ice, 3 invisible, 4 acid, 5 moving platform, 6 crumbling, 7 vanishing, 8 laser; the settings kind 9 is never a block.

A block of kinds 0 to 4 may carry `faces`, keyed by the game's face numbers `"0"` to `"5"`, top, `+x`, `+y`, `-y`, `-x`, underside, each `{ "type", "facing", "variant" }`.

`facing` is 1 to 4, a quarter turn at a time about the face's inward normal from its first tangent ([level-format.md](level-format.md)), on the types that turn, the teleporter 5, the arrow 28, the two starts 29 and 30 and the captivators 50 to 53 and 56, since the lift at `0x8003b5dc` gives each captivator its heading from the word and the wandering ball's walk follows it.

A wandering ball or a corkscrew with no facing heads as 1 does, which is how the disc leaves most of them, since the captivators' routine at `0x8003f98c` turns for a word of 2, 3 or 4 alone ([motion.md](motion.md)), as do the two stars and the wheel, whose heading comes through the same routine, and so does what the start's routine at `0x80038178` turns, the starts and the teleporter, which turns for the same three words.

The hazards at `0x8003a9a4` lay the arrow's way from its facing by the rule the start follows ([motion.md](motion.md)), and a facing of 0 heads as 1 there as it does for the starts, so every reader of this repo reads a facing of 0 on a type that needs one as 1, with a line saying so.

`variant` is what the type's one varying field holds, the colour 0 to 3 of a teleporter 5 or a switch 9, the tier 2, 1, 0 of a coin 37 for bronze, blue, gold, the cut 0, 1, 2 of a gem 36 for blue, green, red, and the phase 0 to 3 of the moving spikes 11 and the corkscrew 56.

A vanishing block carries `phase`, 0 to 3 on the disc, 4 and 5 accepted as "dims at once".

A platform carries `far`, the other end of its run, `length` in blocks, 2 or 3 on the disc, and `speed`, 30 on the disc, a step the game scales by 50/60 and adds to the position each frame. A laser carries `far` and `colour`. The record's own cell is one end of a span and `far` the other, on one axis, and the span is read from the two whichever is lower.

The writers of this repo write a project the same way, so a diff between two is a diff between levels: blocks in lattice order, ascending `x`, then `y`, then `z`, which is also the game's record order; `facing` only on a type that turns and only where the word is not 0; `variant` on every type that has one, 0 included; `length` and `speed` always on a platform; `circuits` holding only the colours that start off; `from` where there is a source.

A template of a shipped level takes its `title` from the number the pause screen shows, or the disc's name where the game shows none.

**The growth rule.** Keys are only ever added; a published key never changes its meaning or its type; every optional key has a default on read; a reader ignores keys it does not know.

`version` stays 1 for as long as that holds, which is meant to be forever; it exists so that a reader meeting a higher number can say the file is newer than it, read what it knows and warn rather than misread it.

**Reading a project file.** `readProject`, and `read_project` in the tool, refuse a document that does not carry the marker and take everything else, with a report line for every value it could not take as written:

- A key of the wrong type takes its default, so `"length": "3"` is a two-block platform and a `time` that is not a whole number is 99, a whole number being one JSON spells within the 2^53 both readers hold exactly, with or without a point, so a larger one takes the default as a fraction does.
- A `title` past 80 characters, or any other text past 2000, `author`, `notes`, `world`, `into` or `from`, is cut to that many.
- A `type`, `facing`, `speed`, `phase` or `time` past the file's word, -32768 to 32767, is the nearest word the file holds, as is a `variant` on a type whose variant has no range.
- A colour or a variant outside its range, or missing, is 0.
- A platform's `length` whose run reaches past the edge from the run's upper end is the most the edge leaves room for, or 1 where it leaves none, and one below 1 is 1.
- A face key that is not one of the six, a second spelling of a face already named, and a face entry with nothing standing there, a type of 0 or none, are left out.
- A block is left out where it has no cell of three whole numbers and a kind, where its cell lies outside the lattice, where its kind is not 0 to 8, where an earlier block that was kept stands on its cell, or where it is a span with no far end, or one on its own cell, outside the lattice or along no one axis from its cell, since the writer has no bytes for any of these.
- A key the reader does not know is passed over in silence, and a higher `version` is read with a line saying so, which is a note and not a repair, since every value was taken as written, and the one line of this reader's that the count of repairs beside its report leaves out.

Lines of one shape are kept to the first three and the rest counted, as the level reader's are. So the reader leaves out only what has no shape the file can hold, keeps everything that has one, and what comes out is a project the level writer writes, with the checks naming what the game would make of it, a cell past the edge, a type the game does not play or a run over the cap among them.

The one such project the writer still refuses is one with so many records that a link or a pickup number runs past the file's word, and since a link word names at most 2048 records of blocks, the settings record taking none, the file opener and `--from-json` refuse a project whose blocks carry more than that before the writer runs, in the checks' own words for the record cap, so the author reads the count of records and not the block whose word overran; the gate goes by the count alone, so a crowd of that size with no device, which the writer would still write, is refused with the rest.

## What is never stored, and why

Everything the game derives at load or never reads is left out and rebuilt at every write, so that a file cannot carry a stale copy of it:

- The links between switches, teleporters and lasers (a stale one hangs the game or sends the ball into garbage, [level-format.md](level-format.md)).
- The pickup numbers (the loader renumbers everything it walks at `0x80035998`).
- Each device's own state word (a colour turns over as one, so the colour's state is what is stored).
- The header word (unread, [the backlog](../backlog/item-005-the-header-word.md)).
- The trailer's cell and two numbers (unread).
- The sixteen never-set words, the extras and the filler words of every slot.
- Record order (lattice order at every write).
- The beam's cells (the loader writes them at `0x80035a70`).
- A span's direction, axis and end order (derived from `cell` and `far`).
- The crumbling block's copy of its own cell.
- The level type (derived from the key count).
- Names, since names change and numbers do not.
- Any id local to one browser, since a file is a level and not a slot in someone's browser.

## The level file a project means

A `.kwl` is the inflated level exactly as the game loads it, the one form every community tool shares.

`canonical(project)` writes one file for a project and writes it the same way every time, so two writers that agree on the rules below agree to the byte.

**The container.** The lattice of 39,304 little-endian `u16` cells indexed `x*1156 + y*34 + z`, `0xFFFF` where nothing stands, 0 to 4 for a block of that kind with nothing on it, and `5 + i` for the block carrying record `i`; a beam's cells and the rest of a platform's run are left empty, since the loader fills them.

Then the header, an `i32` holding the placed-cell count, which the game never reads, and the `u16` record count, which excludes the trailer.

Then the records, 256 bytes each: every block of kinds 5 to 8 and every block of kinds 0 to 4 with something on a face, in lattice order, then the settings record where `hidden` or `invisibleFromAfar` is set and otherwise no settings record at all, then the trailer. The file is `78614 + 256 x (count + 1)` bytes long.

**A record** is 128 `i16` words: six slots of sixteen at words 0 to 95, the never-set words 96 to 111 at -1, the extras 112 to 124 at -1, and the cell at 125 to 127. A slot's words are the kind word, the type, the fields `f2` to `f12`, a pad, `f14` and a pad. The six slots are the six faces in the order above.

| kind | slot 0 | slot 1 | slots 2 to 5 | extras |
| --- | --- | --- | --- | --- |
| 0 to 4, a bare face | `[K, 0, -1, -1, 0, -1, -1, -1, 0, -1 x7]` | the same with -1 for K | the same | -1 |
| 0 to 4, an object | `[K, type, facing, variant, state, number, next, link, 0, F9, F10, -1, -1, -1, F14, -1]` | the same with -1 for K | the same | -1 |
| 5 platform | `[5, dir, axis, 1, lx, ly, lz, ux, uy, uz, -1 x6]` | `[end, length, speed, -1, 5 + k, -1 x11]` | -1 x16 | words 119 to 121 `512 x cell`, 122 to 124 `256` |
| 6 crumbling | `[6, 1, 512x, 512y, 512z, -1 x11]` | -1 x16 | -1 x16 | -1 |
| 7 vanishing | `[7, 0, phase, -1 x13]` | -1 x16 | -1 x16 | -1 |
| 8 laser | `[8, dir, axis, lit, lx, ly, lz, ux, uy, uz, -1 x6]` | `[-1, 1, -1, -1, 5 + k, -1, colour, next, -1 x8]` | -1 x16 | -1 |
| 9 settings | `[9, hidden, flip, 0 x13]` | 0 x16 | 0 x16 | 0, and the cell `0, 0, 0` |
| 666 trailer | `[666, sx, sy, sz, 0, 0, time, -1 x9]` | -1 x16 | -1 x16 | -1, and the cell `-1, -1, -1` |

`K` is the block's kind in slot 0 and -1 in slots 1 to 5.

A face with nothing on it on a block of kinds 0 to 4 is the bare slot, the form the disc holds on 19,430 of its empty faces, and the game tests only its type 0 and its state 0; the slots a record of kinds 5 to 8 has no use for are -1 throughout, which is what the disc holds on most of them, 32 to 33 of its 37 platforms, 337 to 402 of its 435 crumbling blocks, 40 to 93 of its 98 vanishing blocks and 116 to 117 of its 123 lasers by slot, the rest carrying an editor's leftovers in words the game never reads.

`dir` is the game's direction from the record's cell to `far`, 0 `-z`, 1 `+x`, 2 `+y`, 3 `-y`, 4 `-x`, 5 `+z`; `axis` is 1, 2 or 5 for a run along `x`, `y` or `z`; `l` is the lower end and `u` the upper, lower first on all 160 spans of the disc; `end` is 0 when the record stands at the lower end and 1 at the upper, as on 37 of 37; `lit` is 1 where the laser's colour starts on and 0 where it starts off; `5 + k` is the record's own lattice value, which the platform loader at `0x80032908` writes over its whole run.

`phase` is the vanishing block's; `hidden` and `flip` are the two settings; `sx, sy, sz` is the cell of the start the game takes, or `0, 0, 0` with no start; `time` is the project's.

The trailer's cell words are -1, so every file ends `ff ff ff ff ff ff`.

**The words of an object slot by type.** `facing` is the project's where the type turns and 0 elsewhere; `variant` is the project's where the type has one and 0 elsewhere; `state` is `f4`, the word the draw and contact walks gate on at `0x80039280` and `0x80038580`, so a pickup with 0 there is neither drawn nor collected; `number` is the pickup's, below, and -1 on anything else; `next` and `link` are the links, below, and -1 on anything else; `f8` is 0, the frame the draw command carries; `F9`, `F10` and `F14` are the constants the disc holds for the type, which the loader overwrites or never reads.

| type | what | facing | variant | state | F9, F10, F14 |
| --- | --- | --- | --- | --- | --- |
| 1 fire, 2 ice | paint | | | 0 | -1, -1, -1 |
| 4 acid patch | paint | | | 0 | -1, -1, -1 |
| 5 teleporter | device | yes | colour | the colour's, 1 on or 2 off | 256, 1, 30 |
| 7 exit | device | | | 2 | 500, 1, 30 |
| 8 clock | paint | | | 0 | 256, 0, 0 |
| 9 switch | device | | colour | the colour's, 1 on or 2 off | 256, 0, 0 |
| 10 boost button | device | | | 1 | 256, 3, 0 |
| 11 moving spikes | hazard | | phase | 1 | 256, 0, 0 |
| 12 spikes | hazard | | | 1 | 256, 0, 0 |
| 26 hidden exit | device | | | 2 | 500, 1, 30 |
| 28 arrow | paint | yes | | 1 | 256, 0, 0 |
| 29 start on a clock | start | yes | | 0 | 386, 1, -100 |
| 30 start | start | yes | | 0 | 256, 0, 0 |
| 31 key | pickup | | | 1 | 386, 1, -100 |
| 32, 33, 34 pills, 35 hourglass | pickup | | | 1 | 386, 2, 100 |
| 36 gem | pickup | | cut | 1 | 386, 1, -17 |
| 37 coin | pickup | | tier | 1 | 386, 1, -100 |
| 38 sunglasses | pickup | | | 1 | 386, 1, -100 |
| 42 star | pickup | | | 1 | 416, 0, 100 |
| 43 to 47 fruit | pickup | | | 1 | 386, 1, 100 |
| 50, 51, 52 captivators | hazard | yes | | 0 | -1, -1, -1 |
| 53 wandering ball | hazard | yes | | 0 | -1, -1, -1 |
| 56 corkscrew | hazard | yes | phase | 0 | -1, -1, -1 |

A type not in the table is written with state 0 and the constants -1, which is a slot the game skips.

**The links.** For each colour, the members are its switches and teleporters as `(record, face)` and its lasers as `(record, 6)`, sorted ascending, `M[0]` to `M[n-1]`, and `link(m) = record x 16 + face`.

`next(M[0])` is -1 and `next(M[i])` is `link(M[i-1])`, written to `f6` of a device and to word 7 of a laser's second slot, so the list a switch walks runs down the members from the highest; every switch's `f7` is `link(M[n-1])`. The colour's teleporters sorted ascending, `T[0]` to `T[m-1]`, send the ball round one ring, `f7(T[i]) = link(T[(i-1) mod m])`, a lone teleporter naming itself. This is the rule the disc's 104 switches and 147 teleporters follow without exception ([level-format.md](level-format.md)), and `Level.verify` holds every written file to it.

**The pickup numbers.** Walking the records in order and the faces 0 to 5 of each, the fourteen pickup types, 31 to 38 and 42 to 47, take `f5` of 0 to n-1 and every other slot -1. On the records the game walks the disc numbers its pickups as the writer does on all 228 levels that number them, BONUS 30 having left its thirty unnumbered; a pickup an editor left on a crumbling block, which the game never walks, repeats a number on five levels, and the writer numbers nothing there; the loader renumbers at load in any case.

**Undefined bytes.** A project has no level file, and `canonical` raises rather than invent one, where a cell is not three coordinates in 0 to 33, two blocks stand on one cell, a kind is not 0 to 8, a face key with something standing under it is not an integer or names a face outside the six, one face of a block is named twice, as `"5"` and `"05"` do, a span has no far end or one outside 0 to 33 or runs along no one axis, a platform's length runs past the lattice from the run's upper end or is below one, a laser's colour or a device's variant is not one of the four, or any word is asked for more than -32768 to 32767, the file's range, as a time or a platform's speed can; both writers refuse each with one sentence, and `validate` names each of these as an error first.

## Reading a file the game would load

`read_kwl(blob)` reads what the game reads and repairs what the lattice contradicts, and tells the caller what it did in a report, a line per repair and a line per value it kept that an author should know of, the notes below, with the count of the repairs alone beside it, where lines of one shape, the same words with other numbers, are kept to the first three and the rest counted in one line after them, the count taken before that, so a hostile lattice does not give a report the length of itself.

The game walks the lattice by value and the records by the count, so the lattice is the authority for where a block is and which records exist; the community's files break the parser's rules in ways the game shrugs off, so only one thing is fatal.

- Any length that is the lattice, six bytes and whole 256-byte stretches reads; the stretch count comes from the length, and a header count that disagrees is reported and counted among the repairs, since the game walks the records by that word and the file written back carries the count of the records it holds. Any other length raises.
- The last stretch is the trailer where its kind is 666; otherwise none is there, the time is 99 and the report says so.
- A settings record anywhere among the records gives the two flags, and several give the flags of all of them.
- A record whose cell words differ from the cell naming it is moved to that cell; a cell naming a record that is not there, or that another cell names first, or that is not a block, is left empty; a record no cell names, the settings record apart, is dropped. Each is a report line.
- A span's two ends are read from `f4` to `f9` and sorted lower first; `far` is the end that is not the record's cell, and a record standing at neither end, on the line through the two, is laid from its cell to the upper end, which makes its cell the span's lower end or, where the cell lies past the upper end, its upper, and where its cell lies off that line the far end is laid along their axis through the cell, at the upper end's place or, where that is level with the cell, the lower end's, each reported.
- A span whose two ends are one cell, whose ends lie along no one axis or whose far end lies outside the lattice is dropped and its cell left empty, reported, since the writer has no bytes for the first two and the loader would write past the lattice for the third.
- The direction and axis words are never read.
- A platform's length is cut to what the edge leaves room for from the run's upper end, or to 1 where it leaves none, or raised to 1 from below, reported; its length and speed are otherwise kept, and noted outside 2 to 3 and 30; a vanishing block's phase is kept, and noted at 4 or 5, the notes being the lines that repair nothing.
- Kinds 0 to 4 take an object from every face whose type is above 0, with its type whatever it is, its facing where the type turns and the word is not 0, read as 1 with a line where the type needs one and the word is 0, its variant where the type has one, read as 0 with a line where the word is outside the variant's range; what stands on records of kinds 5 to 9 is counted and left out, since the game never walks it; a record of kinds 0 to 4 with nothing on its faces folds into a plain block of its kind.
- A laser's colour outside the four is read as 0, with a line.
- A colour's state is read from its first device or laser, and a disagreement among them is reported.
- A file whose records are not in lattice order is written back in lattice order, and the report says so where the order decides play: where the file holds captivators, whose dice follow the walk order, or several starts, of which the game takes the last.
- The pickup numbers, the links, the filler words and the header word are never read; where the file's wiring in play, the slots each switch's list reaches and the place each teleporter leads to, read as the cells and faces they name, is not what the colour rule's wiring gives, as a community file left unwired or wired by hand is, the report says the level written back follows the colours; a link word nothing walks, a teleporter's next on a colour with no switch, is not compared, since the community's viewer does not carry it.

## What the game would make of a project

`validate(project, hides)` returns findings, each a level, a text and where it is, a cell and perhaps a face; errors are what the game would mishandle, warnings what an author should know. `counts` gives the figures the caps are read against and `plays_as` the line the editor shows.

Both take `skins.hides` of `public/objects.json` for the face count, and without it, where that file has not loaded, run every other rule, leave the faces and the blocks uncounted, null, and say so in a warning, so a level is never checked less for a file that did not arrive. The two sides give one reading of every project a reader gives them; a document handed to the checks without a reader, which no path of the page or the tool takes, may read apart where a value has a shape no reader passes on.

**Errors.**

- A cell outside 1 to 32, since the face builder at `0x800271d8` walks 1 to 32 and builds nothing beyond.
- Two blocks on one cell.
- A kind that is not 0 to 8.
- Anything on the faces of a block of kinds 5 to 8.
- A face key with something standing under it that is not one of the six, by number or by spelling.
- A face named twice.
- A type the game does not play, which is anything but the 32 types the disc places and the acid patch 4.
- A device, 5, 7 or 9, or the moving spikes 11 on a block that is not plain, since the glow loader at `0x8002977c` and the spikes' init at `0x8002a0b0` take kind 0 alone.
- A `facing` outside 1 to 4, or none on the teleporter, the arrow, the starts, the two stars and the wheel, which the disc always turns, the wandering ball and the corkscrew heading as 1 does with none.
- A `variant` outside its range.
- A laser's `colour` that is not one of the four.
- A `phase` outside 0 to 5.
- A span with no far end, or whose far end is its own cell, lies along no one axis or lies past the edge.
- A platform's run, lower end to upper end plus its length, reaching past the edge, or past the lattice itself, which the checks name apart since the writer has no bytes for it, or holding any block but its own.
- A platform longer than 7 blocks, since the ride at `0x80033810` marks its run in an 8 by 8 by 8 grid at `0x800d4e30` by its length word and an eighth block lands past the row.
- A platform shorter than one block.
- A platform's length or speed outside the file's range.
- A beam crossing a block, or ending on a block that is neither plain nor another laser's, since the loader writes style 0 over both ends and `-2` between unconditionally.
- A platform's run through a beam or over a beam's end, a beam through a platform's run, or a beam ending in another's beam, since the loaders fill the lattice in record order and the last to write a cell has it.
- No start.
- A time below 1 or outside the file's range.
- A world that is not one of the ten.
- A target that is not a world or finals slot.
- A counter over its cap, below.

**Warnings.**

- Several starts, naming the one the game takes, the last in record then face order.
- An object looking into a block, a crumbling or vanishing block or a beam's cell.
- A beam ending on a plain block that carries something, which keeps working but paints plain.
- A hidden exit 26 on a block that is not plain, which the glow loader passes over and the game has not been seen to take.
- A level with no key, which the game draws with the bonus artwork, placing a block or a face that artwork has no picture for, the fire, ice and acid blocks, the moving platform's four textures and the fire, ice and acid paint, the exit, the clock, the start on a clock and the fruit, whose models in the second set are the placeholder texture ([tgi.md](tgi.md)), named in the warning by their annotation names, and which no keyless level of the disc places.
- A platform's speed other than 30 or length outside 2 to 3.
- A time above 99, which the clock has never been seen to show.
- A phase of 4 or 5.
- A colour that starts off with teleporters or lasers and no switch to turn it on.
- A lone teleporter leading to itself.
- A switch whose colour has nothing to switch.
- A key with no exit, hidden or not.
- The star 42, untested in play.
- A counter above the disc's own maximum, below.

| counter | what is counted | cap | most on the disc |
| --- | --- | --- | --- |
| records | blocks that carry a record, the settings record included | 123 | 75, LEVEL 126 |
| cells | placed cells | | 178, HIDDEN 10 |
| faces | the faces the game builds, below | 768 | 766, HIDDEN 10 |
| blocks | blocks of kinds 0, 1, 2, 4, 6 and 7 inside 1 to 32 with a face built, the ones a keyless level scores | 256 | 178, HIDDEN 10 |
| objects | what the loader numbers, the devices, the two spikes, the arrow and the pickups, types 5, 7, 9 to 12, 26, 28, 31 to 38 and 42 to 47, so not a start, a clock or paint | 255 | 81, LEVEL 148 |
| platforms | | 8 | 4, LEVEL 75 |
| lasers | | | 12, LEVEL 149 |
| vanishing | | 64 | 14, LEVEL 77 |
| crumbling | | 64 | 33, BONUS 22 |
| captivators | types 50 to 56 | 32 | 12, SIMON 6 |
| keys | | | 4 |
| lights | teleporters, switches and exits, the three that cast a light when on | 32 | 19, LEVEL 136 |
| spikes | the moving spikes | 64 | 19, LEVEL 43 |

The caps are the room the game's memory holds, unchecked by the game:

- The level's record table runs into the frame buffers at `0x80179000` after 123 records.
- The 160-byte face structs at `0x80191000` run into the per-cell table at `0x801af000` after 768.
- The 48-byte object entries at `0x800c8c78` run to the frame flag at `0x800cbc78`, 256 of them, and the loader zeroes the next entry's word before it reads each face, so the 256th object has the loader write past the table.
- The light maker at `0x8002e418` searches the 32 entries of the list at `0x800df184` for a free one and, finding none, falls through and writes the 33rd light past the list.
- The moving spikes' init at `0x8002a078` appends every type 11 on a plain block to the list at `0x800d655c`, which has room for 64 before the next table.
- The captivators' 180-byte entries at `0x800ba3dc` run to the next table after 32.
- The crumbling and vanishing blocks' index lists at `0x800a5668` and `0x800a576c` hold 64 each before the tables that follow them.

The caps on platforms, 8, and on the blocks a keyless level counts, 256, are conservative choices with no traced table behind them. The instructions these figures rest on, with the loader's kinds below 5, its types 5 to 47, the glow loader's three types, the key's type and the face builder's 1 to 32, are listed in the tool in the shape `tools/kula_skins.py` checks its readings, and the disc test and the build both read them off the executable and hold the caps, the length cap and the type constants to them, naming the two caps they cannot, so a stale figure fails a rebuild as it fails the test.

The faces are counted as the loader builds them, replaying `skins.hides` of `public/objects.json` ([tgi.md](tgi.md)) over every block inside 1 to 32, a beam's two ends standing plain blocks first: a face toward a neighbour of a kind the block's kind hides behind is not built, except that a kind outside the table's own list is built unseen toward a crumbling block, a laser's own cell hides like the plain block the loader has made of it, which, with the ends standing plain blocks, is read off the loader at `0x80035a70` and untested in play, since no keyless level of the disc outside the Simon rooms, which score nothing, has a laser, and a platform's blocks take their faces from the loader's tables, six on a lone block and five, four and five along a run.

HIDDEN 10 comes to 766 by that count, and one more plain block in the open takes it over 768.

**Plays as.** "Plays as an arcade level." where a key stands on a block of kinds 0 to 4; "Plays as a bonus level since it has no key." where none does, by the loader's count at `0x80027b2c`; "Plays as a hidden level, with the glass ball on half-seen blocks." where `hidden` is set; and "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks." for a hidden level with no key.

## The drafts a browser keeps

The browser store is a convenience and the exported file is the record; the viewer's "Your levels" says so under its rows.

### The store

`public/js/editor/drafts.js` keeps the drafts under `localStorage["kula.drafts"]` as `{ "version": 1, "next": n, "drafts": { id: { "doc", "updated", "saved", "edits" } } }`: `version` is this version's 1, or the higher number the store was found with, `doc` is a project as the file holds it, `updated` the time of the last change, `saved` the time of the last save to a file or null, `edits` the changes since that save, counted as below.

Ids are whole numbers taken from `next`, which only ever grows and is never taken past the largest integer the language holds exactly; a store that has reached it makes no more levels and says so.

The reading, writing and merging of the store's text is `public/js/format/store.js`, which touches neither the page nor storage, and `public/js/format/held.js` holds the store's key and the shape an entry has to have to count as a draft, an object whose `doc` carries the format's marker and a list of blocks, which the store's reader uses as its first gate and the page's boot reads off the store's text, without the editor, to decide whether the editor loads at the start.

### A draft as a level

A draft is drawn as `toLevel(doc, id)`, a level whose pack is `/DRAFT/DRAFT.PAK` and whose index is its id, so its permalink reads `#DRAFT/<id>/...` with no change to the link's grammar, and a module registered as a level source answers that slot on the device holding the draft; a link to an id no entry here names falls back as any unhonoured hash does and says, in one toast, that the level is kept in another browser.

The boot fetches the editor when the store holds an entry of a draft's shape under a key that is an id, and otherwise not, once the map has drawn its first level unless the link names one of those drafts, which has nothing to show before the editor is up and waits for it, so a `#DRAFT` link to a level this browser does not hold fetches none of it.

A hashchange to a `#DRAFT` link after a plain boot loads the editor when the store holds that draft and shows it once the editor is up, putting the link back in the bar where the fallback had moved it, and otherwise gives way as an unknown link does, fetching nothing.

### The card and a new draft

The card's title field takes at most 80 characters, and its time field a whole number of seconds from 1 to 32767, the range the file's word holds, saying so in a toast when it keeps the old value; the checks warn above 99 rather than refuse.

`new` emits `edit-wanted` once the new draft is open, for the editor to turn its mode on; a copy and an opened file leave the mode as it is.

### Reading the store

The store is read once at boot, through the same `readProject` the file importer uses: a store that does not parse is an empty one, and an entry whose key is not a positive whole number in the number's own spelling, so that `01` and `1e3` name nothing, that has not a draft's shape, whose document throws in the reader or in the writer, or that names a world that is not one of the ten, is never drawn but stays in storage as it is, under its own key, a key the language reserves included.

One of them whose key is such a number and that has a draft's shape, the format's marker and a list of blocks, still makes the editor load at the start, since the boot reads the keys and the shapes and not the readers, and any other does not; such entries are counted into one toast per browser session, and into a row of "Your levels" that offers to remove them, which asks to be pressed again, a removal the next write carries and another tab's copy arriving before it does not undo.

A repair the reader makes to a stored document at boot is silent and the draft's saved mark stands, where the importer says what it repaired.

A store whose `version` is higher than this one's is read for what this version knows and written back under that version, with the entries this version does not know.

### Writing the store

A browser whose storage throws on read keeps the drafts in memory alone and says they live until the page is closed; one that refuses a write for want of room, told by the error's name, says it gives the map no room to keep levels while nothing of the map's is stored yet and that it is full once levels are, and one that refuses a write for any other reason says plainly that it could not keep the levels just now, each once per streak of failures, not at every keystroke.

Writes wait 300 ms after the last change and are flushed on `pagehide`, on `visibilitychange` to hidden and through `flush()`, which an export calls first, and every write first merges the stored copy where it is not the text this tab last read or wrote, as a page shown again from the back-forward cache (`pageshow` with `persisted`) or thawed (`resume`) does, since either may have missed another tab's writes.

A `storage` event for the key from another tab merges that tab's copy: per draft the later `updated` wins, and at one `updated` the larger text, the document as the project writer writes it with the save time and the count, so that two tabs settle on the same copy.

A draft changed here since the last write is kept until that write, one deleted here is not taken back unless it never reached storage, in which case it is simply forgotten and a level of theirs under its id is taken as theirs, and a draft of theirs under an id this tab handed out and never wrote is a level of its own, so this tab's draft moves to a fresh id with its steps and, where it is on screen, the view, and a toast says so, or, where the store has no id left to give, the two are settled by the later change like any other pair.

### Changes and steps

`edits` counts the changes since the last save: a step adds one, undo takes one away and redo adds it back, a run of title letters typed within a second of each other counts once, or not at all where it ends where it began, and the count never falls below zero.

The store never reads the `kula.survey` key an earlier notebook left in some browsers.

The steps a draft took, which undo and redo walk, live in the editor's memory alone (`public/js/editor/trail.js`): one step a user action that changes the document, as `same` in `public/js/format/project.js` compares two, so one that leaves it as it was takes none, with a cap of 200, title letters typed within a second of each other coalescing into one step so that a pause starts another, and a run of them that brings the document back to where its step began taking the step away, never stored, never in a file, and dropped when the draft is deleted or another tab's copy of it is taken.

## Files

A draft saves as `<slug>.kula.json`, the project file `writeProject` writes, or as `<slug>.kwl`, the canonical level `writeKwl` writes; the slug is the title composed to NFC and in lower case, with every run of anything but letters, their marks and digits as one hyphen, cut to 60 characters, trimmed of hyphens, and `level` where nothing is left, so a copy of `LEVEL 1` saves as `level-1.kwl`.

Either save flushes the store first and then marks the draft saved, `saved` the time and `edits` 0, so its row counts the changes since.

`public/js/editor/files.js` opens a file by what it holds, never by its name, in the order "Levels from elsewhere" below gives:

- The map's own file is read by `readProject` and refused where its world is not one of the ten.
- The game's level is read by `readKwl` in the world on screen and titled by the file's stem.
- A pack, a disc image or a level of the community's viewer is read as that section says.
- JSON that is neither the map's file nor the viewer's is refused, as is anything the order places nowhere.
- A project whose blocks carry more records than a link word can name is refused in the checks' words for the record cap, and a document the writer cannot write with the writer's reason.

Every open makes a new draft marked saved, since the file is the record, and the reader's report shows as one toast, the line itself where there is one, the count of repairs where there are more, or that the level was read with notes where no line is a repair, and in full in a fold at the top of the Level card, under the same count or the same words, until another draft is shown.

The read and the draft are one rule in `public/js/editor/intake.js`, which the sidebar's `open a file…` and `paste a link…` and the disc box's `a file…` share: `readLevel` reads a file through `readLevelFile` in the world on screen and says a refusal in one toast, and `draftOf` makes the draft marked saved and says the report, so a level from elsewhere becomes a draft the same way wherever it is opened from; the sidebar then shows the draft with the fold, and the box adds its row and leaves the map where it was.

## Onto the disc

A draft is exported to the disc by `public/js/editor/patchdialog.js`, which takes a list of drafts, a row each, and places them as one patch: opened from a draft's card it lists that draft, a select under the rows adds any other draft this browser holds or, by its last entry, a level from a file, read as the sidebar's `open a file…` reads one through `public/js/editor/intake.js` and made a draft marked saved, a pack's or an image's question asked in the box's place and the box opened again once it is answered or declined, and a row's `take out` drops it, as `take all out` drops every row.

The rows, the image and its plan live as long as the page: the box opened again holds what it held when it was closed, with a row added for the draft it is opened for where none holds it and the rows whose drafts went meanwhile dropped without a word, and plans again over the image it holds rather than reading it again.

It refuses nothing but errors: a project with any error from the checks below is shown its errors and gets no patch, warnings go in a fold and stop nothing, and a project the writer cannot write is refused with the writer's reason.

### A row's slot

A row's target is its project's `into`, a slot of a world pack or a finals pack in the `pack#index` form, chosen in the row from `public/packs.json` with the Simon rooms' pack left out, shown as the project's `into`, else the slot `guessSlot` in `public/js/editor/slotguess.js` reads out of the title, else its `from`, else the first slot no other row takes, and written to the draft through `setMeta` only when the author changes it, so the file carries a target the author chose and never the dialog's default or its guess.

A draft has the one `into`, whichever patches it is placed in, and its row shows it.

`guessSlot(title, listed, taken)` is pure, over the pairs of key and title the row's select lists, the pause screen's names with the Simon rooms left out, and never names a key in `taken`: the slot whose title is the draft's title, case aside and with the whitespace trimmed and collapsed; else the one whose title stands in the draft's title as whole words, the longest where several do, so that `My LEVEL 101 remix` names LEVEL 101 and not LEVEL 10; else the one titled `LEVEL n` for the first number in the title, or `BONUS n`, `FINAL n` or `HIDDEN n` where that word, in any case, stands before the number; else null.

The rows settle in passes, every `into` first, then the guesses in row order, each over the slots no row has yet, then the `from`s, then the free slots, so a guess never takes a slot chosen for another row, whichever row is first.

Two rows naming one slot are an error under the rows, in the checks' words, and the patches wait until a slot changes; a row on a slot an earlier row takes is not fitted and shows no fit.

### The fit and the patches

The fit is worked out twice:

- Before the image is given, and after it while the rows cannot be placed as they stand, two on one slot, one with no slot or one the writer refuses, from `public/packs.json` alone through `fitAll(pack, items)` over each pack's rows in row order, each with the length of the level's zlib stream at level 6, the level the disc was packed at, and its length at level 9, which decides each path and the bytes to spare from the slot's record, the name the slot would take from the title, the pack's capacity and the other records' lengths as stored and recompressed, as the rows above leave them, and is never optimistic since a rebuilt pack's name table never grows.
- Once the image is read, through `planAll` over the image itself, inflating with the browser's `DecompressionStream`, and `verifyAll` over the patched image, which gives the same paths and room where the image is the disc's and the truth where it is not, whose warnings about an image that is not the disc's are shown once and stop nothing, and whose refusal is shown on the row of the first level the image will not take, the rows above it keeping their fits.

The patches are then the bytes of [disc.md](disc.md): the PPF with the description `Kula World Map: <title>`, the titles of several joined by commas, the VCDIFF, and the patched image as the original's slices with the written sectors between them, each named `<slug>` with its extension, or `<slug>-and-<n>-more` after the first row's title and the count of the others, and each download flushing the store first.

## Levels from elsewhere

`readLevelFile` reads a file by what it holds, in one order, and never by its name:

- A file of whole 2352-byte sectors with the volume mark at sector 16 is a disc image, sniffed first so that one handed over as a file is read a slice at a time rather than whole.
- Text that parses as JSON is the map's file where it carries the marker and the community viewer's level where it has `blocks` at `pos` and a `time`.
- Bytes whose first word counts 1 to 32 slots whose table, records and NUL-ended names all lie within the file are a pack.
- A length that is the lattice, the six header bytes and whole records is the game's level.

Anything else is refused.

A pack asks which slot to open, each named as the pack names it, and the chosen record is inflated with the browser's `DecompressionStream` and read by `readKwl` in the world on screen, since a pack's bytes do not say which world they are from, titled by the slot's name or the file's stem; a browser that cannot inflate is told it needs a newer one.

A disc image is walked as the patcher walks it, a slice at a time where it is handed over as a file, and lists the packs it holds, the 21 the disc has and any other `.PAK` the walk finds, then the slots of the chosen pack, each titled as the pause screen titles the shipped level that lies there and by the pack's name otherwise; the chosen record is read in the world of the pack's directory, and in the world on screen for a pack from elsewhere. Declining either question opens nothing and says nothing.

Every file opened this way makes a new draft marked saved, as the map's own file does, with the reader's report in the card's fold.

### The community's viewer

The community's Saturn viewer, orbit, keeps a level as JSON of blocks, and the same level in a share link.

In the JSON, `type` is the game's kind, `pos` is the game's cell `(x, y, z)` written as `(x, 33 - z, y)`, and a block of kinds 0 to 4 carries six `items`, one a face, each the slot's words under the viewer's names, `id`, `option`, `variant` and `state` for the type, the facing, the variant and the state, with `route` and `to` for the two link words on a teleporter or a switch, 65535 where the file holds -1, and `null` where the link leaves a slot empty; a block with no item is the lattice's own and a block whose items are all bare is one too.

A platform carries `from`, `to` and `start` as the game's points with `y` and `z` swapped and no flip, the last times 512 as the file has it, with `movement`, `orientation`, `length`, `speed` and `id` for the words the file holds under those meanings; a vanishing block carries its record's first eight words as `intervals`, the phase second; and a laser carries `from`, `to`, `orientation` and four words named `length`, `speed`, `variant` and `state` that are really whether it starts lit, its own lattice value, its colour and its next link, so they are mapped by position rather than by name.

`hidden` and `reverse` are the two settings, `reverse` the invisible-from-afar flag, each read as true or false, anything else said in the report and taken as false, and `time` the clock.

`public/js/format/orbit.js` reads a level by laying every word back into the game's file, the records in the order the blocks come and the lattice naming each, and reading that with `readKwl`, so one reader decides what a level means and the repairs above apply to the viewer's files as to any other; a block outside the lattice, a second block on a cell or a kind the game has not is left out first, with a line in the report.

Of the viewer's 203 level files, 169 read back to the canonical bytes of a shipped level and the rest to no level of the disc's, and `tests/fixtures/orbit-levels.json` holds five of the 169 with the slot each is, lasers, a platform, devices and the flag among them, so the axes and the laser words are held to the disc.

The share link carries the level as text, a header of `time|hidden|reverse` and a line a block, every number in base 36 with `~` for 65535 and `_` for an empty slot, gzipped and written in base64url without padding under `level=`, with the viewer's theme under `theme=`; `readOrbitLink` takes a whole URL, a query or the bare value, refuses a value that is only digits, which names one of the viewer's own levels, reads the level in the world `theme` names where that is one of the disc's and the world on screen otherwise, saying so where it is not, and `readLevelText` titles it Shared level.

The link is pasted into the box the sidebar's `paste a link…` opens, which reads it in the world on screen, shows the reader's refusal under the field and keeps the field for another paste, and the result is a new draft marked saved, as a file's is. The fixture holds the link the viewer's own encoder makes of each of its five levels.

## The palette

`public/js/editor/palette.js` builds its rows from the data rather than from a list of its own:

- The kinds of block are the kinds below the settings record apart from the spans, named by the annotations' kind names, and the things are the set the disc places (`PLAYED` in kwl.js) less type 4, which is untested in play, with the five fruit folded into one row writing type 46.
- A type the legend tells apart by a field (`objectId` splits it) has a row per variant from `VARIANTS`, keyed as the legend keys it, so the eyedropper finds a row by the same id.
- The groups are rules, not lists: the pickups by `PICKUPS`, what paints a face or starts the ball, then the hazards by the annotations' flag, and the rest as devices.

The spans have rows of their own in the Blocks group, one for the moving platform and one laser row per colour, keyed `k8/<colour>` since the legend keys every laser as the one kind `k8`, and named `Laser (<colour>)` with the colour's word taken from the annotations' switch variants through `circuitName` in `public/js/viewer/data.js`, the bracketed part of the variant's name trimmed of its spaces, or `Laser (circuit 2)` by the circuit's number where the variant has no word, or nothing in its bracket but spaces, as the checks name a circuit without one, so that the palette invents no name of its own.

`idOf` names a fruit of any of the five types by that row, so the eyedropper and the form's list find a fruit wherever it came from; a thing the palette has no row for, type 4 among them, stays in the form's list as a disabled entry named as the panel names an unnamed type, by its number, and can be taken off but not chosen anew.

## The form

`public/js/editor/editform.js` is the panel's form while editing, drawn through the one seam the panel has, `onShow(fn)` in `public/js/viewer/chrome/detail.js`, which calls what is registered after every rebuild of the panel with the box and the cell it shows; the panel itself has no editor branch, and the form draws only while editing is on and the cell is a block of the draft, or a cell of a span's run, which gets the span's block.

### The controls

Every control changes one key of the project through the copy-on-write functions and one step of the trail, labelled as the editor's announcements read:

- The kind select writes `kind` through `setBlock`, keeping `faces` for a kind of 0 to 4 and dropping them for a crumbling or vanishing block, which the label says.
- The phase select writes `phase`.
- A platform's length and speed fields write `length` and `speed`.
- A laser's swatches write `colour`.
- The face's list writes `faces[j]` as `{ type, variant, facing }` with the palette's entry for the type and variant, a facing kept from what stood there or 1, and nothing in the list removes the key.
- The facing buttons write `facing`, labelled by the way the thing then points, read through the same heading rule the panel uses.
- The colour, worth and phase swatches write `variant`.
- The pressed facing button or swatch, which stands for what the face holds or for the value an absent key is read as, writes nothing.
- The circuit row's button, which a face holding a switch or a teleporter and a laser's block show for their one colour, with the count of the switches, teleporters and lasers of it, writes `circuits` through `setCircuit`, as do the four Circuits rows of the Level card in `public/js/editor/draftlist.js`, one per colour, built once with the card and brought up to date at every update of the draft, so a colour's starting state is set beside the level's other settings.

A teleporter's "leads to" and a run's axis and far end are shown and not edited, since the links are rebuilt at every write and a run is re-laid with the tool.

The refusals are the editor's, by the same conditions: a device on a block that is not plain, anything on a span's, crumbling or vanishing block's faces, a face that looks into another block, and any change the checks newly flag as an error, found by validating the changed copy, after which the control goes back to what it showed; a Length or Speed the browser cannot read as a number is put back with the form's own sentence, that it must be a number, and an emptied one in silence, as is one that rounds to what the block holds, which takes no step.

### The buttons and the brush

The two buttons place through the editor's own `placeHere` and `buildAgainst`, which the editor hands the form when it wires it, with `holdsBrush`, whether a face holds what Place would put there as the game reads the two, a facing left out heading as 1 and a variant left out reading as 0, since a copy of a shipped level spells out what the palette's brushes leave out, so the keyboard path and the pointer's are one rule and the form imports nothing of the editor's.

The form learns that the mode or the brush changed through events the editor emits, and its Place button names the brush, is greyed with `aria-disabled` where `holdsBrush` finds the face holding it already, so that it keeps the focus its own press leaves on it and a press says the refusal, and is left out for a platform or a laser, whose run is laid on the map in two clicks.

### The overview on the level line

How the level plays, its counts against the caps and the disc's maxima, `validate`'s findings and one of the overview's own, the things the ball takes that no walk from the start reaches, by `reachable` of `public/js/viewer/walk.js` over the planner's probe, named keys first with where each stands, through `typeWord` and `listed` of `public/js/format/project.js`, the words `validate`'s own findings name a type and a list by, a face that looks into another block left to `validate`, and said to count no jump, teleporter, platform, ice or fall, are the level line's rather than the panel's.

`public/js/editor/overview.js` registers with the chip's one seam, `noteWith(fn)` in `public/js/viewer/chrome/navigate.js`, which asks what is registered for the note of the level it shows and falls back to the level's own, so a shipped level's note is untouched and a draft's carries the overview, built again with the chip at every update of the level, each finding linking to its cell through the panel and, while it holds the focus, found again by its `data-field` in the note built after the edit.

The note floats over the map, so the counts and the findings stand under one summary line that tallies the errors and the warnings, a `details` element open where the sidebar stands beside the map and closed where it overlays it, by `sidebarOverlays` of `public/js/viewer/chrome/sidebar.js`, until the author opens it, which is kept for the session.

The plays-as sentence stands whole above the fold, since it is what tells an author what a level with no key does, and the counts line holds every capped counter, those at nought dimmed, since a counter that appears only once it is above nought reads as a surprise, leaving out only the faces and the blocks where `counts` has them uncounted, null, for want of the face count.

### The focus, the face and the helpers

The control being worked is found again by its `data-field` after the panel is rebuilt by the store's update, and the chosen face survives the update, undo and redo through the funnel's own keep, so the focus and the face stay where the author is.

The sentences and helpers the tools and the form both use live in `public/js/editor/editing.js`, the refusal sentences, the words a label is built from, the draft on screen, the checks a change is held to and the span a cell belongs to, so the two import it and never each other.

## The checks

**The digest fixture.** `tests/fixtures/kwl-digests.json` holds, for each of the 230 shipped levels keyed by `pack#index`, the SHA-256 of its canonical file rebuilt from `public/map_data.json`, the SHA-256 of that file's zlib stream at level 6, the level the disc was packed at, and at level 9, the level the layout fit and the image fit meet on, and the level-6 stream's length, under the version of the zlib that wrote them.

`python3 tools/kula_kwl.py --digests` writes it, sorted and one key a line so a rebuild diffs line by line, and the Python tests and the viewer's own writer are both held to it, so the two writers cannot drift apart without the fixture saying so.

zlib's output at a level has been stable across its releases, and a zlib whose output differs fails the deflate lines alone, each naming the version the fixture was written with beside the one running.

**The deflate vectors.** `tests/fixtures/deflate-vectors.json` holds four inputs, two thousand zero bytes, the word KULA five hundred times over, four kilobytes of noise and a sparse lattice of the level file's size, with the stream zlib writes for each at level 6 and at level 9, the two levels the page compresses at, and the version of zlib that wrote them, and the unit tests hold the page's vendored deflate to every stream.

`python3 tools/kula_kwl.py --deflate-vectors` rewrites the streams from the inputs the fixture holds with the Python's own zlib; a vector is added by appending its name and its input, in base64, and rewriting.

**The hostile documents.** `tests/fixtures/hostile-projects.json` holds project documents written to break a reader, a face named every way a key can be spelled, a cell of two coordinates, a far end on its own cell or at 32767, two hundred platforms of length 32767, whole numbers past 2^53, a face key of 4,301 digits, a title and notes longer than their most, a time of null, a kind of true, a type of 10^308, a blocks list that is text, with what the reader gives for each, the project and the report, and the digest of the level the writer writes for that project or the sentence it refuses it with; a document of another format carries its refusal alone.

`python3 tools/kula_kwl.py --hostile` rewrites the outcomes from the documents with the Python reader and writer, a case is added by appending its name and document and rewriting, and the page's reader and writer are held to every case, so the two sides cannot answer a document differently without the fixture saying so.

**The viewer's writer.** The page writes and reads the same bytes in `public/js/format/kwl.js`, whose `writeKwl`, `readKwl` and `levelOf` port `canonical`, `read_kwl` and the parser, and models a level in `public/js/format/project.js`, which holds the project file's reader and writer, the copy-on-write edits and `validate`, `counts` and `plays_as` as above.

The unit tests hold the port to the Python side through the digest fixture, both digests over all 230 templates, and through the fixed point: a template written to the game's bytes and read back is the same project, and the level the viewer draws of a project carries the shipped level's markers, by cell and by every field the renderer reads.

**The disc check.** `python3 tools/kula_kwl.py --check`, with `$KULA_DISC` set, parses every level of the disc, rebuilds it from its fields through `project_of_level` and `canonical`, and holds the rebuild to the disc two ways. In play:

- The rebuild passes `Level.verify`.
- The same cells hold the same kinds.
- Every record the disc keeps in play, a settings record with no flag set and a record of kinds 0 to 4 with nothing on it apart, has a record of its kind at its cell in the rebuild, so a record dropped whole is a failure and not a count.
- The records both have, matched by cell, have the same kind, the same objects by face with the same type, the same facing where the type turns, the same variant where it has one and the same state, the same spans, colours, lit flags, lengths, speeds and end words, the same phase on a vanishing block and the same cell words on a crumbling one.
- Every switch's list reaches the same slots and every teleporter leads to the same place, by cell and face.
- The time and the two settings are the same.

Word for word: every word of every matched record and of the trailer outside an explicit mask of what the game never reads, a link compared as the cell and face it names and a record's own lattice value as itself, so that a record folded or left out does not read as a hundred shifted words.

The mask is the header word; words 96 to 118 of every record; words 13 and 15 of every slot; the kind word of slots 2 to 5; the trailer's words 1 to 5 and its slots 1 to 5; every word of a settings record but its two flags; a bare slot's words other than its type and its state; an object's `f9`, `f10` and `f14`, its `f6` and `f7` on anything but a teleporter or a switch, and its `f5` on BONUS 30, whose pickups the disc left unnumbered, the five levels where a number repeats needing no mask since the repeat stands on a crumbling block, whose words the mask takes already; a platform's second slot but its end, length, speed and lattice value, and its first slot from `f10` on; a crumbling block's first slot from `f5` on and its other slots; a vanishing block's type word, its first slot from `f3` on and its other slots; and a laser's slots 2 to 5.

A level whose rebuild has fewer records than the disc, 144 that carry a settings record with neither flag set and 2 that carry a record with nothing on it, is compared on the records both have, and the two counts come from the same stripping the record check uses and are pinned beside the residual table.

All 230 levels play as the disc's.

Outside the mask the rebuild differs from the disc in these words and no others, each a class the tool's own table pins by its count, which `--check` fails on when a count moves or a class appears and the unit test holds too, so a writer change that moves one is a finding and not a filler; the check also holds the three constants the writer puts in an object slot by type, `F9`, `F10` and `F14`, to the three most of the disc's objects of that type carry, so a wrong constant fails the check and not only the digests:

| words | count | what it is |
| --- | --- | --- |
| the clock's `f2` | 27 | 4 left by the editor on 27 of 51 clocks; the loader skips the turn for type 8 and never reads it |
| a platform's slots 2 to 5, the type and one `f4` | 17 | an editor's leftovers in slots the game never reads, on five of the 37 |
| a laser's `f10` and `f14` | 6 | a deleted object's constants on three lasers, in words nothing reads |
| the extras 119 to 124 of one ice block and one crumbling block | 12 | a platform's position left on LEVEL 54 and FINAL 11, read for kind 5 alone |
| the kind word of one object slot | 1 | 0 on LEVEL 71, the scratch word the game writes before it reads |
| one teleporter's `f6` | 1 | LEVEL 125's two yellow teleporters, the one chain of the disc left unlinked, which nothing walks since the colour has no switch |
