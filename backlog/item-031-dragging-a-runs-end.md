# 31. Dragging a run's end

## What and why

A run is laid in two clicks and moved the same way: a click with a platform or laser brush on a run's own block takes it as the first click, and the second lays the run anew to the cell clicked ([docs/viewer.md](../docs/viewer.md)). The second gesture was first sketched as a drag of the run's far end and put aside; what landed is the re-lay through two clicks, which needed no new seam.

## Sketch

A drag on the map turns the camera: the pointer's press, move and release are the orbit's, and a press that wanders less than five pixels is a click ([public/js/interaction.js](../public/js/interaction.js)). The editor takes its clicks, its hover faces and its tip lines through registration seams and takes no press, so a drag of a run's end needs either a seam that hands a press over, with the camera held still for it, or a handle that is not the map, drawn at the far end through the cell hook and listened to on an element of its own. With the press handed over, the preview is the one the two-click run has, the run toward the hovered cell with every cell tinted, and the release is the second click, so the rules and the refusals are already there. On a touch screen a finger's drag is the orbit's too, and the two-tap convention would need a hold on the end before the drag.

Open: whether the drag belongs to the run tools alone or to Select on a selected run's end, which would take the orbit away from that cell; and whether a platform's length, 2 or 3, is dragged as well. Ruled out: nothing; the two-click re-lay stays whatever is added.
