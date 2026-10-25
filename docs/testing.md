# The checks

Every check of the repo lives where what it checks is computed: a unit test for what a module computes, a browser test for what only a browser shows, a pixel capture for a change meant to draw as before, and the Python suite for the tools, with the disc where a reading needs it. [CLAUDE.md](../CLAUDE.md) states the rules under "Where a check lives"; this document says what each suite is, how it runs and how a test is added.

## The suites

`npm test` runs the unit tests under `tests/unit` with Node's own runner, every file in its own process, in a few seconds; they read the shipped data through `tests/unit/fixtures.js` (`map_data.json`, `objects.json`, `annotations.json` and `packs.json`) and the synthetic disc image `tests/unit/synthetic.js` builds from the page's own writers.

The unit tests also hold the repo to its conventions: `imports.test.js` the layers, the preloads and the pure modules of play, `prose.test.js` the docs' one-point lines, `sizes.test.js` every module, spec, unit test and tool to a size, `docs.test.js` and `counts.test.js` the README's and the docs' figures to the data, `hashes.test.js` that nothing cites a commit by its hash, `site.test.js` what the site may say, and `backlog.test.js` the backlog's numbering and links.

`npm run test:browser` runs the browser tests under `tests/browser` with Playwright in Chromium, at 1280 by 720, against the site served from `public/` on port 8480; every test opens its own page, so the tests of one file run spread over the workers as the files do.

One spec runs with its name after the command, `npm run test:browser -- play-hud`, and one test with `-g` and a piece of its title.

`npm run pixels` renders the working tree and a ref, `HEAD` unless one is given, over the matrix in `tests/pixels/cases.js` with the clock held still, the ball stood on a level for the play cases, and names every capture that differs; it proves a change meant to draw as before, a move or a re-wiring, and is not run for one meant to draw differently.

`npm run frame` and `npm run boot` are measurements, not checks: where a frame's time goes, and when the page's first frames land over a throttled network.

`python3 -m unittest discover -s tools/tests` runs the tools' tests without the disc, the motion reader's one file a module, `test_kula_motion_<subject>.py`, over the shared `motion_fixture.py`; `python3 -m compileall -q tools/` and `ruff check tools/` at the release [.github/workflows/ci.yml](../.github/workflows/ci.yml) pins complete the Python checks.

A reading only the disc can hold is held by the tool's own check against the disc, `python3 tools/kula_kwl.py --check` with `KULA_DISC` set, or by a rebuild with `python3 tools/kula_build.py` that changes nothing committed.

## Where a check lives

A unit test holds anything a module computes: the simulation and the pure modules under `play/`, the camera's arithmetic, the sentences, the formats and their readers and writers.

A browser test holds only what only a browser shows: layout and boxes, a pointer or a key reaching a control, focus, the lazy load, the canvas's pixels and the live region. It asserts the wiring, that the strip says one thing after another, and never replays frame by frame what a unit test replays.

Two cases show the line. The lethargy pill's pace is held pass by pass in `tests/unit/passes.test.js`, and the browser asserts once that a step of a sixtieth runs one game frame to the frame of the take and two run one from the frame after. The sunglasses' spells are held frame by frame in `tests/unit/rules-under.test.js`, and the browser asserts that every invisible block shows while they last, blinks as they wear off and hides after, the strip saying so.

A game formula is never re-derived in a test; the test reads the table's word and the module's result.

## How a test is added

A spec file is one subject, named for it: a new browser test goes in the spec of its subject, and a new spec is made only for a subject no spec holds. The helpers two specs need live in a helper module beside them, `tests/browser/helpers.js` for what the map's specs share and `playhelpers.js`, `drafthelpers.js` and `patchhelpers.js` for their areas; a helper one spec needs stays at that spec's head. Read a helper module's exports before writing a helper of your own.

A browser test of play holds the page's clock before its first step of the game, through `frozen`, `onward` and `stepUntil` in `helpers.js`, opens its level through `drafted` or the play helpers' drafts, and reads the frames it means; it waits on the wall clock only where the wall clock is its subject. The live region, the toasts, the drawer and the hash's deferred write run on timers and animation frames the held clock does not drive, and a held-clock test awaits or flushes them, or installs Playwright's own clock before the page loads where a timer is what it waits for.

A unit test of the simulation builds its level from the builders beside its file, `rules-level.js`, `ball-lattice.js`, `hazards-level.js` or `project-doc.js`, which also set the viewer's state from the fixtures.

A feature commit adds a unit test where the change is arithmetic, one assertion to the browser test of the same behaviour where it is wiring, and a new browser test only for a new behaviour the browser alone shows; its body names the unit test, by file and title, that holds what the change computes.

## The budgets

A module or a spec stays under 800 lines and a unit test or a tool under 1,000, held by `tests/unit/sizes.test.js`; a file already over its cap stands in the test's table at the next hundred above its size, a row a commit may lower and none may raise, and the commit that brings the file under the cap takes its row out. A change that would push a file past its cap or its row splits the file first, where its sections join, a subject to a file.

A browser test runs under five seconds on a developer's machine and ten in CI; one that cannot carries `test.slow()` with a line saying what it waits for, and the suite's reporter names any other and fails the run. The suite's wall time locally is its tests' time spread over the workers; in CI it is the sum over the workers of each shard, so only cheaper tests lower it.
