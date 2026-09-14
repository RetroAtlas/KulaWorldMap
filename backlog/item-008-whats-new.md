# 8. A changelog the map can show

## What and why

OddworldMap keeps `changelog.json` and a What's New panel: a dated, curated, player-facing journal of the site, with a dot marking what arrived since you last looked. This map has neither, and it is young enough that starting the journal now costs nothing and starting it in a year costs the first year.

Deliberately not started as data alone. A `changelog.json` that nothing reads is a file that goes stale in a month; the entry and the panel that shows it ship together or not at all.

## Sketch

Entries are curated rather than generated from commits: a player-facing headline and a detail paragraph, dated, tagged new/improved/fixed. The panel is a dialog, which the map now has one opener for (`js/modal.js`).
