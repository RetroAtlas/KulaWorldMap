"""Unit tests for the effects: python3 -m unittest discover -s tools/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_motion_code import GP  # noqa: E402
from kula_motion_effects import effect_init, effect_tables, effects  # noqa: E402
from motion_fixture import AT, GAME, addiu, code, lui, lw, sb, sw  # noqa: E402


class Effects(unittest.TestCase):
    def test_startups_straight_run_is_followed_for_what_it_stores_through_gp(self):
        c = code(lui("v0", 0x000a), addiu("v0", "v0", -30472), sw("v0", "gp", 5048), addiu("v1", "zero", 100),
                 lw("a1", "a1", 23216), sb("v1", "gp", 5104), sb("zero", "gp", 5105))
        self.assertEqual(effect_init(c, (AT, AT + 28)),
                         {GP + 5048: ("sw", 0x800988f8), GP + 5104: ("sb", 100), GP + 5105: ("sb", 0)})
        with self.assertRaises(SystemExit):
            effect_init(code(lw("a1", "a1", 23216), sw("a1", "gp", 5048)), (AT, AT + 8))

    def test_an_effect_table_is_read_as_its_count_its_frames_and_its_rows(self):
        def halves(lo, hi):
            return (lo & 0xFFFF) | ((hi & 0xFFFF) << 16)
        c = code(halves(2, 1), halves(6, 0), halves(1330, 107), halves(0, -1), halves(80, 107))
        self.assertEqual(effect_tables(c, [AT, 0, AT]),
                         {AT: {"count": 2, "frames": 1, "rows": [[[6, 0, 1330, 107], [0, -1, 80, 107]]]}})
        with self.assertRaises(SystemExit):
            effect_tables(code(halves(0, 1)), [AT])
        with self.assertRaises(SystemExit):
            effect_tables(code(halves(2, 40)), [AT])

    def test_the_effects_ship_their_tables_their_colours_as_shown_their_units_and_the_flash(self):
        e = effects(GAME)
        self.assertEqual(e["sprites"], {"count": 7, "colours": [[100, 50, 100], [80, 80, 80], [60, 60, 127], [127, 20, 20],
                                                                 [0, 127, 127], [80, 20, 20], [127, 127, 127]], "full": 128})
        self.assertEqual(e["size"], {"hud": 64, "world": 16})
        self.assertEqual(e["kinds"], {"0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "4", "6": "2", "7": "2",
                                      "8": "8", "9": "9", "10": "4"})
        self.assertEqual(set(e["tables"]), {"0", "1", "2", "3", "4", "8", "9"})
        self.assertEqual(e["tables"]["2"], {"frames": 2, "rows": GAME["effect.tables"][0x800999ac]["rows"]})
        self.assertEqual(e["starts"]["31"], {"world": 6, "hud": 0})
        self.assertEqual(e["starts"]["35"], {"world": 10, "hud": 1})
        self.assertEqual(e["starts"]["32"], {"world": 9})
        self.assertEqual({k for k, v in e["starts"].items() if "hud" in v}, {"31", "35", "43", "44", "45", "46", "47"})
        self.assertEqual(set(e["starts"]), {"31", "32", "33", "34", "35", "36", "37", "38", "42", "43", "44", "45", "46", "47"})
        self.assertEqual(e["teleport"], {"hud": 3})
        self.assertEqual(e["hud"], {"clock": [160, 28], "teleport": [160, 166], "key": [6, 11],
                                    "fruit": [[208, 217], [228, 216], [253, 216], [278, 216], [299, 218]]})
        self.assertEqual(e["flash"], {"blend": 1, "teleport": {"from": 268, "step": 20, "blanks": 2},
                                      "bonus": {"from": 254, "step": 6}})
        # the flash shows on 13 passes, from 248 down to 8, and a level with no key opens from white over 42
        self.assertEqual(len(range(268 - 20, 0, -20)), 13)
        self.assertEqual(len(range(254 - 6, 0, -6)), 42)
        self.assertEqual({k: e[k] for k in ("most", "particles", "near", "light")},
                         {"most": 16, "particles": 2, "near": 121, "light": {"over": 512}})

    def test_an_effect_word_otherwise_stops_the_reading(self):
        tables, at = GAME["effect.tables"], GAME["effect.hud.at"]
        def rows(address, *row):
            return {"effect.tables": {**tables, address: {"count": 2, "frames": 1, "rows": [list(row)]}}}
        for change in ({"effect.slots.last": 10}, {"effect.pointers": GAME["effect.pointers"][:-1] + [0x800988f8]},
                       {"effect.kind.33": 8}, {"effect.kind.44": 2}, {"effect.kind.42": 2}, {"effect.kind.5.hud": 2},
                       {"effect.kind.35.hud": 9}, {"effect.kind.31": 11},
                       {"effect.tables": {**tables, 0x80098d2c: {**tables[0x80098d2c], "count": 3}}},
                       {"effect.tables": {**tables, 0x80098d2c: {**tables[0x80098d2c], "frames": 2}}},
                       rows(0x80098d2c, [7, 0, 0, 0], [0, 0, 0, 0]), rows(0x80098d2c, [0, -2, 0, 0], [0, 0, 0, 0]),
                       rows(0x80098d2c, [0, 0, 0, 256], [0, 0, 0, 0]), rows(0x80099698, [6, -1, 10, 255], [2, 0, 0, 0]),
                       {"effect.colour.a": 101}, {"effect.full": 127}, {"effect.sprites": 6},
                       {"effect.entry": 180}, {"effect.player": 2940}, {"effect.buffer": 84}, {"effect.prims": 164},
                       {"effect.particle": 44}, {"effect.row.quad": 3}, {"effect.row.double": 2}, {"effect.header": 8},
                       {"effect.angle.step": 4}, {"effect.third": 2}, {"effect.players": 2}, {"effect.gone": -2},
                       {"effect.step": 2}, {"effect.dice": 2048}, {"effect.dice.world": 1024}, {"effect.sine.one": 2048},
                       {"effect.hud.shift": 17}, {"effect.world.shift": 17}, {"effect.whole.shift": 17},
                       {"effect.whole.one": 2}, {"effect.light.shift.g": 8},
                       {"effect.table.at": [0x800d2e20, 0x800d2e24, 0x800d2e20]}, {"effect.table.words": 1025},
                       {"effect.table.send": 4096}, {"effect.table.shift": 2}, {"effect.hud.z": 0},
                       {"effect.hud.at": {**at, "clock": [160, 28, 0]}}, {"effect.hud.at": {**at, "fruit": at["fruit"][:4]}},
                       {"teleport.flash.word": 2}, {"teleport.flash.run.on": 0}, {"teleport.flash.level": 0},
                       {"teleport.flash.mode.last": 1}, {"teleport.flash.level.from": 268}, {"teleport.flash.step": 20},
                       {"teleport.flash.from.1": 0}, {"teleport.flash.blend": 2}, {"teleport.flash.semi": 0},
                       {"teleport.flash.wide": 0}, {"teleport.flash.quad": 44}, {"teleport.flash.len": 9}):
            with self.assertRaises(SystemExit):
                effects({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
