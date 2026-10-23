# 26. The PAL and Japanese discs

## What and why

The patcher knows one disc, the NTSC-U release sold as Roll Away: it tells an image by its 109,607 sectors, the system identifier in its volume descriptor, the boot line naming `SLUS_007.24` and the 21 packs by path, and it warns rather than refuses on anything else ([docs/disc.md](../docs/disc.md)).

The same game shipped as Kula World in PAL territories and as Kula Quest in Japan, which the About names, under serials of their own, SCES-01000 and SCPS-10064 as PSX Data Center lists them.

Their images differ from this one in size and layout and their executables carry other serials, so a level placed through this patcher onto one of them would get a warning for the sector count and one for the boot line and then a fit worked out from the image's own packs, which is right where the pack paths are the same and refused where they are not, while the fit the dialog shows before the image is given comes from `public/packs.json`, which is this disc's alone.

They were put aside for after the editor shipped.

What makes them worth a file is that the level data is the game's own and applies to all three, so a level made here is a level for any of them once the disc side knows where to put it.

## Sketch

What a port needs, each read off the image rather than assumed:

- The sector count of each image and the layout of its packs, which the build would write as a `packs.json` per release, or one file keyed by release, since the fit the page shows without the image comes from that file.
- The serial of each executable, for the folder ePSXe and PCSX-ReARMed read a PPF from and for the boot line the identification tests.
- Whether the packs lie under the same ten directories with the same names, since the dialog's slot list and the placer's path checks rest on the paths.
- Whether the level format is the same, which the canonical rebuild check of `tools/kula_kwl.py --check` would settle word for word once pointed at the other image.
- Whether the pause screen numbers the slots the same way, which `shown_as` in the build computes from the slot and would need the other executables' tables read with `tools/mips.py`.
- How the dialog tells the images apart, which the volume descriptor's identifiers and the boot line give it without any hash, since the repo records no Redump hash by rule and the hash test refuses hex runs.

What is already known from this disc's data:

- The regional differences the level notes cite, from The Cutting Room Floor's page on the game, which the About credits, say that BONUS 30 is the one arcade level rebuilt between the PAL and the NTSC release, that HIRO's slot 19 holds the Japanese release's tutorial where every other world holds the object catalogue, that the Japanese release removed a fruit and a coin and gave the Select button a free camera ([docs/camera.md](../docs/camera.md)), and that the Japanese release lets the player choose among the fourteen beach balls the mesh file holds ([docs/ggi.md](../docs/ggi.md)).
- The moving platforms' speed is scaled by 50/60 by the loader on this disc, which says the game was authored for a 50 Hz release and leaves open what the PAL disc's rates are ([docs/motion.md](../docs/motion.md)).

Unknown until someone with those images runs the tools on them: their sector counts, pack tables and slack, whether `/3.00` or any free file exists on them, whether their sectors are Mode 2 Form 1 throughout as this one's are, and whether the level files are byte for byte the ones here where the notes say nothing changed.

Ruled out: telling the releases apart by the image's size alone, since a warning and not a refusal is the rule for a size that is not expected, and any reading taken from this disc's executable standing in for theirs.
