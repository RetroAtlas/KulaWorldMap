# The disc

What the disc holds for writing a level back onto it, reading by reading, with what each rests on: the image and where its room is, how a sector is built so that a console takes it as pressed, and the packs with the bytes each has to spare. Every figure here is measured on the NTSC-U image under `$KULA_DISC` by `tools/kula_sector.py`, whose `--check` rebuilds the disc's own sectors and compares, and the unit tests hold the readings to the disc wherever it is present. [level-format.md](level-format.md) is the level inside a pack; where a level goes inside its pack, and how a patch is written out, are later work and will join this document with it.

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

Between them the packs hold 156,146 bytes in 85 sectors, 174,080 bytes of capacity, so 17,934 bytes are spare across the disc. How a level is placed in a pack, in its slot's own bytes, in a pack rebuilt within these sectors or in a pack moved into `/3.00`, and how a patch carries the result, are the later readings this document will take up.
