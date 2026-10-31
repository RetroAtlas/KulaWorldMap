"""What the hand settles of a release's map, where the aligner cannot: an anchor placed by a hand read, a key tuned
otherwise than the frame rates scale it, a reading the release has no instruction for, a check the release lays out
as another instruction, a multiplier's run of another shape, a check the release alone has, and the words of the
end-screen pairs the release draws otherwise. Every row carries a sentence saying what the instruction is and why
it is the one, and a hand row wins over the aligner's placement.
"""

# A US address to (the release's address, why): the same instruction, exact or with its registers renamed.
PLACED = {"eu": {}, "jp": {}}

# A key to why its value is neither the US value nor a rate or a count scaled from it.
TUNED = {"eu": {}, "jp": {}}

# A key, or a tuple of the keys of one reading, to (the address, the text, why) of the instruction standing where
# the reading would be.
ABSENT = {"eu": {}, "jp": {}}

# A US address to (the release's address, the text, why) of the instruction that does the check's work there.
RESHAPED = {"eu": {}, "jp": {}}

# A multiplier's key to (the address, the count, the source register, the destination register, why) of its run.
MULTIPLIERS = {"eu": {}, "jp": {}}

# Checks the release alone has, each (the address, the text, why).
EXTRA = {"eu": [], "jp": []}

# The index of a pair's first entry in the end-screen table to the word the release's own pair letters.
WORDS = {"eu": {}, "jp": {}}
