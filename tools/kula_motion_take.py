"""What the ball takes off its face, by type, how near its centre has to come
to a thing's middle, where that middle stands off its block's centre, what it
scores and, for each thing that lasts, the word it sets and how that word
runs down, the lethargy pill's hold on the pace, the view and the screen, the
devices under the ball, the switch and the teleporter the hazards routine
runs every frame, the run of progress each acts in and the marker that keeps
either from acting twice in a visit, and the level's end, the exits, the wait
an ending runs and the blocks a bonus level marks under the ball: "What the
ball takes", "The devices under the ball" and "The level's clock and its end"
in docs/motion.md, and "The view in play" in docs/camera.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_level import FACE, FACES
from kula_motion_code import BALL_RECORD, BLOCK, CRUMBLING_UNDER, GP, TURN, root

CHECKS = [
    # What the ball takes.
    (0x80035620, "sw $zero, -29572($at)", "the loader marks every slot as not to be taken"),
    (0x80035690, "sw $s4, -29572($at)", "and then a fruit as to be taken"),
    (0x800358dc, "sw $s4, -29572($at)", "a key, a pill or the sunglasses"),
    (0x8003579c, "sw $s4, -29572($at)", "a coin"),
    (0x800357d0, "sw $s4, -29572($at)", "type 42"),
    (0x80035804, "sw $s4, -29572($at)", "an hourglass"),
    (0x80035830, "sw $s4, -29572($at)", "and a gem"),
    (0x80035838, "lh $v0, 6($v1)", "whose stand is by its cut"),
    (0x80035840, "bne $v0, $zero, 0x80035854", "the first cut standing lower"),
    (0x80035640, "beq $v0, $zero, 0x80035924", "a type outside the loader's table"),
    (0x80035928, "beq $a1, $zero, 0x800359fc", "or sent to its plain case lays no entry and is passed over"),
    (0x800359f4, "jal 0x80039ec0", "the loader lays each thing's matrix"),
    (0x80039fa8, "subu $v1, $v1, $a3", "whose translation takes the stand along the top's normal"),
    (0x80039fac, "sw $v1, 28($t0)", "from the block's centre"),
    (0x80039d14, "lw $v1, -29548($at)", "the draw walk takes the translation"),
    (0x80039d24, "addu $v0, $v0, $v1", "adds the offset it turned"),
    (0x80039d30, "sh $v0, 40($v1)", "and keeps the point as the thing's position"),
    (0x800384f4, "addiu $a0, $a0, 104", "the contact walks the cells about the ball from the words at 104"),
    (0x80039198, "slti $v0, $v0, 3", "three over"),
    (0x800391b4, "slti $v0, $v0, 3", "three on"),
    (0x800391d0, "slti $v0, $v0, 3", "and three up"),
    (0x80038548, "slti $v0, $v0, 5", "taking a record of a kind below 5"),
    (0x80038578, "lh $v0, 8($a3)", "and each slot's f4"),
    (0x80038580, "beq $v0, $zero, 0x8003916c", "passing over a slot where it is nothing"),
    (0x80038598, "lw $v0, -29572($at)", "and a thing the loader marked not to be taken"),
    (0x800385a0, "beq $v0, $zero, 0x8003916c", "too"),
    (0x800385b4, "lh $v1, -29536($at)", "it measures from the ball's centre to the thing's position"),
    (0x800385c0, "mult $v0, $v0", "squared"),
    (0x8003862c, "slt $v0, $v0, $v1", "against the thing's reach squared plus the ball's radius squared"),
    (0x80038630, "beq $v0, $zero, 0x8003916c", "and passes over one out of reach"),
    (0x80038670, "sw $zero, 7236($gp)", "a thing in reach is to be taken"),
    (0x80038674, "addiu $v0, $v0, -27", "and its type less the first the walk knows"),
    (0x80038680, "sltiu $v0, $v1, 21", "one of the types it knows"),
    (0x80038694, "lw $v0, 568($at)", "picks its case from the table at 0x80010238"),
    (0x80039110, "bne $v0, $zero, 0x80039168", "unless the case asked to keep the thing"),
    (0x80039138, "sh $zero, 8($v0)", "the walk's tail writes 0 into its f4"),
    (0x80039140, "sh $zero, 2($v0)", "and its type"),
    (0x80039158, "jal 0x8002c184", "and repaints its face"),
    (0x800386c4, "lh $v0, 6($v0)", "type 42's case reads its form"),
    (0x800386cc, "bne $v0, $zero, 0x8003873c", "the green scores"),
    (0x80038730, "sw $s2, 7236($gp)", "and the brown is kept"),
    (0x80038700, "sw $v0, -23760($at)", "ending the level"),
    (0x80038b8c, "lh $v0, 6($v1)", "a coin's case reads its tier"),
    (0x80038b94, "bne $v0, $zero, 0x80038bb8", "the first scoring most"),
    (0x80038bbc, "bne $v0, $s2, 0x80038bdc", "the second"),
    (0x80038be4, "bne $v0, $s1, 0x80039108", "and the third least"),
    (0x80038a24, "addiu $v1, $v1, -1", "a key takes one off the keys left"),
    (0x80038a30, "sw $v1, 13308($at)", "at 0x800a33fc"),
    (0x800358bc, "addiu $v1, $v1, 1", "which the loader counted"),
    (0x800358c4, "sw $v1, 13308($at)", "key by key"),
    (0x80038a3c, "bne $v1, $zero, 0x80038a90", "and the last"),
    (0x80038a78, "sh $zero, 6($v0)", "writes 0 into the exit's f3"),
    (0x80038a7c, "sh $s2, 8($v0)", "1 into its f4"),
    (0x80038a84, "sh $s2, 8($v1)", "and 1 into the hidden exit's f4"),
    (0x80035868, "sw $s0, 7516($gp)", "the exit being the last the loader met"),
    (0x80035874, "sh $s4, 6($v1)", "whose f3 it set"),
    (0x8003588c, "sw $s0, 7520($gp)", "the hidden exit the last it met"),
    (0x80035898, "sh $zero, 8($v1)", "whose f4 it cleared"),
    (0x80035a3c, "sw $v0, 7520($gp)", "or the exit again where it met none"),
    (0x80039074, "subu $v0, $v0, $v1", "the hourglass takes the clock from a count"),
    (0x80039094, "sw $v0, 22332($at)", "and writes the difference back as the clock"),
    (0x800390c4, "sw $v1, 21448($at)", "scoring by the seconds of it"),
    (0x800387d4, "sw $v0, -23752($at)", "the lethargy pill sets its word"),
    (0x80038854, "sw $v0, -23744($at)", "the invincibility pill its word"),
    (0x800388b8, "sw $v0, -23748($at)", "the bouncy pill its word"),
    (0x8003892c, "sw $v0, -23756($at)", "and the sunglasses theirs"),
    (0x80035de0, "addiu $v0, $zero, -1", "which the level's load sets to -1"),
    (0x80035de8, "sw $v0, -23756($at)", "the sunglasses' word"),
    (0x80035df0, "sw $v0, -23752($at)", "the lethargy pill's word"),
    (0x80035df8, "sw $v0, -23744($at)", "the invincibility pill's word"),
    (0x80035e00, "sw $v0, -23748($at)", "and the bouncy pill's word"),
    (0x8003b2d0, "bne $v0, $zero, 0x8003b2e4", "the hazards routine finds the sunglasses' word at nothing"),
    (0x8003b2d8, "jal 0x8002bec8", "and starts their blink"),
    (0x8003b2e8, "bltz $v0, 0x8003b2f4", "counting the word down while it is not negative"),
    (0x8003b2dc, "addu $a0, $zero, $zero", "the start called with nothing"),
    (0x8003893c, "jal 0x8002bec8", "the take calls the blink's start"),
    (0x8002bf38, "sw $zero, 24144($at)", "the take's call clears the blink's state"),
    (0x8002bf44, "sw $v1, 23192($at)", "and sets the flag"),
    (0x8002bee8, "sw $v0, 24144($at)", "the start marks the state an off spell's state"),
    (0x8002bef8, "sw $v0, 18076($at)", "lays the count"),
    (0x8002bf08, "sw $v0, 18080($at)", "and the timer"),
    (0x8002bf14, "sw $zero, 23192($at)", "and clears the flag"),
    (0x8002bed4, "lw $v1, 13264($v1)", "the four stores indexed by the word that gates every update"),
    (0x8002bedc, "sll $v1, $v1, 2", "four bytes a step"),
    (0x8002bf70, "beq $v1, $a3, 0x8002bf88", "the blink runs an off spell"),
    (0x8002bf78, "beq $v1, $v0, 0x8002bfec", "or an on spell, and otherwise returns"),
    (0x8002bfa0, "bgtz $v0, 0x8002c04c", "returning while the timer stays above nothing"),
    (0x8002c004, "bgtz $v0, 0x8002c04c", "in an on spell too"),
    (0x8002bfc0, "blez $v0, 0x8002c02c", "the count at nothing ends the blink"),
    (0x8002c024, "bgtz $v0, 0x8002c034", "from an on spell too"),
    (0x8002c030, "sw $zero, 0($a2)", "the end clears the state and leaves the flag"),
    (0x8002bfd4, "sw $v0, 0($a2)", "else the state swaps to an on spell"),
    (0x8002bfe0, "sw $a3, 23192($at)", "and the flag goes on"),
    (0x8002c03c, "sw $a3, 0($a2)", "or to an off spell"),
    (0x8002c048, "sw $zero, 23192($at)", "and the flag goes off"),
    (0x80051370, "lw $s5, 0($s5)", "the invisible block's light reads the flag"),
    (0x80051390, "beq $s5, $zero, 0x800513b8", "and draws every face through it"),
    (0x8002a3e8, "jal 0x8002bf50", "the frame's draw runs the blink before the light"),
    (0x8002a3c8, "lw $s0, 12096($gp)", "under a gate of its own"),
    (0x8002a3d8, "bne $s0, $v0, 0x8002a6c8", "which is not read"),
    (0x8003b300, "bltz $v0, 0x8003b310", "and the invincibility pill's word"),
    (0x8003b30c, "sw $v0, -23744($at)", "by its step"),
    (0x8003b31c, "bltz $v0, 0x8003b35c", "and while that runs"),
    (0x8003b33c, "sw $v0, -23748($at)", "puts the bouncy pill's word back"),
    (0x8003b358, "sw $zero, -23752($at)", "and the lethargy pill's word at nothing"),
    (0x8003b384, "bltz $v0, 0x8003b398", "the lethargy pill's word not negative"),
    (0x8003b38c, "sw $v0, 0($s1)", "counts down by its step"),
    (0x8003b390, "jal 0x8003b468", "and ticks the clock on"),
    # The lethargy pill's hold on the pace, the view and the screen.
    (0x80069a04, "lui $gp, 0x000a", "the start sets gp"),
    (0x80069a08, "addiu $gp, $gp, 12088", "to 0x800a2f38"),
    (0x800387d8, "jal 0x800201f0", "the lethargy pill's case starts the screen's effect"),
    (0x800387dc, "addiu $a0, $zero, 1", "with its start word"),
    (0x800201f4, "lw $v0, 13260($v0)", "which reads the count of players at 0x800a33cc"),
    (0x80020208, "bne $a0, $v0, 0x8002021c", "and asked to start"),
    (0x80020210, "sw $a0, 10228($gp)", "writes the mode word at 0x800a572c"),
    (0x80020224, "beq $v0, $zero, 0x80020230", "or asked to end while the mode stands"),
    (0x8002022c, "sw $v0, 10228($gp)", "marks the end"),
    (0x8003b36c, "bne $v0, $zero, 0x8003b380", "the hazards routine finds the pill's word at nothing"),
    (0x8003b374, "jal 0x800201f0", "and asks the end"),
    (0x8003b378, "addu $a0, $zero, $zero", "with nothing"),
    (0x80040ad8, "bne $v0, $zero, 0x80040af4", "the loop finds the mode word standing"),
    (0x80040af4, "jal 0x80065b68", "and waits through the library's VSync instead"),
    (0x8002076c, "sw $a1, 10740($gp)", "the second half-rate word, 0x800a592c, is written here"),
    (0x80035268, "lw $a0, 548($s0)", "the view routine reads the pill's word at 548 of the record"),
    (0x8003531c, "blez $a0, 0x80035368", "and while it is positive"),
    (0x80035334, "sra $a0, $a0, 12", "takes its product"),
    (0x80035338, "sll $a0, $a0, 12", "modulo"),
    (0x80035340, "subu $a0, $v0, $a0", "a turn"),
    (0x8003533c, "jal 0x8005fb58", "its sine"),
    (0x80035344, "bgez $v0, 0x80035350", "rounded toward nothing"),
    (0x80035360, "jal 0x80061298", "and rolls the view about its line of sight"),
    (0x80035364, "addu $a1, $a1, $s1", "the view the frame draws"),
    (0x8006132c, "subu $t9, $t8, $t9", "the roll takes the sine times the down row off the right row"),
    (0x800613bc, "addu $t9, $t8, $t9", "and adds the sine times the right row to the down row"),
    (0x8001dcd0, "jal 0x8002025c", "the frame's draw runs the screen's routine each pass"),
    (0x80020260, "lw $v1, 10228($gp)", "which reads the mode"),
    (0x80020288, "beq $v1, $v0, 0x800202b4", "the start's pass"),
    (0x80020274, "beq $v1, $a0, 0x80020398", "the passes the pill works"),
    (0x8002029c, "beq $v1, $v0, 0x80020518", "the end's pass"),
    (0x800202a4, "beq $v1, $v0, 0x800205f4", "and the fade's pass"),
    (0x80024060, "lw $v1, 10240($gp)", "the flash's quad shows a sprite counted from the group's start"),
    (0x80024274, "lhu $v0, -23060($at)", "with its page word"),
    (0x8002428c, "lhu $v0, -23062($at)", "and its palette word"),
    (0x8002423c, "lbu $a1, -23063($at)", "blending where its descriptor's second byte says"),
    (0x80024240, "jal 0x8005f8c8", "so"),
    (0x80023048, "nor $v0, $zero, $s3", "the byte the walker sets where the upload names a blend"),
    (0x8002304c, "sltu $v0, $zero, $v0", "any blend"),
    (0x80023054, "sb $v0, 1($s1)", "second in the descriptor"),
    (0x80023198, "jal 0x8005f808", "and puts the blend in the page word"),
    (0x8002319c, "addu $a1, $s3, $zero", "as named"),
    (0x800202e8, "sb $a2, 4($v0)", "on the pill's pass the quad's red is written"),
    (0x8002032c, "sb $a2, 5($v0)", "its green"),
    (0x8002034c, "sb $a2, 6($v0)", "and its blue"),
    (0x800202cc, "lw $a0, 13268($a0)", "the screen's width at 0x800a33d4"),
    (0x800202e0, "lw $v1, 13276($v1)", "and its height at 0x800a33dc"),
    (0x800202f4, "addiu $a0, $a0, 1", "each a pixel more"),
    (0x80020310, "addiu $v1, $v1, 1", "than the screen"),
    (0x80020300, "sh $a0, 16($v0)", "are the quad's corners across"),
    (0x80020314, "sh $v1, 26($v0)", "and down"),
    (0x80020374, "jal 0x8005f868", "added to the frame's table"),
    (0x800202c4, "sw $a0, 10228($gp)", "and the mode moved on"),
    (0x80020380, "sw $v0, 5148($gp)", "the idle phase"),
    (0x80020384, "sw $v0, 5152($gp)", "the stretch's phase"),
    (0x8002038c, "sw $v0, 5156($gp)", "and the magnitude set"),
    (0x80020398, "lw $v1, 5148($gp)", "each pass after, the idle phase"),
    (0x800203c0, "jal 0x8005fb58", "has its sine taken"),
    (0x800203d4, "sll $v0, $v1, 3", "and thrown away"),
    (0x800203e8, "sb $s0, 22656($at)", "the ghost's red is written"),
    (0x8002040c, "sb $s1, 22657($at)", "its green"),
    (0x80020430, "sb $s0, 22658($at)", "and its blue"),
    (0x80020460, "jal 0x8005f868", "and the ghost added to the frame's table"),
    (0x800204a0, "sb $s0, 22684($at)", "the second sprite's red"),
    (0x800206ac, "jal 0x8005f868", "and that added"),
    (0x8002429c, "beq $s3, $s5, 0x800242ac", "each buffer's ghost is paged at the other buffer's place"),
    (0x800242a8, "lw $a2, 13268($a2)", "the screen's width along"),
    (0x800242b0, "addu $a1, $zero, $zero", "with the blend that takes half of each"),
    (0x800242b4, "jal 0x8005f808", "in its page word"),
    (0x800242d8, "jal 0x80025354", "laid before the sprite"),
    (0x80024308, "sh $s4, 16($s0)", "the sprite is a page wide"),
    (0x80024318, "sh $v0, 18($s0)", "and the screen high"),
    (0x800242f0, "addiu $a1, $zero, 1", "semi-transparent"),
    (0x80024314, "jal 0x8005f8c8", "so"),
    (0x80024324, "addu $a1, $zero, $zero", "and shaded by its colour"),
    (0x80024320, "jal 0x8005f8f8", "so"),
    (0x800243ac, "sh $s4, 8($v0)", "the second sprite starts a page along"),
    (0x800243c0, "sh $v1, 16($v0)", "and is the rest of the width wide"),
    (0x800206c8, "beq $v0, $zero, 0x80020748", "while the mode stands the routine's tail runs"),
    (0x800206dc, "sw $v0, 5156($gp)", "waning the magnitude"),
    (0x800206e0, "blez $v0, 0x80020748", "and while that is positive"),
    (0x80020708, "subu $a0, $v0, $a0", "steps the phase modulo a turn"),
    (0x8002070c, "sw $a0, 5152($gp)", "keeps it"),
    (0x80020710, "jal 0x8005fb58", "takes its sine"),
    (0x80020720, "mult $v0, $v1", "times the magnitude"),
    (0x80020728, "sra $v1, $t0, 12", "over 4096"),
    (0x80020734, "sw $v0, 13272($at)", "adds it to the scale across at 0x800a33d8"),
    (0x8002073c, "subu $v0, $v0, $v1", "and takes it off"),
    (0x80020744, "sw $v0, 13280($at)", "the scale down at 0x800a33e0"),
    (0x80041ba8, "jal 0x80020238", "which the loop puts back as a level is left"),
    (0x80020240, "sw $v0, 13272($at)", "across"),
    (0x80020250, "sw $v0, 13280($at)", "and down"),
    (0x80020248, "sw $zero, 10228($gp)", "with the mode cleared"),
    (0x80020530, "sw $v0, 5404($gp)", "the end's pass sets the fade's level"),
    (0x80020588, "sh $v0, 5340($gp)", "lays the quad's corners again"),
    (0x800205a8, "jal 0x8005f868", "draws the ghost once more"),
    (0x80020518, "sw $v0, 10228($gp)", "and moves the mode on"),
    (0x80020600, "sw $a0, 5404($gp)", "the fade's pass steps the level down"),
    (0x80020604, "bltz $a0, 0x800206bc", "and below nothing"),
    (0x800206bc, "sw $zero, 10228($gp)", "clears the mode"),
    (0x8002062c, "sb $a0, 17416($at)", "else writes the level as the quad's red"),
    (0x80020658, "sb $v1, 17417($at)", "its green"),
    (0x80020680, "sb $v1, 17418($at)", "and its blue"),
    (0x8004101c, "jal 0x8002a3c0", "each pass the loop draws the level"),
    (0x8002a4c8, "addiu $a2, $a2, 22080", "from a copy of the view"),
    (0x8002a4d4, "lw $v1, 22884($at)", "taken as it is"),
    (0x80056680, "addiu $v0, $v0, 13272", "which the transform takes with the scale across"),
    (0x800566b0, "addiu $v1, $v1, 13280", "and the scale down"),
    (0x800566f4, "ctc2 $a2, rt11rt12", "into the rows it loads"),
    (0x800517a8, "addiu $v0, $v0, 13272", "as the beams' draw does"),
    (0x800517bc, "mult $a2, $v0", "times the scale"),
    (0x8005181c, "ctc2 $a2, rt11rt12", "into its rows"),
    (0x80041014, "jal 0x8002a1b4", "the loop draws the background"),
    (0x8002a260, "addiu $v0, $v0, -8192", "from a copy with 8192 off each word of its translation"),
    (0x8002a264, "sra $v0, $v0, 4", "shifted down by 4"),
    (0x80041034, "jal 0x80014d40", "and the sun's flare"),
    (0x80014e40, "addiu $v0, $v0, -8192", "from a copy with 8192 off its translation as well"),
    (0x80014e44, "sra $v0, $v0, 4", "shifted down by 4"),
    (0x80014d4c, "lw $t3, 13272($t3)", "then the scale across"),
    (0x80014d54, "lw $t1, 13280($t1)", "and the scale down"),
    (0x80014e70, "mult $v0, $t3", "the view's first row times the one"),
    (0x80014e80, "mult $v0, $t1", "the second times the other"),
    (0x80014e88, "sra $v0, $t4, 12", "over 4096"),
    (0x80014eb8, "mult $v1, $v0", "the translation across the same"),
    (0x80014ed0, "mult $v1, $v0", "and down"),
    (0x80014ee8, "jal 0x80060718", "loaded"),
    (0x8006072c, "ctc2 $t0, rt11rt12", "as the coprocessor's rotation"),
    (0x80014ef0, "jal 0x80060748", "and translation"),
    (0x80014f28, "jal 0x800609c8", "to put the world's sun on the screen"),
    (0x80036bb4, "bltz $v0, 0x80036bc0", "the bouncy pill's word not negative"),
    (0x8003659c, "bne $v0, $zero, 0x800365cc", "and at its hold or more"),
    (0x800365a0, "addiu $v0, $zero, 2", "while the state at 408 is the rolling state's number"),
    (0x800365a8, "lw $v1, -23892($v1)", "and no other"),
    (0x800365b0, "bne $v1, $v0, 0x800365cc", "the ball's routine"),
    (0x800365bc, "sw $zero, -24200($at)", "drops the jump"),
    (0x800365c4, "sw $zero, -24204($at)", "and the roll, and the word"),
    (0x800365c8, "sw $v0, 0($a1)", "grows by one"),
    (0x8003b00c, "sw $v0, 21448($at)", "a crumbling block scores"),
    (0x8003afd4, "lh $v1, 2($v0)", "where its type"),
    (0x8003afdc, "bne $v1, $v0, 0x8003b010", "is 1"),
    (0x8003b024, "addiu $v1, $zero, 2", "and the type becomes 2"),
    (0x8003b028, "sh $v1, 2($v0)", "broken"),
    # The devices under the ball, and the level's end.
    (0x8003b398, "jal 0x8003a388", "the hazards routine runs the switch"),
    (0x8003b3a0, "jal 0x8003a58c", "and the teleporter"),
    (0x8003a394, "jal 0x8003b56c", "the switch asks whether the ball is in the air"),
    (0x8003a3a8, "sh $zero, 492($s0)", "clearing the device marker there"),
    (0x8003a3b4, "beq $v0, $v1, 0x8003a578", "does nothing while the marker holds it"),
    (0x8003a3c4, "bne $v0, $v1, 0x8003a578", "or while the ball stands on anything else"),
    (0x8003a3cc, "lhu $v0, 336($s0)", "and asks the progress"),
    (0x8003a3e4, "lhu $v0, 332($s0)", "and the measure across"),
    (0x8003a400, "sh $v1, 492($s0)", "then marks the device"),
    (0x8003a464, "lh $a0, 14($v0)", "and walks the list its f7 starts"),
    (0x8003a49c, "bne $a0, $v0, 0x8003a500", "a laser by its face"),
    (0x8003a4ec, "sh $v1, 6($a1)", "turning its lit flag over"),
    (0x8003a4b8, "lh $a2, 46($a1)", "and reading the next from its second slot"),
    (0x8003a558, "sh $a0, 8($a1)", "a device's f4 turned between 1 and 2"),
    (0x8003a520, "lhu $v1, 12($a1)", "and the next read from its f6"),
    (0x8003a570, "bne $v1, $v0, 0x8003a494", "until the list ends"),
    (0x8003a5a0, "jal 0x8003b514", "the teleporter asks whether the ball is in the air"),
    (0x8003a5b0, "sh $zero, 492($s0)", "clearing the marker there"),
    (0x8003a5c8, "bne $a0, $v0, 0x8003a5f4", "does nothing unless the ball stands on one"),
    (0x8003a5e4, "lh $v1, 8($v0)", "whose f4"),
    (0x8003a5ec, "beq $v1, $v0, 0x8003a600", "is 1"),
    (0x8003a608, "beq $v0, $a0, 0x8003a90c", "and the marker is not its type"),
    (0x8003a610, "lhu $v0, 336($s0)", "and asks the progress"),
    (0x8003a620, "beq $v0, $zero, 0x8003a908", "within the band"),
    (0x8003a630, "bne $v0, $s1, 0x8003a654", "starting the count where none runs"),
    (0x8003a63c, "sw $v0, 7472($gp)", "at 0x800a4c68"),
    (0x8003a660, "sw $v0, 7472($gp)", "counting it down"),
    (0x8003a668, "sh $v0, 370($s0)", "holding the pad off"),
    (0x8003a66c, "sw $zero, 96($s0)", "and dropping the roll"),
    (0x8003a680, "bne $s2, $s1, 0x8003a908", "until the count has passed nothing"),
    (0x8003a6b4, "sh $v0, 492($s0)", "then marks the device"),
    (0x8003a6e4, "lhu $v1, 14($v0)", "reads the far end from its f7"),
    (0x8003a710, "sw $v0, 348($s0)", "as the slot the ball stands on"),
    (0x8003a724, "lh $a1, 4($v0)", "takes the far end's f2"),
    (0x8003a734, "jal 0x80038178", "lays the frame by it"),
    (0x8003a750, "swr $v0, 44($s0)", "copies the side into the view's side"),
    (0x8003a770, "swr $v0, 36($s0)", "the heading"),
    (0x8003a790, "swr $v0, 52($s0)", "and the normal"),
    (0x8003a86c, "sw $s2, 408($s0)", "puts the ball at rest"),
    (0x8003a878, "sll $a0, $a0, 8", "half a block along the normal"),
    (0x8003a894, "sh $v1, 68($s0)", "from the far end's cell"),
    (0x8003a8ec, "swr $v0, 60($a0)", "as its position"),
    (0x8003a8f8, "jal 0x80037430", "and reads the cells about it again"),
    (0x8003a6cc, "sw $zero, 0($s0)", "the send writes 0 into the record's first word, as a landing does"),
    (0x8003a79c, "lui $v0, 0x000c", "and lays the frame matrix at 212 by the record's address"),
    (0x8003a7a0, "lhu $v0, -24280($v0)", "from the side at 20"),
    (0x8003a7c8, "sh $v0, -24088($at)", "its first store, at 212"),
    (0x8003a83c, "sh $v0, -24072($at)", "the matrix's last halfword, at 228"),
    (0x8003a860, "sh $v0, -24074($at)", "and its last store, at 226"),
    (0x8003817c, "sh $zero, 7184($gp)", "the frame routine's first store, to its scratch by gp"),
    (0x8003825c, "swl $v0, 23($a2)", "its first to the record"),
    (0x800383e0, "sh $v0, 16($a2)", "and its last"),
    (0x800383e4, "jr $ra", "and its return"),
    (0x8003a904, "addiu $v0, $zero, 1", "the send returns 1"),
    (0x8003b3a8, "beq $v0, $zero, 0x8003b3d8", "on which the hazards' routine"),
    (0x8003b3b0, "jal 0x80037430", "reads the cells about the ball again"),
    (0x8003b3b8, "jal 0x80037a98", "and measures where it is within its cell, as the frame does"),
    (0x8003b3cc, "bne $v0, $zero, 0x8003b3d8", "after which a progress past the band"),
    (0x8003b3d4, "sh $zero, 492($s0)", "clears the marker"),
    (0x80036854, "lhu $v0, -23964($v0)", "as does a progress"),
    (0x8003686c, "lhu $v0, -162($s1)", "or a measure across"),
    (0x80036884, "sh $zero, -2($s1)", "off the middle"),
    (0x80030d3c, "sh $s1, 494($s0)", "a landing marks the ball landed"),
    (0x80036834, "sh $zero, 0($s1)", "until the next frame's intents"),
    (0x8003b474, "beq $v1, $v0, 0x8003b4f4", "the clock stands on a clock face"),
    (0x8003b490, "lw $v1, 1144($gp)", "and in the mode"),
    (0x8003b498, "beq $v1, $v0, 0x8003b4c8", "that is 1"),
    (0x8003b4ac, "subu $v0, $v0, $a0", "else ticks down"),
    (0x8003b4b4, "sw $v0, 22332($at)", "at 0x800a573c"),
    (0x8003b4b8, "bgtz $v0, 0x8003b4c8", "and at nothing"),
    (0x8003b4c4, "sw $v0, 24064($at)", "ends the level in the outcome word"),
    (0x8003ad84, "beq $v0, $zero, 0x8003aec8", "with no bonus flag the hazards routine tests the exits"),
    (0x8003aed0, "bne $v1, $v0, 0x8003af44", "the ball standing on the exit"),
    (0x8003aedc, "lw $v0, 13308($v0)", "with the keys left"),
    (0x8003aee4, "bne $v0, $zero, 0x8003af44", "at nothing"),
    (0x8003aef4, "beq $v0, $zero, 0x8003af20", "where it has just landed"),
    (0x8003af14, "sw $v1, 19612($at)", "leaves at once"),
    (0x8003af28, "bne $v0, $zero, 0x8003af3c", "else, with no wait running"),
    (0x8003af30, "sw $v0, 540($s0)", "takes the ending at 540"),
    (0x8003af38, "sh $v0, 370($s0)", "with a wait at 370"),
    (0x8003af44, "bne $v1, $v0, 0x8003afb0", "and the hidden exit"),
    (0x8003af88, "sw $v1, 19612($at)", "leaves at once from a landing"),
    (0x8003afa4, "sw $v0, 540($s0)", "or takes its own ending"),
    (0x8003afac, "sh $v0, 370($s0)", "with the wait"),
    (0x800363f8, "beq $v0, $zero, 0x800364cc", "the ball's routine counts a wait"),
    (0x80036404, "sh $v1, 0($a0)", "down"),
    (0x800364a8, "bne $v0, $zero, 0x800364cc", "and as it runs out"),
    (0x800364b4, "lw $v0, 13264($v0)", "at the view word's index"),
    (0x800364c8, "sw $v1, 19612($at)", "copies the ending to 0x800a4c9c"),
    (0x800365e4, "lw $v1, 19612($at)", "which the routine reads back"),
    (0x800365ec, "bne $v1, $v0, 0x80036630", "from where an exit's ending"),
    (0x80036600, "beq $v0, $v1, 0x80036638", "with one player"),
    (0x80036610, "bne $v0, $v1, 0x80036640", "or with both results"),
    (0x80036620, "beq $v0, $v1, 0x80036638", "at 1"),
    (0x80036630, "beq $v1, $zero, 0x80036640", "or any other"),
    (0x8003663c, "sw $v1, 24064($at)", "becomes the outcome"),
    (0x80036450, "bne $a0, $v0, 0x80036470", "the spikes' ending"),
    (0x80036460, "bne $v0, $v1, 0x80036470", "with the wait at 1"),
    (0x8003646c, "sw $a0, 24064($at)", "is written into the outcome directly"),
    (0x8003b058, "bne $s1, $v0, 0x8003b0d0", "the spikes' ending is the invincibility word"),
    (0x8003b0c4, "sw $s1, -23760($at)", "as tested"),
    (0x80035fe0, "sw $v1, 12088($gp)", "the start sets the bonus flag"),
    (0x80030468, "lw $v0, 24176($v0)", "which the landing reads"),
    (0x80030490, "jal 0x8002dc30", "to mark the block under the ball"),
    (0x80030494, "addiu $a3, $zero, 1", "with a mark of 1"),
    (0x8003ae74, "jal 0x8002dc30", "as the hazards routine does every frame"),
    (0x8003ae78, "addiu $a3, $zero, 1", "with the same"),
    (0x8002dcc0, "beq $v1, $v0, 0x8002dd88", "the marking passes where no block is"),
    (0x8002dce0, "beq $a1, $s1, 0x8002dd88", "or one marked already"),
    (0x8002dcf0, "beq $v1, $v0, 0x8002dd88", "or one of the kind it skips"),
    (0x8002dcf8, "sw $s1, 0($a0)", "else marks it"),
    (0x8002dd14, "sw $v0, 0($v1)", "takes one off the count of unmarked blocks"),
    (0x8002dd50, "sw $v0, 21448($at)", "and scores"),
    (0x8002dd70, "jal 0x8002ddac", "and repaints each face"),
    (0x8003ae80, "lw $v0, 24152($v0)", "the count at nothing"),
    (0x8003ae88, "bne $v0, $zero, 0x8003afb0", "ends the level"),
    (0x8003ae98, "beq $v0, $zero, 0x8003aeb0", "at once where the ball has just landed"),
    (0x8003aea4, "sw $v0, 24064($at)", "in the outcome word"),
    (0x8003aeb8, "bne $v0, $zero, 0x8003afb0", "else with no wait running"),
    (0x8003aec4, "sw $v0, 540($s0)", "as an ending"),
    (0x8003aec0, "j 0x8003afa8", "with the hidden exit's wait"),
    (0x80041b18, "bgez $a0, 0x80041b90", "a level that ends badly"),
    (0x80041b24, "lw $v0, 21460($v0)", "in a mode"),
    (0x80041b2c, "blez $v0, 0x80041b38", "past the arcade's mode"),
    (0x80041b34, "sw $zero, 9360($gp)", "scores nothing"),
]
IMMEDIATES = [
    ("what the ball takes", "take.live", "the loader marks a thing the walk may take with this", 0x800355c4,
     "addiu $s4, $zero, {}"),
    ("what the ball takes", "take.stand", "a pickup's middle stands this far from its block's centre, units",
     0x800355c8, "addiu $s7, $zero, {}"),
    ("what the ball takes", "take.stand.coin", "a coin's middle this far", 0x800357a4, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.hedgehog", "type 42's middle this far", 0x800357d8, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.hourglass", "an hourglass's middle this far", 0x80035850, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.gem", "and a gem's middle this far, past the first cut", 0x80035844,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.reach", "a pickup's reach squared, units", 0x800355cc, "addiu $s6, $zero, {}"),
    ("what the ball takes", "take.reach.key", "a key's reach squared", 0x800358ac, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.reach.fruit", "and a fruit's reach squared", 0x8003566c, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.within", "the walk adds this, the ball's radius squared, to it", 0x800384c8,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.first", "the walk's cases start at this type", 0x80038674, "addiu $v0, $v0, {}"),
    ("what the ball takes", "take.open", "a case writes this into an exit's f4 and a thing it keeps", 0x800384b0,
     "addiu $s2, $zero, {}"),
    ("what the ball takes", "take.third", "and tells a coin's third tier by this", 0x800384bc, "addiu $s1, $zero, {}"),
    ("what the ball takes", "key.points", "a key scores", 0x80038a28, "addiu $v0, $v0, {}"),
    ("what the ball takes", "gem.points", "a gem", 0x80038b00, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.0", "a coin of the first tier", 0x80038ba8, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.1", "of the second", 0x80038bd0, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.2", "and of the third", 0x80038bf8, "addiu $v0, $v0, {}"),
    ("what the ball takes", "hedgehog.points", "type 42 in its green form", 0x80038780, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.points", "the sunglasses", 0x80038930, "addiu $v1, $v1, {}"),
    ("what the ball takes", "fruit.points.43", "a fruit of type 43", 0x80038c8c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.44", "44", 0x80038d34, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.45", "45", 0x80038ddc, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.46", "46", 0x80038e84, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.47", "and 47", 0x80038f2c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "hourglass.from", "the hourglass takes the clock from this many ticks", 0x80039070,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.lethargy", "the lethargy pill sets its word to", 0x800387cc, "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.lethargy.step", "which counts down by this a frame", 0x8003b388, "addiu $v0, $v0, {}"),
    ("what the ball takes", "pill.lethargy.ticks", "ticking the clock this many extra a frame", 0x8003b394,
     "addiu $a0, $zero, {}"),
    ("what the ball takes", "pill.lethargy.players", "the screen's effect starts where the players are fewer than",
     0x800201fc, "slti $v0, $v0, {}"),
    ("what the ball takes", "pill.lethargy.blanks", "and while its mode stands a pass waits this many blanks",
     0x80040af8, "addiu $a0, $zero, {}"),
    ("the view in play", "rock.shift", "the view rolls by the sine of the pill's word's product shifted down by this",
     0x80035358, "sra $a0, $v0, {}"),
    ("the view in play", "rock.round", "the sine rounded toward nothing by this first", 0x8003534c,
     "addiu $v0, $v0, {}"),
    ("the view in play", "flash.code", "the flash is a textured quad coded this", 0x80024058, "addiu $v0, $zero, {}"),
    ("the view in play", "flash.sprite", "showing the sprite this far past the group the header's sixth bound starts",
     0x80024068, "addiu $v1, $v1, {}"),
    ("the view in play", "flash.laid", "its colour laid at this", 0x80024200, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.grey", "and written at this on the pill's pass", 0x8002028c, "addiu $a2, $zero, {}"),
    ("the view in play", "screen.phase", "the two phases start at this", 0x8002037c, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.magnitude", "and the stretch's magnitude at this", 0x80020388,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.idle.step", "the idle phase steps this a pass, its sine thrown away", 0x800203a0,
     "addiu $v0, $v1, {}"),
    ("the view in play", "screen.tint.outer", "the ghost's red and blue", 0x800203c4, "addiu $s0, $zero, {}"),
    ("the view in play", "screen.tint.green", "and its green", 0x800203f4, "addiu $s1, $zero, {}"),
    ("the view in play", "screen.page.gate", "a second ghost where the screen is this wide or more", 0x80020474,
     "slti $v0, $v0, {}"),
    ("the view in play", "screen.sprite.width", "a ghost is this wide, a texture page", 0x800242fc,
     "addiu $s4, $zero, {}"),
    ("the view in play", "screen.sprite.rest", "and the second the width less this", 0x800243bc,
     "addiu $v1, $v1, {}"),
    ("the view in play", "screen.wane", "the magnitude wanes by this a pass", 0x800206d8, "addiu $v0, $v0, {}"),
    ("the view in play", "screen.step", "and the stretch's phase steps this", 0x800206f0, "addiu $v0, $v1, {}"),
    ("the view in play", "screen.rest.across", "the scale across is this plus the stretch", 0x8002072c,
     "addiu $v0, $v1, {}"),
    ("the view in play", "screen.rest.down", "and the scale down this less it", 0x80020738, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.reset.across", "which a level's leaving puts back to this", 0x80020238,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.reset.down", "and this", 0x80020244, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.end", "the end's pass sets the fade's level at this", 0x8002051c,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.fade", "which steps by this a pass", 0x800205fc, "addiu $a0, $v0, {}"),
    ("what the ball takes", "pill.invincible", "the invincibility pill sets its word to", 0x8003884c,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.invincible.step", "which counts down by this a frame", 0x8003b304,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "pill.bouncy", "the bouncy pill sets its word to", 0x800388b0, "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.bouncy.hold", "which grows while the ball rolls from this", 0x80036598,
     "slti $v0, $a0, {}"),
    ("what the ball takes", "pill.bouncy.grow", "by this a frame", 0x800365b4, "addiu $v0, $a0, {}"),
    ("what the ball takes", "pill.bouncy.latch", "giving the roll to the Up latch from this count",
     0x80036dbc, "slti $v0, $v0, {}"),
    ("what the ball takes", "pill.bouncy.latch.step",
     "and a count of frames Up or Cross has been latched under it steps by this a frame", 0x80036da0,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.word", "the sunglasses set their word to", 0x80038924, "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.step", "which counts down by this a frame", 0x8003b2ec, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blinks", "and at nothing they blink this many times", 0x8002beec,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.blink", "of this many frames each", 0x8002befc, "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.flag.on", "the take calls the blink's start with this", 0x80038940,
     "addiu $a0, $zero, {}"),
    ("what the ball takes", "sunglasses.flag", "which sets the sunglasses' flag to this", 0x8002becc,
     "addiu $v1, $zero, {}"),
    ("what the ball takes", "sunglasses.blink.step", "the blink takes this off an off spell's timer a frame",
     0x8002bf9c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.count.step", "and this off its count as the timer runs out", 0x8002bfbc,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.on", "laying the timer at this for the on spell", 0x8002bfc8,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.blink.step.on", "an on spell's timer steps by this", 0x8002c000,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.count.step.on", "and the count by this as it runs out", 0x8002c020,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.off", "the timer laid at this for the off spell", 0x8002c034,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "crumble.points", "a crumbling block scores this as it breaks", 0x8003b004,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "crumble.under", "the ball on one standing on this", 0x8003afb4, "addiu $v0, $zero, {}"),

    ("the devices under the ball", "send.type", "the teleporter's routine runs on this type", 0x8003a5c4,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.band", "from a progress of this, taken the other way", 0x8003a618,
     "addiu $v0, $v0, {}"),
    ("the devices under the ball", "send.band.span", "for this many units", 0x8003a61c, "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "send.wait", "counting down from this", 0x8003a638, "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.hold", "with the pad held off for this many frames", 0x8003a664,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.hold.after", "and for this many once the ball is sent", 0x8003a6b8,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.mark", "the device marked done with this", 0x8003a6a8, "addiu $v0, $zero, {}"),
    ("the devices under the ball", "throw.type", "the switch's routine runs on this type", 0x8003a3a0,
     "addiu $v1, $zero, {}"),
    ("the devices under the ball", "throw.band", "from a progress of this, taken the other way", 0x8003a3d4,
     "addiu $v0, $v0, {}"),
    ("the devices under the ball", "throw.band.span", "for this many units, along and across", 0x8003a3d8,
     "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "throw.laser", "a laser on its list is named by this face", 0x8003a498,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "rearm", "the marker clears past this far off the middle, taken the other way",
     0x8003685c, "addiu $v0, $v0, {}"),
    ("the devices under the ball", "rearm.span", "for this many units", 0x80036860, "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "exit.type", "the hazards routine tests the exit as this type", 0x8003ad88,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "exit.hidden.type", "and the hidden exit as this", 0x8003af40, "addiu $v0, $zero, {}"),
]
MULTIPLIERS = [
    ("the view in play", "rock.scale", "the pill's word is scaled by this before its sine", 0x80035324, 1, "a0", "v0"),
    ("what the ball takes", "hourglass.points", "the hourglass scores this a second of the clock it leaves", 0x800390a8, 5,
     "v1", "v0"),
]
DIVISORS = [
    ("what the ball takes", "hourglass.second", "the hourglass counts the clock it leaves in seconds of this many ticks",
     0x80039060, "lui $a0, {}", 0x80039064, "ori $a0, $a0, {}", 0x800390a0, "sra $v1, $t3, {}"),
]
GREYS = []
SCANS = [
    ("the devices under the ball", "send.stores",
     "stores in the send, each resolved to its address, none from 564 to 688 of the ball's record",
     0x8003a6b4, 0x8003a8fc, "s0", (564, 688),
     ((0x8003a734, 0x80038178, {"a2": 0}), (0x8003a8f8, 0x80037430, {"a0": 0}))),
    ("the devices under the ball", "frame.stores",
     "stores in the frame routine the send hands the record to, each resolved, none from 564 to 688, and it calls nothing",
     0x80038178, 0x800383e8, "a2", (564, 688), ()),
]

UNHARMED = -1             # the invincibility word while no pill lasts
INVINCIBLE_WORD = 0x800ba340

MODE_WORD = (0x800a572c, 10228)   # the lethargy effect's mode word, and its offset from gp
SCREEN_WORDS = {"wide": 0x800a33d4, "high": 0x800a33dc, "distance": 0x800a33e4,
                "across": 0x800a33d8, "down": 0x800a33e0}
FLAT_TEXTURED = 0x2c      # the GPU's code for a flat textured quad
ONE_PLAYER = 2            # the gate the screen's effect asks the count of players against

# The contact walk's and the loader's cases by type, from the first each
# knows, and the case every other type goes to.
TAKE_TYPES = (0x80010238, 27, 21)
TAKE_TAIL = 0x80039108
TAKE_CASES = {27: 0x80038f64, 31: 0x8003894c, 32: 0x80038794, 33: 0x80038868, 34: 0x80038804, 35: 0x80039048,
              36: 0x80038aac, 37: 0x80038b1c, 38: 0x800388cc, 42: 0x800386a4, 43: 0x80038c0c, 44: 0x80038cb4,
              45: 0x80038d5c, 46: 0x80038e04, 47: 0x80038eac}
LOADER_TYPES = (0x80010188, 5, 43)
LOADER_PLAIN = 0x80035924
LOADER_CASES = {**dict.fromkeys((5, 9, 11, 12, 28), 0x80035908), 7: 0x8003585c, 10: 0x800358ec, 26: 0x80035880,
                31: 0x800358a4, **dict.fromkeys((32, 33, 34, 38), 0x80035760), 35: 0x800357e4, 36: 0x80035810,
                37: 0x8003577c, 42: 0x800357b0, **dict.fromkeys(range(43, 48), 0x80035664)}
# The end landing lays the centre by the face of the ball's normal: a face toward the near end of the run goes to
# its axis's near case, one toward the far end to the far case.
END_FACES = (0x80010170, 0, FACES)
END_NEAR = {"-x": 0x800333cc, "-y": 0x80033404, "-z": 0x8003343c}
END_FAR = {"+x": 0x800333d8, "+y": 0x80033410, "+z": 0x80033444}
END_CASES = {FACE.index(f): at for f, at in (*END_NEAR.items(), *END_FAR.items())}
CUTS = 3                  # a gem's cuts, by its f3
TIERS = 3                 # a coin's tiers, by its f3


def take(r):
    """What the ball takes off its face, by type: how far from the thing's
    middle the ball's centre has to come, the ball's own radius apart, where
    that middle stands off its block's centre, what it scores and, for a
    fruit, the bit it sets in the pickups' word; and for each thing that lasts, the word it sets and how that word runs down, the
    bouncy pill's latch, the lethargy pill's word with the blanks a pass waits while
    its effect stands, the roll of the view and the screen's flash, ghost,
    stretch and fade, and the invincibility pill's word with the glow the ball's draw
    runs off it."""
    if r["take.live"] != 1 or r["take.open"] != 1 or r["take.third"] != 2:
        sys.exit("the loader or the walk marks a thing with something other than 1")
    if r["take.first"] != -min(TAKE_CASES) or r["take.first"] + max(TAKE_CASES) >= TAKE_TYPES[2]:
        sys.exit("the walk's cases do not start at the first type its table knows")
    if root(r["take.within"], "the ball's part of the reach") != r["ball.rest"]:
        sys.exit("the walk's reach does not add the ball's radius")
    reach = {k: root(r[k], k) for k in ("take.reach", "take.reach.key", "take.reach.fruit")}
    stand = r["take.stand"]
    if r["hourglass.second"] != r["time.tick"]:
        sys.exit("the hourglass counts seconds otherwise than the clock does")
    if r["hourglass.from"] + 1 != r["ball.breathe.full"]:
        sys.exit("the hourglass does not take the clock from a tick short of the cap the breath takes the time against")
    fruit = {r[f"fruit.points.{t}"] for t in range(43, 48)}
    if len(fruit) != 1:
        sys.exit(f"the fruit score {sorted(fruit)}, not one figure")
    if r["pill.lethargy"] % r["pill.lethargy.step"] or r["pill.lethargy.step"] > -1:
        sys.exit("the lethargy pill's word does not count down to nothing in whole steps")
    if r["pill.invincible.step"] != -1 or r["sunglasses.step"] != -1:
        sys.exit("the invincibility pill's or the sunglasses' word does not count down by one")
    if r["sunglasses.flag.on"] != 1:
        sys.exit("the take does not call the sunglasses' blink's start with 1")
    if r["sunglasses.flag"] != 1:
        sys.exit("the blink's start does not set the sunglasses' flag to 1")
    if {r["sunglasses.blink.step"], r["sunglasses.blink.step.on"], r["sunglasses.blink.count.step"],
            r["sunglasses.blink.count.step.on"]} != {-1}:
        sys.exit("the sunglasses' blink does not count its timer and its count down by one")
    if r["sunglasses.blink.on"] != r["sunglasses.blink"] or r["sunglasses.blink.off"] != r["sunglasses.blink"]:
        sys.exit("the sunglasses' blink does not lay its timer at the frames the start lays it at")
    if r["pill.bouncy.hold"] != r["pill.bouncy"] - 1 or r["pill.bouncy.grow"] != 1:
        sys.exit("the bouncy pill's word does not grow by one from a step short of its start")
    if r["pill.bouncy.latch"] < 1 or r["pill.bouncy.latch.step"] != 1:
        sys.exit("the bouncy pill's latch does not count frames by one")
    if r["crumble.under"] != CRUMBLING_UNDER:
        sys.exit(f"a crumbling block scores while the ball stands on {r['crumble.under']}")
    if r["gp"] != GP or GP + MODE_WORD[1] != MODE_WORD[0] or r["pill.lethargy.players"] != ONE_PLAYER:
        sys.exit("the lethargy effect's mode word is not where gp puts it, or its start is not gated at one player")
    if r["rock.round"] != (1 << r["rock.shift"]) - 1:
        sys.exit("the view's roll is not rounded toward nothing by its own shift")
    if r["flash.code"] != FLAT_TEXTURED or r["flash.laid"] != r["screen.grey"]:
        sys.exit("the flash is not a flat textured quad with its colour laid as the pill's pass writes it")
    if r["screen.page.gate"] != r["screen.sprite.width"] + 1 or r["screen.sprite.rest"] != -r["screen.sprite.width"]:
        sys.exit("the ghost's second sprite is not gated at a page's width or does not take the rest of the screen")
    if r["screen.wane"] > -1 or r["screen.magnitude"] % r["screen.wane"] \
            or r["screen.fade"] > -1 or r["screen.end"] % r["screen.fade"]:
        sys.exit("the stretch's magnitude or the fade's level does not run down to nothing in whole steps")
    rest = (r["screen.rest.across"], r["screen.rest.down"])
    if rest != (r["screen.reset.across"], r["screen.reset.down"]) \
            or rest != (r["screen.load.across"], r["screen.load.down"]):
        sys.exit("the stretch does not rest at the scales the executable loads and a level's leaving puts back")
    if r["glow.gate"] != UNHARMED or BALL_RECORD + r["glow.gate.word"] != INVINCIBLE_WORD:
        sys.exit("the ball's draw does not gate its glow on the invincibility pill's word at rest")
    glow_round = 1 << r["glow.round.shift"]
    if r["glow.round.rest"] != r["glow.step"] + glow_round - 1 or glow_round != 2 * TURN:
        sys.exit("the glow's counter does not step modulo a round of two turns, rounded toward nothing")
    phases = {"red": 0, "green": r["glow.green.phase"], "blue": r["glow.blue.phase"]}
    for channel, phase in phases.items():
        if 1 << r[f"glow.{channel}.shift"] != TURN or r[f"glow.{channel}.rest"] != phase + TURN - 1:
            sys.exit(f"the glow's {channel} does not take its angle modulo a turn, rounded toward nothing")
    if r["glow.red.under"] != TURN or r["glow.green.from"] != phases["green"] - 1 \
            or r["glow.green.span"] != TURN - 1 or r["glow.blue.gate"] != 1 - phases["blue"]:
        sys.exit("a channel of the glow is not raised over the one turn its angle runs")
    if (-phases["green"], -phases["blue"]) != (TURN // 2, TURN):
        sys.exit("the glow's channels are not a quarter round apart")
    if r["glow.gain.green"] != r["glow.gain"] or r["glow.gain.blue"] != r["glow.gain"]:
        sys.exit("the glow's three channels do not share one gain")
    counter = r["gp"] + r["glow.counter.at"]
    if not r["glow.clear"][0] <= counter < r["glow.clear"][1] or r["glow.counter.load"] != 0:
        sys.exit("the glow's counter does not start at nothing")
    pickup = {"reach": reach["take.reach"], "stand": stand}
    taken = {
        31: {"reach": reach["take.reach.key"], "stand": stand, "points": r["key.points"]},
        32: pickup, 33: pickup, 34: pickup,
        35: {**pickup, "stand": r["take.stand.hourglass"], "points": r["hourglass.points"],
             "clock": {"from": r["hourglass.from"], "second": r["hourglass.second"]}},
        36: {**pickup, "stand": [stand] + [r["take.stand.gem"]] * (CUTS - 1), "points": r["gem.points"]},
        37: {**pickup, "stand": r["take.stand.coin"], "points": [r[f"coin.points.{t}"] for t in range(TIERS)]},
        38: {**pickup, "points": r["sunglasses.points"]},
        42: {**pickup, "stand": r["take.stand.hedgehog"], "points": r["hedgehog.points"]},
    }
    for t in range(43, 48):
        taken[t] = {"reach": reach["take.reach.fruit"], "stand": stand, "points": next(iter(fruit)),
                    "fruit": r[f"fruit.bit.{t}"]}
    lasting = {
        32: {"word": r["pill.lethargy"], "step": -r["pill.lethargy.step"], "ticks": r["pill.lethargy.ticks"],
             "blanks": r["pill.lethargy.blanks"],
             "rock": {"scale": r["rock.scale"], "shift": r["rock.shift"]},
             "screen": {"grey": r["screen.grey"],
                        "tint": [r["screen.tint.outer"], r["screen.tint.green"], r["screen.tint.outer"]],
                        "magnitude": r["screen.magnitude"], "wane": -r["screen.wane"],
                        "step": r["screen.step"], "phase": r["screen.phase"],
                        "fade": {"from": r["screen.end"], "by": -r["screen.fade"]}}},
        33: {"word": r["pill.bouncy"], "hold": r["pill.bouncy.hold"], "latch": r["pill.bouncy.latch"]},
        34: {"word": r["pill.invincible"], "step": -r["pill.invincible.step"],
             "glow": {"step": r["glow.step"], "round": glow_round, "gain": r["glow.gain"],
                      "from": [-phase for phase in phases.values()]}},
        38: {"word": r["sunglasses.word"], "step": -r["sunglasses.step"],
             "blink": {"times": r["sunglasses.blinks"], "frames": r["sunglasses.blink"],
                       "first": r["sunglasses.blink"] + r["sunglasses.blink.step"]}},
    }
    return taken, lasting


def exits(r):
    """What the loader writes into the exits' slots and what the last key writes."""
    return {7: {"shut": {"f3": r["take.live"]}, "opened": {"f3": 0, "f4": r["take.open"]}},
            26: {"shut": {"f4": 0}, "opened": {"f4": r["take.open"]}}}


def band(r, key):
    """A run of progress the code tests as an offset and a span, as its two ends."""
    lo = -r[key]
    hi = lo + r[f"{key}.span"] - 1
    if lo + hi != BLOCK:
        sys.exit(f"{key} runs from {lo} to {hi}, not about the middle of a cell")
    return [lo, hi]


def devices(r):
    """What the teleporter and the switch under the ball do: the run of
    progress each acts in, the teleporter's count and the hold on the pad,
    and the run about the middle the marker that keeps either from acting
    twice holds in."""
    if r["send.type"] != 5 or r["send.mark"] != r["send.type"] or r["throw.type"] != 9:
        sys.exit("the devices' routines run on other types than the teleporter's type and the switch's type")
    if r["send.hold"] != r["send.hold.after"]:
        sys.exit("the teleporter holds the pad off otherwise after the ball is sent than before")
    if r["throw.laser"] != FACES:
        sys.exit(f"a switch's list names a laser by face {r['throw.laser']}, not the one past the six")
    rearm = band(r, "rearm")
    return {5: {"send": {"wait": r["send.wait"], "band": band(r, "send.band"), "hold": r["send.hold"], "rearm": rearm}},
            9: {"throw": {"band": band(r, "throw.band"), "rearm": rearm}}}
