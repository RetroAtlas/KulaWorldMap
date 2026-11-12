# The checks

Every check of the repo lives where what it checks is computed: a unit test for what a module computes, a browser test for what only a browser shows, a pixel capture for a change meant to draw as before, a comparison of computed styles for a change to the stylesheet meant to show as before, and the Python suite for the tools, with the disc where a reading needs it. [CLAUDE.md](../CLAUDE.md) states the rules under "Where a check lives"; this document says what each suite is, how it runs and how a test is added.

## The suites

`npm test` runs the unit tests under `tests/unit` with Node's own runner, every file in its own process, in a few seconds; they read the shipped data through `tests/unit/fixtures.js` (`map_data.json`, `objects.json`, `annotations.json` and the release files under `releases/`, the US file's layout among them as `packs`), which also holds the few helpers the files share, and the synthetic disc image `tests/unit/synthetic.js` builds from the page's own writers.

`patch.test.js` holds the placer and the patch writers to the digests of `tests/fixtures/patch-digests.json`, and `patchread.test.js` the patch readers to the same digests, applying each patch the writers make over the synthetic image, naming the slots it changes and refusing a damaged window or a block check of another image; a test of each runs over the disc where `KULA_DISC` names it and is skipped where it does not.

`community.test.js` holds the committed index of the community levels, `public/community/index.json`, to the records under `catalogue/levels/` and the ledger `catalogue/ids.json` through the functions of `tools/community.js`, the one tool under `tools/` whose check runs under `npm test` rather than the Python suite, every id the ledger has issued to exactly one of a record and a retired id, the tool's refusals to hostile documents built in the test, its command over a scratch root, and the lines of `docs/tools.md` and `docs/community.md` that count the tools and say what this one refuses.

The unit tests also hold the repo to its conventions: `imports.test.js` the layers, the preloads, the pure modules of play and every module to parsing in older WebKit and in the Wayback Machine, `prose.test.js` the docs' one-point lines, `sizes.test.js` every module, stylesheet partial, spec, unit test, other script under `tests/` and tool to a size, `stylesheet.test.js` the stylesheet's partials to the two pages' links, `docs.test.js`, `docs-releases.test.js` and `counts.test.js` the README's and the docs' figures to the data, `hashes.test.js` that nothing cites a commit by its hash, `kinds.test.js` that every kind and type a script names is one `KIND` and `TYPE` hold, `site.test.js` what the site may say, `address.test.js` that the contact address stands whole in nothing the site serves, `backlog.test.js` the backlog's numbering and links, `ci.test.js` the image of CI's browser job to Playwright's pin, and `frame.test.js` the frame tool's parts to the functions the viewer defines.

`imports.test.js` holds its table of layers to an order of its own too, a row naming only itself and the rows beneath it, where a file a row names stands for its folder, so two rows that name each other fail there, a cycle through them named once, though no module yet imports along it.

`stylesheet.test.js` holds the partials under `public/css` to their names, the stylesheet links of the page and of the page for a missing path to them, in name order and after the page's inline script, the list of partials in `docs/viewer.md` to the folder, and every custom property the page for a missing path reads to a partial it links.

`stylesheet.test.js` holds the blocks under a phone's width and under reduced motion, any `@media` block that names `max-width`, writes `width <` or names `prefers-reduced-motion`, to the partial linked last too, since a rule under either query wins a tie against the rule it narrows by coming later, and leaves a block for a pointer that hovers with its surface.

`npm run test:browser` runs the browser tests under `tests/browser` with Playwright in Chromium, at 1280 by 720, against the site served from `public/` on port 8480; every test opens its own page, so the tests of one file run spread over the workers as the files do.

The site is served over HTTP/1.1, by `tests/browser/serve.py`, so that a page keeps its connections open: at one connection a request, the server's default, a run leaves more connections closing than the machine has ports to open new ones from, and the tests late in it fail to reach the page.

One spec runs with its name after the command, `npm run test:browser -- play-hud`, and one test with `-g` and a piece of its title.

CI runs the browser suite in Playwright's own container image at the version `package.json` pins `@playwright/test` to, which carries the browser build that version expects with Node and Python beside it, so the job installs none of them.

CI draws the page in the image's fonts, WenQuanYi Zen Hei and its Mono face, so a browser test of layout and boxes can pass on a developer's machine and fail in CI.

`npm run pixels` renders the working tree and a ref, `HEAD` unless one is given, over the matrix in `tests/pixels/cases.js` with the clock held still, the ball stood on a level for the play cases, and names every capture that differs; it proves a change meant to draw as before, a move or a re-wiring, and is not run for one meant to draw differently.

The ref is served straight from the repository, each file read as it is asked for on a port of its own, so nothing is checked out; `tests/public.js` serves both trees, a folder or a commit.

The matrix runs with the editor absent and again with it loaded by a level kept in storage, that side working Your levels open and scrolled into view so the level's tile paints before every capture, and a still paint that left the frame's view or its switches swapped would show in the map's hashes.

The matrix also stands levels on the other discs, such a case naming its disc in its id, `A/B1/jp/v1`, which the harness sets through the release model before it selects the level and puts back once the case is captured, so a ref from before that model runs those cases on the US disc.

`npm run styles` opens the page at the working tree and at a ref, `HEAD` unless one is given, in each interface state of `tests/styles/states.js`, and compares the computed style of every element and of every `::before` and `::after` it draws, naming every state in which one differs, with the elements and the properties; it proves a change to the stylesheet meant to show as before, a rule moved or a file cut, and is not run for one meant to show differently.

A state is a size and kind of screen, what is kept in storage or answered for a file before the page loads, what the page is asked to open through its own controls, or through its modules or an event the browser would send where no control serves, and a selector that stands once it is open and is absent from the plain map, so a state that fails to open fails the run; each is opened on a page of its own at both trees, and a new surface earns a state there.

The states stand in a list for each subject beside `tests/styles/states.js`, which joins them: `viewerstates.js` for the plain viewer and the page for a missing path, `editorstates.js` for Your levels, the editor and its boxes, and `playstates.js` for play, a level carried in its link and the community levels, with what the lists share in `statehelpers.js`.

A new state goes in the list of the surface it shows, and one that shows surfaces of two lists stands with the surface it names first.

The page's clock is stopped before a state is read and every running animation put at its end, since a toast, an armed button and the note of a save leave by themselves; a state that drives the ball holds the game's clock before its first step, as a browser test of play does.

A state is read only where its selector still stands once the clock has stopped: one whose selector has left by then, as the note of a save has where the machine stalled for a second, is opened again, and fails the run the third time.

Each state is read as it stands under reduced motion, then with motion allowed and every animation held at its first frame, so the transitions and animations reduced motion switches off are compared too, and then with hover, focus and active forced on every element.

Hover, focus and active are forced one at a time and then all at once, the focus both as a click leaves it and with `:focus-visible` as a key gives it: forced alone, a rule under one of them is held wherever its element stands, where forced only together a later rule of equal weight under another would hide it, and forced all at once they show which of their rules stands over the rest.

A property list is sorted by name before it is hashed, since the browser lists custom properties in an order that differs from one load of a page to the next.

`npm run styles -- --unseen` names every rule of the stylesheet that no state puts on screen, a rule that hides its element counting where the element would be drawn without it, `--only` runs the states whose names hold a word, and `--dump` writes each state's reads at both trees to a folder.

`--unseen` counts by rule, and a rule is shown where any one selector of its list is, so after the rules it names every selector of a shown rule that no state puts on screen by the same test, the list cut at its top-level commas alone.

What the proof cannot read is a pseudo-element the browser gives no computed style for, the search box's cancel button and a fold's marker, and a rule whose element no state renders is compared only as far as an element with no box computes.

An animation is compared at one moment alone, at its first frame where reduced motion switches it off and at its end where it does not, so a change to another frame of its keyframes is not seen.

A declaration is compared only in a state where it decides, so one that another rule stands over in every state is compared in none, as the look a toast wears while it fades.

`npm run frame` and `npm run boot` are measurements, not checks: where a frame's time goes, and when the page's first paint and its first frames land over a throttled network.

`python3 -m unittest discover -s tools/tests` runs the tools' tests without the disc, the motion reader's one file a module, `test_kula_motion_<subject>.py`, over the shared `motion_fixture.py`, the atlas writer's tests and the build's artwork tests over the worlds `tgi_fixture.py` builds, the aligner's in `test_kula_align.py` and the map writer's in `test_kula_map.py` over the executables `align_fixture.py` lays out, a few routines and copies of them laid out as another release lays out the same code, and the tests of the level writer's disc check in `test_kula_kwl_check.py` beside the writer's own `test_kula_kwl.py`; `python3 -m compileall -q tools/` and `ruff check tools/` at the release [.github/workflows/ci.yml](../.github/workflows/ci.yml) pins complete the Python checks.

The motion reader's tests run over a hand-typed fixture of the readings, `motion_fixture.py`'s `GAME` for the base's executable and `GAME_EU` and `GAME_JP` for the PAL and the Japanese executables' where they differ, a reading an executable has no instruction for None, which covers most of the readings' keys, so each module's table functions and the relations they hold run over all three and a relation false on any executable's readings fails without a disc.

`test_kula_motion.py` composes the whole table over each of the three and holds the ball's breath in it, the cap the time is taken against, its divisor and the ticks of a second, to the figures the release files under `public/releases/` ship for that executable, the base's `public/objects.json` where a release ships no entry of its own, so a figure that moves in the fixture or in a shipped file fails there.

The places of the registry's names the fixture carries for a release are read off its map whatever the map has pending, since the fixture's readings are typed by hand and not read through the map.

What holds the readers to an executable is each tool's own run against its disc, `python3 tools/kula_motion.py --release <id>` and `python3 tools/kula_skins.py --release <id>` with that release's disc variable set, which stop at the first instruction that is not the one expected, and the tool's table against the disc, which the build compares.

`test_kula_motion_releases.py` holds the fixture's PAL and Japanese readings to the relations the map writer accepts for each release: each is the base's, a rate or a count scaled by the two frame rates in either direction of truncation where the rates differ, an offset the fixture's own words give, a key the hand table lists as tuned, None where it lists the reading as absent, the map's places for the registry's names, the hand table's words for the end screen's pairs, an address of the release's own or a word of its data in the base's shape, and a reading that fits none fails naming it.

The same file holds the hiding sets the PAL and the Japanese readings give to the base's, the Japanese paths folding kinds the base tests one by one into ranges.

`test_kula_release.py` holds the release reader the same way, to a fixture of each release's executable's words, every stretch the readings match at its own address in a blob of that executable's size, with the release's committed map beside it where it has one for the word the end screen letters a perfect level with, and to a changed word at any reading stopping it.

`test_kula_motion_maps.py` holds the readers to every committed map the same way, over an executable of that release's size laid from the map's own words at the map's places: every row's word decodes to its text, every keyed row's value reads through `Code` by the row's US address alone, every registered instruction with a pattern is read by the map's pattern at its place whatever row stands there too, one the map keeps no pattern for by the pattern the reader gives whatever row stands there, an absent row reads None through every reader asked for it once the instruction it names stands there, a changed word at a keyed row's or an absent row's place stops the reader naming the place, every registered constant has its value in the map in the registry's shape, and a map with a pending row is refused, what it has pending read off its file without building it.

A committed map that still has pending rows is held the same way by the rows and the names it has, every registered name it lacks being among what it has pending, and loading it as a reader would is refused.

A reading only the disc can hold is held by the tool's own check against each of the three discs, `python3 tools/kula_kwl.py --check` with `KULA_DISC` set and `--release eu` or `--release jp` with `KULA_DISC_EU` or `KULA_DISC_JP` set, or by a rebuild with `python3 tools/kula_build.py` that changes nothing committed.

`test_kula_kwl_check.py` holds the check the same way, a class for each release that runs where that release's variable is set and holds every level of its disc, rebuilt, to the disc in play and to that release's tables of the words the rebuild writes differently and of the levels whose records it does not keep one for one.

`test_kula_sector.py`'s disc class runs per release the same way, each where its variable is set, holding the pack, directory and sampled sectors it rebuilds to that image's counts.

The release files are held the same way, each to its own disc: `test_kula_build.py`'s class for each runs where the release's variable is set and holds the committed file to what the build writes for that disc, and `python3 tools/kula_build.py --all` with the three variables set changes nothing committed.

The sheets a release file names are held by the same class to files under `public/tex/<id>/` of the atlas's size, none lying there unnamed, and by the rebuild, which writes them again byte for byte.

The release reader's table of addresses is held to the three executables by its own run, `python3 tools/kula_release.py --release <id>` with that release's disc variable set, which stops at the first instruction that is not the one expected.

## Where a check lives

A unit test holds anything a module computes: the simulation and the pure modules under `play/`, the camera's arithmetic, the sentences, the formats and their readers and writers.

A browser test holds only what only a browser shows: layout and boxes, a pointer or a key reaching a control, focus, the lazy load, the canvas's pixels and the live region. It asserts the wiring, that the strip says one thing after another, and never replays frame by frame what a unit test replays.

Two cases show the line. The lethargy pill's pace is held pass by pass in `tests/unit/passes.test.js`, and the browser asserts once that a step of a sixtieth runs one game frame to the frame of the take and two run one from the frame after. The sunglasses' spells are held frame by frame in `tests/unit/rules-under.test.js`, and the browser asserts that every invisible block shows while they last, blinks as they wear off and hides after, the strip saying so.

A game formula is never re-derived in a test; the test reads the table's word and the module's result.

## How a test is added

A spec file is one subject, named for it: a new browser test goes in the spec of its subject, and a new spec is made only for a subject no spec holds. The helpers two specs need live in a helper module beside them, `tests/browser/helpers.js` for what the map's specs share and `playhelpers.js`, `drafthelpers.js`, `patchhelpers.js` and `communityhelpers.js` for their areas; a helper one spec needs stays at that spec's head. Read a helper module's exports before writing a helper of your own.

A browser test of play holds the page's clock before its first step of the game, through `frozen`, `onward` and `stepUntil` in `helpers.js`, opens its level through `drafted` or the play helpers' drafts, and reads the frames it means; it waits on the wall clock only where the wall clock is its subject. The live region, the toasts, the drawer and the hash's deferred write run on timers and animation frames the held clock does not drive, and a held-clock test awaits or flushes them, or installs Playwright's own clock before the page loads where a timer is what it waits for.

A tile's picture is painted from an intersection observer's callback, which the browser runs on a frame of its own once the tile has come within a screen of showing, so a browser test of the tiles awaits the paint with a poll rather than reading it after the step that scrolled the tile in, and reads a repaint an update or a change of density gives a tile in view in the same step, since that paint is synchronous.

A unit test of the simulation builds its level from the builders beside its file, `rules-level.js`, `ball-lattice.js`, `hazards-level.js` or `project-doc.js`, which also set the viewer's state from the fixtures.

A feature commit adds a unit test where the change is arithmetic, one assertion to the browser test of the same behaviour where it is wiring, and a new browser test only for a new behaviour the browser alone shows; its body names the unit test, by file and title, that holds what the change computes.

## The budgets

A module, a stylesheet partial, a spec or any other script under `tests/` but a unit test stays under 800 lines and a unit test or a tool under 1,000, held by `tests/unit/sizes.test.js`; a file already over its cap stands in the test's table at the next hundred above its size, a row a commit may lower and none may raise, and the commit that brings the file under the cap takes its row out. A change that would push a file past its cap or its row splits the file first, where its sections join, a subject to a file.

A browser test runs under five seconds on a developer's machine and ten in CI; one that cannot carries `test.slow()` with a line saying what it waits for, and the suite's reporter names any other and fails the run. The suite's wall time locally is its tests' time spread over the workers; in CI it is the sum over the workers of each shard, so only cheaper tests lower it.
