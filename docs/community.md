# The community levels

The community levels are levels players made and sent in, each its author's work shared under CC BY 4.0 with credit to the name in its Author field, published in one catalogue the page reads rather than in any browser's store.

This document specifies the catalogue: the index that carries the levels, the shape of its entries, the gates their documents pass, the rule it grows by and the slots its levels open under; `public/js/format/catalogue.js` is its one reader and writer.

## The catalogue

The catalogue is one JSON document in UTF-8, `public/community/index.json`, that carries every published record whole, a project or a bundle document as [editor.md](editor.md) specifies them, under an id, with the figures a tile shows beside it and the licence it is shared under.

```json
{
  "version": 1,
  "licence": "CC-BY-4.0",
  "entries": [
    {
      "id": 1,
      "kind": "level",
      "title": "Spiral",
      "author": "Ada",
      "notes": "A tight climb with one key.",
      "world": "HIRO",
      "playsAs": "Plays as an arcade level.",
      "blocks": 3,
      "licence": "CC-BY-4.0",
      "level": {
        "format": "kula-world-level",
        "version": 1,
        "title": "Spiral",
        "author": "Ada",
        "notes": "A tight climb with one key.",
        "world": "HIRO",
        "time": 99,
        "hidden": false,
        "invisibleFromAfar": false,
        "simon": false,
        "circuits": {},
        "blocks": [
          { "cell": [17, 17, 17], "kind": 0, "faces": { "0": { "type": 30, "facing": 3 } } },
          { "cell": [18, 17, 17], "kind": 0, "faces": { "0": { "type": 31 } } },
          { "cell": [19, 17, 17], "kind": 0, "faces": { "0": { "type": 7 } } }
        ]
      }
    },
    {
      "id": 2,
      "kind": "bundle",
      "title": "Spiral campaign",
      "author": "Ada",
      "notes": "",
      "world": "HIRO",
      "playsAs": "Plays as a bonus level since it has no key.",
      "blocks": 1,
      "licence": "CC-BY-4.0",
      "levels": [
        {
          "format": "kula-world-level",
          "version": 1,
          "title": "Spiral 1",
          "author": "Ada",
          "notes": "",
          "world": "HIRO",
          "time": 99,
          "hidden": false,
          "invisibleFromAfar": false,
          "simon": false,
          "circuits": {},
          "blocks": [
            { "cell": [17, 17, 17], "kind": 0, "faces": { "0": { "type": 30, "facing": 3 } } }
          ]
        }
      ]
    }
  ],
  "retired": [3]
}
```

| key | meaning | default on read |
| --- | --- | --- |
| `version` | the integer 1 | a `version` that is not a whole number is read as 1 with a line, and a higher one is read with a line saying the index is newer |
| `licence` | the licence every entry is shared under where it names no licence of its own, as its SPDX identifier, `CC-BY-4.0` | `CC-BY-4.0`, which an empty text takes too, and a longer text is cut to 80 with a line |
| `entries` | the published records, one an entry, in any order | `[]` with a line where it is missing or not a list |
| `retired` | the ids of records taken down, so that a link to one can be told from a link to a level that never was | `[]`, and a value that is not a positive whole number, an id named twice or an id an entry carries is left out with a line |

An entry's keys, in the order the index writes them:

| key | meaning | default on read |
| --- | --- | --- |
| `id` | a positive whole number of the record's own, unique in the index: the index of the slot a link names | none: an entry without one, with one that is not a positive whole number or with another entry's id is left out with a line |
| `kind` | `level` or `bundle`, which of the two documents the entry carries | told by which of `level` and `levels` the entry has, a word that is neither with a line, and an entry with neither document is left out with a line |
| `title`, `author` | the texts a tile shows, a title of up to 80 characters and an author of up to 2000 | the texts of a level's document, and `""` for a bundle, whose head these are, which an empty text takes too; a longer text is cut to its most with a line |
| `notes` | the author's notes, up to 320 characters, a cap sized for the page rather than the file's 2000 | a level's document's own cut to 320, and `""` for a bundle; a longer text is cut to 320 with a line |
| `world` | the disc world a tile names, one of the ten | the document's own world, for a bundle its first level's world, which also stands in for a world that is not one of the ten, with a line |
| `playsAs` | the checks' sentence for how the level plays, for a bundle its first level's sentence | recomputed from the document whatever the index says, so the page never trusts a stale figure, and the written one is for whoever reads the file |
| `blocks` | how many blocks the document places, summed over a bundle's levels | recomputed the same way |
| `licence` | the licence the entry is shared under, as its SPDX identifier, written on every entry and telling something only where it differs from the licence at the head | the licence at the head, which an empty text takes too, and a longer text is cut to 80 with a line |
| `level` | a level entry's project document, whole, as "The project file" in [editor.md](editor.md) specifies it | required on a level entry: one whose document is not a project is left out with a line, as is one whose document fails a gate below |
| `levels` | a bundle entry's levels in play order, each a project document, as "The bundle file" there specifies them | required on a bundle entry: one whose list is none, or holds no level, is left out with a line, and one with a level that is no project document or fails a gate below is left out whole, with a line naming the level's place and its reason and one saying the entry goes with it, since a link names a level by its place in the list |

**The documents stand whole.** The index carries the documents themselves rather than the packed text a link carries: after the host's compression a plain document is half the size on the wire, it needs no decompressor to read, and the picture a tile paints needs the parsed document anyway.

**The gates.** A document stands in the catalogue only past the gates a link's level passes and one more: read by `readProject` with no repair, where the link's reader repairs as the reader of a file does, its world one of the ten, under the game's caps as `overCaps` of `public/js/format/checks.js` counts them, the faces and the blocks among them where the reader is given the face table and the rest without it, and written by `writeKwl` without a refusal; a document that fails is left out with a line saying why, so nothing of it reaches the renderer or the store.

A bundle's levels pass the gates one by one, and a level that fails, or that is no project document, takes its entry with it, since a link names a level by its place in the record's list and the rest would change place; a list cut at the bundle reader's cap keeps its entry, the cut being at its tail.

A document written as a newer version of the format reads with the note and passes, since the note repairs nothing.

A left-out document's own lines are kept under the entry's place and id, `entry 3 (id 7): block 1 at 5,5,5 has a phase of "x", which is not a whole number; it is 0`, so the report says what the repair would have been.

**Reading the index.** `readCatalogue` takes the index as text or parsed, with the face table as an option, and gives the catalogue, its version, licence, entries and retired ids, with a report line for every value it could not take as written, lines of one shape kept to the first three and the rest counted as the project reader keeps them.

The reader refuses nothing it can parse: an index that is not a table of keys reads as an empty catalogue with a line, a key the reader does not know is passed over in silence, and the entries and the retired ids keep the index's order.

**Writing the index.** `writeCatalogue` writes the head's keys one a line, then the entries by id, each entry's keys one a line in the order of the table above and its document as `writeProject` writes it, indented inside the entry, a bundle's levels each inside its own braces in the list, then `retired` in order on one line, so a diff between two indexes is a diff between records, a document can be cut out of the index by taking its indent away, and an index read and written again is the same text.

`entryOf` makes the entry for a record's document under its id, a project or a bundle as the readers give them, the figures filled from the document, the notes cut to 320 and the licence `LICENCE`, `CC-BY-4.0`, and `documentOf` gives the document back, a level's document whole and a bundle's head and levels joined again.

**The growth rule.** Keys are only ever added; a published key never changes its meaning or its type; every optional key has a default on read; a reader ignores keys it does not know.

`version` stays 1 for as long as that holds, as the project file's version does, and a reader meeting a higher number says the index is newer than it and reads what it knows.

The index is one page while it holds under 200 entries; past that a later page hangs off a new head key, which an older reader passes over, so the first page stays whole for every reader.

A bundle in an entry holds at most 60 levels, `BUNDLE_IN_CATALOGUE_MOST`, a cap on what is published rather than on what is read, which only ever grows, so a reader takes a longer list as the bundle reader takes one.

A world or artwork of a level's own, if one is ever carried, comes as a new key under the growth rule, with `world` still naming the disc world an older reader draws the level in.

**The slots.** A community level opens under the pack `/COMMUNITY/COMMUNITY.PAK`, `COMMUNITY_PACK`, at the index of its record's id, so the link to the level of record 17 reads `#COMMUNITY/17/...`, and a bundle's levels open at `<id>-<n>`, `n` the level's place in the record's list counted from 1 as the record writes it, `#COMMUNITY/17-3/...` for the third level.

A published bundle never loses a level or changes its order, so a removal or a reorder is a new record under a new id with the old one retired, and a link once shared keeps its meaning.

A retired id covers every `<id>-<n>` under it, so a link to any level of a bundle taken down is told it was.

**The licence.** Every community level is its author's work, shared under CC BY 4.0 with credit to the name in its Author field; the index names the licence at its head as the SPDX identifier, and every entry carries the licence it is shared under, which tells something only where it differs from the licence at the head.
