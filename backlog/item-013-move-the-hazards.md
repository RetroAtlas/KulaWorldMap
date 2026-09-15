# 13. Move the hazards across blocks

## What and why

The stars and the wheel travel in play and the map turns them on the spot. Where they go is half in the data: a star's `facing` field points along a straight run of cells a ball could stand on, to the platform's edge or a wall, and on LEVEL 141 the four the walkthrough calls a group travelling in a line face `+x` along one seven-cell stretch with their reaches adding to the same length, and on LEVEL 22 the seven glide along the platform's rows as it says. The other half is not: seen in play, a star turns back at any object in its way, a coin included, so a run bounded by edges and walls alone is wrong wherever a pickup sits on it, and a group in a line has to turn as one. The wheel goes round a course the walkthrough calls set and the data does not describe.

Travel belongs behind a Display switch when it comes, since a thing drawn where it is not is the wrong thing for a map by default.

## Sketch

A run bounded by edges, walls and every object on the face, the stars of a run turning together when the first of them reaches an end, and a pace read off the game rather than chosen. The wheel's course needs the walkthrough's "clockwise" of LEVEL 52 matched against its four wheels' cells and facings, which may say it follows the ring.

## Ruled out

A run bounded by edges and walls only (3ce9756, reverted): a star walked into a coin.
