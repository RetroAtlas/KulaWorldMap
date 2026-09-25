# 20. Split the renderer

## What and why

[render.js](../public/js/render.js) was 1,086 lines on 2026-09-25 (`wc -l public/js/*.js`), two and a half times the next module, and holds the atlas cache, the six faces and their shades, the visible walk and its painter's order, the block's faces and how a texture is laid on one, the kind looks and the vanishing block's cycle, the objects and their motion, markers, labels and facings, shadows, rails, the ground grid, the scale bar and the pick buffer. Every item since 14 has landed in it and the next will too. Nothing in it is wrong; it is one file doing two jobs, drawing blocks and drawing the things that stand on them, which share only the projection and the painter's order.

Two things make the split worth doing before the next feature rather than after. A reader who wants to know how a face is painted should not have to walk past the corkscrew's bounce, and the shared viewer library of [item 22](item-022-one-viewer-across-the-maps.md) needs seams of this kind to be cut at all.

## Sketch

The seam is the block and the thing: `cube`, `paint`, `kindTint`, `LOOK`, `vanishingLook`, `kindOf` and the atlas on one side, `drawThing`, `drawObject`, `drawShadow`, `drawMarker`, `drawFacing` and the labels on the other, with `draw`, `visible`, `travelling` and the pick buffer holding the two together. `state.js` already owns the projection. No behaviour changes, so the browser suite passing unchanged is the proof.

## Ruled out

Nothing yet.
