# The disc

What the disc holds for writing a level back onto it, reading by reading, with what each rests on: the image and where its room is, how a sector is built so that a console takes it as pressed, and the packs with the bytes each has to spare. Every figure here is measured on the NTSC-U image under `$KULA_DISC`: by `tools/kula_sector.py`, whose `--check` rebuilds the disc's own sectors and compares, and by `tools/kula_place.py`, which puts a level into a pack on a copy of the image; the unit tests hold the readings to the disc wherever it is present. [level-format.md](level-format.md) is the level inside a pack, and [editor.md](editor.md) how a level is written from its fields; how a patch carries a placement is later work and will join this document.

## The image

The image is 257,795,664 bytes, which is 109,607 sectors of 2352 bytes and nothing over, one Mode 2 data track, so the cue sheet is the three lines `tools/kula_warp.py` writes beside a copy. Every sector of the 109,607 opens with the twelve-byte sync, carries its own address in the header as minutes, seconds and frames in BCD counted from the two-second pregap, so sector 1002 reads `00 15 27 02` and the last, 109606, `24 23 31 02`, and has 2 for its mode; both copies of the subheader agree on every sector. The primary volume descriptor is sector 16: type 1, `CD001`, system and application identifier `PLAYSTATION`, a volume identifier of 32 spaces, a volume space of 109,607 blocks of 2048 bytes, and no Joliet descriptor after it, so every file has exactly one directory record. Sector 17 is the terminator, 18 to 21 the two path tables with their copies, 22 the root directory and 23 `SYSTEM.CNF`, which boots `cdrom:SLUS_007.24;1`, the executable at 24 to 321. Sectors 0 to 15 are the system area: 0 to 3 empty, 4 to 11 the licence data, and 12 to 15 Form 2 sectors with nothing in them.

42 files lie in twelve directories of one sector each: the root at 22, `/XA` at 3946, and the ten worlds, HIRO at 322, ARCTIC 1012, ATLANT 1340, COWBOY 1675, FIELD 1991, HAZE 2321, HELL 2645, HILLS 2971, INCA 3293 and MARS 3616. The data files lie in address order with no gap between them but the directory sectors: each world's directory stands between the last pack of the world before it and its own artwork, so `COPYCAT.PAK` ends at 1011, ARCTIC's directory is 1012 and `ARCTIC.TGI` begins at 1013. A pack is therefore followed at once by the next file or by a directory, and cannot grow past the sectors it has. A directory record holds a file's extent and size in both byte orders, little-endian at 2 and 10 and big-endian at 6 and 14, and the two agree on every record of the disc; a pack's record lies in its world's directory sector, the world pack's at offset 96 and the finals pack's at 212 or 216, but for HIRO, whose directory has `COPYCAT.PAK` at 96, `HIRO.PAK` at 214 and `HIROFI.PAK` at 388.

The one room on the disc is `/3.00`, the last file: 31,752,000 bytes at sector 93953, 15,504 sectors whose user data is zero on every one, and a name the executable never spells. After it, sectors 109457 to 109606 are the track's postgap, 150 sectors with a sync and a header and zero from the subheader on, which is also what the EDC and ECC of nothing come to, so they check as they stand.

Of the 109,607 sectors, 31,601 are Form 1 and 78,006 Form 2. The Form 1 sectors are every data file, `/3.00`, the system area, the postgap and the picture frames of the two video streams; the Form 2 sectors are the four music files' XA audio and the sound of the streams. A Form 2 sector carries 2324 bytes of data, no ECC, and an EDC at 2348 over bytes 16 to 2347, which is the same CRC as below over a longer span and checks on all 78,006. Nothing here writes one.

## The sector

A Mode 2 Form 1 sector, as the disc has every one of its data sectors:

| bytes | holds |
| --- | --- |
| 0 to 11 | sync: `00`, ten `FF`, `00` |
| 12 to 15 | minutes, seconds and frames of the address plus 150, in BCD, then the mode, 2 |
| 16 to 19 | the subheader: file, channel, submode, coding |
| 20 to 23 | the subheader again |
| 24 to 2071 | 2048 bytes of user data |
| 2072 to 2075 | the EDC, little-endian |
| 2076 to 2247 | 172 bytes of P parity |
| 2248 to 2351 | 104 bytes of Q parity |

The file and channel are 0 and the coding 0 on every Form 1 sector of the disc; the XA files use file 1 and channels 0 to 3, with coding 1 on the audio. The submode is `0x08`, data, on an ordinary sector of a file and `0x89`, data with end of record and end of file, on the last sector of every file outside `/XA`, of every directory, and of the terminator, the path tables and the root, 53 in all; the volume descriptor alone has `0x09`. The streams' picture frames carry `0x48`, real-time data, and `FINAL.STR` ends on `0xC8`; `0x00` is on 5,696 sectors, the postgap's 150 and the rest inside three of the music files and the logo stream, the empty sectors of their interleave. Among the Form 2 sectors `0x64` is the audio, `0xE4` the last sector of each of the music's channels and of the logo's sound, 17 in all, and `0x20` the four empty sectors of the system area. **A pack runs on `0x08` and ends on `0x89`**, on all 21, 85 sectors in all, so a pack of one sector is one `0x89` sector; the unit tests hold this to the disc.

**The EDC** is a CRC-32 over bytes 16 to 2071, the subheader and the user data, with the polynomial (x^16 + x^15 + x^2 + 1)(x^16 + x^2 + x + 1), which is x^32 + x^31 + x^16 + x^15 + x^4 + x^3 + x + 1, run least significant bit first from a zero register with no final inversion, which is a table built from the bit-reversed constant `0xD8018001`, and stored little-endian at 2072.

**The ECC** is a Reed-Solomon product code in GF(2^8) over x^8 + x^4 + x^3 + x^2 + 1, `0x11D`, laid out as ECMA-130 lays it out, over the 2064 bytes 12 to 2075, header, subheader, user data and EDC, with the four header bytes read as zero. That is the Mode 2 convention: the parity does not depend on the sector's address, so the same bytes carry the same EDC and ECC wherever they lie, and a file can be moved sector by sector with nothing but its addresses rewritten. The 2064 bytes are read as two planes of 1032, the even bytes and the odd, and each plane is coded alike. For P, a plane is 24 rows of 43 columns, byte n at row n // 43 and column n % 43, and each column is a codeword of 26 bytes, its 24 data bytes then two of parity; with m the column's offset in its first row, 2 x column + plane, the column's bytes are 12 + m, 12 + m + 86 and so on, 86 apart, and its parity goes to 2076 + m and 2076 + 86 + m. For Q, a plane with its 86 P bytes is 1118 bytes read as 26 rows of 43, and each of the 26 diagonals is a codeword of 45: the k-th of its 43 data bytes is the plane's byte (43 d + 44 k) mod 1118, in sector bytes 12 + (86 d + 88 k) mod 2236 + plane, and its parity goes to 2248 + m and 2248 + 52 + m with m = 2 d + plane. Both codes have the check matrix of a row of ones over a row of descending powers of alpha: a codeword V of n bytes has sum V_i = 0 and sum V_i alpha^(n - 1 - i) = 0, so with S the sum of the data bytes and T the sum of the data bytes weighted by alpha^(n - 1 - i), the first parity byte is (T + S) / (alpha + 1) and the second is the first plus S.

What settles the reading is the disc: rebuilt from its address, subheader and user data alone by `tools/kula_sector.py --sweep`, every one of the 31,601 Form 1 sectors of the image comes out bit for bit as the disc has it, in 51 seconds, and one flipped user byte fails both the EDC and the ECC of any of them. The unit test under `$KULA_DISC` holds 423 of them, the 85 pack sectors, the volume descriptor, the twelve directory sectors and 325 sampled every 97th sector across the image, and asserts the count. The viewer's port, `public/js/sectors.js`, is the same arithmetic over `Uint8Array`s and is held to the Python side through `tests/fixtures/sectors.json`: thirteen synthetic sectors at varied addresses and submodes and two with a user byte flipped, written by the tool only after its own check against the disc has passed, and carrying no byte of the disc. An emulator passes a sector on whatever its parity says and a console's drive does not, which is why every sector the tools write is rebuilt whole: `tools/kula_warp.py` reads each sector a write touches, lays the bytes into its user data and writes it back with the EDC and ECC recomputed, as the disc has them.

## The packs

The 21 packs and their room, as the disc allots it: the size is the directory record's, the sectors are what that size occupies, the capacity is those sectors' user bytes and the slack is what is left in the last sector. Every pack is followed at once by the next file or a directory, so the capacity is the most a pack can be made in place; `INCA.PAK` fills its sectors exactly.

| pack | sector | size | sectors | capacity | slack |
| --- | --- | --- | --- | --- | --- |
| `/HIRO/HIRO.PAK` | 1002 | 11,155 | 6 | 12,288 | 1,133 |
| `/HIRO/COPYCAT.PAK` | 1009 | 5,254 | 3 | 6,144 | 890 |
| `/HIRO/HIROFI.PAK` | 1008 | 1,664 | 1 | 2,048 | 384 |
| `/HILLS/HILLS.PAK` | 3286 | 11,789 | 6 | 12,288 | 499 |
| `/HILLS/HILLSFI.PAK` | 3292 | 1,986 | 1 | 2,048 | 62 |
| `/INCA/INCA.PAK` | 3609 | 12,288 | 6 | 12,288 | 0 |
| `/INCA/INCAFI.PAK` | 3615 | 1,772 | 1 | 2,048 | 276 |
| `/ARCTIC/ARCTIC.PAK` | 1332 | 12,850 | 7 | 14,336 | 1,486 |
| `/ARCTIC/ARCTICFI.PAK` | 1339 | 1,349 | 1 | 2,048 | 699 |
| `/COWBOY/COWBOY.PAK` | 1983 | 13,410 | 7 | 14,336 | 926 |
| `/COWBOY/COWBOYFI.PAK` | 1990 | 1,538 | 1 | 2,048 | 510 |
| `/FIELD/FIELD.PAK` | 2313 | 12,347 | 7 | 14,336 | 1,989 |
| `/FIELD/FIELDFI.PAK` | 2320 | 1,731 | 1 | 2,048 | 317 |
| `/ATLANT/ATLANT.PAK` | 1666 | 14,783 | 8 | 16,384 | 1,601 |
| `/ATLANT/ATLANTFI.PAK` | 1674 | 1,391 | 1 | 2,048 | 657 |
| `/HAZE/HAZE.PAK` | 2636 | 14,404 | 8 | 16,384 | 1,980 |
| `/HAZE/HAZEFI.PAK` | 2644 | 1,731 | 1 | 2,048 | 317 |
| `/MARS/MARS.PAK` | 3937 | 14,838 | 8 | 16,384 | 1,546 |
| `/MARS/MARSFI.PAK` | 3945 | 1,611 | 1 | 2,048 | 437 |
| `/HELL/HELL.PAK` | 2961 | 16,129 | 8 | 16,384 | 255 |
| `/HELL/HELLFI.PAK` | 2969 | 2,126 | 2 | 4,096 | 1,970 |

Between them the packs hold 156,146 bytes in 85 sectors, 174,080 bytes of capacity, so 17,934 bytes are spare across the disc.

## The pack, written back

A pack is written back as the disc lays it out: the count, the table of offsets and sizes, the name offsets, which start at `4 + 12n` for a pack of `n` records, the names, each ending in a newline before its NUL, one to four bytes of padding to the next four-byte boundary, and the records back to back in slot order, the file ending where the last record ends. The padding is the one thing the disc fills with leftovers, a few bytes of a name's text on some packs and zeros on others, and nothing reads it, so the writer pads with zeros; with that one allowance, `kula_pak.pack` reproduces every pack of the disc from its names and records, and the unit tests hold it to all 21.

The game never reads a name, so what a slot is called is for the next reader of the pack. A level placed in its slot's own bytes keeps the slot's name, since nothing else of the pack moves. A pack rebuilt or moved names the slot after the level's title, in upper-case ASCII and no longer than the name it replaces, or keeps the old name where the title gives nothing; the length rule keeps the name table from growing, so that how much room a slot has is a matter of the records alone and a fit worked out from the table's sizes is never optimistic.

## Placing a level

A level arrives as a zlib stream of the file [editor.md](editor.md) writes, deflated at level 6 as the disc's own streams are, and goes into a slot by the first of three paths that fits, each a reading of how the game reads a pack. The game loads a pack by its directory record's size, reading `(size >> 11) + 1` sectors into a 32,768-byte buffer, and takes a record from the buffer by the offset and size the table gives, so a record's bytes beyond its size and a pack's bytes beyond its size are never read.

**In place**, when the stream is no longer than the record it replaces: the stream is written over the record's first bytes, the table's size for the slot is set, and nothing else moves, not the other records, not the names, not the directory. The bytes the old record had past the new one are left as they were. The room is what the slot had over; LEVEL 1, 299 bytes on the disc, comes back from its fields at 292 and goes in with seven to spare.

**Rebuilt**, when the pack laid out again fits the sectors it has: first with the other records as they are, then, when that overflows, with the other records recompressed at level 9, which the game's inflater takes like any other zlib stream and which wins the bytes in the table below, 505 to 951 a world pack. The rebuilt pack is written over the pack's own sectors with zeros to the end of the last, as the disc's slack is, and the directory record's size is rewritten in both byte orders where it changed. A rebuilt pack carries the game's other levels, recompressed where that is what made room, so a patch of it carries them too. A rebuild never reaches fewer sectors than the pack had: it happens only for a stream longer than the one it replaces, and recompression is tried only when the pack would otherwise overflow, and wins less than a sector.

**Moved**, when even that does not fit: the pack is written into the first sectors of `/3.00`, the one file on the disc whose sectors are free, and the directory record's extent and size are rewritten. The sector after the pack is kept clear, since the game reads one sector past a pack whose size is a multiple of 2048, and the move is refused where the head of `/3.00` is not zero. A pack is never longer than 32,767 bytes on any path, the most the buffer takes with the sector the game reads over.

| pack | slack | level 9 wins | room for a level, by slot | records |
| --- | --- | --- | --- | --- |
| `/HIRO/HIRO.PAK` | 1,133 | 505 | 1,927 to 2,718 | 299 to 1,192 |
| `/HIRO/COPYCAT.PAK` | 890 | 252 | 1,312 to 1,920 | 172 to 802 |
| `/HIRO/HIROFI.PAK` | 384 | 81 | 1,139 to 1,326 | 702 to 914 |
| `/HILLS/HILLS.PAK` | 499 | 525 | 1,366 to 2,033 | 349 to 1,096 |
| `/HILLS/HILLSFI.PAK` | 62 | 110 | 973 to 1,199 | 857 to 1,081 |
| `/INCA/INCA.PAK` | 0 | 704 | 1,013 to 1,713 | 321 to 1,096 |
| `/INCA/INCAFI.PAK` | 276 | 95 | 1,138 to 1,233 | 795 to 929 |
| `/ARCTIC/ARCTIC.PAK` | 1,486 | 723 | 2,611 to 3,218 | 426 to 1,096 |
| `/ARCTIC/ARCTICFI.PAK` | 699 | 52 | 1,311 to 1,440 | 586 to 715 |
| `/COWBOY/COWBOY.PAK` | 926 | 696 | 2,001 to 2,631 | 400 to 1,096 |
| `/COWBOY/COWBOYFI.PAK` | 510 | 52 | 1,169 to 1,393 | 642 to 848 |
| `/FIELD/FIELD.PAK` | 1,989 | 631 | 2,967 to 3,629 | 352 to 1,096 |
| `/FIELD/FIELDFI.PAK` | 317 | 105 | 1,105 to 1,313 | 708 to 971 |
| `/ATLANT/ATLANT.PAK` | 1,601 | 667 | 2,755 to 3,277 | 511 to 1,096 |
| `/ATLANT/ATLANTFI.PAK` | 657 | 80 | 1,296 to 1,437 | 587 to 752 |
| `/HAZE/HAZE.PAK` | 1,980 | 888 | 3,230 to 3,906 | 377 to 1,096 |
| `/HAZE/HAZEFI.PAK` | 317 | 73 | 1,155 to 1,231 | 800 to 879 |
| `/MARS/MARS.PAK` | 1,546 | 729 | 2,646 to 3,354 | 385 to 1,130 |
| `/MARS/MARSFI.PAK` | 437 | 75 | 1,118 to 1,390 | 652 to 907 |
| `/HELL/HELL.PAK` | 255 | 951 | 1,637 to 2,378 | 453 to 1,262 |
| `/HELL/HELLFI.PAK` | 1,970 | 174 | 3,043 to 3,145 | 961 to 1,113 |

The slack is the last sector's, as above; level 9 wins what recompressing every record of the pack at level 9 saves, 8,168 bytes across the disc; and the room for a level is the longest stream a slot takes without a move, the pack's capacity less the table, the names and the other records at level 9, smallest for the slot whose record is smallest. A stream no longer than the slot's record goes in place, one no longer than the record plus the slack rebuilds the pack as it is, one within the room rebuilds it recompressed, and a longer one moves the pack. Written back from their fields, 224 of the disc's 230 levels go into their own slot in place; six come out a few bytes longer than the disc's stream, BONUS 30 by 82 since its pickups are renumbered, and rebuild their pack, LEVEL 33 recompressing INCA's, which has no slack at all.

## What changes on the disc

A placement is a list of sectors, each built whole with its address, subheader, EDC and ECC, and written only where it differs from the sector the image has. In place, the sectors holding the table entry and the record change and no other, which for a record in a pack's first sector is one sector. Rebuilt, every sector of the pack changes, since the records after the slot move, and the world's directory sector changes where the size did, by the eight bytes of the record's size in its two byte orders. Moved, the sectors of the pack at the head of `/3.00` are new, data sectors ending on an end-of-file sector as a pack's are everywhere else on the disc, and the directory sector changes by the extent and the size; the pack's old sectors are left as they were, named by nothing. The placer reads the result back through the same readers that read the disc, the directory walk and the pack reader, inflates the slot and compares it with the level, compares every record and name with what it meant to write, and checks every sector it wrote.

The unit tests drive every path over a synthetic image, built with the disc's structure in 43 sectors: the volume descriptor, the root and one world's directory, `SYSTEM.CNF`, a world pack and a finals pack of one sector each holding small levels written by the level writer, the world pack's at level 1 so that recompression wins room, a `/3.00` of twelve zero sectors and a postgap; under `$KULA_DISC` they do the same on a copy of the disc, placing LEVEL 1's own stream and larger levels by every path into HIRO's first slot and a longer one into INCA's, and prove after each that nothing outside the written sectors moved. The image is known by its structure and never by a hash: a raw image of 2352-byte sectors with the volume descriptor at sector 16, the system identifier `PLAYSTATION`, a `SYSTEM.CNF` booting `cdrom:SLUS_007.24;1` and the 21 packs by path, so that a size or a file that is not the disc's is a warning rather than a refusal.
