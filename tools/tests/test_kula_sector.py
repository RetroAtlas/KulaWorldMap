"""Unit tests for the sector builder: python3 -m unittest discover -s tools/tests

The fixture needs nothing. The last three classes hold the readings to each
release's disc under $KULA_DISC, $KULA_DISC_EU and $KULA_DISC_JP, each skipped
without its variable.
"""

import base64
import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import Disc  # noqa: E402
from kula_disc import DISC_VARS, open_release, packs  # noqa: E402
from kula_place import SYNTHETIC_SECTORS, synthetic_image  # noqa: E402
from kula_sector import (  # noqa: E402
    DATA_SUBMODE,
    ECC_OFF,
    EDC_OFF,
    EOF_SUBMODE,
    FIXTURE,
    SECTOR_RAW,
    SUBHEADER_OFF,
    USER,
    USER_OFF,
    check,
    close,
    ecc,
    edc,
    fixture,
    header,
    noise,
    raw_sector,
    rebuilt,
    rewrite,
    sector,
    sectors_of,
    split,
    sweep,
    verify,
)

CASES = json.loads(FIXTURE.read_text())
unb64 = base64.b64decode


def stored_edc(raw):
    return struct.unpack_from("<I", raw, EDC_OFF)[0]


def with_second_copy(raw, copy):
    """The sector with its second subheader copy replaced and its EDC and ECC recomputed."""
    return close(bytes(raw[:SUBHEADER_OFF + 4]) + copy + bytes(raw[USER_OFF:EDC_OFF]))


class TheFixture(unittest.TestCase):
    def test_it_regenerates_byte_for_byte(self):
        self.assertEqual(fixture(), FIXTURE.read_text())

    def test_every_case_rebuilds_from_its_parts_checks_and_survives_a_rewrite(self):
        self.assertGreaterEqual(len(CASES["cases"]), 12)
        for c in CASES["cases"]:
            with self.subTest(c["name"]):
                raw, user = unb64(c["sector"]), unb64(c["user"])
                self.assertEqual((len(raw), len(user)), (SECTOR_RAW, USER))
                self.assertEqual(sector(c["lba"], user, c["submode"], c["file"], c["channel"]), raw)
                self.assertTrue(check(raw))
                self.assertEqual(rewrite(raw, user), raw)

    def test_it_covers_both_submodes_a_pack_is_written_with(self):
        self.assertLessEqual({DATA_SUBMODE, EOF_SUBMODE}, {c["submode"] for c in CASES["cases"]})

    def test_a_flipped_byte_fails_the_edc_and_the_ecc(self):
        self.assertEqual(len(CASES["broken"]), 2)
        for b in CASES["broken"]:
            with self.subTest(b["name"]):
                raw, whole = unb64(b["sector"]), unb64(CASES["cases"][b["from"]]["sector"])
                self.assertEqual([i for i, (x, y) in enumerate(zip(raw, whole)) if x != y], [b["at"]])
                self.assertTrue(USER_OFF <= b["at"] < EDC_OFF)
                self.assertIs(b["check"], False)
                self.assertFalse(check(raw))
                self.assertNotEqual(edc(raw), stored_edc(raw))
                self.assertNotEqual(ecc(raw), raw[ECC_OFF:])


class TheSector(unittest.TestCase):
    def test_the_address_is_minutes_seconds_and_frames_in_bcd_from_the_pregap(self):
        self.assertEqual(header(0), bytes([0x00, 0x02, 0x00, 0x02]))
        self.assertEqual(header(1002), bytes([0x00, 0x15, 0x27, 0x02]))
        self.assertEqual(header(109606), bytes([0x24, 0x23, 0x31, 0x02]))

    def test_a_rewrite_keeps_the_sync_header_and_subheader_and_recomputes_the_rest(self):
        a = sector(1002, noise(1), EOF_SUBMODE, 1, 2)
        b = rewrite(a, noise(2))
        self.assertEqual(b[:USER_OFF], a[:USER_OFF])
        self.assertEqual(b[USER_OFF:EDC_OFF], noise(2))
        self.assertNotEqual(b[EDC_OFF:], a[EDC_OFF:])
        self.assertEqual(b, sector(1002, noise(2), EOF_SUBMODE, 1, 2))

    def test_the_parity_covers_the_subheader_and_the_data_but_not_the_address(self):
        here, there = sector(16, noise(3), DATA_SUBMODE), sector(93953, noise(3), DATA_SUBMODE)
        self.assertNotEqual(here[:USER_OFF], there[:USER_OFF])
        self.assertEqual(here[EDC_OFF:], there[EDC_OFF:])
        last = sector(16, noise(3), EOF_SUBMODE)
        self.assertNotEqual(last[EDC_OFF:ECC_OFF], here[EDC_OFF:ECC_OFF])
        self.assertNotEqual(last[ECC_OFF:], here[ECC_OFF:])

    def test_a_sector_of_nothing_carries_no_parity(self):
        raw = sector(109457, bytes(USER), 0)
        self.assertEqual(raw[SUBHEADER_OFF:], bytes(SECTOR_RAW - SUBHEADER_OFF))
        self.assertTrue(check(raw))

    def test_user_data_is_one_length(self):
        with self.assertRaises(ValueError):
            sector(0, bytes(USER - 1), DATA_SUBMODE)
        with self.assertRaises(ValueError):
            rewrite(sector(0, bytes(USER), DATA_SUBMODE), bytes(USER + 1))

    def test_a_sector_whose_subheader_copies_differ_checks_but_does_not_rebuild(self):
        whole = sector(1002, noise(1), DATA_SUBMODE)
        other = bytes([0, 0, EOF_SUBMODE, 0])
        raw = with_second_copy(whole, other)
        self.assertEqual(raw[:SUBHEADER_OFF + 4], whole[:SUBHEADER_OFF + 4])
        self.assertEqual(raw[SUBHEADER_OFF + 4:USER_OFF], other)
        self.assertEqual(raw[USER_OFF:EDC_OFF], whole[USER_OFF:EDC_OFF])
        self.assertNotEqual(raw[EDC_OFF:ECC_OFF], whole[EDC_OFF:ECC_OFF])
        self.assertNotEqual(raw[ECC_OFF:], whole[ECC_OFF:])
        self.assertFalse(split(whole))
        self.assertTrue(split(raw))
        self.assertTrue(check(raw))
        self.assertFalse(rebuilt(raw, 1002))


class TheSweep(unittest.TestCase):
    def test_every_form_1_sector_of_an_image_is_rebuilt_and_one_that_differs_is_named(self):
        image = bytearray(synthetic_image())
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "image.bin"
            path.write_bytes(image)
            with Disc(path) as disc:
                self.assertEqual(sweep(disc), (SYNTHETIC_SECTORS, [], []))
            image[25 * SECTOR_RAW + USER_OFF + 9] ^= 0x10
            image[30 * SECTOR_RAW + EDC_OFF] ^= 0x01
            path.write_bytes(image)
            with Disc(path) as disc:
                self.assertEqual(sweep(disc), (SYNTHETIC_SECTORS - 2, [25, 30], []))

    def test_a_sector_whose_subheader_copies_differ_is_counted_apart_where_it_checks(self):
        image = bytearray(synthetic_image())
        at = 28 * SECTOR_RAW
        image[at:at + SECTOR_RAW] = with_second_copy(image[at:at + SECTOR_RAW], bytes([0, 0, EOF_SUBMODE, 0]))
        image[32 * SECTOR_RAW + SUBHEADER_OFF + 6] ^= 0x01
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "image.bin"
            path.write_bytes(image)
            with Disc(path) as disc:
                self.assertEqual(sweep(disc), (SYNTHETIC_SECTORS - 2, [32], [28]))


COUNTS = {
    "us": {"volume descriptor": 1, "pack": 85, "directory": 12, "sampled": 325},
    "eu": {"volume descriptor": 1, "pack": 85, "directory": 12, "sampled": 304},
    "jp": {"volume descriptor": 1, "pack": 84, "directory": 12, "sampled": 572},
}


class Held:
    """A release's disc held to the readings: its sectors come out of them bit for bit."""
    release = None

    @classmethod
    def setUpClass(cls):
        cls.disc = open_release(cls.release)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def test_its_sectors_come_out_of_the_readings_bit_for_bit(self):
        counts, failed = verify(self.disc)
        self.assertEqual(failed, [])
        self.assertEqual(counts, COUNTS[self.release])

    def test_a_pack_runs_on_data_sectors_and_ends_on_an_end_of_file_sector(self):
        for _, path in packs(self.disc):
            run = sectors_of(*self.disc.files[path.upper()])
            submodes = [raw_sector(self.disc.f, s)[SUBHEADER_OFF + 2] for s in run]
            self.assertEqual(submodes, [DATA_SUBMODE] * (len(run) - 1) + [EOF_SUBMODE], path)

    def test_a_pack_sector_with_one_byte_flipped_fails_the_edc_and_the_ecc(self):
        lba, _ = self.disc.files["/HIRO/HIRO.PAK"]
        raw = bytearray(raw_sector(self.disc.f, lba))
        self.assertTrue(check(raw))
        raw[USER_OFF + 7] ^= 1
        self.assertFalse(check(raw))
        self.assertNotEqual(edc(raw), stored_edc(raw))
        self.assertNotEqual(ecc(raw), bytes(raw[ECC_OFF:]))


@unittest.skipUnless(os.environ.get(DISC_VARS["us"]), f"needs the disc under ${DISC_VARS['us']}")
class TheDisc(Held, unittest.TestCase):
    release = "us"


@unittest.skipUnless(os.environ.get(DISC_VARS["eu"]), f"needs the PAL disc under ${DISC_VARS['eu']}")
class ThePalDisc(Held, unittest.TestCase):
    release = "eu"


@unittest.skipUnless(os.environ.get(DISC_VARS["jp"]), f"needs the Japanese disc under ${DISC_VARS['jp']}")
class TheJapaneseDisc(Held, unittest.TestCase):
    release = "jp"


if __name__ == "__main__":
    unittest.main()
