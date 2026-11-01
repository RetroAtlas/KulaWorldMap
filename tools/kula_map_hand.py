"""What the hand settles of a release's map, where the aligner cannot: an anchor placed by a hand read, a key tuned
otherwise than the frame rates scale it, a reading or a check the release has no instruction for, a divisor the
release lays out as a shift, a check the release lays out as another instruction, a multiplier's run of another
shape, a check the release alone has, and the words of the end-screen pairs the release draws otherwise. Every row
carries a sentence saying what the instruction is and why it is the one, and a hand row wins over the aligner's
placement. Each release's rows are in a module of its own, `kula_map_hand_<id>.py`, gathered here by release.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_map_hand_eu
import kula_map_hand_jp

BY_RELEASE = {"eu": kula_map_hand_eu, "jp": kula_map_hand_jp}

# A US address to (the release's address, why): the same instruction, exact or with its registers renamed.
PLACED = {release: module.PLACED for release, module in BY_RELEASE.items()}

# A key to why its value is neither the US value nor a rate or a count scaled from it.
TUNED = {release: module.TUNED for release, module in BY_RELEASE.items()}

# A key, a tuple of the keys of one reading, or the US address of a check or of an instruction reaching a word, to (the address, the text, why) of the instruction in its place.
ABSENT = {release: module.ABSENT for release, module in BY_RELEASE.items()}

# A divisor's key to (the address, the text, why) of the shift the release divides by in place of the base's reciprocal.
SHIFTS = {release: module.SHIFTS for release, module in BY_RELEASE.items()}

# A US address to (the release's address, the text, why) of the instruction that does the check's work there, or opens the routine there.
RESHAPED = {release: module.RESHAPED for release, module in BY_RELEASE.items()}

# A multiplier's key, or a registered run's name, to (the address, the count, the source register, the destination register, why) of its run.
MULTIPLIERS = {release: module.MULTIPLIERS for release, module in BY_RELEASE.items()}

# Checks the release alone has, each (the address, the text, why).
EXTRA = {release: module.EXTRA for release, module in BY_RELEASE.items()}

# The index of a pair's first entry in the end-screen table to the word the release's own pair letters.
WORDS = {release: module.WORDS for release, module in BY_RELEASE.items()}
