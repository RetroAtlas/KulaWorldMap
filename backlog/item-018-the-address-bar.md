# 18. The address bar: history, and the level's key

## What and why

Two things about the URL, found 2026-09-16.

The browser's Back leaves the page. The viewer only ever calls `replaceState` (`writeHash` in [navigate.js](../public/js/navigate.js)), so nothing done in the map makes a history entry. OddworldMap, beside this repo at `../OddworldMap`, settled this carefully: choosing a level or following a link makes an entry, dragging the view does not, and this map should behave the same; choosing a search result should make one too. Which actions do and which do not is for the design to say, action by action.

Undecided: the permalink keys the level by its place in the flat list (`#L164` is LEVEL 106), which nobody can read. Names are not unique (nine levels are OBJ LEVEL, and LEVEL 135 appears twice, the second shown as LEVEL 136) and 60 levels have no shown number, so a readable key needs a fallback, and links already shared need to keep working.

## Sketch

`writeHash` and `applyHash` in navigate.js, and the `hashchange` handler there.

## Ruled out

Nothing yet.
