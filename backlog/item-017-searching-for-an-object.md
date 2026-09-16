# 17. Searching for an object

## What and why

Checked on 2026-09-16: searching for an object shows one instance and stops, where a level may hold many. Choosing a result centres the view on it, and from then on dragging orbits about that object rather than about the level, with no way back short of choosing the level again. Whether that is a bug or a feature is open.

## Sketch

The search is [search.js](../public/js/search.js); the view turns about `state.target`, which `centreOn` in [navigate.js](../public/js/navigate.js) sets.

## Ruled out

Nothing yet.
