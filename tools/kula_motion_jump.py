"""The view's extra pitch, the word R1 held adds to and a fall or a jump's
last rows over nothing grow, which pitches the view further down, the
fly-in, the curve the level's start lays and the view flies along for 68
frames with the ball's wait held at 2000, and the jump, the hop and the
boost button's launch, which rolls the ball on and launches it as the long
jump: "The ball's roll" and "The level's clock and its end" in
docs/motion.md, and "The view in play" and "The fly-in" in docs/camera.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_motion_code import BLOCK

CHECKS = [
    # The view's extra pitch.
    (0x80034f60, "bne $v1, $v0, 0x80034fb8", "R1 held"),
    (0x80034f94, "sh $v0, 504($s0)", "adds to the extra pitch at 504"),
    (0x80035050, "beq $v1, $v0, 0x80035074", "falling"),
    (0x80035058, "bne $v1, $v0, 0x8003512c", "or jumping"),
    (0x8003506c, "beq $v0, $zero, 0x8003512c", "in the arc's last rows"),
    (0x80035078, "bne $a0, $v0, 0x80035130", "over nothing"),
    (0x8003508c, "beq $v0, $zero, 0x800350dc", "short of the near mark"),
    (0x800350b0, "sw $v0, 7000($gp)", "the rate grows"),
    (0x800350d8, "sh $v0, 504($s0)", "and the pitch by the rate"),
    (0x800350e8, "sw $v0, 7000($gp)", "past the mark the rate wanes"),
    (0x8003510c, "sh $v0, 504($s0)", "and the pitch grows by it"),
    (0x8003512c, "sw $v0, 7000($gp)", "over a block the rate is reset"),
    (0x80035184, "sh $v0, 504($s0)", "and the pitch comes back"),
    (0x800354d4, "jal 0x80060f58", "the extra pitch and the view's own pitch the camera down"),
    # The fly-in.
    (0x800362bc, "jal 0x80033e94", "the level's start lays the fly-in's curve"),
    (0x80033ee4, "lh $v0, 12($s0)", "from the ball's heading at 12"),
    (0x80033f14, "lh $v0, 20($s0)", "its side at 20"),
    (0x80033eb4, "lh $v0, 28($s0)", "and its normal at 28, each a whole unit"),
    (0x8002f36c, "sh $a1, 388($a0)", "the start copies the position at 60, laid on the face, into the view's target"),
    (0x800341b4, "lh $a0, 388($s0)", "and from the view's target at 388"),
    (0x800341bc, "addu $s1, $a0, $v1", "which the last point stands off along the normal"),
    (0x800341ec, "subu $v0, $s1, $t9", "the first lies back along the heading from it"),
    (0x800341f0, "subu $a3, $v0, $t2", "and against the side"),
    (0x80034258, "addu $v1, $a3, $v1", "the second a share of the way from the first to the last"),
    (0x80034268, "addu $v1, $v1, $v0", "and a share of the side on"),
    (0x800342b0, "subu $v0, $s1, $v0", "and the third a share of the heading short of the last"),
    (0x80033f34, "sw $zero, 6992($gp)", "the start puts the parameter at nothing"),
    (0x80033f38, "sw $v1, 6996($gp)", "and the slowing step at its first value"),
    (0x8003431c, "lw $v1, 6992($gp)", "the view routine reads the parameter"),
    (0x80034344, "beq $v0, $zero, 0x80034360", "and takes the flight while it is within the end"),
    (0x80034350, "lw $v0, 13232($v0)", "and the mode word at 0x800a33b0"),
    (0x80034358, "bne $v0, $s4, 0x80034390", "is not the one the flight is skipped in"),
    (0x800343cc, "jal 0x80033cbc", "it evaluates the curve"),
    (0x80033cc8, "sll $v0, $t4, 1", "whose unit is one shifted up by two thirds"),
    (0x80033ce4, "sllv $t3, $t3, $v0", "of the shift it is given"),
    (0x80033ce8, "subu $t3, $t3, $t1", "the remainder being the unit less the parameter"),
    (0x80033d14, "lw $v1, 0($a0)", "the first point weighted by the remainder's cube"),
    (0x80033d50, "lw $v0, 0($a1)", "the second by three times the parameter by the remainder's square"),
    (0x80033d88, "lw $v0, 0($a2)", "the third by three times the parameter's square by the remainder"),
    (0x80033db0, "lw $v0, 0($a3)", "and the last by the parameter's cube"),
    (0x80033dc4, "srav $v1, $v1, $t4", "the sum shifted down by the shift"),
    (0x80033dc8, "sw $v1, 0($t2)", "into the point"),
    (0x80034428, "jal 0x800601e8", "the flight's view takes the heading normalised"),
    (0x80034440, "jal 0x800608fc", "the side as the heading's cross product with the normal"),
    (0x80034450, "jal 0x800601e8", "normalised"),
    (0x8003449c, "subu $v0, $zero, $v0", "and the normal turned round"),
    (0x80034470, "sh $v0, 22884($at)", "as its rows right"),
    (0x800344a8, "sh $v0, 22890($at)", "down"),
    (0x800344f0, "sh $v0, 22896($at)", "and ahead"),
    (0x80034518, "jal 0x800610f8", "turns it about its down axis by the parameter less the end"),
    (0x80034530, "jal 0x80060f58", "pitches it down"),
    (0x80034548, "subu $a0, $s0, $a0", "and rolls it about its line of sight by the remainder"),
    (0x80034554, "jal 0x80061298", "doubled"),
    (0x80034570, "jal 0x80060508", "turns the curve's point by the view"),
    (0x8003458c, "subu $v0, $zero, $v0", "and puts it at the middle across"),
    (0x80034598, "sw $v0, 22904($at)", "in the view's translation"),
    (0x800345b4, "sw $v0, 22908($at)", "below the middle"),
    (0x800345a0, "subu $s0, $s0, $a0", "and ahead of the eye by the remainder's share of the distance out"),
    (0x800345f8, "sw $v0, 22912($at)", "over the depth in play"),
    (0x80034600, "sh $v0, 370($s2)", "writes the hold into the wait at 370"),
    (0x8003463c, "sw $v0, 6992($gp)", "steps the parameter by the step while it is within the slow gate"),
    (0x80034610, "lw $v0, 6996($gp)", "and past it reads the slowing step"),
    (0x80034620, "sw $v1, 6992($gp)", "stepping it by that"),
    (0x8003461c, "addiu $v0, $v0, -1", "which falls by one"),
    (0x80034624, "sw $v0, 6996($gp)", "each frame"),
    (0x80034628, "bgtz $v0, 0x80034640", "unless it would fall past nothing"),
    (0x80034630, "sw $s4, 6996($gp)", "when it is the least step"),
    (0x8003464c, "bne $v0, $zero, 0x80034658", "and as the parameter passes the end"),
    (0x80034654, "sh $v0, 370($s2)", "writes the last wait"),
    (0x80034658, "sh $zero, 374($s2)", "and puts the free camera's angles at 374"),
    (0x8003465c, "sh $zero, 376($s2)", "and 376 at nothing"),
    (0x80034690, "lh $v1, 374($a0)", "which the free camera turns the eye by"),
    (0x800346b8, "lh $a0, 376($a0)", "both"),
    (0x80036648, "lh $v0, 0($s1)", "the ball's routine reads the wait"),
    (0x80036654, "beq $v0, $zero, 0x80036714", "and skips the platforms, the captivators' moves and the hazards while it is at the gate or past it"),
    (0x800368ac, "lh $v1, -23840($v1)", "the contact walk's caller asks the live word at 460"),
    (0x800368b4, "bne $v1, $v0, 0x800368d4", "and skips the walk while it is not set"),
    # The jump, the hop and the boost button's launch.
    (0x80022e44, "lw $t2, 24($a3)", "the parser of the .GGI takes the header's section sizes"),
    (0x80022e60, "sll $t2, $t2, 1", "in halfwords"),
    (0x80022e8c, "addu $v0, $v1, $v0", "summed from the first section's start"),
    (0x80022ea0, "sw $v0, 11296($gp)", "and keeps where the fifth begins"),
    (0x8002f2ec, "lw $v1, 23384($v1)", "which the ball's init takes"),
    (0x8002f368, "sw $v1, 6452($gp)", "as the jump's table"),
    (0x8002f5f0, "lw $v0, 120($s0)", "the forward jump needs a block under the ball"),
    (0x8002f5f8, "bltz $v0, 0x8002f674", "and does nothing otherwise"),
    (0x8002f630, "swr $v0, 68($s0)", "it saves the centre at 68"),
    (0x8002f638, "swr $v1, 72($s0)", "and 72"),
    (0x8002f63c, "lw $v0, 6452($gp)", "takes the table"),
    (0x8002f648, "lh $a1, 0($v0)", "its count"),
    (0x8002f668, "sw $a1, 404($a0)", "as the count at 404"),
    (0x8002f670, "sw $v1, 416($a0)", "and its first row at 416"),
    (0x8002f60c, "sw $v0, 408($s0)", "in the jumping state"),
    (0x8002f65c, "sh $v0, 312($a0)", "at its speed"),
    (0x8002f660, "sh $v0, 320($a0)", "the spin's speed set to the same"),
    (0x8002f6fc, "lh $v0, 486($s0)", "the hop"),
    (0x8002f708, "sw $zero, 408($s0)", "is a state of its own"),
    (0x8002f730, "swr $v0, 68($s0)", "saving the centre, which its rows never read"),
    (0x8002f760, "sw $a0, 404($s0)", "with the same count"),
    (0x8002f764, "sw $v1, 416($s0)", "and the same first row"),
    (0x8002fcf0, "sw $v0, 404($s0)", "jumping, the count falls by one a frame"),
    (0x8002fcf4, "sw $zero, 404($s0)", "and from one past the skip to nothing"),
    (0x8002fd00, "blez $v0, 0x8002fe14", "where it is nothing the jump ends"),
    (0x8002fd30, "sh $v1, 80($s0)", "else a row's height"),
    (0x8002fd44, "sh $v1, 76($s0)", "its right"),
    (0x8002fd5c, "sh $a0, 78($s0)", "and its back are taken"),
    (0x8002fd58, "beq $v1, $zero, 0x8002fdc4", "and where the long jump's word at 412 is set"),
    (0x8002fd68, "sll $v0, $v1, 1", "each is taken three"),
    (0x8002fd6c, "addu $v0, $v0, $v1", "times"),
    (0x8002fd70, "srl $v1, $v0, 31", "with its sign added"),
    (0x8002fd7c, "sra $v0, $v0, 1", "over two, toward nothing"),
    (0x8002fd80, "sh $v0, 76($s0)", "the right"),
    (0x8002fd9c, "sh $v0, 78($s0)", "the back"),
    (0x8002fdb8, "sh $v0, 80($s0)", "and the height"),
    (0x8002fdbc, "addiu $v1, $v1, 1", "and the word"),
    (0x8002fdc0, "sw $v1, 412($s0)", "counts the row"),
    (0x8002fdcc, "jal 0x800606b8", "the frame matrix turns the row"),
    (0x8002fdd8, "jal 0x80030f48", "the saved centre is drawn across toward the middle"),
    (0x8002fdf4, "sh $v0, 60($s0)", "and the centre is the saved one plus the turned row"),
    (0x8002fe20, "bne $v0, $zero, 0x8002fe78", "as the jump ends, with the word short of the long jump"),
    (0x8002fe8c, "sh $v1, 60($s0)", "the centre is the saved one moved two blocks along the heading"),
    (0x8002fe50, "sh $v0, 60($s0)", "or three"),
    (0x8002feb4, "jal 0x80030b48", "and the landing is tried"),
    (0x8002febc, "beq $v0, $zero, 0x8002fecc", "which failing"),
    (0x8002fecc, "sw $v0, 408($s0)", "the ball falls"),
    (0x8002fee0, "sh $zero, 312($s0)", "with its speed along the heading dropped"),
    (0x8002fed8, "lhu $v0, 326($s0)", "at the last frame's change along the normal"),
    (0x8002ff00, "subu $v0, $zero, $v0", "turned downward"),
    (0x8002ff0c, "sh $v0, 310($s0)", "for its speed down"),
    (0x8002ff14, "sw $zero, 412($s0)", "and the long jump's word cleared"),
    (0x80030d68, "sw $zero, 412($s0)", "as a landing clears it"),
    (0x800334a8, "sw $zero, 412($s0)", "and a landing on a platform"),
    (0x800309b8, "sw $zero, 412($s0)", "a bounce off a wall"),
    (0x80030ae8, "sw $zero, 412($s0)", "a drop under a block above"),
    (0x80035ea4, "sw $zero, -23888($at)", "and the level's start"),
    (0x8002f880, "addiu $v0, $zero, 1", "and the states' dispatcher, in every state but the jump's state"),
    (0x8002f884, "beq $v1, $v0, 0x8002f8a4", "which it passes over"),
    (0x8002f88c, "lw $v0, 412($s0)", "reads the word"),
    (0x8002f8a0, "sw $zero, 412($s0)", "and clears it from the kept value up"),
    (0x80036e04, "sw $v1, 412($s0)", "the bouncy pill's latch on the pad arms it as the button does"),
    (0x80037d1c, "lhu $a0, 342($a2)", "the measure routine takes the last frame's measure along the normal"),
    (0x80037d34, "subu $v0, $v0, $a0", "off this frame's measure"),
    (0x80037d3c, "sh $v0, 326($a2)", "and keeps the change at 326"),
    (0x800300b0, "sh $zero, 320($s0)", "hopping, each row puts the spin's speed at nothing"),
    (0x800300b8, "lhu $t0, 0($v0)", "and takes this row's height"),
    (0x800300c4, "subu $v1, $v1, $t0", "off the next row's height"),
    (0x800300f8, "sh $zero, 76($s0)", "and nothing across"),
    (0x80030110, "sh $zero, 78($s0)", "or along"),
    (0x80030124, "addu $v0, $v0, $a0", "moves the centre from where it is"),
    (0x800301b0, "lw $v1, 120($s0)", "and as the count runs out the hop asks after the block under the ball's cell"),
    (0x800301cc, "sw $v0, 408($s0)", "and is at rest"),
    (0x800301c8, "bgez $v1, 0x800301f4", "or, over nothing"),
    (0x800301d4, "sw $v0, 408($s0)", "falls"),
    (0x800301e8, "sh $zero, 312($s0)", "with no speed along the heading"),
    (0x80030648, "beq $v1, $v0, 0x8003067c", "the landings, jumping"),
    (0x80030690, "jal 0x80033078", "try a platform in the arc's last rows"),
    (0x800306a0, "jal 0x80030b48", "then a block"),
    (0x800306c0, "jal 0x800307dc", "then a wall"),
    (0x80030810, "lw $v0, 168($s0)", "which is a block ahead at the ball's level"),
    (0x8003083c, "bgez $v0, 0x80030908", "or ahead and above, high in the cell"),
    (0x80030858, "bgez $v0, 0x80030908", "or the floor ahead, low in it"),
    (0x80030934, "sll $v0, $v0, 1", "and bounces the ball back twice the frame's advance"),
    (0x80030968, "sw $a0, 408($s0)", "into a fall"),
    (0x800309c4, "sh $v1, 312($s0)", "at that advance reversed"),
    (0x800309b4, "sh $zero, 320($s0)", "with the spin's speed at nothing"),
    (0x800307c0, "jal 0x800309e8", "or a block above"),
    (0x80030a2c, "lw $v0, 192($s0)", "over the ball"),
    (0x80030ad4, "sw $v1, 408($s0)", "which drops it"),
    (0x80030b04, "sh $v1, 310($s0)", "at its rise reversed"),
    (0x80030aa4, "sll $v0, $v0, 1", "the centre set back by twice that rise"),
    (0x80030b10, "sh $a0, 60($s0)", "along the normal"),
    (0x80030ac4, "sh $zero, 312($s0)", "and the speed"),
    (0x80030ac8, "sh $zero, 320($s0)", "and the spin's speed at nothing"),
    (0x8003b22c, "bne $v1, $v0, 0x8003b2c0", "a boost button under the ball"),
    (0x8003b248, "sh $v0, 372($s0)", "writes the count at 372 from the roll's gate"),
    (0x8003b268, "beq $v0, $zero, 0x8003b280", "and from the launch's gate"),
    (0x8003b270, "lh $v1, 494($s0)", "or with the landed flag"),
    (0x8003b278, "bne $v1, $v0, 0x8003b2c0", "standing"),
    (0x8003b280, "addiu $a0, $zero, 10", "makes the sound call with 10"),
    (0x8003b290, "jal 0x8004ddbc", "the call"),
    (0x8003b298, "jal 0x8004f154", "shudders the pad"),
    (0x8003b29c, "addiu $a0, $zero, 1", "with one argument"),
    (0x8003b2a0, "lw $v0, 412($s0)", "reads the long jump's word"),
    (0x8003b2a8, "sh $zero, 372($s0)", "puts the count at nothing"),
    (0x8003b2ac, "bne $v0, $zero, 0x8003b2b8", "and where the word is nothing"),
    (0x8003b2b0, "sw $v1, 100($s0)", "asks the jump"),
    (0x8003b2b4, "sw $v1, 412($s0)", "as the long jump"),
    (0x8003b2b8, "sw $v1, 96($s0)", "forward"),
    (0x8003b2bc, "sw $zero, 92($s0)", "and drops the turn"),
    (0x800301b8, "sh $v0, 494($s0)", "a hop's end marks the ball landed as a landing does"),
    (0x80035e7c, "sh $zero, -23928($at)", "the level's start puts the count at nothing"),
    (0x80035eac, "sh $zero, -23806($at)", "and the landed flag"),
    (0x80030c6c, "addiu $a0, $zero, 102", "a landing makes the sound call with 102"),
    (0x800301f4, "addiu $a0, $zero, 102", "as a hop's end does"),
    (0x800367c0, "addiu $a0, $zero, 113", "and a capture with 113"),
    (0x8004dddc, "slti $v0, $a0, 120", "which the call takes to a table while under 120"),
    (0x800227f8, "sw $a0, 5816($gp)", "the landing's shake keeps its arguments"),
    (0x80022808, "sw $v0, 5812($gp)", "under a flag of 1"),
    (0x80022818, "lw $v1, 5812($gp)", "which a routine of the frame reads"),
    (0x80022838, "bgez $v0, 0x8002287c", "running the count down"),
]
IMMEDIATES = [
    ("the ball's jump", "jump.speed", "the jump starts at this speed, units a frame", 0x8002f658, "addiu $v0, $zero, {}"),
    ("the ball's jump", "jump.rows", "the table's rows start this many bytes in", 0x8002f664, "addiu $v1, $v1, {}"),
    ("the ball's jump", "jump.step", "the count falls by this a frame", 0x8002fce8, "addiu $v0, $v0, {}"),
    ("the ball's jump", "jump.skip", "and from one past this to nothing", 0x8002fce4, "addiu $v1, $zero, {}"),
    ("the ball's jump", "jump.row", "a row is read this many bytes a step", 0x8002fd24, "addiu $v0, $a1, {}"),
    ("the ball's jump", "jump.recentre", "the saved centre moves across toward the middle by this a frame", 0x8002fddc,
     "addiu $a1, $zero, {}"),
    ("the ball's jump", "jump.long", "the long jump lands three blocks on from this count of rows", 0x8002fe1c,
     "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.catch", "the landing is tried while the count is under this", 0x80030684, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.wall", "a wall is met from this progress", 0x800307f4, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.wall.high", "a block ahead and above from this measure into its cell along the normal",
     0x80030828, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.wall.low", "and the floor ahead under this", 0x80030830, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.bounce", "a bounce while rising starts down at this", 0x800309a4, "addiu $v0, $zero, {}"),
    ("the ball's jump", "jump.ceiling", "a block above is met from this measure into its cell along the normal",
     0x80030a00, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.ceiling.ahead", "ahead and above from this progress", 0x80030a44, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.ceiling.behind", "and behind and above under this", 0x80030a4c, "slti $v0, $v1, {}"),
    ("the ball's jump", "boost.type", "a boost button is this type", 0x8003b228, "addiu $v0, $zero, {}"),
    ("the ball's jump", "boost.roll", "a ball on it from this progress is rolled on by the game", 0x8003b23c, "slti $v0, $v0, {}"),
    ("the ball's jump", "boost.frames", "for this many frames", 0x8003b244, "addiu $v0, $zero, {}"),
    ("the ball's jump", "boost.fire", "and launched from this progress", 0x8003b264, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.arm", "the launch arms the long jump's word with this where it is nothing", 0x8003b2a4,
     "addiu $v1, $zero, {}"),
    ("the ball's jump", "jump.keep", "and outside the jump's state the word is kept while under this", 0x8002f894,
     "slti $v0, $v0, {}"),
    ("the ball's jump", "hop.rows", "the hop's rows start this many bytes in", 0x8002f75c, "addiu $v1, $v1, {}"),
    ("the ball's jump", "hop.skip", "its count falls from one past this to nothing", 0x80030080, "addiu $v1, $zero, {}"),
    ("the ball's jump", "hop.step", "by this a frame", 0x80030084, "addiu $v0, $v0, {}"),
    ("the ball's jump", "hop.ahead", "and each row moves the centre by the height this many bytes on, the next row's height, less this row's height",
     0x800300b4, "lhu $v1, {}($v0)"),
    ("the ball's jump", "hop.row", "a row read this many bytes a step", 0x800300bc, "addiu $v0, $a3, {}"),

    ("the fly-in", "flight.unit.shift", "the start shifts the ball's frame vectors up by this, a whole unit to eight blocks",
     0x80033ebc, "sll $v0, $v0, {}"),
    ("the fly-in", "flight.quarter.shift", "the curve's second point lies the way from the first to the last shifted down by this on",
     0x80034254, "sra $v1, $a2, {}"),
    ("the fly-in", "flight.half.shift", "and the third the heading's eight blocks shifted down by this short of the last",
     0x800342ac, "sra $v0, $v0, {}"),
    ("the fly-in", "flight.first", "the slowing step starts at this", 0x80033f2c, "addiu $v1, $zero, {}"),
    ("the fly-in", "flight.end.gate", "the view flies while the parameter is under this", 0x80034340, "slti $v0, $v1, {}"),
    ("the fly-in", "flight.least", "and the mode word is not this, which is the slowing step's floor too", 0x80034354,
     "addiu $s4, $zero, {}"),
    ("the fly-in", "flight.curve.shift", "the curve is evaluated with a shift of this, its unit one shifted up by two thirds of it",
     0x800343bc, "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.yaw", "the view is turned about its down axis by the parameter plus this", 0x800344f8,
     "addiu $a0, $a0, {}"),
    ("the fly-in", "flight.pitch", "pitched down by this", 0x80034528, "addiu $a0, $zero, {}"),
    ("the fly-in", "flight.bank.from", "and rolled about its line of sight by this less the parameter", 0x80034538,
     "addiu $s0, $zero, {}"),
    ("the fly-in", "flight.bank.shift", "shifted up by this", 0x8003454c, "sll $a0, $a0, {}"),
    ("the fly-in", "flight.below", "the curve's point is put this below the middle of the view", 0x800345a8,
     "addiu $v0, $v0, {}"),
    ("the fly-in", "flight.out.shift", "and ahead of the eye by the remainder's share, shifted down by this, of the distance out",
     0x800345e4, "sra $v0, $v1, {}"),
    ("the fly-in", "flight.ahead", "over this, the depth in play", 0x800345e8, "addiu $v0, $v0, {}"),
    ("the fly-in", "flight.hold", "the flight writes this into the wait at 370 on each of its frames", 0x800345fc,
     "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.slow.gate", "and steps the parameter while it is under this", 0x80034604, "slti $v0, $a0, {}"),
    ("the fly-in", "flight.step", "by this", 0x8003460c, "addiu $v0, $a0, {}"),
    ("the fly-in", "flight.end.gate.after", "and as the stepped parameter is no longer under this", 0x80034648,
     "slti $v0, $v0, {}"),
    ("the fly-in", "flight.done", "writes this into the wait", 0x80034650, "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.gate",
     "the ball's routine skips the platforms, the captivators' moves and the hazards while the wait is this or more",
     0x80036650, "slti $v0, $v0, {}"),
]
MULTIPLIERS = [
    ("the ball's jump", "jump.snap", "as the jump ends the centre is the saved one moved this far along the heading",
     0x8002fe80, 1, "v0", "v0"),
    ("the ball's jump", "jump.far", "or this far after the long jump", 0x8002fe30, 4, "v0", "v1"),
    ("the fly-in", "flight.above", "the curve ends this far along the normal from the view's target, units", 0x800341a4, 6,
     "a0", "v1"),
    ("the fly-in", "flight.out", "the eye starts this much further out along its line of sight, units", 0x800345b8, 8, "s0",
     "v1"),
]
DIVISORS = []
GREYS = []
SCANS = []

# The share of the side the fly-in's second point lies on, a divide by a
# reciprocal with no shift after it.
FLIGHT_THIRD = (0x80034240, "lui $t0, {}", 0x80034248, "ori $t0, $t0, {}")

BUTTON = 10               # the boost button's type
LONG = [3, 2]             # the long jump takes each row times the first over the second


def jump(r):
    """The jump, the hop and the boost button's launch, each number against
    the others: the jump at the roll's top speed, the rows past a count and
    three pads, the landings two and three blocks on, a wall met in the air
    where one takes a roll, and the centre drawn across as a roll's centre is."""
    if r["jump.speed"] != r["roll.top"]:
        sys.exit("the jump does not start at the roll's top speed")
    if r["jump.rows"] != 4 * r["jump.row"] or r["jump.step"] != -1:
        sys.exit("the jump's rows do not start past a count and three pads, or the count does not fall by one")
    if r["jump.snap"] != 2 * BLOCK or r["jump.far"] != 3 * BLOCK:
        sys.exit("the jump does not land two blocks on, or the long jump three")
    if len({r[k] for k in ("jump.wall", "jump.wall.high", "jump.ceiling", "jump.ceiling.ahead", "move.touch")}) != 1:
        sys.exit("a wall is not met in the air where one takes a roll")
    if r["jump.wall.low"] != r["ball.rest"] or r["jump.ceiling.behind"] != r["ball.rest"] + 1:
        sys.exit("the floor ahead or a block behind is not met at the ball's radius")
    if r["jump.recentre"] != r["roll.recentre"] or r["jump.bounce"] != r["roll.fall"]:
        sys.exit("a jump's centre is not drawn across, or a bounce does not start down, as in a roll")
    if r["boost.type"] != BUTTON:
        sys.exit(f"the launch belongs to type {r['boost.type']}, not to the boost button")
    if not r["jump.arm"] < r["jump.keep"] <= r["jump.long"]:
        sys.exit("the long jump's word, armed, would not survive to the jump, or a count kept would land it long")
    if r["hop.rows"] != r["jump.rows"] or r["hop.skip"] != r["jump.skip"] or r["hop.step"] != r["jump.step"]:
        sys.exit("the hop does not run the jump's rows by the jump's count")
    if r["hop.row"] != r["jump.row"] or r["hop.ahead"] != 3 * r["hop.row"]:
        sys.exit("the hop does not take the next row's height, a row of three halfwords on")
    return {"speed": r["jump.speed"], "skip": r["jump.skip"], "snap": r["jump.snap"], "far": r["jump.far"],
            "long": r["jump.long"], "scale": LONG, "arm": r["jump.arm"], "keep": r["jump.keep"],
            "recentre": r["jump.recentre"], "catch": r["jump.catch"],
            "wall": r["jump.wall"], "low": r["jump.wall.low"], "bounce": r["jump.bounce"],
            "boost": {"roll": r["boost.roll"], "frames": r["boost.frames"], "fire": r["boost.fire"]}}


def flight(r):
    """The fly-in: the wait it holds the ball's words at and the gate the
    ball's routine skips the platforms, the captivators' moves and the
    hazards from, the wait it ends with, the parameter's end and steps with
    the frames flown simulated from them, the yaw and the roll it undoes,
    the pitch, the depths and the curve's points as shifts along the ball's
    frame, each held against the others: the end read alike before and
    after a step, the curve's unit and the depth's share both the end, the
    turn and the roll undone from it, the mode skipped the one the clock
    stands in, the pitch and the depths those of the view in play, and the hold at
    the gate or past it where the start's wait and the last wait stay
    under it."""
    end = r["flight.end.gate"] - 1
    unit = 1 << r["flight.unit.shift"]
    if r["flight.end.gate.after"] != r["flight.end.gate"]:
        sys.exit("the flight's end is read as two values")
    if 1 << (2 * r["flight.curve.shift"] // 3) != end or 1 << r["flight.out.shift"] != end:
        sys.exit("the curve's unit or the depth's share is not the parameter's end")
    if r["flight.yaw"] != -end or r["flight.bank.from"] != end:
        sys.exit("the flight's turn and roll are not undone from the parameter's end")
    if r["flight.least"] != r["clock.mode"]:
        sys.exit("the 1 the flight tests the mode word against is not the mode the clock stands in")
    if r["flight.pitch"] != r["look.pitch"] or r["flight.below"] != r["look.below"] or r["flight.ahead"] != r["look.ahead"]:
        sys.exit("the flight pitches the view or places its point otherwise than the view in play")
    if not r["start.wait"] < r["flight.gate"] <= r["flight.hold"] or not 0 < r["flight.done"] < r["flight.gate"]:
        sys.exit("the flight's hold does not reach the gate the start's wait and its last wait stay under")
    slow, step, least = r["flight.slow.gate"] - 1, r["flight.step"], r["flight.least"]
    t, inc, frames = 0, r["flight.first"], 0
    while t <= end:
        frames += 1
        if t <= slow:
            t += step
        else:
            t, inc = t + inc, inc - 1
            if inc <= 0:
                inc = least
    quarter, half = unit >> r["flight.quarter.shift"], unit >> r["flight.half.shift"]
    return {"hold": r["flight.hold"], "gate": r["flight.gate"], "done": r["flight.done"],
            "end": end, "step": step, "slow": slow, "first": r["flight.first"], "least": least, "frames": frames,
            "yaw": r["flight.yaw"], "bank": end << r["flight.bank.shift"], "pitch": r["flight.pitch"],
            "below": r["flight.below"], "ahead": r["flight.ahead"], "out": r["flight.out"],
            "curve": {"above": r["flight.above"], "back": [unit, unit - quarter, half, 0],
                      "left": [unit, unit - quarter - unit // r["flight.third"], 0, 0]}}
