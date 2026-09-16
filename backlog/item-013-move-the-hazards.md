# 13. Move the hazards across blocks

## What and why

The stars and the wheel travel in play and the map turns them on the spot. Where they go is half in the data: a star's `facing` field points along a straight run of cells a ball could stand on, to the platform's edge or a wall, and on LEVEL 141 the four the walkthrough calls a group travelling in a line face `+x` along one seven-cell stretch with their reaches adding to the same length, and on LEVEL 22 the seven glide along the platform's rows as it says. The other half is not, and the two stars differ, seen in play: type 50, the long-spiked one, is slow and travels the space it has, turning back at any wall or object in its way, a coin included, so a run bounded by edges and walls alone is wrong wherever a pickup sits on it; type 52, the short-spiked one, is quick and goes back and forth over a fixed stretch as if on a spring, whose length the data does not give. A group in a line has to turn as one. The rolling stone goes round a course the walkthrough calls set and the data does not describe.

Travel belongs behind a Display switch when it comes, since a thing drawn where it is not is the wrong thing for a map by default.

## Sketch

For type 50 a run bounded by edges, walls and every object on the face, the stars of a run turning together when the first of them reaches an end; for type 52 a stretch measured in play; and a pace for each read off the game rather than chosen. The rolling stone's course needs the walkthrough's "clockwise" of LEVEL 52 matched against its four stones' cells and facings, which may say it follows the ring.

## Ruled out

A run bounded by edges and walls only (3ce9756, reverted): a star walked into a coin.
