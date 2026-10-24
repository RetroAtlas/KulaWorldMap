"""Unit tests for what the ball takes and the devices under it: python3 -m unittest discover -s tools/tests"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code, dispatch  # noqa: E402
from kula_motion_take import (END_CASES, END_FACES, LOADER_CASES, LOADER_PLAIN, LOADER_TYPES, TAKE_CASES,  # noqa: E402
                              TAKE_TAIL, TAKE_TYPES, devices, exits, take)
from motion_fixture import GAME  # noqa: E402


class Dispatch(unittest.TestCase):
    def cases(self, where, cases, default):
        """An executable whose table at `where` sends each type to its case."""
        at, first, count = where
        blob = bytearray(at - EXE_BASE + 4 * count)
        for i in range(count):
            struct.pack_into("<I", blob, at - EXE_BASE + 4 * i, cases.get(first + i, default) & 0x0FFFFFFF)
        return Code(bytes(blob))

    def test_the_walks_and_the_loaders_tables_send_each_type_to_its_case(self):
        dispatch(self.cases(TAKE_TYPES, TAKE_CASES, TAKE_TAIL), TAKE_TYPES, TAKE_CASES, TAKE_TAIL, "the walk")
        dispatch(self.cases(LOADER_TYPES, LOADER_CASES, LOADER_PLAIN), LOADER_TYPES, LOADER_CASES, LOADER_PLAIN,
                 "the loader")
        dispatch(self.cases(END_FACES, END_CASES, None), END_FACES, END_CASES, None, "the end landing")

    def test_a_type_sent_elsewhere_stops_the_reading(self):
        for swap in ({31: TAKE_CASES[37]}, {28: TAKE_CASES[31]}, {36: TAKE_TAIL}):
            with self.assertRaises(SystemExit):
                dispatch(self.cases(TAKE_TYPES, {**TAKE_CASES, **swap}, TAKE_TAIL), TAKE_TYPES, TAKE_CASES, TAKE_TAIL,
                         "the walk")
        with self.assertRaises(SystemExit):
            dispatch(self.cases(LOADER_TYPES, {**LOADER_CASES, 7: LOADER_PLAIN}, LOADER_PLAIN), LOADER_TYPES,
                     LOADER_CASES, LOADER_PLAIN, "the loader")
        with self.assertRaises(SystemExit):
            dispatch(self.cases(END_FACES, {**END_CASES, 0: END_CASES[5]}, None), END_FACES, END_CASES, None,
                     "the end landing")


class Take(unittest.TestCase):
    def test_a_pickup_ships_its_reach_its_stand_and_its_points(self):
        taken, lasting = take(GAME)
        self.assertEqual(taken[31], {"reach": 150, "stand": 386, "points": 1000})
        self.assertEqual(taken[32], {"reach": 160, "stand": 386})
        self.assertEqual(taken[35], {"reach": 160, "stand": 436, "points": 10, "clock": {"from": 5999, "second": 50}})
        self.assertEqual(taken[36], {"reach": 160, "stand": [386, 436, 436], "points": 2975})
        self.assertEqual(taken[37], {"reach": 160, "stand": 406, "points": [750, 500, 250]})
        self.assertEqual(taken[42], {"reach": 160, "stand": 416, "points": 1550})
        for i, t in enumerate(range(43, 48)):
            self.assertEqual(taken[t], {"reach": 180, "stand": 386, "points": 2500, "fruit": 1 << i})
        self.assertEqual(set(taken), {31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47})
        self.assertEqual(lasting[32], {"word": 360, "step": 2, "ticks": 4, "blanks": 2,
                                       "rock": {"scale": 64, "shift": 5},
                                       "screen": {"grey": 128, "tint": [96, 112, 96], "magnitude": 780, "wane": 5,
                                                  "step": 213, "phase": 1024, "fade": {"from": 80, "by": 8}}})
        self.assertEqual(lasting[33], {"word": 840, "hold": 839, "latch": 4})
        self.assertEqual(lasting[34], {"word": 840, "step": 1,
                                       "glow": {"step": 100, "round": 8192, "gain": 3, "from": [0, 2048, 4096]}})
        self.assertEqual(lasting[38], {"word": 840, "step": 1, "blink": {"times": 21, "frames": 9, "first": 8}})

    def test_a_reach_that_is_not_a_square_stops_the_reading(self):
        for change in ({"take.reach": 25000}, {"take.within": 10001}, {"take.reach.key": 22500 + 1}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_a_reach_not_adding_the_balls_radius_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            take({**GAME, "take.within": 8100})

    def test_a_fruit_scoring_otherwise_or_an_hourglass_counting_otherwise_stops_the_reading(self):
        for change in ({"fruit.points.45": 2000}, {"hourglass.second": 60}, {"hourglass.from": 4999}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_a_pills_word_running_otherwise_stops_the_reading(self):
        for change in ({"pill.lethargy": 361}, {"pill.lethargy.step": 2}, {"pill.invincible.step": -2},
                       {"pill.bouncy.hold": 840}, {"pill.bouncy.latch": 0}, {"pill.bouncy.latch.step": 2},
                       {"crumble.under": 95}, {"take.open": 2}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_the_sunglasses_blink_read_otherwise_stops_the_reading(self):
        for change in ({"sunglasses.flag.on": 0}, {"sunglasses.flag": 0}, {"sunglasses.blink.step": -2},
                       {"sunglasses.blink.step.on": 0}, {"sunglasses.blink.count.step": 1},
                       {"sunglasses.blink.count.step.on": -2}, {"sunglasses.blink.on": 8},
                       {"sunglasses.blink.off": 10}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_the_invincible_balls_glow_read_otherwise_stops_the_reading(self):
        for change in ({"glow.gate": 0}, {"glow.gate.word": 552}, {"glow.round.rest": 8292}, {"glow.round.shift": 12},
                       {"glow.red.shift": 11}, {"glow.red.rest": 4096}, {"glow.green.rest": 2048}, {"glow.blue.rest": 0},
                       {"glow.red.under": 4095}, {"glow.green.from": -2048}, {"glow.green.span": 4096},
                       {"glow.blue.gate": 4096}, {"glow.green.phase": -1024, "glow.green.from": -1025,
                                                  "glow.green.rest": 3071},
                       {"glow.gain.green": 2}, {"glow.gain.blue": 4}, {"glow.counter.load": 5},
                       {"glow.counter.at": 0}, {"glow.clear": [0x800a4700, 0x800fb1e8]},
                       {"glow.clear": [0x800a4220, 0x800a46f4]}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_the_lethargy_pills_screen_read_otherwise_stops_the_reading(self):
        for change in ({"gp": 0x800a2f3c}, {"pill.lethargy.players": 3}, {"rock.round": 15}, {"rock.shift": 4},
                       {"flash.code": 40}, {"flash.laid": 127}, {"screen.page.gate": 256}, {"screen.sprite.rest": -255},
                       {"screen.wane": 5}, {"screen.magnitude": 781}, {"screen.fade": -7}, {"screen.end": 81},
                       {"screen.rest.down": 4096}, {"screen.reset.across": 3840}, {"screen.load.down": 4096}):
            with self.assertRaises(SystemExit):
                take({**GAME, **change})

    def test_the_exits_ship_what_the_loader_and_the_last_key_write(self):
        self.assertEqual(exits(GAME), {7: {"shut": {"f3": 1}, "opened": {"f3": 0, "f4": 1}},
                                       26: {"shut": {"f4": 0}, "opened": {"f4": 1}}})


class Devices(unittest.TestCase):
    def test_the_teleporter_and_the_switch_ship_their_bands_about_the_middle(self):
        d = devices(GAME)
        self.assertEqual(d[5]["send"], {"wait": 15, "band": [167, 345], "hold": 15, "rearm": [156, 356]})
        self.assertEqual(d[9]["throw"], {"band": [197, 315], "rearm": [156, 356]})
        self.assertEqual(set(d), {5, 9})
        for key in ("send", "throw"):
            lo, hi = d[5 if key == "send" else 9][key]["band"]
            self.assertEqual(lo + hi, 512)

    def test_a_band_off_the_middle_or_another_type_stops_the_reading(self):
        for change in ({"send.band": -160}, {"throw.band.span": 120}, {"rearm.span": 200}, {"send.type": 9},
                       {"send.mark": 9}, {"send.hold.after": 14}, {"throw.laser": 5}):
            with self.assertRaises(SystemExit):
                devices({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
