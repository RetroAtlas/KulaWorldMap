"""The blocks under the ball and what each does to it, the air test, ice
that rolls the ball on and chills the heat while a cold grows on it and
wanes off it, the arrow that lets the ball roll off it its own way alone,
the crumbling block that breaks the frame the ball first stands on it,
shrinks once broken and holds a rolling ball short of its free edge, the
moving platform that carries the ball in a lattice of its own, its dwell and
the scaling of its speed, and the landings onto it, the body landing by the
face of the ball's normal across the run and the end landing against an end
face, the direction and body tests held to the record's slot order, the
bias, the rumble, the heights and the slack, and the word the ball keeps for
what it stands on by the kind of the block under the cell its centre lies
in: "The blocks under the ball", "The crumbling block" and "The moving
platform" in docs/motion.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_level import FACE, FIRST_RECORD, STYLES
from kula_motion_code import ACID, BLOCK, CRUMBLING_UNDER, FIRE, ICE, INVISIBLE, LIT
from kula_motion_things import SPUN_AT

CHECKS = [
    # The blocks under the ball.
    (0x8003b514, "lw $v1, 408($a0)", "the air test reads the ball's state"),
    (0x8003b51c, "beq $v1, $v0, 0x8003b540", "falling"),
    (0x8003b520, "sltiu $v0, $v1, 2", "or in a hop or a jump"),
    (0x8003b534, "slti $v0, $v0, 2", "while its count stands at two or more, the ball is in the air"),
    (0x8003aab0, "bne $v1, $v0, 0x8003aac4", "on ice, before the air test is asked"),
    (0x8003aab8, "sw $v0, 96($s0)", "the hazards make the forward request"),
    (0x8003aac0, "sw $zero, 92($s0)", "and drop the turn's request"),
    (0x8003acec, "bne $v1, $v0, 0x8003ad64", "and on the ground on ice, as the heat cools"),
    (0x8003ad4c, "sw $v0, 520($s0)", "the cold at 520 grows"),
    (0x8003ad60, "sw $v0, 520($s0)", "and is set back"),
    (0x8003ad74, "sw $v0, 520($s0)", "off ice it wanes"),
    (0x8003ad78, "sw $zero, 520($s0)", "to no less than nothing"),
    (0x8003a9a4, "bne $v1, $v0, 0x8003aab0", "on an arrow"),
    (0x8003aa48, "lh $a1, 4($v0)", "the hazards take its facing, the slot's f2"),
    (0x8003aa54, "jal 0x80038008", "and lay its way"),
    (0x80038038, "bne $a0, $zero, 0x80038050", "the way routine, on the top"),
    (0x80038044, "sh $v0, 7164($gp)", "lays the second tangent"),
    (0x8003804c, "sh $v0, 7174($gp)", "and then the first"),
    (0x800380ac, "addiu $a1, $a1, 19260", "gives the first"),
    (0x800380d0, "bne $t0, $t1, 0x80038100", "for a facing of 2"),
    (0x800380dc, "addiu $a1, $a1, 19252", "the second"),
    (0x80038100, "bne $t0, $a3, 0x80038138", "for 3"),
    (0x80038110, "subu $v0, $zero, $v0", "the first turned round"),
    (0x80038138, "bne $t0, $t2, 0x80038170", "and for 4"),
    (0x80038148, "subu $v0, $zero, $v0", "the second turned round"),
    (0x8003aa68, "bne $v1, $v0, 0x8003aaa0", "and where the heading differs from the way"),
    (0x8003aa80, "bne $v1, $v0, 0x8003aaa0", "on any"),
    (0x8003aa98, "beq $v1, $v0, 0x8003aaa8", "axis"),
    (0x8003aaa4, "sw $zero, -24204($at)", "the forward request is dropped"),
    (0x8003b548, "bne $v1, $v0, 0x8003b554", "in the air over an arrow"),
    (0x8003b550, "sh $v0, 12128($gp)", "the air test sets a flag at 0x800a5e98"),
    (0x8003b55c, "sh $zero, 12128($gp)", "cleared on the ground"),
    (0x800308ac, "lh $v1, 24216($v1)", "which the wall test in the air reads"),
    (0x800308b4, "bne $v1, $v0, 0x800309c8", "and where it stands"),
    (0x800308cc, "bne $v1, $v0, 0x80030908", "a heading differing from the way"),
    (0x800308e4, "bne $v1, $v0, 0x80030908", "on any"),
    (0x800308fc, "beq $v1, $v0, 0x800309c8", "axis"),
    (0x80030914, "jal 0x8004ddbc", "bounces the ball with a sound"),
    (0x800309cc, "sh $zero, 24216($at)", "and one along the way clears the flag"),
    (0x8003afb8, "bne $v1, $v0, 0x8003b034", "on a crumbling block"),
    (0x8002a40c, "jal 0x8002b3ec", "the frame's draw runs the crumbling blocks"),
    (0x8002b4b8, "beq $v1, $v0, 0x8002b4d0", "a block marked broken"),
    (0x8002b4c0, "beq $v1, $t0, 0x8002b5b0", "or breaking"),
    (0x8002b580, "sh $t0, 2($s4)", "is set breaking"),
    (0x8002b58c, "jal 0x800227f4", "with the screen shaken"),
    (0x8002b5bc, "sh $v0, 4($s4)", "and its size at f2 shrinks"),
    (0x8002b5c4, "bltz $v0, 0x8002b624", "until it goes negative"),
    (0x8002b64c, "sw $v0, 0($v1)", "when its faces are undrawn"),
    (0x8002b690, "sh $zero, 2($s4)", "its type cleared"),
    (0x8002b69c, "sh $v0, 0($v1)", "and its lattice cell emptied"),
    (0x80037344, "bgez $v0, 0x8003741c", "the input routine's tail, with the floor ahead empty"),
    (0x80037354, "bgez $v0, 0x8003741c", "and nothing beside the block under"),
    (0x80037364, "bgez $v0, 0x8003741c", "on either side"),
    (0x80037374, "bne $v1, $v0, 0x8003741c", "on a crumbling block"),
    (0x80037384, "bne $v0, $zero, 0x8003741c", "with no jump asked"),
    (0x80037394, "blez $v0, 0x8003741c", "and rolling"),
    (0x800373c0, "sw $zero, 96($s0)", "drops the forward request"),
    (0x800373ec, "sh $v0, 60($s0)", "sets the centre back"),
    (0x80037418, "sh $zero, 312($s0)", "and drops the speed"),
    (0x80033098, "bne $v0, $zero, 0x800334d4", "the platform landing does nothing for a ball riding one"),
    (0x800330a8, "jal 0x800334f0", "and probes"),
    (0x80033518, "sll $v0, $v0, 9", "a block under the centre"),
    (0x80033584, "jal 0x800379e8", "for the cell it lies in"),
    (0x800335b8, "bne $v1, $v0, 0x80033640", "whose record is a platform's record"),
    (0x80033624, "jal 0x80032ec4", "with the ball within its body"),
    (0x800330dc, "sh $v0, 486($s0)", "marks the ball riding at 486"),
    (0x800330f0, "sw $s2, 408($s0)", "at rest"),
    (0x800331cc, "subu $v0, $v0, $a0", "keeps the centre relative to the platform's position"),
    (0x80033208, "sh $v0, 84($s0)", "with the travel at 84"),
    (0x80033224, "sw $a1, 528($s0)", "and the record at 528"),
    (0x80033228, "lui $a1, 0x000a", "a second probe"),
    (0x80033230, "jal 0x80033654", "lands the ball against a platform's end"),
    (0x8003314c, "sh $zero, 20052($at)", "the landing lays the platform's blocks along x"),
    (0x8003316c, "sh $zero, 20276($at)", "or y"),
    (0x80033188, "sh $zero, 0($v0)", "or z"),
    (0x80033978, "addiu $t9, $t9, 20016", "into a lattice of its own at 0x800d4e30"),
    (0x800334b8, "jal 0x80033930", "which the cells about a riding ball are read from"),
    (0x80033b30, "lh $v0, 0($v0)", "a word a cell"),
    (0x80033bd0, "jal 0x800379e8", "and then the level's lattice at the ball's true cell"),
    (0x80033be8, "bne $v1, $v0, 0x80033bf4", "where a lit beam"),
    (0x80033bf0, "sw $v1, 156($s0)", "is written over the ball's own cell"),
    (0x80033c30, "jal 0x8004f108", "and the pad shakes while the platform moves"),
    (0x8002f908, "bne $v0, $zero, 0x8002f928", "a ball riding a platform does not fall at rest"),
    (0x8002f96c, "bne $v0, $zero, 0x8002f98c", "nor rolling over nothing"),
    (0x80032c9c, "sh $v0, 238($a1)", "the platform's routine moves its position words"),
    (0x8003b3e0, "beq $v0, $zero, 0x8003b440", "and the hazards take the travel from them"),
    (0x8003b408, "addu $v1, $v1, $a0", "each frame"),
    (0x8003b410, "sh $v0, 84($s0)", "into 84"),
    (0x800314f0, "lhu $v0, 84($s3)", "which the ball's draw adds to the centre"),
    (0x8002f610, "jal 0x80033810", "the forward jump leaves the platform"),
    (0x8002f70c, "jal 0x80033810", "as does the hop"),
    (0x80033818, "sh $v0, 488($a2)", "marking the leave at 488"),
    (0x80033828, "sh $zero, 486($a2)", "unmarking the ride"),
    (0x800338e8, "sh $v1, 60($a2)", "with the centre no longer relative to the platform"),
    (0x8003391c, "sh $zero, 84($a2)", "and no travel"),
    # The platform landings' direction and body tests.
    (0x800335dc, "jal 0x80037f98", "the body landing takes the face of the ball's normal"),
    (0x80037fa4, "bne $v0, $v1, 0x80037fb4", "which the face routine numbers as the record's slots are numbered"),
    (0x80037fb0, "addiu $v0, $zero, 1", "+x"),
    (0x80037fbc, "addiu $v0, $zero, 4", "-x"),
    (0x80037fd4, "addiu $v0, $zero, 2", "+y"),
    (0x80037fdc, "addiu $v0, $zero, 3", "-y"),
    (0x80037ff4, "addiu $v0, $zero, 5", "+z, the underside"),
    (0x80037ff8, "sltu $v0, $zero, $v0", "-z, the top, 0"),
    (0x80037ffc, "subu $v0, $zero, $v0", "and -1 for anything else"),
    (0x800335f8, "lh $a0, 4($v1)", "and the record's first field, the axis of the run"),
    (0x800335fc, "jal 0x80033c54", "and asks whether the face lies along it"),
    (0x80033c58, "beq $a0, $v1, 0x80033c68", "an axis word of 1"),
    (0x80033c60, "bne $a0, $v0, 0x80033c78", "or 4 is x"),
    (0x80033c68, "beq $a1, $v1, 0x80033cb0", "along which a face of 1"),
    (0x80033c70, "beq $a1, $v0, 0x80033cb0", "or 4 lies"),
    (0x80033c7c, "beq $v0, $zero, 0x80033c90", "an axis word of 2 or 3 is y"),
    (0x80033c88, "bne $v0, $zero, 0x80033cb4", "along which a face of 2 or 3 lies"),
    (0x80033c90, "beq $a0, $zero, 0x80033ca0", "an axis word of 0"),
    (0x80033c98, "bne $a0, $v0, 0x80033cb4", "or 5 is z"),
    (0x80033c9c, "addu $v0, $zero, $zero", "any other axis word answering no"),
    (0x80033ca0, "beq $a1, $zero, 0x80033cb0", "along which a face of 0"),
    (0x80033ca8, "bne $a1, $v0, 0x80033cb4", "or 5 lies"),
    (0x80033cac, "addu $v0, $zero, $zero", "and any other face lies across"),
    (0x80033604, "bne $v0, $zero, 0x80033640", "the body landing refuses a face along the run"),
    (0x8003360c, "lh $v0, 334($s0)", "and reads the distance off the face"),
    (0x8003361c, "addiu $a0, $s0, 60", "the body test takes the centre"),
    (0x80033620, "lw $a1, 6560($gp)", "the record"),
    (0x80033628, "addu $a2, $zero, $zero", "and a slack of nothing"),
    (0x80032ed4, "lh $v0, 34($a1)", "it reads the record's count of blocks"),
    (0x80032ed8, "lh $v1, 4($a1)", "and its axis"),
    (0x80032ef4, "slti $v0, $v1, 3", "dispatching on the axis"),
    (0x80032f08, "j 0x80032fa8", "any other axis word answering as the last call did"),
    (0x80032f1c, "j 0x80032fa8", "either way"),
    (0x80032f24, "lh $v0, 0($a0)", "along x it takes the centre"),
    (0x80032f28, "lh $v1, 238($a1)", "and the platform's position"),
    (0x80032f3c, "sw $v0, 6508($gp)", "keeping the centre plus the slack plus half a block less the position"),
    (0x80032f50, "lh $v1, 240($a1)", "along y the position's y"),
    (0x80032f58, "addiu $v0, $v0, 256", "the same way"),
    (0x80032f78, "lh $v1, 242($a1)", "and along z its z"),
    (0x80032f80, "addiu $v0, $v0, 256", "the same way"),
    (0x80032f98, "subu $v0, $v0, $a2", "then takes the slack off the centre"),
    (0x80032fa4, "sw $v1, 6512($gp)", "keeping the position plus the run plus half a block less that"),
    (0x80032fb0, "bltz $v1, 0x80032fc8", "and answers no where the first is negative"),
    (0x80032fc0, "nor $v0, $zero, $v0", "or the second"),
    (0x80032fc4, "srl $v0, $v0, 31", "is"),
    (0x800330bc, "beq $s1, $s2, 0x80033228", "where the first probe finds nothing the second runs"),
    (0x8003367c, "lwl $v0, 63($s0)", "taking the ball's centre"),
    (0x800336d4, "jal 0x800379e8", "and the cell it lies in"),
    (0x80033708, "beq $v1, $v0, 0x80033790", "keeping a platform's record where that cell names one"),
    (0x80033718, "lh $v0, 28($s0)", "else the cell a block under the centre along the normal"),
    (0x80033754, "jal 0x800379e8", "is looked up"),
    (0x80033768, "bltz $v0, 0x800337f0", "and must name a record"),
    (0x80033788, "bne $v1, $v0, 0x800337fc", "of a platform"),
    (0x800337ac, "jal 0x80037f98", "the end landing takes the face of the normal"),
    (0x800337cc, "jal 0x80033c54", "asks whether it lies along the run"),
    (0x800337d4, "beq $v0, $zero, 0x800337f0", "refusing one across it"),
    (0x800337e0, "jal 0x80032ec4", "and runs the body test"),
    (0x8003325c, "sh $v0, 486($s0)", "the end landing marks the ride"),
    (0x80033270, "sw $s1, 408($s0)", "at rest"),
    (0x80033370, "sh $v0, 60($s0)", "biases the centre as the body landing does"),
    (0x80033398, "jal 0x80037f98", "takes the face of the normal again"),
    (0x800333a4, "sltiu $v0, $v1, 6", "one of the six"),
    (0x800333bc, "lw $v0, 368($at)", "and lays the centre by it through the table at 0x80010170"),
    (0x800333d4, "sh $v0, 60($s0)", "along x toward the near end"),
    (0x800333d8, "lw $v0, 6548($gp)", "or by the count past the far end"),
    (0x80033404, "addiu $v0, $zero, 156", "along y toward the near end"),
    (0x80033410, "lw $v0, 6548($gp)", "or by the count"),
    (0x80033424, "lh $v0, 34($v0)", "of blocks"),
    (0x80033430, "addiu $v0, $v0, 356", "past the far end"),
    (0x8003343c, "j 0x80033468", "along z toward the near end"),
    (0x80033440, "addiu $v0, $zero, 156", "the same way"),
    (0x80033444, "lw $v0, 6548($gp)", "or by the count"),
    (0x80033458, "lh $v0, 34($v0)", "of blocks"),
    (0x80033464, "addiu $v0, $v0, 356", "past the far end"),
    (0x80033468, "sh $v0, 64($s0)", "into the centre's z"),
    (0x80033488, "addiu $v0, $v0, -512", "with the travel"),
    (0x800334a4, "sw $a0, 528($s0)", "and the record kept as the body landing keeps them"),
    # What the ball stands on.
    (0x800377a4, "lw $a0, 120($s0)", "the ball's word for what it stands on is read from the cell under the one its centre lies in, word 4 of the 27"),
    (0x800377b4, "sw $a0, 352($s0)", "kept at 352"),
    (0x80037944, "lh $v0, 2($v0)", "a plain block carrying a record reads as the type of the slot on the ball's face"),
    (0x8003794c, "sw $v0, 356($s0)", "into 356"),
    (0x80037894, "sw $v1, 356($s0)", "fire as its own kind"),
    (0x800378bc, "sw $v1, 356($s0)", "ice too"),
    (0x8003790c, "sw $v1, 356($s0)", "and acid"),
    (0x8003795c, "sw $a0, 356($s0)", "a lattice style of fire the same"),
    (0x80037970, "sw $v1, 356($s0)", "of ice"),
    (0x80037998, "sw $v1, 356($s0)", "and of acid"),
    (0x8003792c, "bne $v0, $zero, 0x800379d0", "a kind with no case leaves the word as it was"),
    (0x800379bc, "bne $v0, $v1, 0x800379c8", "as does a lattice word below the empty one"),
]
IMMEDIATES = [
    ("crumbling block", "crumble.size", "size at load, units", 0x80028ab8, "addiu $a3, $zero, {}"),
    ("crumbling block", "crumble.shrink", "shrinks per frame once broken, units", 0x8002b5b8, "addiu $v0, $v0, {}"),

    ("moving platform", "platform.dwell", "the dwell laid at each end and counted down before the move test, frames",
     0x80032e7c, "addiu $v1, $zero, {}"),

    ("the blocks under the ball", "ice.kind", "ice is this kind under the ball", 0x8003aaac, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "cold.gain", "on which the cold at 520 grows by this a frame", 0x8003ad48,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "cold.top.gate", "and is set back once it passes this, less one", 0x8003ad50,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "cold.back", "to this", 0x8003ad58, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "cold.wane", "and off ice wanes by this a frame", 0x8003ad6c, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "arrow.type", "an arrow is this type under the ball", 0x8003a9a0, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.whole", "a crumbling block's type word is this while it is whole", 0x8003afd8,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.broken", "and this once the ball has stood on it", 0x8003b024,
     "addiu $v1, $zero, {}"),
    ("the blocks under the ball", "crumble.broken.seen", "which the frame's draw breaks the block at", 0x8002b4a0,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.breaking", "setting the word to this while it shrinks", 0x8002b4bc,
     "addiu $t0, $zero, {}"),
    ("the blocks under the ball", "crumble.code.input", "the input routine holds a ball rolling on this", 0x80037368,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.edge.hold", "short of its free edge, dropping the roll and the speed from this progress",
     0x800373a4, "slti $v0, $v0, {}"),
    ("the blocks under the ball", "crumble.edge.back", "and setting the centre back from this", 0x800373b8,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "ride.kind", "a platform is this kind under the landing's probe", 0x800335b4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.off", "which lands the ball under this far off its face", 0x80033614,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias", "its centre kept relative to the platform's position plus this", 0x800331c8,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias.back", "and the travel that position plus this", 0x80033204,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias.travel", "as the hazards take it each frame", 0x8003b40c,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.beam", "the level's lattice read at the true cell for this alone", 0x80033be4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.rumble", "and the pad shaken by this while the platform moves", 0x80033c2c,
     "addiu $a1, $zero, {}"),
    ("the blocks under the ball", "ride.face.x", "the face of the ball's normal is numbered as the slots are, +x this",
     0x80037fb0, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.x.back", "-x this", 0x80037fbc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.y", "+y this", 0x80037fd4, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.y.back", "-y this", 0x80037fdc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.z", "and the underside this, the top being 0", 0x80037ff4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.x", "the direction test pairs an axis word or a face of this", 0x80033c54,
     "addiu $v1, $zero, {}"),
    ("the blocks under the ball", "ride.along.x.back", "with an axis word of this as x", 0x80033c5c,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.face.x.back", "and a face of this", 0x80033c6c, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.y.from", "an axis word this far past the y pair's first", 0x80033c64,
     "addiu $v0, $a0, {}"),
    ("the blocks under the ball", "ride.along.y.span", "within a pair this wide, as y", 0x80033c78, "sltiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.along.face.y.from", "and a face this far past the pair's first", 0x80033c80,
     "addiu $v0, $a1, {}"),
    ("the blocks under the ball", "ride.along.face.y.span", "within a pair this wide", 0x80033c84, "sltiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.along.z.back", "an axis word of 0 or this as z", 0x80033c94, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.face.z.back", "and a face of 0 or this", 0x80033ca4, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.yes", "answering this where the two fall in one pair", 0x80033cb0,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.count.less", "the body test takes the record's count of blocks plus this",
     0x80032edc, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.body.axis.y", "dispatches on the axis word, this for y", 0x80032ee4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.axis.x", "this for x", 0x80032efc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.axis.z", "and this for z", 0x80032f10, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.ends", "and reaches this far past the first block's centre toward the near end, units",
     0x80032f30, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.body.ends.back", "and this far past the last block's centre toward the far end", 0x80032f9c,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.end.kind", "the end landing takes a record of this kind at the ball's own cell",
     0x80033704, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.kind.under", "or a block under it", 0x80033784, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.tolerance", "and runs the body test with a slack of this, units", 0x800337e4,
     "addiu $a2, $zero, {}"),
    ("the blocks under the ball", "ride.end.bias", "biases the centre by this, as the body landing does", 0x80033368,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.end.low", "and lays it this far along the axis for a face toward the near end, units",
     0x800333cc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.high", "or the count of blocks times a block plus this for one toward the far end",
     0x800333f8, "addiu $v0, $v0, {}"),
]
MULTIPLIERS = [
    ("moving platform", "platform.scale", "speed on the disc is scaled by this over sixty", 0x80032a60, 5, "v1", "v0"),
    ("the blocks under the ball", "crumble.edge.push",
     "the input routine sets a ball at a crumbling block's free edge back this far along its heading, units",
     0x800373cc, 4, "v0", "v1"),
    ("the blocks under the ball", "ride.body.block", "the body test's run is the count of blocks less one times this, units",
     0x80032ee0, 1, "v0", "a3"),
    ("the blocks under the ball", "ride.end.block", "and the end landing's far end lies at the count times this", 0x800333f4, 1,
     "v0", "v0"),
]
DIVISORS = []
GREYS = []
SCANS = []

PLATFORM = 5
OFF = -1                  # the lattice's word for no block
VANISHING = 7
ARROW = 28
CRUMBLING = 6


def blocks(r):
    """What the blocks under the ball do to its roll, by kind: ice's chill of
    the heat and its cold, the crumbling block's size, its shrink and the
    edge rule that keeps a ball from going round it, and a platform's landing
    height, the block its position is biased by, the pad's rumble, the body
    landing's height and reach along the run and the end landing's slack,
    each held to the kind or the type it is read from and to the ball's
    rest; the face routine's numbering and the direction test's pairs are
    held to the record's slot order."""
    if r["ice.kind"] != ICE or r["arrow.type"] != ARROW or r["ride.kind"] != PLATFORM \
            or r["crumble.under"] != CRUMBLING_UNDER or r["crumble.code.input"] != CRUMBLING_UNDER:
        sys.exit("ice, the arrow, the crumbling block or the platform is not read from its own kind or type")
    over = r["cold.top.gate"] - 1
    if not 0 < r["cold.back"] < over or r["cold.gain"] <= 0 or r["cold.wane"] >= 0:
        sys.exit("the cold does not grow on ice, wane off it and go back below the mark it passes")
    if r["crumble.size"] != BLOCK or r["crumble.shrink"] >= 0:
        sys.exit("a crumbling block's size is not a block, or does not shrink")
    if (r["crumble.whole"], r["crumble.broken"], r["crumble.breaking"]) != (1, 2, 3) \
            or r["crumble.broken.seen"] != r["crumble.broken"]:
        sys.exit("a crumbling block's type does not go whole, broken, breaking")
    if not r["move.middle"] < r["crumble.edge.hold"] < r["crumble.edge.back"] < BLOCK:
        sys.exit("the crumbling block's edge rule does not hold the ball past the middle and set it back short of the edge")
    if len({r["ride.bias"], -r["ride.bias.back"], -r["ride.bias.travel"], BLOCK}) != 1:
        sys.exit("a platform's position is not biased by a block wherever it is taken")
    if r["ride.body.off"] != r["ball.rest"] + 1 or r["ride.beam"] != LIT:
        sys.exit("a platform lands the ball otherwise than at its rest, or reads the level's lattice for more than a lit beam")
    faces = {"+x": r["ride.face.x"], "-x": r["ride.face.x.back"], "+y": r["ride.face.y"], "-y": r["ride.face.y.back"],
             "+z": r["ride.face.z"], "-z": 0}
    if faces != {f: FACE.index(f) for f in faces}:
        sys.exit("the face routine does not number the ball's normal as the record's slots are numbered")
    pairs = {"x": {r["ride.along.x"], r["ride.along.x.back"]},
             "y": set(range(-r["ride.along.y.from"], -r["ride.along.y.from"] + r["ride.along.y.span"])),
             "z": {0, r["ride.along.z.back"]}}
    if pairs != {a: {faces["+" + a], faces["-" + a]} for a in pairs}:
        sys.exit("the direction test does not pair the axis words by axis")
    if {r["ride.along.x"], r["ride.along.face.x.back"]} != pairs["x"] \
            or (r["ride.along.face.y.from"], r["ride.along.face.y.span"]) != (r["ride.along.y.from"], r["ride.along.y.span"]) \
            or r["ride.along.face.z.back"] != r["ride.along.z.back"] or r["ride.along.yes"] != 1:
        sys.exit("the direction test does not pair the faces as it pairs the axis words")
    if (r["ride.body.axis.x"], r["ride.body.axis.y"], r["ride.body.axis.z"]) != (faces["+x"], faces["+y"], faces["+z"]):
        sys.exit("the body test does not dispatch on the axis word by the positive way's number")
    if r["ride.body.count.less"] != -1 or r["ride.body.block"] != BLOCK or r["ride.body.ends"] != BLOCK // 2 \
            or r["ride.body.ends.back"] != -r["ride.body.ends"]:
        sys.exit("the body test does not reach from the first block's centre to the last block's centre and half a block past each")
    if r["ride.end.kind"] != PLATFORM or r["ride.end.kind.under"] != PLATFORM or r["ride.end.bias"] != BLOCK \
            or r["ride.end.block"] != BLOCK:
        sys.exit("the end landing is not read from a platform's kind, or lays the body otherwise than a block at a time")
    if r["ride.end.tolerance"] != r["ball.rest"] or r["ride.end.low"] != BLOCK // 2 - r["ball.rest"] \
            or r["ride.end.high"] != BLOCK // 2 + r["ball.rest"]:
        sys.exit("the end landing's slack, or where it lays the centre, is not the ball's rest height off the end face")
    return {
        ICE: {"chill": -r["heat.chill"],
              "cold": {"gain": r["cold.gain"], "over": over, "back": r["cold.back"], "wane": -r["cold.wane"]}},
        CRUMBLING: {"size": r["crumble.size"], "shrink": -r["crumble.shrink"],
                    "edge": {"hold": r["crumble.edge.hold"], "back": r["crumble.edge.back"], "push": r["crumble.edge.push"]}},
        PLATFORM: {"ride": {"bias": r["ride.bias"], "rumble": r["ride.rumble"],
                            "body": {"off": r["ball.rest"], "ends": r["ride.body.ends"]},
                            "end": {"tolerance": r["ride.end.tolerance"]}}},
    }


def standing(r):
    """The word the ball keeps for what it stands on, by the kind of the block
    under the cell its centre lies in: fire, ice and acid their own kind, the
    invisible, platform, crumbling and vanishing kinds one number each past
    the types, a lattice style the kind it is, and a bare plain block or no
    block the lattice's empty word, each held to the kind or the style its
    case tests."""
    if r["standing.centre"] != BLOCK // 2 or 1 << r["standing.shift"] != BLOCK:
        sys.exit("the cell the ball's centre lies in is not the nearest block's cell")
    if r["standing.first"] != FIRST_RECORD:
        sys.exit(f"the block under the ball carries a record from {r['standing.first']}, not from the first record")
    words = {kind: kind for kind in (FIRE, ICE, ACID)}
    words.update({kind: r[f"standing.word.{kind}"] for kind in (INVISIBLE, PLATFORM, CRUMBLING, VANISHING)})
    for kind in words:
        if r[f"standing.kind.{kind}"] != kind:
            sys.exit(f"kind {kind} under the ball is tested as {r[f'standing.kind.{kind}']}")
    for style in range(1, STYLES):
        if r[f"standing.style.{style}"] != style:
            sys.exit(f"lattice style {style} under the ball is tested as {r[f'standing.style.{style}']}")
    if r["standing.style.word.3"] != words[INVISIBLE]:
        sys.exit("the invisible block reads otherwise as a lattice style than as a record")
    if r["standing.nothing"] != OFF or r["standing.none"] != OFF:
        sys.exit("a bare plain block or no block under the ball does not read as the lattice's empty word")
    if words[CRUMBLING] != r["crumble.under"]:
        sys.exit("the crumbling block reads otherwise under the ball than the hazards test it")
    past = {word - kind for kind, word in words.items() if word != kind}
    if len(past) != 1 or next(iter(past)) <= max(SPUN_AT):
        sys.exit(f"the kinds that read as a number of their own are not one step past the types: {words}")
    return words
