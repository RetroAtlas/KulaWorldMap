"""Unit tests for the releases and the boot line: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import disc  # noqa: E402
from disc import NAME, SECTOR_RAW, Disc  # noqa: E402
from kula_disc import DISC_VARS, EXE, EXE_BASE, RELEASES, exe_of, open_release, release_of  # noqa: E402
from kula_place import CNF_AT, ROOT_AT, synthetic_image  # noqa: E402
from kula_sector import USER, USER_OFF, rewrite  # noqa: E402

IMAGE = synthetic_image()
KEYS = {"label", "name", "region", "serial", "boot", "sectors", "exe", "base", "gp"}


def user_of(image, lba):
    at = lba * SECTOR_RAW + USER_OFF
    return image[at:at + USER]


def with_sector(image, lba, user):
    """The image with one sector's user data replaced and the sector rebuilt whole."""
    at = lba * SECTOR_RAW
    return image[:at] + rewrite(image[at:at + SECTOR_RAW], user.ljust(USER, b"\0")) + image[at + SECTOR_RAW:]


def booting(name):
    """The synthetic image with its boot line naming another executable of the same length."""
    return with_sector(IMAGE, CNF_AT, user_of(IMAGE, CNF_AT).replace(b"SLUS_007.24", name))


def without_cnf():
    """The synthetic image with SYSTEM.CNF struck from the root directory."""
    root = bytearray(user_of(IMAGE, ROOT_AT))
    start = root.index(b"SYSTEM.CNF;1") - NAME
    root[start:] = bytes(USER - start)
    return with_sector(IMAGE, ROOT_AT, bytes(root))


class TheTable(unittest.TestCase):
    def test_the_releases_stand_in_order_each_with_the_same_keys(self):
        self.assertEqual(list(RELEASES), ["us", "eu", "jp"])
        self.assertEqual(list(DISC_VARS), list(RELEASES))
        for release, entry in RELEASES.items():
            with self.subTest(release):
                self.assertEqual(set(entry), KEYS)
                self.assertEqual(entry["exe"], "/" + entry["boot"])

    def test_the_executable_and_its_base_are_the_us_entry(self):
        self.assertEqual(EXE, RELEASES["us"]["exe"])
        self.assertEqual(EXE_BASE, RELEASES["us"]["base"])


class TheBootLine(unittest.TestCase):
    def write(self, data):
        f = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
        self.addCleanup(Path(f.name).unlink)
        f.write(data)
        f.close()
        return f.name

    def opened(self, data):
        image = Disc(self.write(data))
        self.addCleanup(image.close)
        return image

    def exit_of(self, fn, *args):
        with self.assertRaises(SystemExit) as caught:
            fn(*args)
        return caught.exception.code

    def test_the_release_is_the_one_whose_executable_the_boot_line_names(self):
        self.assertEqual(release_of(self.opened(IMAGE)), "us")
        self.assertEqual(release_of(self.opened(booting(b"SCES_010.00"))), "eu")
        self.assertEqual(release_of(self.opened(booting(b"SCPS_100.64"))), "jp")

    def test_the_name_is_read_whatever_the_line_puts_around_it(self):
        for cnf in (b"BOOT=cdrom:\\SCES_010.00;1 \r\nTCB = 4\r\nEVENT = 16\r\nSTACK = 0X801FFF00\r\n",
                    b"boot = cdrom:\\sces_010.00;1\r\n"):
            with self.subTest(cnf):
                self.assertEqual(release_of(self.opened(with_sector(IMAGE, CNF_AT, cnf))), "eu")

    def test_an_image_without_system_cnf_or_booting_something_else_is_no_release(self):
        self.assertIsNone(release_of(self.opened(without_cnf())))
        self.assertIsNone(release_of(self.opened(booting(b"SLES_000.00"))))

    def test_the_executable_is_the_path_and_base_of_the_release_booted(self):
        self.assertEqual(exe_of(self.opened(IMAGE)), ("/SLUS_007.24", 0x80010000 - 0x800))
        self.assertEqual(exe_of(self.opened(booting(b"SCES_010.00"))), ("/SCES_010.00", 0x80011000 - 0x800))

    def test_an_image_booting_no_release_has_no_executable(self):
        path = self.write(booting(b"SLES_000.00"))
        image = Disc(path)
        self.addCleanup(image.close)
        self.assertEqual(self.exit_of(exe_of, image),
                         f"{path}: SYSTEM.CNF names none of the three releases' executables")

    def test_an_image_without_system_cnf_has_no_executable(self):
        path = self.write(without_cnf())
        image = Disc(path)
        self.addCleanup(image.close)
        self.assertEqual(self.exit_of(exe_of, image), f"{path} has no SYSTEM.CNF")

    def test_a_release_opens_from_the_path_given(self):
        image = open_release("eu", self.write(booting(b"SCES_010.00")))
        self.addCleanup(image.close)
        self.assertEqual(release_of(image), "eu")

    def test_a_release_opens_from_its_own_variable(self):
        path = self.write(booting(b"SCPS_100.64"))
        with mock.patch.dict(os.environ, {"KULA_DISC_JP": path}, clear=False):
            image = open_release("jp")
        self.addCleanup(image.close)
        self.assertEqual(release_of(image), "jp")

    def test_without_a_path_or_the_variable_the_exit_names_the_variable(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("KULA_DISC_EU", None)
            self.assertEqual(self.exit_of(open_release, "eu"), "no disc image: pass --disc or set $KULA_DISC_EU")

    def test_a_path_without_an_image_is_refused_as_any_disc_is(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder)
        missing = str(Path(folder) / "image.bin")
        self.assertEqual(self.exit_of(open_release, "us", missing), f"no disc image at {missing}")

    def test_an_image_booting_another_release_is_refused_by_name(self):
        path = self.write(IMAGE)
        self.assertEqual(self.exit_of(open_release, "eu", path),
                         f"{path} boots SLUS_007.24, not the Kula World disc's SCES_010.00")

    def test_an_image_booting_no_release_is_refused_as_booting_nothing_the_game_shipped(self):
        path = self.write(without_cnf())
        self.assertEqual(self.exit_of(open_release, "jp", path),
                         f"{path} boots no executable the game shipped, not the Kula Quest disc's SCPS_100.64")

    def test_a_refused_image_is_closed(self):
        opened = []
        real = open

        def spy(*args, **kwargs):
            opened.append(real(*args, **kwargs))
            return opened[-1]

        with mock.patch.object(disc, "open", spy, create=True), self.assertRaises(SystemExit):
            open_release("jp", self.write(IMAGE))
        self.assertTrue(opened[0].closed)


if __name__ == "__main__":
    unittest.main()
