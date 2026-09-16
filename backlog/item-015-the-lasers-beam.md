# 15. The laser's beam

## What and why

Checked in play on 2026-09-16: a beam is not seen through a block, and a laser emits one beam, where the map draws four per laser and draws them over every block. Drawing the beam over the blocks was a decision (`drawBeam` in [render.js](../public/js/render.js) says why), so this reverses one rather than fixing a slip.

Screenshots from play, in `out/shots/`: `clock-switch-laser.png`, `laser-pair.png`.

## Sketch

A level's beams are worked out in [data.js](../public/js/data.js) (`beams`) and drawn in render.js.

## Ruled out

Nothing yet.
