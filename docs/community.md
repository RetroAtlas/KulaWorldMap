# The community levels

The community levels are levels players made and sent in, each its author's work shared under CC BY 4.0 with credit to the name in its Author field, published in one catalogue the page reads rather than in any browser's store.

This document specifies the catalogue: the index that carries the levels, the shape of its entries, the gates their documents pass, the rule it grows by, the slots its levels open under, the panel that shows it, how a level is sent in, how it is added to it by hand and how an intake would add one itself, designed and not built; `public/js/format/catalogue.js` is its one reader and writer, `public/js/community/panel.js` shows it, `public/js/editor/sendlink.js` composes the addresses a level is sent in by, `public/js/format/kinship.js` judges whether a level is a copy of one of the game's levels or resembles one and `tools/community.js` joins the records into it.

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

## The panel

The sidebar's "Community levels" shows the catalogue, as [viewer.md](viewer.md) says under "Community levels"; `public/js/community/panel.js` is the panel, loaded by the boot with the rest of the community layer when the fold is first opened, once the map has drawn where the fold was left open, or with the data where the link names a community level, and never on a plain visit.

The panel fetches the index at `INDEX_URL`, `community/index.json`, with a null fallback, reads it through `readCatalogue` with the face table of the disc shown and holds the catalogue for the visit; an index that did not arrive, or one the reader throws on, is said in the fold's own line and not held, so the next opening fetches it again, and a module the page could not fetch is said in the same line by the boot.

Each entry is a tile through `public/js/viewer/ui/tiles.js`, keyed by its id, its picture painted by `paintLevel` from the level `toLevel` makes of the entry's document under `COMMUNITY_PACK` with the tag `Community`, built once and kept with its index for the pictures and the links; the tiles stand newest first, the highest id first, and `public/js/community/sort.js` holds the row's four sorts and its filter over the title, the author and the world as the map names it.

A bundle entry is one tile too, keyed by its id, its picture painted from its first level and its line the author with how many levels the bundle holds, `by Ada · 12 levels`, in place of a world; choosing it shows the first level, the slot `<id>-1`.

A bundle entry's `world`, the world of its first level, still orders and filters it.

An entry with no title is shown as `UNTITLED` of `public/js/format/project.js`, "Untitled level", or for a bundle as `UNTITLED_BUNDLE` of `public/js/format/bundle.js`, "Untitled bundle", the names the editor gives them.

Choosing a tile shows the level through `showLevel` with the document attached to the level as `project`, which is what `copy this level` under the level line clones into a draft, author and notes kept and no `from` set, and what `save the file` writes through `writeProject`, named by the title's slug.

For a level of a bundle the note adds the level's place, `Level 3 of 12 in <title>`, and a `details` whose summary is the count of levels and whose list links to every level of the bundle, `#COMMUNITY/<id>-<n>` in the record's order, the one on screen marked `aria-current`.

The fold is open where the sidebar has a column of its own and closed where it overlays the map, `sidebarOverlays` of `public/js/viewer/chrome/sidebar.js`, as a draft's overview folds.

Once opened or closed by hand the fold stays so for the visit, as the overview's fold does.

The list is capped at three tenths of the window's height and scrolls, as the overview's findings are.

A link of the list holding the focus hands it to the marked link once the level it names is on screen, since the note is built afresh for every level.

For a level of a bundle `save the file` writes the whole bundle through `documentOf` and `writeBundle`, named by the slug of the bundle's title with `.kula-bundle.json`, as the Level card's `save as a bundle` names one.

The panel answers a link's slot through `provideLevels`: `COMMUNITY/<id>` with a level entry's document and `COMMUNITY/<id>-<n>` with the level at place `n` of a bundle entry's list, both read by one regular expression and `Number`, from the catalogue held.

Before the first link is read, and on a hashchange that brings such a link, the boot awaits `prepare`, which fetches the index where none is held and builds the level, and throws the toast's sentence where it cannot: "The community's levels could not be loaded, so that link could not be followed." where the index did not arrive, "That level was taken down." for an id under `retired`, and "The community levels hold no such level." for any other slot the catalogue does not answer.

The fold keeps whether it is open under `localStorage["kula.community"]`, as Your levels keeps its own under `kula.yours`, and opens itself when a level of the community's pack comes on screen.

## Sending a level in

A level is sent in from the share box of its card, whose second part, "Send it to the community levels", offers two roads once the level names an author, both carrying the link that holds the level whole, so what is sent is the link and nothing else, and the author's name travels inside it.

The name the level is credited to is the name in its Author field, so where that field is empty, or holds spaces alone, the part reads "Give the level an author first, so it can be credited." in place of the offer.

A box that opens refusing, for a level the checks find errors in, has no second part, since there is no link to send.

The part says in one sentence that a level sent in is shared under CC BY 4.0 with credit to its author and that a person looks at every level before it appears, the look "Adding a level by hand" describes.

`send it in by email` opens a new message to the contact address, its subject "A level for the community levels: <title>" and its body the title and the author, the link, the statement "I made this level and share it under CC BY 4.0, credited to <author>." and the line "Anything else goes here.", so the grant stands in the message the level arrives in and the sender has only to send it.

`send it in as a GitHub issue (needs an account)` opens the repository's form for a level, `.github/ISSUE_TEMPLATE/level.yml`, with the title and the link filled in through the query keys `title` and `link`, the link's text area rendered as text so the form keeps the link as it is.

The form asks for notes and for a tick on "I made this level and share it under CC BY 4.0, credited to the name in its Author field", which it needs before it is sent, and takes no author, since the link carries the name.

The form is filled only while its address stays within 3,500 characters, `ISSUE_MOST` of `public/js/editor/sendlink.js`, the room a signed-in visitor's request headers leave a URL; past it the form opens bare, the part says to copy the link and paste it into the form's Link field, and the box stays up for the copy.

Every shipped level's link fills the form, a bound the module's unit test holds over every template.

The module composes both addresses with no DOM, `mailtoFor` with the contact address joined from its parts at the call and `issueFor` with the repository's address.

Every text of either address, the subject, the body, the title and the link, goes through `encodeURIComponent`, so the link's `#` and `&` survive, a lone surrogate in a text replaced first, since the encoding throws on one and a title read from a file can carry one.

The box opens each address through `window.open` with `noopener`.

What a sender states, by either road, is that the level is their own work and that they share it under CC BY 4.0 with credit to the name in its Author field; the statement is what the commit that adds the record points at, as "Adding a level by hand" says.

## Adding a level by hand

A level arrives as the link the share box writes or as the file the editor saves, by email to the contact address or as an issue on the repository, with the author's grant of CC BY 4.0 in the message, and nothing adds it to the catalogue but a person running the tool and committing what it wrote.

`node tools/community.js --add <link or file>` reads the level, the `s` segment of a link through `decodeSegment` or a project or bundle file, fills `author` and `notes` from `--author <name>` and `--notes <text>` only where the document's own author and notes are empty, holds it to every refusal below and to the other records, writes it as `catalogue/levels/<id>.json` under the id `catalogue/ids.json` names as `next`, the file as the editor saves it, bumps `next`, writes `public/community/index.json` again and prints the id.

`node tools/community.js` with no argument writes the index again from the records and the ledger, which is how a record corrected by hand or an id retired reaches the page, and prints every refusal in place of writing where there is one.

`npm test` then holds the committed index to the records through the tool's own functions, every record to the refusals and to the text the editor saves, the ledger to the text the tool writes, and every id the ledger has issued to exactly one of a record and a retired id, so a stale index, a hand edit of it or a gap in the ledger fails there before it is pushed.

The record, the ledger and the index land in one commit whose body names the issue by its number, or says the level came by email and when, and says that the author granted CC BY 4.0 there, so `git log` on a record leads to the grant.

A level sent in again replaces its record under its id: the new document is written over `catalogue/levels/<id>.json` as the editor saves it, the tool run with no argument and the commit made as the first was, so the id and every link to it keep their meaning.

Taking a level down deletes its record and lists its id under `retired` in `catalogue/ids.json` in the same commit, the tool run with no argument after, so a link to the level is told it was taken down rather than that there was no such level, and the id is never given again.

A level that is an edit of one of the game's levels cannot be granted under CC BY 4.0 by the player who edited it, so the catalogue takes levels of a player's own, while sharing such a level by its link stays as it is.

Whether a level is such an edit is judged by its blocks through `kinOf` in `public/js/format/kinship.js`, which the tool calls, and not by the `from` key alone, since a player may copy a shipped level as scaffolding and rebuild it from nothing.

A level's shape is its blocks, each as its cell and kind, and the blocks two levels hold in common are counted at the best alignment of the one over the other, every offset between a block of each with the same kind tried, so a copy shifted by a cell, or with a block added at any corner, still holds every block of its source.

The share two levels have is the blocks they hold in common over the more numerous of the two, so a level that holds a small one whole is not its edit unless little else stands in it.

The objects on the faces do not count, so a copy with its objects changed is still the copy.

One bar decides a copy: a level whose `from` names a shipped level, that disc's variant where `fromRelease` names a disc holding one, is refused where its share with that level is a half or more, `NEAR`, since the file records where the copy came from and a level at the bar still lays its source's own shape.

A level whose share with the level its `from` names is a fifth or more, `FROM_NOTE`, but under a half is admitted with a note naming that level, since a rebuild that kept part of its source is the call of the person adding it, and a share under a fifth passes the `from` over.

A level the rule does not refuse and the line above does not note, whatever its `from` says, is admitted with a note where its share with any level of the three discs is a half or more, `NEAR`, with at least eight blocks in common, `FLOOR`, so three plain blocks in a row name no level, the note naming the nearest such level.

A level that resembles a game level without a recorded source is noted and not refused because no count of blocks tells an honest simple level, a flat slab or a ring, which lie close to the game's simplest levels, from a copy whose `from` was stripped, so the person's look, which every level gets before it appears, is the backstop for a level whose provenance the file does not record.

The note, which any level the rule does not refuse may draw, its `from` naming a level or not, reads `note: record <id>: <name> holds <percent> percent of the blocks of the game's <title>, which is worth a look`, the percent how much of the game level's blocks stand in the level, in whole percent, which stays true where the level has outgrown the game level it holds, and the title the number the pause screen shows or the disc's name, with the disc's label after a variant's title; `--add` prints it after the id for the level added alone, the run with no argument prints one for every record after the index's line, and either exits 0.

The tool refuses, naming the record in one sentence each:

- a document that reads with a repair, since what the page would show would not be what was sent;
- a document the checks find an error in, judged with the face table of `public/objects.json` and the names of `public/annotations.json` as the editor judges a draft;
- a document the writer refuses, over the record cap or one `writeKwl` cannot write, and one over the game's caps as `overCaps` counts them;
- a level that is, byte for byte, a level one of the three discs ships or a level another record carries, a bundle's levels among them, since the catalogue holds no copies;
- a copy whose share with the level its `from` names is a half or more, `NEAR` of `public/js/format/kinship.js`, that disc's variant of the slot where `fromRelease` names a disc holding one, named with the game's level and how much of that level's blocks it holds, in whole percent, since a copy that still lays its source's own shape is an edit of a game level and not its sender's own work, while a `from` naming no shipped slot is passed over, and a copy gutted and rebuilt passes whatever its `from` says while its shape shares under a half with its source at any alignment, noted from a fifth up;
- a title, an author or notes holding a control character, a line break in the notes aside, a bidi formatting character or a zero-width character, any of which could hide or reorder what the page shows;
- notes past 320 characters, the page's cap;
- a bundle of more than 60 levels, or of none;
- a record whose id the ledger retires or has not issued, an issued id that is neither a record's id nor retired, and a record file not written as the editor saves it.

## An intake that runs itself

Nothing of this section is built: a level reaches the catalogue by the hand road "Adding a level by hand" describes, and this section is the shape of the intake that would add one itself, settled here so that it is built from a known shape once the levels arriving make the hand step a chore, and not before.

**When to build it.** The intake is worth building once more than about two levels a month arrive by hand, or once the catalogue is past about twenty entries; below that a person running the tool costs less than any writer, and the community the levels would come from is small, a chat room of some seventy, a forum with a handful active in a month and no custom level found anywhere in years, so the hand road may stay the only one.

**The write path is the issue form.** A static page can hold no secret, so the page writes nothing anywhere; the one write it can lead to is the repository's form for a level, which "Sending a level in" fills, where the author is signed in on the form's own site and GitHub holds the identity.

The form's body holds 65,536 characters, so every link within the box's bound of 8,000 fits its Link field many times over, and a longer link, which the box leads with the file for, fits too while it is under that room, and is read as any pasted link is, since the reader's cap on a segment lies past it.

The required tick on the licence stands in every issue the form takes, so the grant is in the issue the Action's commit names, as the hand road's commit names it.

**The form's answers are text, not a contract.** An issue form's answers reach the issue's body under `### <label>` headings, a shape GitHub does not document as a contract, so the Action reads the body for the one thing it needs, the link, found in the body by its shape, and hands the tool the link alone, which `--add` takes as it takes a pasted link, its `s` segment read as `segmentOf` of `tools/community.js` reads it.

Nothing else of the body is read: not the notes, not the title and no address.

**The only writer is an Action in the repository it writes to.** A workflow on an issue's opening runs for anyone's issue with no approval gate, and the token it is given reaches its own repository and nothing beyond, so a writer living where the records live needs no stored secret; a writer anywhere else would need a personal token or an app's key kept as a secret, which is what this shape keeps out.

The Action runs only for an issue carrying the label the form applies to every issue it opens, read from the event and not from the body, so an issue opened blank, without the form and its tick, starts nothing.

**A data repository of its own.** The records, the ledger and the index move to a repository that holds the catalogue alone, with a Pages site of its own that serves the index, so the Action's token can change nothing of this repository, its code or its site, a flaw in the intake reaches no further than the catalogue's data, and a level's pull request runs no browser suite and deploys no page; this repository keeps the reader, the panel, the share box and the tool.

The tool runs there from a checkout of this repository at a pinned release, so the gates a level passes are one code in both places and move by a bump a person makes; the command reads the records under its own repository's root and the face table, the names and the shipped levels' digests from this repository's files, so it gains a flag for the root the records stand under before the move.

The two tests of `tests/unit/community.test.js` that read the committed catalogue, the index held to the records and the ledger byte for byte and every issued id held to exactly one of a record and a retired id, move with the records and run in the data repository's own workflow against the pinned tool, so the committed index is held to the records where they stand.

The rest of that file, the tool's refusals and its command, stays here with the tool, as `tests/unit/catalogue.test.js` stays with the reader.

**The page fetches across origins.** `INDEX_URL`, the panel's address for the index, becomes the data site's address and the fetch crosses origins, which GitHub Pages allows by answering every request with `Access-Control-Allow-Origin: *`; this site's own origin answers it, and the data site's own origin is to be verified before the move, since a fetch refused there would show every visitor the failed line.

**The write is a pull request a person merges.** The Action's job, given `contents: write`, `pull-requests: write` and `issues: write` for itself, writes the record, the ledger and the index on a branch of its own in one commit that names the issue by its number and says the grant was made there, as the hand road's commit does, runs the tool and the moved tests there, since a run made by the workflow's token starts no other run, and opens a pull request from the branch.

The ruleset on main takes no push but a merge, with no bypass for Actions, so the token cannot push to main, and a person merges.

That merge is the look the site promises in "a person looks at every level before it appears", and it is a person's push to main, which starts the Pages deploy there as a push to main starts it here; nothing publishes without it.

The data repository needs "Allow GitHub Actions to create and approve pull requests" on, a setting off by default and inherited from the organisation, so allowed there first; its default workflow permissions may stay read, since the job asks for its own; a ruleset on main requiring a pull request before merging; and Pages built from the workflow, as here.

**The body never reaches a shell through an expression.** The issue's body is the author's text, and an expression that writes it into a `run` step writes it into the shell, so the body reaches the Action as an environment variable set from the event or as an action input, which the step that finds the link reads as a value; the link alone goes on to `--add`, which decodes the level from the link's own text and fetches nothing, so no address in an issue is ever followed.

The tool's sentence on a refusal carries the level's title as typed, with only the characters that would hide or reorder the terminal's text replaced, so it goes to the comment the same way, as a step's output an action reads or as an environment variable, never through an expression in a `run` step.

**Every refusal of the tool stands.** A level passes every refusal "Adding a level by hand" lists, `recordOf` and `indexOf` between them, and no fewer.

A refused level ends as a comment on the issue carrying the tool's sentence, and no pull request.

The tool's note, where the level draws one, goes into the pull request's body, where the person merging reads it.

The level is credited to the name in its Author field, which the link carries, never to the login that opened the issue.

**The owner is the author's numeric id.** The opener's numeric GitHub id is kept beside the record's id in the ledger or in a table beside it, never in the record, which is the document as the editor saves it, nor in the index, which the page reads.

A later issue from the same id is taken as the author's update, the record replaced under its id, or removal, the record deleted and the id retired, through the same pull request, and an issue from any other id on a published record is refused.

How such an issue names the record is open, since the form takes a link alone, a shared link names no record and a removal carries no level.

The login is kept beside the number for a person reading the ledger alone, since a login changes hands and the number does not.

**A bundle stays on the hand road.** A bundle shares as a file and the form takes a link alone, and a file attached to an issue is something the body names, which the Action never fetches, so a bundle comes by email with its file, as "Adding a level by hand" says.

**The form and its address move with the records.** The form, `.github/ISSUE_TEMPLATE/level.yml`, moves to the data repository, where it gains the label the Action runs on, and `ISSUE_FORM` of `public/js/editor/sendlink.js` with it, so the issue the box opens is the one the Action runs on.

`send it in by email` stays as it is, a message a person reads.

**Ruled out.**

- Usernames and password hashes in a private repository: the page cannot read it without a token, a token in the page is public, a hash store the page can read is crackable offline, "logged in" would be a variable in the visitor's tab, and the write would still need a credential in the page; identity has to be borrowed from a service with a server, GitHub through its form, or be a key the author holds, never a secret the site holds.
- OAuth from the page: GitHub's flow cannot be completed from a static page, since the token exchange needs the client's secret even with PKCE and the device flow's endpoints send no CORS headers; anonymous gists are gone too.
- A hosted database or function: the free plans looked at pause a project after a week idle, cap it by credits, or have closed or announced their closing, so the catalogue would hang on a service's terms rather than on a repository a person holds.
- A relay: a Nostr relay would need a library the repo may not vendor, and the writer would still be a key or a secret somewhere.
- The Action pushing to main itself, since the merge is where a person looks, and this repository's own Action writing into the data repository, since a write across repositories takes a secret kept.
- Reading the body by its headings, which are no contract, or following an address in it, which would make the writer a fetcher of whatever an issue names.
