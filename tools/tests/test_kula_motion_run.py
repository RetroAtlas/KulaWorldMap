"""Unit tests for the level, its endings and the end screen's words: python3 -m unittest discover -s tools/tests"""

import struct
import sys
import unittest
import zlib
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code  # noqa: E402
from kula_motion_jump import flight  # noqa: E402
from kula_motion_run import WORDS_COUNT, WORDS_TABLE, play, words  # noqa: E402
from kula_motion_simon import simon  # noqa: E402
from motion_fixture import AT, GAME, lui, lw  # noqa: E402


class Play(unittest.TestCase):
    def test_the_level_ships_its_clock_its_endings_and_their_waits(self):
        p = play(GAME)
        self.assertEqual(p["start"], {"wait": 20, "guard": 20})
        self.assertEqual(p["clock"], {"tick": 1, "second": 50, "face": 8, "out": -2})
        self.assertEqual(p["ending"], {"exit": 1, "bonus": 2, "hidden": 3, "spikes": -1, "time": -2, "lost": -3,
                                       "fire": -4, "captivator": -5, "acid": -6, "laser": -7, "simon": -8})
        self.assertEqual(p["wait"], {"exit": 5, "hidden": 5, "bonus": 5, "spikes": 10, "fire": 25, "captivator": 10,
                                     "acid": 6, "laser": 4, "simon": 25})
        self.assertEqual(p["words"], {"exit": "Well Done!", "bonus": "Well Done!", "hidden": "Well Done!",
                                      "spikes": "SPIKED!", "time": "TIME OUT!", "lost": "FELL OFF!", "fire": "FIRE!",
                                      "captivator": "CAPTURED!", "acid": "ACID!", "laser": "LASER!",
                                      "simon": "Wrong Move!", "over": "Game Over!", "won1": "Player 1 Won!",
                                      "won2": "Player 2 Won!", "equal": "Equal Time!"})
        self.assertEqual(p["bonus"], {"block": 50, "skips": 3})
        self.assertEqual(p["points"], {"each": 50, "most": 5000, "levels": 15, "finals": 2})
        self.assertEqual(p["next"], {"bonus": [15, 16, 17], "hidden": 18, "slots": 15, "third": 5, "fruit": 31,
                                     "worlds": 10})
        self.assertEqual(p["simon"], simon(GAME))
        self.assertEqual(p["view"], {"angles": [-8, 3, 10], "swing": 12, "off": 1400, "reach": 1000,
                                     "bonus": {"swing": 58, "off": 3400, "reach": 3000}, "hidden": {"off": 400}})
        self.assertEqual(p["flight"], flight(GAME))
        self.assertEqual(p["screen"], {"wide": 320, "high": 240, "distance": 160,
                                       "scale": {"across": 4096, "down": 3840}})

    def test_an_ending_shared_or_waited_otherwise_stops_the_reading(self):
        for change in ({"end.acid": -4}, {"end.exit": 4}, {"end.hedgehog": -4}, {"wait.hedgehog": 9}, {"wait.hidden": 4},
                       {"wait.simon.done": 24}, {"mark.under": 300}, {"mark.skips": 2}, {"clock.face": 9},
                       {"exit.type": 8}, {"end.exit.landing": 2}, {"simon.done": 3}, {"end.captivator.still": -4},
                       {"acid.gain.wait": 200}, {"death.each.final": 25}, {"end.time": -3}, {"end.spikes": -2},
                       {"death.most.gate": 5000}, {"death.levels": 14}, {"simon.wrong": 3},
                       {"flight.end.gate.after": 1024}, {"flight.curve.shift": 12}, {"flight.out.shift": 9},
                       {"flight.yaw": -1000}, {"flight.bank.from": 2048}, {"flight.least": 2}, {"flight.pitch": 200},
                       {"flight.below": 200}, {"flight.ahead": 700}, {"flight.hold": 900}, {"flight.done": 1000},
                       {"flight.gate": 20}, {"words.win": 26}, {"words.final": 14}, {"words.last": -1},
                       {"words.trial.won1": 30}, {"words.slow.gate": 1200}, {"words.copycat": 2},
                       {"mode.at": 9376}, {"mode.word": 0x800a53d0}, {"game.mode.word": 0x800a33b4},
                       {"mode.simon": 2}, {"mode.bonus": 2}, {"mode.hidden": 1}, {"mode.hidden.flag": 2},
                       {"mode.key": 30}, {"mode.kinds": 4}, {"mode.slots": 5}, {"mode.settings": 8},
                       {"end.view.mode.bonus": 0}, {"end.view.mode.bonus.eye": 2}, {"next.hidden.out": 2},
                       {"next.fruit": 15}, {"fruit.bit.45": 2}, {"fruit.bit.all": 15}, {"next.bonus.2": 18},
                       {"next.back.gate.1": 10}, {"next.third": 4}, {"next.round": 2}, {"next.hidden": 19},
                       {"next.chain.end": 17}, {"next.final": 150}, {"next.one": 2}, {"next.mode.load": 1},
                       {"next.mode.writes": [0x80042000]}, {"next.mode.clears": [0x800482e4]}, {"death.finals": 3},
                       {"next.levels.final": 3}, {"next.start.bonus": 16}, {"run.worlds": 9}, {"next.slots": 14}):
            with self.assertRaises(SystemExit):
                play({**GAME, **change})


class Words(unittest.TestCase):
    POINTER = AT + 0x80
    TABLE = AT + 0x100

    def image(self, body, flags=8):
        return struct.pack("<II", 0x10, flags) + body

    def code(self, streams, count=WORDS_COUNT):
        """A table of `count` entries, the first of them the streams given and the rest the last stream again."""
        entries = self.TABLE + 4
        blobs = entries + 8 * count
        end = max(blobs + sum(len(s) for s in streams), WORDS_TABLE[1] + 4)
        blob = bytearray(end - EXE_BASE)
        put = lambda at, w: struct.pack_into("<I", blob, at - EXE_BASE, w)
        put(WORDS_TABLE[0], lui("t0", self.POINTER >> 16 & 0x7FFF))
        put(WORDS_TABLE[1], lw("t0", "t0", self.POINTER & 0xFFFF))
        put(self.POINTER, self.TABLE & 0x1FFFFFFF)
        put(self.TABLE, count)
        at = blobs
        for i, stream in enumerate(streams):
            blob[at - EXE_BASE:at - EXE_BASE + len(stream)] = stream
            put(entries + 8 * i, at - self.TABLE)
            put(entries + 8 * i + 4, len(stream))
            at += len(stream)
        for i in range(len(streams), count):
            put(entries + 8 * i, at - len(streams[-1]) - self.TABLE)
            put(entries + 8 * i + 4, len(streams[-1]))
        return Code(bytes(blob))

    def test_a_pair_reads_as_its_word_where_its_digest_is_the_pinned_one(self):
        dark, light = self.image(b"the relief"), self.image(b"the highlights")
        with mock.patch("kula_motion_run.WORDS", {0: ("HELLO!", zlib.crc32(dark + light))}):
            self.assertEqual(words(self.code([zlib.compress(dark), zlib.compress(light)])), {0: "HELLO!"})

    def test_another_count_another_pair_not_an_image_or_not_a_stream_stops_the_reading(self):
        dark, light = self.image(b"the relief"), self.image(b"the highlights")
        pair = [zlib.compress(dark), zlib.compress(light)]
        with mock.patch("kula_motion_run.WORDS", {0: ("HELLO!", zlib.crc32(dark + light))}):
            for c in (self.code(pair, count=WORDS_COUNT - 1), self.code(pair[::-1]),
                      self.code([zlib.compress(self.image(b"the relief", flags=9)), pair[1]]),
                      self.code([pair[0], zlib.compress(b"\x10\0\0")]), self.code([pair[0], b"not deflate"])):
                with self.assertRaises(SystemExit):
                    words(c)


if __name__ == "__main__":
    unittest.main()
