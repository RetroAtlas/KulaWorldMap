"""What the hand settles of a release's map, where the aligner cannot: an anchor placed by a hand read, a key tuned
otherwise than the frame rates scale it, a reading the release has no instruction for, a check the release lays out
as another instruction, a multiplier's run of another shape, a check the release alone has, and the words of the
end-screen pairs the release draws otherwise. Every row carries a sentence saying what the instruction is and why
it is the one, and a hand row wins over the aligner's placement.
"""

# A US address to (the release's address, why): the same instruction, exact or with its registers renamed.
PLACED = {"eu": {}, "jp": {}}

# A key to why its value is neither the US value nor a rate or a count scaled from it.
TUNED = {"eu": {
    "ball53.shake": "65 against 77, 77 at fifty a second rounded up, where a count cut either way gives 64 or 78, and one "
                    "above the wheel's turning gate of its disc, 64 and 76",
    "flight.slow.gate": "881 against 929, each one above a multiple of the flight's step of 16, 55 and 58 of them, so the "
                        "parameter steps evenly to 896 and to 944 and eases from there past 1024 with a first step of 16 "
                        "and 13, 69 frames at fifty against 68 at sixty",
    "climb.step": "-73 against -64, the quarter turn's 1024 over the climb's frames, 14 and 16, cut toward nothing",
    "screen.rest.down": "4096 against 3840, the scale down equal to the 4096 across, where the US's is fifteen sixteenths "
                        "of it",
    "screen.reset.down": "4096 against 3840, the reset's scale down equal to its 4096 across as the rest's is",
    "teleport.flash.from": "272 against 268, the 248 the flash's first pass shows plus the mode's step, 24 and 20",
    "teleport.flash.from.1": "264 against 261, 248 plus mode 1's step, 16 and 13",
    "teleport.flash.from.last": "256 against 254, 248 plus the last mode's step, 8 and 6",
    "teleport.flash.level.from": "256 against 254, the last mode's start again, 248 plus its step of 8 and 6",
}, "jp": {}}

# A key, or a tuple of the keys of one reading, to (the address, the text, why) of the instruction standing where
# the reading would be.
ABSENT = {"eu": {
    "platform.scale": (0x800332e4, "lhu $v1, 36($v0)",
                       "the loader reads the speed's halfword at 36 and stores it back two instructions on as it is, "
                       "where the US multiplies it by 50 first, so the speed ships as the disc holds it"),
    "platform.over": (0x800332e8, "sh $zero, 38($v0)",
                      "the loader clears the halfword at 38 between the speed's load and its store with no reciprocal "
                      "about them, where the US divides the product by 60 through one"),
}, "jp": {}}

# A US address to (the release's address, the text, why) of the instruction that does the check's work there.
RESHAPED = {"eu": {}, "jp": {}}

# A multiplier's key to (the address, the count, the source register, the destination register, why) of its run.
MULTIPLIERS = {"eu": {}, "jp": {}}

# Checks the release alone has, each (the address, the text, why).
EXTRA = {"eu": [], "jp": []}

# The index of a pair's first entry in the end-screen table to the word the release's own pair letters.
WORDS = {"eu": {}, "jp": {}}
