# 25. What only an emulator can settle about a written level

## What and why

The editor writes a level as the game's bytes and puts it on the disc, and everything the writers do is held to the disc and to each other:

- The canonical rebuild of all 230 shipped levels goes back word for word outside the unread mask (`python3 tools/kula_kwl.py --check`, with the disc).
- The JS writer's bytes are the Python writer's bytes on every level (`tests/fixtures/kwl-digests.json`).
- Every sector a placement writes is rebuilt as the disc has it and checks.
- The synthetic image patched by each path gives the same patched image, PPF and VCDIFF from both sides (`tests/fixtures/patch-digests.json`), with the PPF applied and the VCDIFF decoded in the tests and by xdelta3 where it is installed.

What none of that can settle is what the game does with a level that no shipped level is like, and whether an emulator takes the patch at all, since nothing on this machine runs the game. Until someone with the disc plays these, the editor's checks say what the disc shows and nothing more, and the dialog's per-emulator sentences rest on the emulators' documentation.

## Sketch

To play, each on PCSX-Redux, which bundles OpenBIOS and reads a PPF beside the image with nothing to turn on, and on DuckStation with Apply Image Patches on, a BIOS dump beside it:

- A PPF of a draft placed in HIRO's slot 0 loads, and the new game starts on the draft; then the same level as an xdelta applied with xdelta3 and as the patched image with its cue sheet.
- The acid patch, type 4, which the disc places nowhere: whether it is drawn and what it does to the ball.
- A platform run with a length past 3, and a speed other than 30, which the checks warn about and the disc never has.
- A vanishing block with a phase of 4 or 5, read as "dims at once" from the code and never placed on the disc.
- A device, a teleporter, exit, switch or hidden exit, on a block that is not plain, which the checks refuse since the glow loader takes kind 0 alone; the refusal is a reading of the code and a level that breaks it would say whether it is right.
- Levels at the caps: 123 records, 768 faces, 255 objects and 32 lights, and one over each, where the code says the tables run into their neighbours.
- A keyless level, which plays as a bonus level and takes the bonus ball by the slot's place on the disc's bonus slots and ball 10 elsewhere, the stand-in the viewer draws; whether the game's own counter agrees for a draft in a numbered slot.
- A keyless level with a fire, ice or acid block, a moving platform, or a fire, ice or clock face or an exit on a block, none of which any of the disc's thirty keyless levels has: the second texture set's models for them are the placeholder, the one whose only quad is texture 8, the first of the moving platform's four textures, and the map draws that on them as the skins table says; whether the game draws the same, or lends them something, is for play.
- A keyless level with a laser, which no keyless level of the disc has outside the Simon rooms, and those score nothing, its beam ending on an empty cell and a plain block standing with plain blocks on five sides and the laser's cell on the sixth side: the editor's block count and the points read the lattice as the loader leaves it, the far end a plain block standing where the file has none, so one more block to mark, and the laser's own cell hiding the faces against it as a plain block does, so the walled-in block is not among the blocks to mark, while the laser's own cell never is; whether the blocks-left meter at the start and the score at the end agree with the editor's count.
- A rebuilt and a moved pack: the other levels of the pack still load after a rebuild with recompression, and a pack moved into `/3.00` loads from its new sectors.
- The downloads on iOS: whether the patched image, a Blob of the original's slices, saves whole, and whether the PPF and xdelta downloads land. On a desktop, WebKit and Firefox were measured saving the image whole and byte for byte with the PPF, the xdelta and the cue landing (2026-10-11, driven by hand through Playwright, outside the suite, which runs Chromium alone), and the suite takes the download fallback with the browser's save picker deleted, so the picker is the one path untested.

What is already settled by the fixtures and the disc tests, and needs no play: the bytes of a written level, the links and pickup numbers, the sector checksums, the three placement paths, the two patch formats and the patched image, and the fit the page shows without the image, which is the fit the tools make with it.
