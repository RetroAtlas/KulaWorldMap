# The camera

How the game frames a level: where its camera stands and looks while the ball rolls, how it flies in as a level opens, and the free camera the Japanese release gives the Select button, read off the code of the NTSC-U release with `tools/mips.py`. None of it comes from the level: the camera is a rule the executable applies to the ball's start and to the lattice. Angles are in 4096ths of a turn and distances in units of which a block is 512, as in [motion.md](motion.md). The ball's record is at `0x800ba114`, and a view is three rows, right, down and ahead, that the geometry coprocessor turns a point by before it adds the view's translation and divides by depth. [level-format.md](level-format.md) is the same document for the level file.

## The ball's frame

The start ([level-format.md](level-format.md)) calls `0x80038178` with the start slot's face and its `f2`, and it lays three unit vectors in the ball's record: up, the face's outward normal; ahead, the face's first tangent turned a quarter turn about the inward normal for each step of `f2` past 1, which is the rule an arrow's facing follows; and right. So the ball starts facing the way the map turns it, and the camera looks that way.

## The view in play

`0x80034a50` builds the view each frame from the ball's frame: its rows are right, the normal negated and ahead, pitched down by 250 (`0x80060f58` turns a view about its right axis), which is 22 degrees. Its translation puts the centre of the face the ball stands on, the cell times 512 plus 256 along the normal, 250 below the middle of the view and 800 ahead of the eye, so the eye stands 648 units behind that point and 531 above it, a block and a quarter back and a block up. The projection is the coprocessor's, with a screen distance of 160 (`0x800a33e4`, set through `0x800607a8` and written nowhere) on a screen 320 wide and 240 high with its middle at the centre (`0x8004ee90`): 90 degrees across and 74 from top to bottom. The point under the ball is 50 lines below the middle and a block is a third of the screen wide there. Other words of the ball's record add turns and a pull back to this view while the ball is on the move, and at rest they are zero.

## The fly-in

As a level opens, and again on a restart, `0x80033e94` lays a cubic curve (evaluated by `0x80033cbc`) from 8 blocks behind the ball and 8 to its left, through 6 back and 3.3 left and then 4 back, to 100 units above the face it stands on, and `0x8003431c` flies the view along it while its parameter runs from 0 to 1024: 16 a frame to 928, then 13, 12 and down to 5, 69 frames in all. Over the flight the view turns from a quarter turn to the right to straight ahead (`0x800610f8` turns a view about its down axis), rolls from upside down to upright (`0x80061298`, about its line of sight), and closes in from 14,000 units further out along that line, so the level opens far off to the ball's left, upside down, and swings in behind it. The view in play then takes over. The one mode whose word at `0x800a33b0` is 1, in which the level's clock does not run either (`0x8003b490`), skips the flight.

## The free camera

The same routine measures the lattice: the box round every cell it fills, the box's middle, and the distance from the middle to the furthest of them, plus 1200. While the ball's word at `0x800ba296` is set, which the Japanese release's Select button does and the README's cheat does on this one, `0x80034684` holds the eye that far from the box's middle and turns it with the pad. The level feeds this camera nothing either.
