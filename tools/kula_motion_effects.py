"""The effects, the burst of two sprites a pickup taken starts at its place,
lit onto the faces about it, and the one a key, a fruit, the hourglass and a
teleport start on the HUD, each an entry in a list of sixteen played from a
table of its kind a frame at a time, the straight run of startup that fills
the kinds' table pointers and the sprites' colours, the frame loop's pass
over every effect, a particle as one of seven sprites laid on a square,
turned by its angle and scaled by its brightness, its size on the HUD and in
the world, the light a world effect colours with the sum of its particles'
colours, the seven tables by the kinds that use them, which effect each
pickup starts, and the teleport's flash of the screen white that slows the
game's pace, which a level with no key opens from: "The effects" in
docs/motion.md.
"""
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE_BASE
from kula_motion_code import ADD, GP, ONE, READS_FIRST, TURN
from kula_motion_take import ONE_PLAYER, TAKE_CASES

CHECKS = [
    # The effects.
    (0x80011520, "addiu $v0, $v0, -4", "startup clears the twelve pointers a word at a time"),
    (0x80011524, "lui $v0, 0x000a", "and fills them from seven tables in the data"),
    (0x80011550, "lw $a1, 23216($a1)", "reads how many effect sprites the .GGI header counts"),
    (0x80011594, "sw $a0, 5088($gp)", "the last pointer filled, kind 10's pointer"),
    (0x800115f8, "sb $v1, 5124($gp)", "and the last byte of the sprites' colours"),
    (0x800115fc, "blez $a1, 0x800118a0", "lays no quad where the header counts none"),
    (0x80011618, "addiu $s0, $s0, -19372", "the quads lie at 0x800ab454"),
    (0x80011620, "jal 0x8005f928", "each set up as a textured quad"),
    (0x8001163c, "lw $v1, 23212($v1)", "from the sprite the header's first word names on"),
    (0x8001165c, "lbu $a1, -23063($at)", "whether the sprite's upload named a blend"),
    (0x80011660, "jal 0x8005f8c8", "makes the quad semi-transparent"),
    (0x80011694, "sb $v0, 12($s0)", "the sprite's place and size give the first corner's texture coordinates"),
    (0x800116c4, "sb $v0, 13($s0)", ""),
    (0x80011708, "sb $v1, 20($s0)", "the second corner's texture coordinates"),
    (0x80011738, "sb $v0, 21($s0)", ""),
    (0x80011768, "sb $v0, 28($s0)", "the third corner's texture coordinates"),
    (0x800117ac, "sb $v1, 29($s0)", ""),
    (0x800117f0, "sb $v1, 36($s0)", "and the fourth corner's texture coordinates"),
    (0x80011834, "sb $v1, 37($s0)", ""),
    (0x80011868, "sh $v0, -19358($at)", "its palette word"),
    (0x80011884, "sh $v0, -19350($at)", "and its page word, which holds the blend"),
    (0x800118c4, "sll $a0, $a0, 2", "an effect starts from a kind"),
    (0x800118d0, "lw $t1, 17136($at)", "whose table the pointers at 0x800a42f0 hold"),
    (0x800118d8, "beq $t1, $zero, 0x80011ab8", "none for a kind without one"),
    (0x800118e4, "lw $a3, 13264($a3)", "the player's word at 0x800a33d0"),
    (0x800118f0, "sll $v1, $a3, 2", "picks the count"),
    (0x800118f4, "addu $t0, $v1, $v0", "a word a player from 0x800a4320"),
    (0x800118f8, "lw $a0, 0($t0)", "the count at 0x800a4320"),
    (0x80011904, "beq $v0, $zero, 0x80011ab8", "stops it at sixteen"),
    (0x80011914, "bltz $v0, 0x80011930", "a position whose third word is below nothing is on the HUD"),
    (0x80011920, "lw $v1, 13260($v1)", "else the count of players at 0x800a33cc"),
    (0x80011928, "bne $v1, $v0, 0x80011ab8", "must be one"),
    (0x80011958, "addu $v0, $v0, $a0", "the entry lies at its index in the player's list"),
    (0x80011964, "sw $t1, -18924($at)", "and takes the table"),
    (0x80011994, "sh $v1, -18932($at)", "the position's three words"),
    (0x800119c4, "sh $v1, -18930($at)", ""),
    (0x800119f4, "sh $v1, -18928($at)", ""),
    (0x80011a20, "sw $zero, -18916($at)", "a frame count at nothing"),
    (0x80011a4c, "sw $a2, -18912($at)", "the light"),
    (0x80011a78, "sh $zero, -18920($at)", "and an angle a particle at nothing"),
    (0x80011aa4, "sh $zero, -18918($at)", ""),
    (0x80011aa8, "lw $v0, 0($t0)", "and the count"),
    (0x80011ab4, "sw $v0, 0($t0)", "goes up by one"),
    (0x80011ac0, "lui $v0, 0x000a", "the run"),
    (0x80011b04, "lw $v0, 17184($at)", "reads the count"),
    (0x80011b74, "lh $v1, 2($v0)", "the table's frames"),
    (0x80011b80, "lw $v0, -18916($at)", "against the entry's frame count"),
    (0x80011b88, "slt $v0, $v0, $v1", ""),
    (0x80011b8c, "bne $v0, $zero, 0x80011d8c", "drawn while the count is under them"),
    (0x80011b9c, "lw $a0, -18912($at)", "else the light"),
    (0x80011ba0, "jal 0x8002f2cc", "is let go"),
    (0x80011bcc, "sw $v1, 0($v0)", "the count comes down"),
    (0x80011be8, "addu $a1, $a1, $fp", "and the entries after move up one"),
    (0x80011d10, "bne $v0, $zero, 0x80011be8", "to the last"),
    (0x80011d84, "beq $v0, $zero, 0x80011b94", "and the index is tried again"),
    (0x80011dec, "lh $a0, 0($t4)", "the table's count of particles"),
    (0x80011e08, "lh $v0, 0($v0)", "read again for the loop"),
    (0x80011e18, "addu $t4, $t4, $v1", "finds the frame's rows past the header"),
    (0x80011e5c, "lh $v0, 0($s7)", "a row's size"),
    (0x80011e68, "lh $v1, -18928($at)", "and the position's third word"),
    (0x80011e6c, "bgez $v0, 0x80011e78", "the size"),
    (0x80011e74, "subu $s5, $zero, $s5", "taken positive"),
    (0x80011e78, "bgez $v1, 0x800122fc", "a third word not below nothing is a position in the world"),
    (0x80011f4c, "lhu $v0, 2($s7)", "the row's brightness"),
    (0x80011f54, "sb $v0, 4($v1)", "goes into the quad's three channels"),
    (0x80011f9c, "sb $v0, 5($v1)", ""),
    (0x80011fe4, "sb $v0, 6($v1)", ""),
    (0x80012014, "lh $s3, -18932($at)", "on the HUD the position is the point"),
    (0x80012018, "lh $v1, -2($s7)", "the row's angle"),
    (0x80012024, "lh $s2, -18930($at)", ""),
    (0x80012028, "bgez $v1, 0x800120c0", "below nothing"),
    (0x80012030, "jal 0x80047418", "draws one from the dice"),
    (0x80012078, "sh $v0, 0($v1)", "kept in the entry's slot for the particle"),
    (0x80012084, "mult $s5, $v0", "the size times the cosine"),
    (0x800120d4, "lh $a0, 0($v0)", "else the slot's angle"),
    (0x800120dc, "addu $a0, $v1, $a0", "plus the row's angle"),
    (0x80012134, "mult $s5, $v0", "and times the sine"),
    (0x8001213c, "lh $v0, 0($s7)", "the size"),
    (0x80012144, "bltz $v0, 0x800121d8", "below nothing picks the square off a corner"),
    (0x80012194, "addu $v0, $s3, $s1", "the corners about the middle"),
    (0x800121d4, "sh $v0, 34($v1)", ""),
    (0x800121d8, "lui $t5, 0x000b", "the corners off one at the middle"),
    (0x80012220, "addu $a0, $s3, $s1", "the first the size on at the angle"),
    (0x80012238, "sh $v0, 10($v1)", ""),
    (0x80012248, "sh $s3, 24($v1)", "the third at the middle"),
    (0x8001224c, "sh $s2, 26($v1)", ""),
    (0x80012254, "sh $a0, 34($v1)", ""),
    (0x800122b0, "addiu $v0, $v0, 23452", "the HUD's table at 0x800a5b9c"),
    (0x800122bc, "lw $a1, 0($a0)", "takes the quad"),
    (0x800122d0, "sw $a1, 0($a0)", ""),
    (0x800122f4, "j 0x800129f4", "past the colour's sum"),
    (0x800122fc, "sll $a0, $a1, 5", "in the world the view's matrix"),
    (0x80012324, "addu $a0, $a0, $s0", "is set"),
    (0x8001235c, "addu $v0, $t4, $t5", "and the position"),
    (0x80012374, "bne $v0, $zero, 0x800129f4", "a particle too near is skipped"),
    (0x80012380, "lh $a1, -2($s7)", "the row's angle"),
    (0x80012388, "bgez $a1, 0x8001248c", "below nothing"),
    (0x80012390, "jal 0x80047418", "draws one from the dice"),
    (0x800123dc, "sh $v0, 0($v1)", "kept in the slot"),
    (0x800123e4, "bne $a1, $zero, 0x800123f0", "where the cosine shifted down by 16 is nothing"),
    (0x80012440, "div $a2, $a1", "divides the size where the depth should"),
    (0x80012454, "bne $a1, $zero, 0x80012460", "the sine"),
    (0x8001247c, "div $v0, $a1", "likewise"),
    (0x800124c4, "lh $a0, 0($v0)", "else the slot's angle"),
    (0x800124cc, "addu $a0, $a1, $a0", "plus the row's angle"),
    (0x800124d4, "lw $v1, 13284($v1)", "the screen's distance"),
    (0x800124dc, "mult $s5, $v1", "times the size"),
    (0x800124ec, "div $v1, $s0", "over the depth"),
    (0x800124f0, "mflo $a1", ""),
    (0x80012510, "mult $a1, $v0", "times the cosine"),
    (0x80012540, "mflo $t0", ""),
    (0x80012578, "mult $v1, $v0", "and times the sine"),
    (0x80012588, "lui $a0, 0x000a", "the corners against the screen"),
    (0x80012618, "bne $a1, $zero, 0x800129f4", "every one off it skips the particle"),
    (0x80012628, "lh $a3, 0($t4)", "the row's sprite"),
    (0x80012640, "lbu $v0, 17192($at)", "its colour's first byte"),
    (0x800126cc, "sll $v0, $a3, 2", "its quad"),
    (0x8001270c, "sb $t4, 56($sp)", "the third byte times the brightness summed"),
    (0x80012748, "sw $v1, 4($t0)", "the quad copied into the entry"),
    (0x80012798, "sb $v0, 4($v1)", "the brightness in the quad's channels"),
    (0x800127e0, "sb $v0, 5($v1)", ""),
    (0x80012828, "sb $v0, 6($v1)", ""),
    (0x8001282c, "lh $v0, 0($s7)", "the size"),
    (0x80012834, "bltz $v0, 0x800128c0", "below nothing picks the square off a corner"),
    (0x8001287c, "addu $v0, $s3, $s1", "the corners about the middle"),
    (0x800128bc, "sh $v0, 34($v1)", ""),
    (0x800128c0, "lui $t4, 0x000b", "the corners off one at the middle"),
    (0x80012908, "addu $a0, $s3, $s1", "the first the size on at the angle"),
    (0x80012920, "sh $v0, 10($v1)", ""),
    (0x80012930, "sh $s3, 24($v1)", "the third at the middle"),
    (0x80012934, "sh $s2, 26($v1)", ""),
    (0x8001293c, "sh $a0, 34($v1)", ""),
    (0x80012950, "lui $t1, 0x000d", "the frame's ordering table"),
    (0x80012954, "addiu $t1, $t1, 11808", "at 0x800d2e20"),
    (0x800129b8, "lw $a2, 0($a1)", "takes the quad at its first word"),
    (0x800129f0, "sw $v0, 0($v1)", ""),
    (0x80012a54, "lw $t4, 32($sp)", "where a particle was drawn"),
    (0x80012a5c, "bne $t4, $zero, 0x80012ab4", ""),
    (0x80012a94, "lw $a0, -18912($at)", "the light"),
    (0x80012ab0, "or $a1, $v1, $a1", "takes the sum, the first byte highest"),
    (0x80012b1c, "sw $v1, 176($v0)", "and the frame count goes up"),
    (0x800142b4, "addiu $v0, $v0, 23452", "the HUD's own primitives link into the same table"),
    (0x80020768, "sw $v0, 10992($gp)", "the flash is marked running at 0x800a5a28"),
    (0x80020770, "sw $a0, 5408($gp)", "its first is the mode"),
    (0x80020774, "beq $a0, $v0, 0x800207a8", "mode 1"),
    (0x800207ac, "sw $v0, 5412($gp)", "the strength"),
    (0x800207b8, "lw $a0, 10992($gp)", "the run reads the mark"),
    (0x800207c0, "bne $a0, $v0, 0x8002094c", "and does nothing while it is down"),
    (0x800207c8, "lw $v1, 5408($gp)", "by the mode"),
    (0x8002082c, "sw $v0, 5412($gp)", "the strength comes down"),
    (0x80020830, "lw $a0, 5412($gp)", "and while above nothing"),
    (0x80020838, "blez $a0, 0x80020944", ""),
    (0x80020864, "sb $a0, 17516($at)", "goes into the quad's three channels"),
    (0x80020894, "sb $v1, 17517($at)", ""),
    (0x800208ac, "addiu $t1, $t1, 11808", "the frame's table"),
    (0x800208c4, "sb $v1, 17518($at)", ""),
    (0x800208e8, "sll $v0, $v1, 9", "takes the quad"),
    (0x80020940, "sw $v0, 0($v1)", "at its first word"),
    (0x80020944, "sw $zero, 10992($gp)", "else the mark"),
    (0x80020948, "sw $zero, 10740($gp)", "and the word are cleared"),
    (0x80022ed8, "sw $v0, 11124($gp)", "the .GGI parser keeps the header's first word"),
    (0x80022ee0, "sw $a0, 11128($gp)", "and its second"),
    (0x800233a4, "jal 0x80024414", "the level's load lays the flash's quad"),
    (0x80024414, "addiu $sp, $sp, -48", ""),
    (0x8002441c, "lw $v1, 21460($v1)", "reading the level's mode word"),
    (0x80024464, "sw $v0, 5412($gp)", "and starting the flash on a level with no key"),
    (0x80024488, "jal 0x8005f808", "a page word"),
    (0x800244b0, "jal 0x8002539c", "before a flat quad"),
    (0x800244b8, "addiu $a0, $s0, 8", "the quad"),
    (0x800244cc, "lw $v1, 13288($v1)", "the screen's width"),
    (0x80024500, "jal 0x8005f8c8", "made semi-transparent"),
    (0x80024504, "sh $a2, 22($v0)", "its last corner at the height plus one"),
    (0x8002539c, "addiu $sp, $sp, -24", "the page word and the quad"),
    (0x800253c4, "jal 0x8005fa78", "merges the quad behind the page word"),
    (0x8002a354, "addiu $v1, $v1, 11808", "the loop's routine before the draw sends the table"),
    (0x8002a6b0, "jal 0x800207b8", "the frame's draw runs the flash"),
    (0x8002f2b4, "sll $a0, $a0, 5", "a light takes its colour"),
    (0x8002f2cc, "sll $a0, $a0, 5", "and is let go"),
    (0x800389c0, "addu $a0, $zero, $zero", "a key's HUD effect is kind 0"),
    (0x800389d8, "addu $a2, $zero, $zero", "with no light"),
    (0x80038c0c, "lw $v0, 1144($gp)", "a fruit's HUD effect asks the game's mode word"),
    (0x80038c14, "beq $v0, $s1, 0x80038c2c", "and is skipped at 2"),
    (0x80038c18, "addu $a0, $zero, $zero", "kind 0"),
    (0x80038c28, "addu $a2, $zero, $zero", "with no light"),
    (0x80038cc8, "addiu $a1, $a1, 13172", "at the second fruit's icon"),
    (0x80038d70, "addiu $a1, $a1, 13180", "the third fruit's icon"),
    (0x80038e18, "addiu $a1, $a1, 13188", "the fourth fruit's icon"),
    (0x80038ec0, "addiu $a1, $a1, 13196", "and the fifth fruit's icon"),
    (0x80038f64, "addu $a0, $zero, $zero", "type 27's case, never reached, starts kind 0 at each icon"),
    (0x80038ffc, "addu $a1, $a1, $s0", "and kind 4 at the thing"),
    (0x8003907c, "lui $a1, 0x000a", "the hourglass's HUD effect"),
    (0x80039080, "addiu $a1, $a1, 13156", "at the clock's point, 0x800a3364"),
    (0x80039084, "addu $a2, $zero, $zero", "with no light"),
    (0x800390c8, "jal 0x800118c4", ""),
    (0x8003a64c, "addu $a2, $zero, $zero", "the teleporter's HUD effect has no light"),
    (0x8003a684, "addu $a0, $zero, $zero", "the send starts the flash in mode 0"),
    (0x80040ae4, "lw $v0, 22828($v0)", "the frame loop reads the word at 0x800a592c"),
    (0x80040aec, "bne $v0, $s2, 0x80040b04", "and at 1"),
    (0x80040b40, "jal 0x8005c7c0", "the loop clears the frame's table each pass"),
    (0x80041014, "jal 0x8002a1b4", "the loop's routine before the draw"),
    (0x8004101c, "jal 0x8002a3c0", "the frame's draw"),
    (0x8005f808, "andi $v0, $a0, 3", "a page word's blend goes in bits 5 and 6"),
    (0x8005fa78, "lbu $v0, 3($a0)", "the merge sums the two lengths into the first's tag"),
    (0x8005fba8, "lui $at, 0x000a", "the sine table"),
    (0x8005fbb0, "lh $v0, -15860($at)", "at 0x8009c20c"),
    (0x800609c8, "lwc2 vxy0, 0($a0)", "the projection"),
]
IMMEDIATES = [
    ("the effects", "effect.slots.last", "startup clears the effect tables' pointers from the one at this index down",
    0x800114fc, "addiu $s1, $zero, {}"),
    ("the effects", "effect.colour.a", "a byte of the sprites' light colours", 0x80011580, "addiu $v1, $zero, {}"),
    ("the effects", "effect.colour.b", "another", 0x80011588, "addiu $v0, $zero, {}"),
    ("the effects", "effect.colour.c", "another", 0x80011598, "addiu $a0, $zero, {}"),
    ("the effects", "effect.colour.d", "another", 0x800115a4, "addiu $v1, $zero, {}"),
    ("the effects", "effect.colour.e", "another", 0x800115ac, "addiu $v0, $zero, {}"),
    ("the effects", "effect.colour.f", "and the last", 0x800115b8, "addiu $v0, $zero, {}"),
    ("the effects", "effect.sprites", "quads laid for this many sprites", 0x80011608, "slti $v0, $s1, {}"),
    ("the effects", "effect.full", "each coloured this, the texture's own colour, until a row sets it",
    0x80011628, "addiu $v0, $zero, {}"),
    ("the effects", "effect.quad", "a quad is this many bytes", 0x8001189c, "addiu $s2, $s2, {}"),
    ("the effects", "effect.most", "effects in a player's list at most", 0x80011900, "slti $v0, $a0, {}"),
    ("the effects", "effect.third", "the position's word this far in says where the effect is drawn",
    0x8001190c, "lh $v0, {}($a1)"),
    ("the effects", "effect.players", "one in the world starts only with this many players",
    0x80011918, "addiu $v0, $zero, {}"),
    ("the effects", "effect.gone", "an effect run out takes this off the count", 0x80011bc8, "addiu $v1, $v1, {}"),
    ("the effects", "effect.row.quad", "a frame's rows lie at the count times the frame shifted by this",
    0x80011df0, "sll $v1, $v1, {}"),
    ("the effects", "effect.row.double", "and by this", 0x80011e10, "sll $v1, $t5, {}"),
    ("the effects", "effect.header", "past a header of this many bytes", 0x80011e14, "addiu $v1, $v1, {}"),
    ("the effects", "effect.dice", "a row's angle below nothing draws from the dice, of this",
    0x80012034, "addiu $a0, $zero, {}"),
    ("the effects", "effect.hud.shift", "on the HUD the size times the cosine is shifted down by this",
    0x80012130, "sra $s1, $t4, {}"),
    ("the effects", "effect.hud.shift.sine", "and times the sine by this", 0x80012148, "sra $t1, $t5, {}"),
    ("the effects", "effect.prims", "an entry's position lies past this many bytes of primitives",
    0x80012368, "addiu $a0, $a0, {}"),
    ("the effects", "effect.depth.shift", "in the world the depth is what the projection gives shifted up by this",
    0x8001236c, "sll $s0, $v0, {}"),
    ("the effects", "effect.near", "and a particle nearer than this is skipped", 0x80012370, "slti $v0, $s0, {}"),
    ("the effects", "effect.dice.world", "a world row's angle below nothing draws from the dice, of this",
    0x80012394, "addiu $a0, $zero, {}"),
    ("the effects", "effect.whole.shift", "and divides the size by the cosine shifted down by this",
    0x800123e0, "sra $a1, $v0, {}"),
    ("the effects", "effect.whole.one", "or by this where that is nothing", 0x800123ec, "addiu $a1, $zero, {}"),
    ("the effects", "effect.whole.shift.sine", "and by the sine shifted down by this", 0x80012450, "sra $a1, $v0, {}"),
    ("the effects", "effect.whole.one.sine", "or by this", 0x8001245c, "addiu $a1, $zero, {}"),
    ("the effects", "effect.world.shift", "else the scaled size times the cosine is shifted down by this",
    0x80012548, "sra $s1, $t0, {}"),
    ("the effects", "effect.world.shift.sine", "and times the sine by this", 0x80012580, "sra $t1, $v1, {}"),
    ("the effects", "effect.light.shift", "a colour byte times the brightness is shifted down by this into the light",
    0x800126e4, "sra $v0, $t3, {}"),
    ("the effects", "effect.light.shift.g", "the second byte's shift", 0x800126ec, "sra $v0, $t2, {}"),
    ("the effects", "effect.light.shift.b", "and the third byte's shift", 0x80012704, "sra $v0, $t6, {}"),
    ("the effects", "effect.table.shift", "the frame's table lies at the buffer times 513 shifted up by this",
    0x800129ac, "sll $v1, $v1, {}"),
    ("the effects", "effect.row.step", "a row is this many bytes", 0x800129f4, "addiu $s7, $s7, {}"),
    ("the effects", "effect.angle.step", "an angle's slot this many", 0x80012a38, "addiu $t5, $t5, {}"),
    ("the effects", "effect.particle", "and a particle's quad this many", 0x80012a50, "addiu $s4, $s4, {}"),
    ("the effects", "effect.step", "the frame count goes up by this a pass", 0x80012b18, "addiu $v1, $v1, {}"),
    ("the effects", "teleport.flash.on", "the flash's mark is set to this", 0x80020764, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.modes", "its modes under this take their strength apart",
    0x80020778, "slti $v0, $a0, {}"),
    ("the effects", "teleport.flash.from", "mode 0 starts at this", 0x80020788, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.mode.last", "the last mode", 0x80020794, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.from.last", "starts at this", 0x8002079c, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.from.1", "and mode 1 at this", 0x800207a8, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.run.on", "the run draws while the mark is this",
    0x800207bc, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.step", "and takes this off mode 0's strength a pass",
    0x80020810, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.step.1", "off mode 1's strength", 0x8002081c, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.step.last", "and off the last mode's strength", 0x80020828, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.level", "the level's load starts the flash on a level whose mode word is this",
    0x80024420, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.level.mode", "in this mode", 0x80024450, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.level.from", "at this", 0x80024458, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.blend", "the flash's page word asks this blend",
    0x80024480, "addiu $a1, $zero, {}"),
    ("the effects", "teleport.flash.semi", "and its quad is made semi-transparent by this",
    0x800244bc, "addiu $a1, $zero, {}"),
    ("the effects", "teleport.flash.wide", "its far corners lie the screen's width plus this",
    0x800244ec, "addiu $v1, $v1, {}"),
    ("the effects", "teleport.flash.high", "and its height plus this", 0x800244f0, "addiu $a2, $a2, {}"),
    ("the effects", "teleport.flash.len", "the quad's tag counts this many words", 0x800253b8, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.quad", "and codes it this, a flat quad", 0x800253c0, "addiu $v0, $zero, {}"),
    ("the effects", "effect.table.send", "the frame's table is sent from this many bytes in, its last word",
    0x8002a364, "addiu $a0, $a0, {}"),
    ("the effects", "effect.kind.42", "type 42's green form starts this kind", 0x80038754, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.32", "the lethargy pill this", 0x800387ac, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.34", "the bouncy pill this", 0x8003881c, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.33", "the invincibility pill this", 0x80038880, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.38", "the sunglasses this", 0x800388fc, "addiu $a0, $zero, {}"),
    ("the effects", "effect.hud.key.right", "a key's HUD effect lies this far right of its icon's point",
    0x800389a8, "addiu $v0, $v0, {}"),
    ("the effects", "effect.hud.key.down", "and this far down", 0x800389b8, "addiu $v0, $v0, {}"),
    ("the effects", "effect.hud.z", "with this as its third word, which puts it on the HUD",
    0x800389cc, "addiu $v0, $zero, {}"),
    ("the effects", "effect.kind.31", "the key starts this kind at the thing", 0x800389f4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.36", "the gem this", 0x80038ac4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.37", "the coin this", 0x80038b34, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.43", "the first fruit this", 0x80038c44, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.44", "the second", 0x80038cec, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.45", "the third", 0x80038d94, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.46", "the fourth", 0x80038e3c, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.47", "the fifth", 0x80038ee4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.27", "and type 27's case, never reached, this", 0x80038fe0, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.35.hud", "the hourglass starts this kind at the clock",
    0x800390cc, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.35", "and this at the thing", 0x800390e8, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.5.hud", "a teleporter starts this kind on the HUD as its count starts",
    0x8003a634, "addiu $a0, $zero, {}"),
    ("the effects", "teleport.flash.word", "and the send gives the flash this for the word the loop waits two blanks on",
    0x8003a68c, "addiu $a1, $zero, {}"),
    ("the effects", "effect.table.words", "the frame's table is cleared with this many words",
    0x80040b28, "addiu $a1, $zero, {}"),
]
MULTIPLIERS = [
    ("the effects", "effect.entry", "an effect's entry is this many bytes", 0x80011930, 5, "a0", "v0"),
    ("the effects", "effect.player", "and a player's list this many", 0x80011944, 5, "a3", "a0"),
    ("the effects", "effect.buffer", "a buffer's quads lie this many bytes apart in the entry", 0x80011e94, 3, "v1", "v0"),
    ("the effects", "effect.table.mul", "the frame's table lies at the buffer times this, shifted", 0x80012998, 2, "v1", "v0"),
]
DIVISORS = []
GREYS = []
SCANS = []

# The effects: the straight run of startup that fills the kinds' table pointers and the sprites' colours, where both
# lie with their offsets from gp, the frame's ordering table as the run, the loop's clear and the send build its
# address, the sine table's quarter turn, the HUD points the key-less effects start at, the kind a key and a fruit
# start at their icon, which the walk passes as $zero, a row's particles, the buffers an entry holds quads for, the
# words an entry holds past them and the GPU's flat quad.
EFFECT_INIT = (0x80011524, 0x800115fc)
EFFECT_POINTERS = (0x800a42f0, 5048)
EFFECT_COLOURS = (0x800a4328, 5104)
EFFECT_TABLE = ((0x80012950, 0x80012954), (0x80040b38, 0x80040b3c), (0x8002a350, 0x8002a354))
EFFECT_SINE = (0x8005fba8, "lui $at, {}", 0x8005fbb0, "lh $v0, {}($at)")
EFFECT_HUD = {"clock": (0x8003907c, 0x80039080), "teleport": (0x8003a640, 0x8003a644),
              "fruit": ((0x80038c1c, 0x80038c20), (0x80038cc4, 0x80038cc8), (0x80038d6c, 0x80038d70),
                        (0x80038e14, 0x80038e18), (0x80038ebc, 0x80038ec0))}
EFFECT_HUD_KIND = 0
EFFECT_WORLD = (27, 31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47)
PARTICLES = 2
BUFFERS = 2
ENTRY_WORDS = 6
FLAT = 0x28
FLAT_WORDS = 5


def effect_init(code, span=EFFECT_INIT):
    """What startup's straight run from the first address to the second
    stores through gp, by address: a lui or an addiu sets a register, any
    other write unsets it, and a word or a byte stored from one that is set
    is kept with which it was."""
    regs, stored = {"zero": 0}, {}
    for pc in range(*span, 4):
        text = code.text(pc)
        m = re.match(r"lui \$(\w+), (0x[0-9a-f]+)$", text)
        if m:
            regs[m.group(1)] = 0x80000000 | (int(m.group(2), 0) << 16)
            continue
        m = re.match(r"addiu \$(\w+), \$(\w+), (-?\d+)$", text)
        if m:
            base = regs.get(m.group(2))
            regs[m.group(1)] = None if base is None else (base + int(m.group(3))) & 0xFFFFFFFF
            continue
        m = re.match(r"(sw|sb) \$(\w+), (-?\d+)\(\$gp\)$", text)
        if m:
            if regs.get(m.group(2)) is None:
                sys.exit(f"0x{pc:08x} stores a register the run has not set")
            stored[GP + int(m.group(3))] = (m.group(1), regs[m.group(2)])
            continue
        m = re.match(r"(\w+) \$(\w+)", text)
        if m and m.group(1) not in READS_FIRST:
            regs[m.group(2)] = None
    return stored


def effect_setup(code, slots, sprites):
    """The pointers to the effect tables, nothing where a kind has none, and
    the sprites' colours, three bytes each, as startup stores them."""
    if GP + EFFECT_POINTERS[1] != EFFECT_POINTERS[0] or GP + EFFECT_COLOURS[1] != EFFECT_COLOURS[0]:
        sys.exit("the effect tables' pointers or the sprites' colours do not lie where their offsets from gp put them")
    stored = effect_init(code)
    pointers = []
    for i in range(slots):
        op, value = stored.get(EFFECT_POINTERS[0] + 4 * i, ("sw", 0))
        if op != "sw":
            sys.exit(f"slot {i} of the effect tables' pointers is not stored as a word")
        pointers.append(value)
    colours = []
    for i in range(sprites):
        channels = [stored.get(EFFECT_COLOURS[0] + 3 * i + c) for c in range(3)]
        if any(ch is None or ch[0] != "sb" for ch in channels):
            sys.exit(f"sprite {i}'s colour is not three bytes startup stores")
        colours.append([ch[1] for ch in channels])
    return pointers, colours


def effect_tables(code, pointers):
    """Each table the pointers name: its count of particles, its frames and a
    row a particle a frame of four halfwords, a sprite, an angle, a size and
    a brightness."""
    out = {}
    for at in sorted(set(pointers) - {0}):
        if not code.holds(at, 4):
            sys.exit(f"the effect table at 0x{at:08x} lies outside the executable")
        count, frames = struct.unpack_from("<hh", code.blob, at - EXE_BASE)
        if count <= 0 or frames <= 0 or not code.holds(at, 4 + 8 * count * frames):
            sys.exit(f"the effect table at 0x{at:08x} holds {count} particles over {frames} frames")
        rows = [[list(struct.unpack_from("<hhhH", code.blob, at + 4 + 8 * (f * count + p) - EXE_BASE))
                 for p in range(count)] for f in range(frames)]
        out[at] = {"count": count, "frames": frames, "rows": rows}
    return out


def effect_sine(code):
    """Where the sine table lies, and what it gives at a quarter turn."""
    hi, hp, lo, lp = EFFECT_SINE
    table = (0x80000000 | (code.immediate(hi, hp) << 16)) + code.immediate(lo, lp)
    return table, int.from_bytes(code.read(table + 2 * (TURN // 4), 2), "little", signed=True)


def effect_places(code):
    """The HUD points the key-less effects start at, three halfwords each, as data."""
    def point(pair):
        at = code.address(*pair)
        return list(struct.unpack_from("<hhh", code.blob, at - EXE_BASE))
    return {"clock": point(EFFECT_HUD["clock"]), "teleport": point(EFFECT_HUD["teleport"]),
            "fruit": [point(pair) for pair in EFFECT_HUD["fruit"]]}


def effects(r):
    """The effects: the list's size, a row's particles, the depth under which
    a particle is skipped, the sprites' light colours as the faces show
    them and the brightness a sprite's texture is its own at, a size's
    unit on the HUD and in the world, what a colour byte times the
    brightness is divided by into the light, the tables by the first kind
    that uses each and every kind's table, what each pickup starts in the
    world and on the HUD, the teleporter's HUD kind, the HUD's points and
    the flash, each held against the others: twelve pointers with the last
    empty and the kinds the pickups start among them, the three pills one
    kind and the five fruit and type 27's case one, the HUD's kinds apart
    from the world's kinds, two particles a row, every sprite among the seven
    and every brightness a byte, the dice's -1 the one angle below nothing
    and drawn in the world only where nothing shows, a size's shifts one
    for the cosine and the sine past the sine's one, the entry two buffers
    of two quads and six words, a row eight bytes of four halfwords, the
    light's bytes shifted alike, one table for the run, the clear and the
    send, sent from its last word, every HUD point's third word -1, and
    the flash marked, tested and given with the one the loop waits two
    blanks on, a flat quad over the screen in the blend that adds, the
    level's load starting the last mode's flash on a level with no key."""
    pointers, colours, tables = r["effect.pointers"], r["effect.colours"], r["effect.tables"]
    if len(pointers) != r["effect.slots.last"] + 1 or pointers[-1] != 0 or 0 in pointers[:-1]:
        sys.exit("the effect tables' pointers are not eleven kinds' pointers of twelve")
    first = {kind: pointers.index(at) for kind, at in enumerate(pointers[:-1])}
    world = {t: r[f"effect.kind.{t}"] for t in EFFECT_WORLD}
    hud = {31: EFFECT_HUD_KIND, 35: r["effect.kind.35.hud"], 5: r["effect.kind.5.hud"],
           **dict.fromkeys(range(43, 48), EFFECT_HUD_KIND)}
    if len({world[t] for t in (32, 33, 34)}) != 1 or len({world[t] for t in (27, 43, 44, 45, 46, 47)}) != 1 \
            or world[36] != world[42] or any(k not in first for k in list(world.values()) + list(hud.values())):
        sys.exit("the kinds the pickups start are not shared as read, or one has no table")
    if set(world.values()) & set(hud.values()):
        sys.exit("a kind is started both in the world and on the HUD")
    for at, t in tables.items():
        on_hud = any(k in hud.values() for k, p in enumerate(pointers) if p == at)
        if t["count"] != PARTICLES or len(t["rows"]) != t["frames"] or any(len(row) != PARTICLES for row in t["rows"]):
            sys.exit(f"the effect table at 0x{at:08x} does not hold {PARTICLES} particles a row over its frames")
        for f, row in enumerate(t["rows"]):
            for sprite, angle, size, bright in row:
                if not 0 <= sprite < r["effect.sprites"] or not 0 <= bright <= 255 or angle < -1:
                    sys.exit(f"row {f} of the effect table at 0x{at:08x} holds {(sprite, angle, size, bright)}")
                if angle == -1 and not on_hud and size and bright:
                    sys.exit(f"row {f} of the effect table at 0x{at:08x} draws from the dice in the world with something to show")
    stored = {r[f"effect.colour.{c}"] for c in "abcdef"} | {0}
    if len(colours) != r["effect.sprites"] or {ch for c in colours for ch in c} != stored or max(stored) >= r["effect.full"]:
        sys.exit("the sprites' colours are not the bytes startup stores, under the texture's own colour")
    shown = [[third, second, first_byte] for first_byte, second, third in colours]
    if r["effect.player"] != r["effect.most"] * r["effect.entry"] or r["effect.buffer"] != PARTICLES * r["effect.quad"] \
            or r["effect.prims"] != BUFFERS * r["effect.buffer"] or r["effect.entry"] != r["effect.prims"] + 4 * ENTRY_WORDS \
            or r["effect.particle"] != r["effect.quad"]:
        sys.exit("an effect's entry is not the quads of two buffers of two particles and six words")
    if 1 << r["effect.row.quad"] != r["effect.header"] or r["effect.header"] << r["effect.row.double"] != r["effect.row.step"] \
            or r["effect.header"] != 2 * r["effect.angle.step"] or r["effect.third"] != 2 * r["effect.angle.step"]:
        sys.exit("a table's header is not two halfwords, or a row not eight bytes, or an angle not a halfword")
    if r["effect.players"] != ONE_PLAYER - 1 or r["effect.gone"] != -1 or r["effect.step"] != 1:
        sys.exit("the world's gate is not one player, or the counts do not step by one")
    if r["effect.dice"] != TURN or r["effect.dice.world"] != TURN or r["effect.sine.one"] != ONE:
        sys.exit("the dice are not drawn for a turn, or the sine table's one is not 4096")
    one = r["effect.sine.one"].bit_length() - 1
    if r["effect.hud.shift"] != r["effect.hud.shift.sine"] or r["effect.world.shift"] != r["effect.world.shift.sine"] \
            or r["effect.whole.shift"] != r["effect.world.shift"] or r["effect.whole.shift.sine"] != r["effect.world.shift"] \
            or r["effect.whole.one"] != 1 or r["effect.whole.one.sine"] != 1 \
            or min(r["effect.hud.shift"], r["effect.world.shift"]) < one:
        sys.exit("a size's shifts are not one for the cosine and the sine, past the sine's one")
    if len({r["effect.light.shift"], r["effect.light.shift.g"], r["effect.light.shift.b"]}) != 1:
        sys.exit("the light's three bytes are not shifted alike")
    if len(set(r["effect.table.at"])) != 1 or r["effect.table.mul"] << r["effect.table.shift"] != 4 * r["effect.table.words"] \
            or r["effect.table.send"] != 4 * (r["effect.table.words"] - 1):
        sys.exit("the frame's table is not one address of so many words, sent from its last")
    at = r["effect.hud.at"]
    points = [at["clock"], at["teleport"], *at["fruit"]]
    if len(at["fruit"]) != 5 or r["effect.hud.z"] >= 0 or any(p[2] != r["effect.hud.z"] for p in points):
        sys.exit("a HUD point's third word is not the one below nothing")
    f = {k: r[f"teleport.flash.{k}"] for k in ("on", "run.on", "word", "modes", "mode.last", "level.mode", "level", "from",
                                                 "from.1", "from.last", "level.from", "step", "step.1", "step.last", "blend",
                                                 "semi", "wide", "high", "len", "quad")}
    if len({f["on"], f["run.on"], f["word"], r["simon.loop.mode"]}) != 1:
        sys.exit("the flash is not marked, tested and given with the one the loop waits two blanks on")
    if len({f["modes"], f["mode.last"], f["level.mode"]}) != 1 or f["level.from"] != f["from.last"] or f["level"] != r["mode.bonus"]:
        sys.exit("the level's load does not start the flash in the last mode on a level with no key")
    if any(f[k] >= 0 for k in ("step", "step.1", "step.last")) or min(f["from"], f["from.1"], f["from.last"]) <= 0:
        sys.exit("a flash's strength does not come down from above nothing")
    if f["blend"] != ADD or f["semi"] != 1 or f["wide"] != 1 or f["high"] != 1 or f["quad"] != FLAT or f["len"] != FLAT_WORDS:
        sys.exit("the flash is not a flat quad over the screen in the blend that adds")
    return {"most": r["effect.most"], "particles": PARTICLES, "near": r["effect.near"],
            "sprites": {"count": r["effect.sprites"], "colours": shown, "full": r["effect.full"]},
            "size": {"hud": 1 << (r["effect.hud.shift"] - one), "world": 1 << (r["effect.world.shift"] - one)},
            "light": {"over": 1 << r["effect.light.shift"]},
            "tables": {str(k): {"frames": tables[pointers[k]]["frames"], "rows": tables[pointers[k]]["rows"]}
                       for k in sorted(set(first.values()))},
            "kinds": {str(k): str(v) for k, v in first.items()},
            "starts": {str(t): ({"world": world[t], "hud": hud[t]} if t in hud else {"world": world[t]})
                       for t in sorted(world) if t in TAKE_CASES and t != 27},
            "teleport": {"hud": hud[5]},
            "hud": {"clock": at["clock"][:2], "teleport": at["teleport"][:2], "fruit": [p[:2] for p in at["fruit"]],
                    "key": [r["effect.hud.key.right"], r["effect.hud.key.down"]]},
            "flash": {"blend": f["blend"],
                      "teleport": {"from": f["from"], "step": -f["step"], "blanks": r["pill.lethargy.blanks"]},
                      "bonus": {"from": f["level.from"], "step": -f["step.last"]}}}
