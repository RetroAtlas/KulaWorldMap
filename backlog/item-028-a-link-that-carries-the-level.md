# 28. A link that carries the level

## What and why

A link to a draft, `#DRAFT/3/...`, names a slot in the browser that holds it: it opens the draft on that device and gives way to the view on screen anywhere else ([docs/viewer.md](../docs/viewer.md)), by the rule that a file is a level and a browser-local id is not one.

The one link that carries a level today is the community's link, orbit's `?level=` share link, which `paste a link…` reads as a template: its codec is orbit's words, a header of the time and the hidden and reverse flags and a line of base36 per block, gzipped and written as base64url, so it carries no title, author or notes and names a world only where the link does ([docs/editor.md](../docs/editor.md)).

A shareable link of the project itself, so that an author can hand a level to someone without a file, was put aside for after the editor shipped.

## Sketch

The payload is the project's canonical text, which the writer writes the same way every time, deflated and written as base64url. The editor already loads pako's deflate for the disc, and the reader already inflates with the browser's `DecompressionStream`, which reading a `.kwl`, a pack or orbit's link needs today, so a browser too old for one is too old for the other.

Measured 2026-10-11 over the 230 shipped levels as templates, `writeProject(fromLevel(l))` deflated at level 9 and written as base64url runs from 324 to 1,115 characters, the median 615, short enough for a chat message or a QR code; a level at the 123-record cap would be measured before any limit is set.

The link is read as every import is, through `readProject` and the sanitiser, and opens as a new draft with the report any repair leaves.

Where it rides is the question: the permalink's hash is the view, grows at its tail and is read by shape, so the level would not go there; a `?level=` query beside the hash is orbit's form, which the paste box already takes and tells from orbit's own catalogue by an all-digit parameter, so the viewer's payload needs a marker of its own that the reader tells from both.

The boot would read it as it reads a `#DRAFT/` link, loading the editor when the query is there.

Open: whether opening the same link twice makes two drafts, as two imports of one file do, or a digest of the payload finds the draft already held; whether the link carries the view as well, or opens framed to fit as a level with no view does; and what the editor says where a level is too large for a link and offers the file instead.

Ruled out: a link that carries the browser-local id, which opens nothing elsewhere and is what `#DRAFT/` already is; and anything served, since the page sends nothing anywhere and keeps no copy of a level.
