# 31. Dragging a run's end

## What and why

A run is laid in two clicks and moved the same way: a click with a platform or laser brush on a run's own block takes it as the first click, and the second lays the run anew to the cell clicked ([docs/viewer.md](../docs/viewer.md)). The second gesture was first sketched as a drag of the run's far end and put aside; what landed is the re-lay through two clicks, which needed no new seam.

## Sketch

A drag on the map turns the camera unless a handler registered with the pointer module takes it: the module asks the handler at every press, handing it a function that reads the cell under the pointer so that the pick is paid for only where a handler wants it, and a handler that answers has the moves and the release, the camera held still for it, while a press that wanders less than five pixels is a click whoever holds the drag ([public/js/viewer/chrome/interaction.js](../public/js/viewer/chrome/interaction.js)). So a drag of a run's end is a handler that answers for a press on the far end of a run and declines every other press, nothing new in the seam: the preview is the one the two-click run has, the run toward the hovered cell with every cell tinted, and the release is the second click, so the rules and the refusals are already there. On a touch screen a finger's drag is the orbit's too, and the two-tap convention would need a hold on the end before the drag.

Open: whether the drag belongs to the run tools alone or to Select on a selected run's end, which would take the orbit away from that cell; whether a platform's length, 2 or 3, is dragged as well; and how the end to take hold of is shown, since the far end of a run at rest is a cell like any other until the handler answers for it. Ruled out: a handle that is not the map, drawn at the far end and listened to on an element of its own, since the seam makes it needless; the two-click re-lay stays whatever is added.
