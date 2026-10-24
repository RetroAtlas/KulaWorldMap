# The camera

How the game frames a level: where its camera stands and looks while the ball rolls, how it flies in as a level opens, and the free camera the Japanese release gives the Select button, read off the code of the NTSC-U release with `tools/mips.py`. None of it comes from the level: the camera is a rule the executable applies to the ball's start and to the lattice.

Angles are in 4096ths of a turn and distances in units of which a block is 512, as in [motion.md](motion.md). The ball's record is at `0x800ba114`, and a view is three rows, right, down and ahead, that the geometry coprocessor turns a point by before it adds the view's translation and divides by depth.

[level-format.md](level-format.md) is the same document for the level file.

## The ball's frame

The start ([level-format.md](level-format.md)) calls `0x80038178` with the start slot's face and its `f2`, and it lays three unit vectors in the ball's record: up, the face's outward normal; ahead, the face's first tangent turned a quarter turn about the inward normal for each step of `f2` past 1, which is the rule an arrow's facing follows; and right. So the ball starts facing the way the map turns it, and the camera looks that way.

## The view in play

`0x80034a50` builds the view each frame from the ball's frame: its rows are right, the normal negated and ahead, pitched down by 250 (`0x80060f58` turns a view about its right axis), which is 22 degrees. Its translation puts the ball's centre, 100 off its face, with a platform's travel added (`0x8002f3c0`), 250 below the middle of the view and 800 ahead of the eye, so the eye stands 648 units behind that point and 531 above it, a block and a quarter back and a block up.

The projection is done by the coprocessor, with a screen distance of 160 (`0x800a33e4`, set through `0x800607a8` and written nowhere) on a screen 320 wide and 240 high with its middle at the centre (`0x8004ee90`): 90 degrees across and, the scene squashed to 15 of 16 top to bottom by the scale below, 77 from top to bottom. The ball's centre is 47 lines below the middle and a block is a third of the screen wide there.

The rows the view is built from are the ball's side, normal and heading as the view last took them, with a yaw and a pitch of the record's own added, which a turn and a face change ramp from the old frame to the new over 19, 13 or 16 frames ([motion.md](motion.md)), and at rest both are zero.

While the ball falls, or in a jump while its count at 404 is under 10, its last seven rows, over no block, a word at 504 of the record pitches the view further down: it grows each frame by a rate that rises by one a frame from 3, so by 4, 5 and on to 32, until the word passes 550, then by a rate that falls by one a frame to no less than 10 until the word reaches 650 (`0x80035050` to `0x80035128`), 57 degrees in all; once the ball is neither falling nor in those rows the rate is 3 again (`0x8003512c`), and on a frame the word has not grown, over a block or at rest, it comes back by 18 (`0x80035180`, `0x800351a8`).

R1 held adds 21 a frame to the same word, to 650 (`0x80034f60`, `0x80034f90`), and R2 holds a word of its own that grows and comes back the same way and pitches the view up instead, bringing the eye in by half of it and the target up the screen by a third (`0x80034fd8`, `0x80035368` to `0x80035430`); the view is pitched down by 250 plus the first word (`0x800354cc`, `0x800354d4`). The same routine turns the ball's own frame, and not the view alone, as a wall ahead takes the ball up it and as a turn is asked ([motion.md](motion.md)).

**The matrix the coprocessor turns a point by is the view's rows with the first scaled by the word at `0x800a33d8` over 4096 and the second by the word at `0x800a33e0` over 4096, which load as 4096 and 3840; the lethargy pill rolls the view by its word and stretches the scene by a waning sine, and the screen flashes white as the pill is taken, carries a tinted ghost of the last frame while it works and fades a white glow as it ends.**

Each pass the loop draws the background, the level and the sun's flare, each from a copy of the view of its own (`0x80041014`, `0x8004101c` and `0x80041034` call `0x8002a1b4`, `0x8002a3c0` and `0x80014d40`): the level's copy is the view as it is (`0x8002a4b4` to `0x8002a548`), and the background and the flare each take 8192 off every word of their copy's translation and shift it down by 4 (`0x8002a250` to `0x8002a29c`, `0x80014e38` to `0x80014e64`).

Each copy reaches the coprocessor with its first row and its translation across times the word at `0x800a33d8` and its second row and its translation down times the word at `0x800a33e0`, each over 4096: the draws written by hand against the coprocessor load it so, the transform at `0x8005662c` (`0x80056680`, `0x800566b0`, `0x800566f4`) and the beams' draw at `0x80051754` (`0x800517a8`, `0x800517bc`, `0x8005181c`) among them, and the flare scales its copy itself (`0x80014d4c`, `0x80014d54`, `0x80014e70`, `0x80014e80`, `0x80014e88`, `0x80014eb8`, `0x80014ed0`) and loads it as the coprocessor's rotation and translation (`0x80014ee8`, `0x8006072c`, `0x80014ef0`, `0x80060754`) to put the world's sun on the screen (`0x80014f10` to `0x80014f2c`).

The words load as 4096 and 3840 and are put back to those as a level is left (`0x80041ba8`, `0x80020238` to `0x80020250`), so at rest the scene is drawn 15 of 16 as high as the coprocessor projects it, which is what a game authored for 256 lines does with 240 ([motion.md](motion.md)).

The view routine reads the lethargy pill's word at 548 of the record, `0x800ba338` ([motion.md](motion.md)), and while it is positive (`0x80035268`, `0x8003531c`) rolls the view about its line of sight (`0x80035360`, `0x80035364`) by the sine of 64 times the word, taken modulo a turn (`0x80035324`, `0x80035334` to `0x80035340`, `0x8003533c`), rounded toward nothing and shifted down by 5 (`0x80035344`, `0x8003534c`, `0x80035358`): 128 either way at most, 11 degrees, a cycle every 32 passes as the word comes down by 2, over the 180 passes the word is positive, 6 s at the two-blank wait the pill brings.

The hazards count the word down before the view reads it, so the roll's first angle is the sine at 64 times 360 and its last at 64 times 2. A positive angle tips the view's up to the left and turns the picture clockwise, since the routine scales the right and down rows by the cosine, takes the sine times the down row off the right row and adds the sine times the right row to the down row (`0x8006132c`, `0x800613bc`), so the first angle, 64 times 360 being five eighths of a turn round, tips the view's up to the right, 90 of 4096, 8 degrees.

The screen is the routine at `0x8002025c`, which the frame's draw runs each pass (`0x8001dcd0`) on the mode word the pill's case sets ([motion.md](motion.md); `0x80020260`, and `0x80020288`, `0x80020274`, `0x8002029c` and `0x800202a4` for its four states).

On the pill's own pass it draws a flat textured quad, code 44, over the whole screen, its corners a pixel past the width and the height (`0x800202cc`, `0x800202e0`, `0x800202f4`, `0x80020310`, `0x80020300`, `0x80020314`), showing the sprite 6 past the group the .GGI header's sixth bound starts (`0x80024058`, `0x80024060`, `0x80024068`, `0x80024274`, `0x8002428c`), [ggi.md](ggi.md)'s sprite 122, a white texel two across and one down uploaded with blend 1, which adds the quad to what is behind it, the quad blending where the descriptor's second byte says the upload named a blend (`0x8002423c`, `0x80024240`; the walker sets the byte and the page word at `0x80023048` to `0x80023054`, `0x80023198` and `0x8002319c`), at a colour of 128, the texel as it is (`0x80024200`, `0x8002028c`, `0x800202e8` to `0x8002034c`): a flash to white (`0x80020374`).

The same pass moves the mode on (`0x800202c4`) and sets two phases at 1024 and a magnitude at 780 (`0x8002037c` to `0x8002038c`).

On each pass after, while the pill works, a sprite of the other display buffer, the frame before, laid at startup with a page word for that buffer's place in video memory and the blend that takes half of each (`0x8002429c` to `0x800242b4`, `0x800242d8`), semi-transparent and shaded (`0x800242f0`, `0x80024314`, `0x80024324`, `0x80024320`), a texture page of 256 wide and the screen high (`0x800242fc`, `0x80024308`, `0x80024318`), with a second from 256 on for the rest of the width where the screen is 257 or wider (`0x800243ac`, `0x800243bc`, `0x800243c0`, `0x80020474`), is drawn with the colour (96, 112, 96) (`0x800203c4`, `0x800203f4`, `0x800203e8` to `0x80020430`, `0x800204a0`, `0x80020460`, `0x800206ac`): a greenish ghost of the last frame at half strength over or under the new one, so what moves trails; a first phase steps 106 a pass and has its sine taken and thrown away (`0x80020398`, `0x800203a0`, `0x800203c0`, `0x800203d4`).

The screen routine's tail runs on every pass the mode stands (`0x800206c8`): the magnitude wanes by 5 (`0x800206d8`, `0x800206dc`) and while it is positive (`0x800206e0`) the second phase steps 213 modulo a turn (`0x800206f0`, `0x80020708`, `0x8002070c`) and its sine times the magnitude over 4096 (`0x80020710`, `0x80020720`, `0x80020728`) is added to 4096 as the scale across and taken from 3840 as the scale down (`0x8002072c`, `0x80020734`, `0x80020738` to `0x80020744`).

So the scene is stretched wide as it is squashed tall and back, by the sine of the phase times a magnitude that is 775 of 4096 on the first pass and wanes 5 a pass, a cycle every 19 passes, to nothing over 155 passes, 5.2 s, after which the words stand within 5 of rest until the level is left.

On the pass the pill's word reaches nothing the hazards ask the end ([motion.md](motion.md)) and the routine sets a level at 80, lays the quad's corners again, draws the ghost once more and moves on (`0x8002051c`, `0x80020530`, `0x80020588`, `0x800205a8`, `0x80020518`); on each pass after it takes 8 off the level and, while that is not below nothing, draws the quad at it (`0x800205fc` to `0x80020604`, `0x8002062c`, `0x80020658`, `0x80020680`), 72 down to 0 over 10 passes, a white glow fading out, and below nothing clears the mode (`0x800206bc`), the frame loop's wait a blank again from the pass after.

The viewer rolls its view by the same word, the angle the table's scale and shift give the word the hazards leave, composed about the view's line of sight after its own yaw and pitch, a positive angle tipping its up to the left as in the game.

Its frame draws the screen from the words as the game's draw of the pass showed it: a flash to white on the pill's own pass, the frame last drawn, tinted by the table's colour over its grey, at half strength over the scene on each pass the pill works and on the end's pass, the order over or under being unread ([motion.md](motion.md)), and the white glow at the fade's level on each pass after.

The scene is neither stretched under the pill nor shaken on a landing ([motion.md](motion.md)), which is recorded here as not drawn.

The table ships the roll as type 32's `lasts.rock`, the screen as its `lasts.screen` and the screen's words as they load as `play`'s `screen`.

## The fly-in

**As a level opens, and again on a restart, the start lays a cubic curve from 8 blocks behind the ball and 8 to its left to 100 units above the face it stands on, where its centre rests, and the view flies along it for 68 frames, 1.13 s, before the view in play takes over.**

The level's start calls `0x80033e94` (`0x800362bc`), which takes the ball's heading, side and normal from its record at 12, 20 and 28, each a whole unit, and shifts them up by 12, to 4096, eight blocks (`0x80033ee4`, `0x80033f14`, `0x80033eb4`, `0x80033ebc`), and lays the curve's four points from the view's target at 388, which then holds the start's position on the face (`0x8002f36c` copies it from 60, laid at `0x800361c8` to `0x8003621c`) and which the first frame's rest state lifts 100 off the face, to the ball's centre with a platform's travel added ([motion.md](motion.md)):

- The last 100 along the normal from the target (`0x800341a4` to `0x800341bc`).
- The first 4096 against the heading and 4096 against the side from the last, 8 blocks behind and 8 to the left (`0x800341ec`, `0x800341f0`).
- The second a quarter of the way from the first to the last and a third of 4096 along the side, 3072 behind and 1707 to the left (`0x80034254`, `0x80034258`, `0x80034240`, `0x80034248`, `0x80034268`).
- The third 2048 against the heading from the last, 4 blocks behind (`0x800342ac`, `0x800342b0`).

The same routine puts the flight's parameter at nothing and its slowing step at 13 (`0x80033f34`, `0x80033f38`, `0x80033f2c`), two words of the globals, at `0x800a4a88` and `0x800a4a8c`, and not of the record.

**The parameter steps 16 a frame to 928 and once more past it, then 13, 12 and one less each frame, 5 at the end, 68 steps from 0 to 1025.**

The view routine, `0x8003431c`, which the ball's routine calls last in its frame (`0x800368dc`), reads the parameter (`0x8003431c`) and takes the flight while it is 1024 or less (`0x80034340`, `0x80034344`) and the mode word at `0x800a33b0` is not 1 (`0x80034350`, `0x80034354`, `0x80034358`); it evaluates the curve at the parameter and then steps it, by 16 while it is 928 or less (`0x80034604`, `0x8003460c`, `0x8003463c`) and past that by the slowing step, which falls by one each frame to no less than 1 (`0x80034610` to `0x80034630`).

So the view stands at the curve's start on the level's first frame, at 928 of its 1024 on the 59th and 944 on the 60th, then at 957, 969, 980, 990, 999, 1007, 1014 and 1020 on the 68th, and the parameter is 1025 on the 69th frame, on which the view in play runs instead; the step's floor of 1 is never reached.

The curve is a cubic Bezier: `0x80033cbc` (`0x800343cc`) takes the four points, the parameter and a shift of 15 (`0x800343bc`), makes the unit 1 shifted up by two thirds of that, 1024 (`0x80033cc8`, `0x80033ce4`), takes the remainder, the unit less the parameter (`0x80033ce8`), and sums the points by the cubic's weights, the remainder's cube, three times the parameter by the remainder's square, three times the parameter's square by the remainder and the parameter's cube, each shifted down by 15 and the sum by 15 again (`0x80033d14` to `0x80033dc8`), so the point at the unit is the last point exactly.

**Over the flight the view turns from a quarter turn to the right to straight ahead, rolls from upside down to upright, and closes in from 14,000 units further out, so the level opens far off to the ball's left, upside down, and swings in behind it.**

The flight's view is laid from the ball's frame and not from the rows the view in play holds: the heading, normalised (`0x80034428`), the side as the heading's cross product with the normal, normalised (`0x80034440`, `0x80034450`), and the normal turned round (`0x8003449c`), as the rows right, down and ahead (`0x80034470`, `0x800344a8`, `0x800344f0`).

It is turned about its down axis by the parameter less 1024 (`0x800344f8`, `0x80034518`, `0x800610f8`), a quarter turn to the right at the start since a positive yaw turns a view left, pitched down by 250 as in play (`0x80034528`, `0x80034530`), and rolled about its line of sight by twice the remainder (`0x80034538`, `0x80034548`, `0x8003454c`, `0x80034554`, `0x80061298`), half a turn at the start.

The curve's point, turned by that view (`0x80034570`), is put at the middle across (`0x8003458c`, `0x80034598`), 250 below the middle (`0x800345a8`, `0x800345b4`) and 800 ahead of the eye plus 14000 times the remainder over 1024 (`0x800345a0`, `0x800345b8` to `0x800345d4`, `0x800345e4`, `0x800345e8`, `0x800345f8`), 14,800 at the start, so it ends where the view in play puts the ball's centre, 250 below and 800 ahead, the curve's end and that centre one point, and the hand-over moves the target by nothing.

The flight puts the free camera's two angles at 374 and 376 at nothing on each of its frames (`0x80034658`, `0x8003465c`, read at `0x80034690` and `0x800346b8`).

**Through the flight the ball's wait at 370 is held at 2000, and set to 1 as the parameter passes 1024, so the pad is dead for 69 frames and read from the 70th, and the platforms, the captivators and the hazards stand from the second frame to the 68th.**

The flight writes 2000 into the wait on each of its frames (`0x800345fc`, `0x80034600`), over the 20 the start set, which the first frame's countdown had taken to 19 ([motion.md](motion.md)), and as the parameter passes 1024 writes 1 (`0x80034648`, `0x8003464c`, `0x80034650`, `0x80034654`), which the next frame's countdown takes to nothing; and it leaves the ball not live at 460 (`0x80034348`), which the view in play marks on its first frame (`0x80034a6c`) and the pad routine asks before it reads (`0x80036c2c`).

So the pad routine is skipped on the flight's 68 frames and reads nothing on the 69th, and the keys work from the 70th, 1.17 s in, with the clock 70 ticks down.

The ball's routine skips the platforms, the captivators' moves and the hazards while the wait is 1000 or more (`0x80036648`, `0x80036650`, `0x80036654`), so they stand from the second frame to the 68th, 67 frames, and run again from the 69th; on the first, under the start's wait of 20, the platforms and the captivators' moves run, and the hazards too where the start's guard does not stand ([motion.md](motion.md)).

Meanwhile the clock ticks, first in each frame (`0x800362f8`), the captivators' reach is tried against where they stand (`0x8003679c`), the intents, the state and the landings run with nothing asked, and from the second frame the contact walk does not run, needing the ball live (`0x800368ac`, `0x800368b4`), which the start's own call of the view in play (`0x80036260`) left it on the first, where it runs unless the guard stands.

The one mode whose word at `0x800a33b0` is 1, the Simon rooms' mode, in which the level's clock does not run either (`0x8003b490`), skips the flight, so the view in play runs from the first frame and the start's wait of 20 stands.

The table ships the flight as `play`'s `flight`: the hold and the gate it holds at, the 1 it ends with, the parameter's end and steps and the frames flown, the yaw and the bank it undoes, the pitch, the depths and the curve's points as shifts along the ball's frame.

The viewer leaves the fly-in out, its flight undrawn and its hold unkept. The map's camera is an orthographic orbit about its target with a zoom for its distance ([viewer.md](viewer.md)), with no eye to fly along the curve, so the flight could only be faked as a turning and zooming orbit, a different picture from the game's swoop in from far off, upside down and to the ball's left, and one that adds nothing to how a level plays; and a pad dead for 69 frames with no flight to watch would read as lag, so the hold goes with the flight.

A level opens in the viewer by the start's own words, the pad dead for 19 frames and read from the 20th and the platforms and the captivators moving from the first, as the Simon rooms open in the game ([motion.md](motion.md)), and in the flight's place the view eases from where it stood to the ball's view over 600 ms with Motion on, and cuts to it without, as play enters a level, as a level starts again and as a run goes on to the next level.

## The free camera

The routine that lays the curve, `0x80033e94`, measures the lattice too: the box round every cell it fills, the box's middle, and the distance from the middle to the furthest of them, plus 1200. While the ball's word at `0x800ba296` is set, which the Japanese release's Select button does and the cheat in [level-format.md](level-format.md) does on this one, `0x80034684` holds the eye that far from the box's middle and turns it with the pad. The level feeds this camera nothing either.

## The view at an ending

While the level's outcome word at `0x800a5e00` is set, by a death, the exit or the clock, or either of two more words the loop asks ([motion.md](motion.md) has the three), the loop runs `0x80036aa8` each frame instead of the ball's routine (`0x80040fcc` to `0x8004100c`), and the view it builds (`0x800347b8`) marks the ball not live, turns by three angles of its own that step −8, 3 and 10 a frame about the lattice's middle, the free camera's rotation and target (`0x800348c8`, `0x800348e4`, `0x8003490c`), the first a call to `0x80060a38` with the three, which builds its matrix as a turn about x after one about y after one about z (`0x80060b0c`, `0x80060b20`, `0x80060b34` and `0x80060b74`, the third column on either sign of the first angle), so the third angle turns the level about the lattice's upright and the first angle about the view's own across axis, and puts the eye by the level's mode word at `0x800a53d4` ([level-format.md](level-format.md)) in three cases.

At 0, the arcade's mode, it stands the free camera's distance plus 1400 from the middle, 1000 further and nearer by turns as a fourth angle steps 12 a frame, a swing every 341 frames, 5.7 s (`0x80034840`, `0x80034968`, `0x80034920` to `0x800349c4`); at 1, a level with no key, the fourth steps 58 and the eye swings 3000 about 3400 further, a swing every 70 frames, 1.2 s (`0x8003487c`, `0x800349d4`, `0x80034a38`); and at any other value, the hidden levels' mode 2, the fourth angle does not step and the eye stands at the distance plus 400, which every case writes before the two swings write over it (`0x80034958`, `0x80034964`), so the level turns under an eye that does not swing. In the Simon rooms the word is 0, so a room's ending swings as in the arcade.

The ball is not drawn while the outcome stands (`0x80036980`, `0x80036988`), and the level that follows, the same after a death, opens with the fly-in.

The viewer stands the eye by the level's mode word in the three cases, the arcade's swing at 0, the Simon rooms included, the quicker and wider swing at 1 and the still eye at 2, and runs each for the frames one swing of the arcade's eye takes, the still eye for the same count ([motion.md](motion.md)).
