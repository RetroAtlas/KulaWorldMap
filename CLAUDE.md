# CLAUDE.md

Guidance for AI agents working in this repo. Read [README.md](README.md) first: what this is, how to run and rebuild it, and which document holds what.

This file is rules. The readings of the disc and the evidence for each are in [docs/](docs/), the viewer's controls and modules in [docs/viewer.md](docs/viewer.md), and the argument for a reading is in the commit that landed it, so a new finding goes to those places and not here.

## Before touching the parser, the viewer's axes or the artwork

Read [docs/level-format.md](docs/level-format.md) before changing anything under `tools/` that reads a level, or anything in the viewer that turns a cell into a point on the screen.

Four readings in it cost more than the rest to get right, and none can be settled from the disc alone, since a mirror image or a shifted framing reads as cleanly as the truth and a kind is named by what the game shows:

- The lattice is 34 x 34 x 34, indexed `x*1156 + y*34 + z`. `z` counts downward, so the smallest `z` in a level is its highest block, and seen from above with `x` to the right, `y` counts down the page.
- The cell closes a record; it does not open the next one. The build's cross-check passes under both framings, so it cannot tell them apart.
- The six slots of a record are the six faces of its block, in the order top, `+x`, `+y`, `-y`, `-x`, underside. A slot has no position of its own: 51 records are zeroed past the first slot, and a range test on slots once read 255 objects out of them.
- The five lattice styles and a record's kind word are one enumeration of block kinds; what stands on a block is named by its type alone.

Keep the cross-check in `tools/kula_build.py` fatal: it holds the readings to the disc.

A points value changes only with the arithmetic in [docs/level-format.md](docs/level-format.md), which a unit test holds it to.

Do not re-derive the lattice from file sizes.

Read [docs/camera.md](docs/camera.md) before touching the start camera the viewer draws or the view it takes in play and at an ending, [docs/tgi.md](docs/tgi.md) before touching `tools/kula_tgi.py`, `tools/kula_tex.py` or `tools/kula_skins.py`, or anything in the viewer that picks a texture for a face, and [docs/ggi.md](docs/ggi.md) before touching `tools/kula_ggi.py`.

[docs/viewer.md](docs/viewer.md) says what every control of the viewer does, so a change to one brings it up to date in the same commit.

## Before a commit

- `npm test` (the unit tests pin the README's and the docs' figures to the data, so a rebuild that moves a count fails there rather than going stale in silence).
- `npm run format:check`.
- `npm run lint`.
- `python3 -m unittest discover -s tools/tests`.
- `python3 -m compileall -q tools/`.
- `ruff check tools/` at the release [.github/workflows/ci.yml](.github/workflows/ci.yml) pins, which `pipx run ruff==<release> check tools/` runs without installing it.
- `npm run test:browser` when the viewer changed.

A change to the viewer that is to draw exactly as before, a move, a re-wiring or a speed-up, is proven with `npm run pixels`, which renders the working tree and `HEAD` over the matrix in `tests/pixels/cases.js` with the clock held still, with the editor absent and with it loaded, and names every capture whose map, pick, hit test or animation differs, and passes when it names none. A change meant to draw differently does not run it: most captures show the thing it changes, so the list says nothing its browser test and a look in the viewer do not.

Where a change is about speed, `npm run frame` says where a frame's main-thread time goes, part by part, at a phone's size with the CPU slowed, and given a ref measures that ref beside the working tree, and `npm run boot` opens the page over a throttled network and says when its first frame and its first textured frame land, given a ref beside that ref's; both are there to reach for, not checks a commit must pass.

No commit message reports what a test found, this one's or any other's: every commit passes them all.

## Conventions

- [`backlog/`](backlog/) holds the open questions, one file per question, with what has been ruled out. Read it before starting anything large. A question earns a file when the gap between finding it and answering it is long enough for the reasoning to be forgotten; the commit that answers it deletes the file and says what was decided.
- A paragraph or a bullet of the docs, the backlog, the README or this file is one line, never wrapped, and makes one point: what one control does, one module's job, one rule, or one reading and what it rests on. A new point is a line of its own beside the one it qualifies, never one more clause on a line that makes a point already, and a line that would pass 1,000 characters is cut where its sentences or clauses join, in the commit that grows it. The unit tests hold every line to that length and fail a paragraph that runs onto a second line.
- A `##` title is renamed only in a commit that updates every citation of it, since the docs cite their sections, their own and each other's, by title. A long section takes `###` subsections at its own turns, in its own words, repeating no heading of its document, unless its readings open on bold leads, which head them already; `docs/annotations.md` takes none, since its tests read every `###` as an entry and end a section at any heading.
- The deployed site is `public/`, and the host serves that directory, so repo artefacts (`README.md`, this file) cannot ship by accident.
- The Pages deploy is the last job of [.github/workflows/ci.yml](.github/workflows/ci.yml) and `needs` every check job in it, so a push to `main` publishes only what passed; a check that lands in a workflow of its own would gate nothing. The job is OddworldMap's, action versions included.
- What the site says, anything under `public/` a visitor can read or hear, is for someone looking at the map. Take out how the project knows a thing: the evidence for a reading, the counts and cross-checks that prove it, and what is or is not decoded yet. Keep anything a player would miss, curiosities and the other releases' differences included, even where the model or the legend shows part of it. The site never names this repo's scripts or files, a path on anyone's machine, an address or a date, and the walkthrough is credited in the About and named nowhere else, on the site or in the code.
- A finding goes to `docs/` while it is being made and reaches the site once it is settled.
- A change to what the map draws or counts searches the site's text, the notes first, for anything that describes it, and brings it up to date in the same commit.
- The contact address is never written out under `public/`: the About joins it from its parts when it opens, out of reach of scrapers that read the source.
- Dependency-free ES modules, no build step, no framework. The page must work when opened from a plain static server. The one exception is pako's deflate under `public/js/vendor/`, vendored unchanged with its licence beside it, because the browser's own compressor writes different bytes in every engine and whether a level fits a slot on the disc is decided by the byte; nothing else is vendored, and the linters and the hash test leave that directory alone.
- The modules under `public/js` lie in layers, and the unit tests hold a module to importing only its own layer and those beneath it:
  - `viewer/` is what a plain visit loads, its root the model, with no DOM and no canvas.
  - `viewer/ui/` is the page's primitives, which know nothing of the map.
  - `viewer/draw/` is what paints a canvas.
  - `viewer/chrome/` is what stands beside the map and speaks for it.
  - `format/` is the readers and writers of the level, the project, the pack, the disc image, the patch and the store, which touch no DOM and nothing of the viewer, and hold the lattice every layer lays a level in.
  - `editor/` and `play/` are what load only through the boot's dynamic import, the editor when a level of your own is wanted and play when the ball is.
  - `main.js` is the boot.
- A new module goes in the lowest layer its imports allow, and where that leaves a choice, with what uses it.
- `public/map_data.json`, `public/objects.json`, `public/packs.json` and `public/tex/sparks.png` are generated by `tools/kula_build.py` and committed. Never hand-edit them; change the tool and rebuild.
- `public/annotations.json` is the opposite: hand-curated, never generated. It is where names for the game's numbered kinds and types go, and under `fields` names for what their records' raw fields hold, and the viewer treats a missing name as normal rather than as an error. A type whose one varying field is a colour or a tier names each value under `variants` with `by` saying which field; one whose field is a direction says so with `facing`; one a switch turns on and off says which field holds whether it starts on with `state`; and `points`, with a level's `score` where the disc holds more than can be collected, and `hazard`, on a kind or type that can cost the ball its life, are the things curated there that are not names, because the levels hold none of them.
- Every entry's note is for someone looking at the map, in a sentence or three, each short and ending in a full stop rather than clauses chained with colons and semicolons. What the entry rests on is its section in [docs/annotations.md](docs/annotations.md), and the unit tests hold both: a section for every entry, and a note that stays short and names nothing the rule above keeps off the site. A name that rests on a guess goes in neither.
- Images are compressed on the way out, never in a follow-up commit: `tools/png.py` writes RGB wherever the alpha says nothing and runs `oxipng` over what it wrote, and `tools/ogcard.js` and `tools/icons.js` do the same to the card and the icons they render. Without `oxipng` on PATH the build still produces a correct file, only a larger one, so do not commit one built that way.
- The disc is never committed, and `.gitignore` keeps `*.bin` and `*.cue` out.
- A permalink, once shared, is read by every later version of the map. What a link carries grows at its tail, which the reader takes by shape and passes over where it does not know it, and a segment never changes what it means: the unit tests hold one link to where it puts the lattice on the screen, so a change to the zoom's scale or the camera's axes fails there rather than moving every link in the wild.
- Nothing in the repo cites a commit by its hash, which an autosquash or a reworded message changes: where a commit must be named, name it by its subject.

### The editor, the route planner and play mode

The editor draws a draft as the viewer draws a disc level, and nothing else: a draft is a level object of `map_data.json`'s shape, made by the level writer and reader in `public/js/format/kwl.js` from the project in `public/js/format/project.js`, drawn by the same code as a shipped level, and never entered into `state.data`; every level reaches the screen through the one funnel in `public/js/viewer/chrome/navigate.js`.

The editor draws and listens only through seams, registrations and events: the frame's hooks in `render.js`, the click, drag and hover registrations and `tipWith` in `interaction.js`, the panel's `onShow` and `selection-changed` event in `detail.js`, the level line's `noteWith`, the link's `provideLevels` and the `level-changed` and `level-updated` events in `navigate.js`, the `atlas-loaded` event in `atlas.js` and play's `play-changed`.

So the faithful modules carry no editor branch: `things.js`, `skins.js`, `lights.js`, `beams.js`, `atlas.js`, `motion.js`, `travel.js`, `icons.js`, `compass.js`, `search.js`, `objectsearch.js`, `placesearch.js`, `dialog.js`, `modal.js`, `toast.js`, and under `tools/` `kula_build.py` apart from `packs.json` and `kula_level.py`, are the modules the editor leaves untouched, `search.js`, `dialog.js`, `modal.js` and `skins.js` apart, which changed for every caller's sake, the search re-scoping on `level-updated`, a dialog or a modal giving the focus back to the control that opened it, and the skins lending the viewer's points their test for a key, and carry no branch of the editor's.

The route planner, `course.js` and `ribbon.js`, draws and listens only through the same kind of seams, the block hook, the pointer lists, the link's tail, the `level-changed` and `level-updated` events and the editor's `editing-changed` and `drafts-moved`, and carries no branch in a faithful module.

Play mode is built the same way.

Its simulation, `play/ball.js`, `play/world.js`, `play/rules.js`, `play/contact.js`, `play/hazards.js` and `play/drive.js`, is pure, every count and threshold read from `objects.motion` and no wall clock among them, and the unit tests hold the simulation's modules to importing the model, the lattice and each other alone.

`play/ball.js` never asks its probe what kind a block is and carries no policy of the mode's, so a lost ball says so and stays where it fell.

`play/play.js` reaches the map only through the seams:

- The frame's travellers through `movingWith`, its four hooks, `runWith` and its `density-changed` event in `render.js`, its marks on the blocks reaching `skins.js` through `faceSkin`'s marked argument as the game's own paint for a marked face and not as a branch of play's.
- The camera's `frame`, `anchored` and `parked` in `state.js`.
- `fitWith` and the `level-changed`, `level-updated` and `link-opening` events in `navigate.js`.
- The switches' `show-changed` event in `sidebar.js`.
- `ballsWith` and a traveller's `tint` and `body` in `things.js`.
- `adoptCourse`, `current` and the `course-changed` event in `course.js`.
- `tipWith` in `interaction.js`.
- The panel's `onShow` and `go-to` event in `detail.js`, and the `play-changed` event the editor listens to.

So the faithful modules carry no branch of play's either; `play/dust.js` and `play/effects.js` are its own, and `play/effects.js` casts its light through `lightsWith` in `lights.js`.

"How it is built" in [docs/viewer.md](docs/viewer.md) says what each of play's modules computes and what play hands the map through its seams.

The project file grows by one rule: keys are only added, a published key never changes its meaning or its type, every optional key has a default on read and a reader ignores keys it does not know, with [docs/editor.md](docs/editor.md) as the specification.

After any change to the level writers, whoever holds the disc runs `python3 tools/kula_kwl.py --check` with `KULA_DISC` set, which holds the rebuild to the disc word for word and fails on any residual its table does not list.

## Naming

A level is titled by the number the game's pause screen gives it, which the build ships as `shown` wherever the engine computes one, and where the disc's own name differs the level's note says so. **The pack path plus the index inside it is the key**, since a name is not unique.

World ids are the disc's directory names, which is all the game has; a friendlier name is a curated override in `annotations.json` under `worlds`, with a source outside the disc, and the viewer falls back to the id rather than inventing one.

## Code comments

Default to none, comment only where the code is genuinely hard to follow, and never reference the history of the code.

A comment must not need editing when a constant is tuned or a kind is added, so do not enumerate kinds or restate values in prose.
