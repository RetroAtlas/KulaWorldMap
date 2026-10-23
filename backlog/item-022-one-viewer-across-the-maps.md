# 22. One viewer across the maps

## What and why

Four maps sit side by side under the RetroAtlas name, and they are built the same way: dependency-free ES modules under `public/js`, no build step, a canvas with a sidebar beside it, a hash that is a permalink, a search with a scope bar.

Counted 2026-10-23 (`find */public/js -name '*.js' -not -path '*/vendor/*' | xargs wc -l`): `OddworldMap` 15958 lines across 69 modules, this map 20781 across 72. Counted 2026-09-22 (`wc -l */public/js/*.js`): `MetalSlugMap` 1068 across 10, `HerculesMap` 931 across 13.

The module names line up across all four (`state`, `navigate`, `search`, `sidebar`, `interaction`, `render`, `main`), and two files have already converged: `public/js/viewer/chrome/searchquery.js`, copied over when the search was rebuilt, is OddworldMap's module line for line but for its comments, and its unit test is OddworldMap's test but for its comments, its examples, which are each map's own, and the path it imports from.

`public/js/viewer/ui/dom.js` here and in HerculesMap are the same file but for `el`'s signature: the `$` and the `on`/`emit` bus are identical, written twice by two sessions who never saw each other's.

What this would settle is where that shared code lives, which map is the reference for each piece, and by what mechanics a repo picks it up, so that the next map gets a search, a permalink and a drawer for free and the fifth feature is written once rather than four times.

The cost of leaving it is visible already, in both directions. The same thing is written twice: the event bus, the hash writer (an `applyHash`/`writeHash` pair and a coalescing of the writes in all four, the same 350 ms debounce here and in OddworldMap), the scope bar (`scope = "all"` and a row of buttons, here and in OddworldMap and MetalSlugMap), the drawer with its scrim and `aria-expanded`, the display preferences saved to `localStorage`, the help overlay built from a table of keys. And each map is missing what its sibling got right: this map's search cursor is keyed by what its row names, so it survives a re-render, where OddworldMap's is an index it clears on every keystroke; OddworldMap's live region waits 250ms for a run of steps to stop, where this one speaks every one. None of these is worth porting by hand four times; each is worth writing once.

## Sketch

OddworldMap is the reference where both have a thing: it has commits on 88 days since 2026-07-12 against 40 here since 2026-09-04, counted 2026-10-23 (`git log --format=%ad --date=short | sort -u | wc -l` in each), and it has met the cases this map has not (a dataset still loading, an embedded map, a dialog over a dialog). Where this map's version is the better one it wins on its merits, and the ones named above are those known today.

Every extraction is a "best of the two" pass, not a copy of either side.

The slices, in the order they pay off, each a commit of its own and each leaving both maps green:

- **The search list.** `searchquery.js` is identical but for the comments in it and in its test, the test's examples and the path the test imports from, which are each map's own, and moves as it is. `searchtext.js` is map-agnostic already. About half of [search.js](../public/js/viewer/chrome/search.js) is the list machinery rather than this map's data: the highlighting, the grouping with its show-more, the scope bar, the summary line, the cursor and the keys, the listbox's ARIA pairing. The seam is an adapter the host passes in: `candidates()`, `groupOf(hit)`, `row(hit, terms)`, `jump(hit)`, `scopes()`, plus an optional input debounce, which OddworldMap needs at its size and this map does not. The candidate shape both maps already produce, `{name, text, tokens, rank}` from `match*(data, groups, terms, current)`, is what makes this the first slice.
- **The hash writer and the URL.** The generic half of [navigate.js](../public/js/viewer/chrome/navigate.js): coalescing the writes, the push that makes a change of place a history entry while a camera move only replaces, writing both through `pushState` and `replaceState`, which raise no `hashchange` and so leave no write of one's own to guard against, and putting a hash the viewer cannot honour back. The map supplies `format()` and `parse()` and nothing else, which here are the module [permalink.js](../public/js/viewer/permalink.js), with the grammar's unit tests beside it. This map's rules were settled in item 18 and OddworldMap's before it; they agree, in two spellings, OddworldMap's `scheduleHash` keeping a push sticky until its timeout of nothing fires where this map's `writeHash` writes it at once.
- **The drawer, the preferences and the filter lists.** `setSidebar`, the scrim, the `matchMedia` breakpoint, the checkbox block saved to and restored from `localStorage`, and the list of kinds with counts, `aria-pressed` and a shift-click that isolates one. HerculesMap has the same three and MetalSlugMap two of them.
- **The help overlay and the dialog.** A table of `[keys, what they do]` drawn into an overlay, with focus returned on close and the back button closing it, which is OddworldMap's `dialog.js` plus this map's `dialog.js` and `modal.js` plus MetalSlugMap's `dialog.js`, three copies of one thing. This map's `dialog.js` is already the better of its own and OddworldMap's: the history entry, the keys kept inside and Tab going round, from OddworldMap's, and the focus handed back to whatever held it, from this map's, so the slice can start from it. The settings panel rides on it and goes with it: [settings.js](../public/js/viewer/ui/settings.js) opens a dialog of switches from a button and marks each one standing away from its `defaultChecked`, and knows nothing of what the switches do, which the host wires and saves as it does its other switches.
- **The toast.** A notice that comes and goes at the foot of the map. [toast.js](../public/js/viewer/ui/toast.js) is OddworldMap's, which stacks three and counts the rest, restarts a notice repeated rather than stacking it again, and is a live region of its own; here its timings are its own rather than a config's and it finds its stack in the page when first used, so it moves as it is. MetalSlugMap has a one-notice toast in its `main.js` that it can take over.
- **The link arrow.** [arrow.js](../public/js/viewer/draw/arrow.js) is OddworldMap's way of drawing a link, lifted into a module that knows nothing of either map and draws in the canvas's own units: `arrowhead` is OddworldMap's as it stands, `bow` gives the curve as a cubic, which at a distance is the quadratic `paintConnections` draws with `quadraticCurveTo` and swells into a loop where the ends meet on the screen, and `arrow` strokes it and puts the head on it with its base on the curve.

  OddworldMap's `paintConnections` draws with `bow` and `arrow` by passing its bends in world units and no loop, which keeps its curves and lays the head along the curve rather than along its end tangent, or a loop for the stacked pairs that arc apart today. Its `paintWires` draws straight lines and heads only the wire in focus, so it takes `arrowhead` alone. This map's `drawLink` in [overlays.js](../public/js/viewer/draw/overlays.js) is the other caller, and the rim and the dash stay with each caller as its own style.

- **The corner inset.** A small canvas floated over the map's bottom right, above its readout, asked for by every frame drawn and sized to the device's pixel ratio, which takes the presses that land on it so that the map beneath hears none: OddworldMap's minimap, whose presses scrub the view, and this map's compass in [compass.js](../public/js/viewer/draw/compass.js), whose presses do nothing. Neither knows what the other draws, so what moves is the float's look, the backing store's sizing, rounded before it is compared so that a fractional ratio does not reallocate it every frame, and the corner itself, which here is a row that lets a press between its widgets through to the map and holds the fit button beside the compass.
- **The bus and the spoken map.** `dom.js` whole, and the a11y pattern: one summary sentence into a live region and into the canvas's own name.
- **The CSS tokens.** The four maps already share a vocabulary in two spellings, `--panel-2`/`--ink` here and in HerculesMap against `--panel2`/`--text` in OddworldMap and MetalSlugMap. Agreeing one spelling is the whole of the first step, and the rows, the drawer and the dialog can then share a stylesheet. One name this map and OddworldMap already spell alike is `--surface-float`, what a float over the map stands on: the chip and the corner here, the panels there.

Mechanics: a repo of its own under the RetroAtlas org, plain ES modules with no build step of its own, vendored into each map at `public/js/lib/` with a manifest naming the version it came from, a script under `tools/` that copies a sibling checkout in, and a CI job that fails when the copy and the source differ.

Vendoring rather than anything cleverer is what keeps the deployed `public/` working from a plain clone and a plain static server, which is the rule the maps are built on, and what lets HerculesMap and MetalSlugMap, which have no `package.json` at all, take the library without taking a toolchain.

A git subtree is the upgrade once the library changes often enough for the copying to chafe.

The proof is that both suites pass unchanged, since none of this is a behaviour change on either side, plus the library's own tests: `node --test` for the DOM-free parts, which is most of the search, and a fixture page under Playwright for the list, the drawer and the dialog.

That fixture is also what gives HerculesMap and MetalSlugMap their first checks.

What stays in each map: the renderer, `render.js` and the modules it draws with, and the camera half of `interaction.js`, since this map orbits a 34-cube lattice and the others pan and zoom a plane; `data.js` and `model.js`, which are each disc's own shapes; everything under `tools/`, which shares no file with OddworldMap's today.

This map's renderer is split between the frame, the blocks and the things that stand on them, and of the slices above only the link arrow touches it, as a module both renderers call.

This file goes when the library exists and its first two slices, the search list and the hash writer, are running in this map and in OddworldMap.

A slice on its own is a commit here and a commit there, not a deletion, and the commit that lands one says which map's version won and why.

## Ruled out

An npm package with a bundler: the no-build-step rule in [CLAUDE.md](../CLAUDE.md) is what keeps the page working from a plain static server, and two of the four maps have no `package.json` to install into.

A git submodule: a clone without `--recursive`, or a Pages checkout without `submodules: true`, leaves `public/js/lib` empty and the page blank, which is the one failure the vendored copy cannot have.

One repo holding all four maps: each is deployed from its own `public/` by its own Pages workflow, and moving those is a much larger change than sharing code needs.

Copying by hand, which is what happens now: nothing checks that the copies still agree, and `searchquery.js` already agrees with OddworldMap's module in its code alone.
