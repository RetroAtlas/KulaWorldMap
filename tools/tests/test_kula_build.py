"""Unit tests for the build: python3 -m unittest discover -s tools/tests

The packs file's class and the release files' classes need a disc, each skipped without its variable.
"""

import json
import os
import sys
import unittest
import zlib
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_build import (  # noqa: E402
    BASE,
    IDENTITY,
    PACKS,
    PUBLIC,
    base_art,
    base_objects,
    code_of,
    hold_to_rules,
    laid_out,
    layout_of,
    mesh_readings,
    motion_overlay,
    other_release,
    packs_json,
    release_art,
    release_json,
    release_objects,
    rooms_of,
    rules_of,
    skins_overlay,
    slot,
    slot_problems,
    tgis_of,
    variants,
)
from kula_disc import DISC_VARS, RELEASES, RELEASE_FILES, open_disc, open_release, packs  # noqa: E402
from kula_kwl import (  # noqa: E402
    CAPS,
    CAPTIVATORS,
    INNER,
    KEY,
    LENGTH_CAP,
    MOVING_SPIKES,
    NUMBERED,
    PLAIN_ONLY,
)
from kula_kwl_check import UNTRACED, figure_failures  # noqa: E402
from kula_level import BLOCK_KINDS, FACE  # noqa: E402
from kula_motion import readings  # noqa: E402
from kula_motion_code import Readings  # noqa: E402
from kula_pak import Pak  # noqa: E402
from kula_place import RECOMPRESS, ROOM  # noqa: E402
from kula_sector import USER, sectors_of  # noqa: E402
from kula_skins import tint  # noqa: E402
from kula_tex import OUT as TEX, SHARED, digest, mean  # noqa: E402
from png import read_png  # noqa: E402
from test_kula_ggi import ARROW, EXITS, PLACED, READINGS, committed, ggi, quad  # noqa: E402
from tgi_fixture import BOTH, BRIGHT, PALETTES, atlases, tgi_blob, worlds  # noqa: E402


def reading():
    """A reading of the executable that agrees with every figure the checks hold."""
    return {
        **{what: CAPS[what] for what in CAPS if what not in UNTRACED},
        "platform.length": LENGTH_CAP,
        "spikes.type": MOVING_SPIKES,
        "glow.types": PLAIN_ONLY - {MOVING_SPIKES},
        "key.type": KEY,
        "block.kinds": BLOCK_KINDS,
        "numbered.from": min(NUMBERED),
        "numbered.count": max(NUMBERED) + 1 - min(NUMBERED),
        "inner.from": INNER.start,
        "inner.below": INNER.stop,
        "captivators.from": min(CAPTIVATORS),
    }


class TheFigures(unittest.TestCase):
    def test_the_comparison_names_a_figure_that_disagrees_and_nothing_when_all_agree(self):
        r = reading()
        self.assertEqual(figure_failures(r), [])
        self.assertEqual(figure_failures({**r, "faces": 770}), ["the cap on faces is 768, not the executable's figure, 770"])
        self.assertEqual(figure_failures({**r, "platform.length": 8}), ["the length cap is 7, not the executable's figure, 8"])
        self.assertEqual(figure_failures({**r, "glow.types": frozenset({5, 7, 10})}),
                         ["the glow loader's set of types is 5, 7, 9, not the executable's figure, 5, 7, 10"])
        self.assertEqual(figure_failures({**r, "numbered.count": r["numbered.count"] + 1}),
                         ["the run of numbered types is 5 to 47, not the executable's figure, 5 to 48"])
        self.assertEqual(figure_failures({**r, "inner.below": 32}),
                         ["the run of inner cells is 1 to 32, not the executable's figure, 1 to 31"])
        self.assertEqual(figure_failures({**r, "platforms": CAPS["platforms"]}),
                         ["the list of untraced caps is blocks, platforms, not the executable's figure, blocks"])
        self.assertEqual(figure_failures({**r, "records": 124, "key.type": 32, "captivators.from": 51}),
                         ["the cap on records is 123, not the executable's figure, 124",
                         "the key's type is 31, not the executable's figure, 32",
                         "the first captivator is 50, not the executable's figure, 51"])


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc under $KULA_DISC")
class ThePacksFile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.disc = open_disc()
        cls.text = PACKS.read_text()
        cls.data = json.loads(cls.text)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def test_every_pack_of_the_disc_is_there_in_order_with_its_place_and_its_room(self):
        self.assertEqual([p["path"] for p in self.data["packs"]], [path for _, path in packs(self.disc)])
        for p in self.data["packs"]:
            lba, size = self.disc.files[p["path"]]
            self.assertEqual((p["lba"], p["size"], p["capacity"]),
                             (lba, size, len(sectors_of(lba, size)) * USER), p["path"])
            self.assertEqual(set(p), {"path", "lba", "size", "capacity", "slots"}, p["path"])

    def test_every_slot_carries_its_name_and_the_length_of_its_record_as_stored_and_recompressed(self):
        for p in self.data["packs"]:
            pak = Pak(self.disc.read_file(p["path"]), p["path"])
            self.assertEqual([s["name"] for s in p["slots"]], pak.names(), p["path"])
            self.assertEqual([s["size"] for s in p["slots"]], [len(s) for s in pak.streams()], p["path"])
            self.assertEqual([s["size"] for s in p["slots"]], [e["size"] for e in pak.entries], p["path"])
            self.assertEqual([s["size9"] for s in p["slots"]],
                             [len(zlib.compress(pak.level(i), RECOMPRESS)) for i in range(len(pak))], p["path"])
            for s in p["slots"]:
                self.assertEqual(set(s), {"name", "size", "size9"}, p["path"])

    def test_the_room_is_the_free_file(self):
        lba, size = self.disc.files[ROOM]
        self.assertEqual(self.data["room"], {"path": ROOM, "lba": lba, "size": size})
        self.assertEqual(set(self.data), {"room", "packs"})

    def test_the_committed_file_is_what_the_build_writes(self):
        self.assertEqual(self.text, json.dumps(packs_json(self.disc), indent=1))


def level(pack, index, **more):
    """A level dict of the shape the build ships, with its one-point lattice, and anything given over it."""
    return {"name": f"L{index}", "theme": "HIRO", "pack": pack, "index": index, "placed": 1, "header": 1,
            "min": [1, 2, 3], "max": [1, 2, 3], "cells": [1, 2, 3, 0], "records": [], "time": 99, **more}


BASE_LEVELS = [level("/HIRO/HIRO.PAK", 0, shown="LEVEL 1"), level("/HIRO/HIRO.PAK", 1, shown="LEVEL 2"),
               level("/HIRO/HIROFI.PAK", 0, shown="FINAL 1")]
BASE_PACKS = ["/HIRO/HIRO.PAK", "/HIRO/HIROFI.PAK"]


class TheComparison(unittest.TestCase):
    def setUp(self):
        self.base = {slot(l): l for l in BASE_LEVELS}

    def test_the_slots_whose_level_is_not_the_bases_are_picked_in_order_naming_the_release(self):
        theirs = [level("/HIRO/HIRO.PAK", 0, shown="LEVEL 1", time=45), dict(BASE_LEVELS[1]),
                  level("/HIRO/HIROFI.PAK", 0, shown="FINAL 1", cells=[1, 2, 3, 2])]
        picked = variants(self.base, theirs, "eu")
        self.assertEqual(list(picked), ["/HIRO/HIRO.PAK#0", "/HIRO/HIROFI.PAK#0"])
        self.assertEqual(picked["/HIRO/HIRO.PAK#0"], {**theirs[0], "release": "eu"})
        self.assertEqual(picked["/HIRO/HIROFI.PAK#0"], {**theirs[2], "release": "eu"})
        self.assertNotIn("release", theirs[0])

    def test_a_disc_whose_every_level_is_the_bases_has_no_variant(self):
        self.assertEqual(variants(self.base, [dict(l) for l in BASE_LEVELS], "jp"), {})

    def test_the_packs_and_the_slots_have_to_be_the_bases_in_its_order_under_its_titles(self):
        levels = [dict(l) for l in BASE_LEVELS]
        self.assertEqual(slot_problems(self.base, levels, BASE_PACKS), [])
        self.assertEqual(slot_problems(self.base, levels, BASE_PACKS + ["/HIRO/COPYCAT.PAK"]),
                         ["the packs are not the base's: /HIRO/COPYCAT.PAK"])
        self.assertEqual(slot_problems(self.base, levels[:2], BASE_PACKS), ["2 slots, not the base's 3"])
        self.assertEqual(slot_problems(self.base, [levels[1], levels[0], levels[2]], BASE_PACKS),
                         ["/HIRO/HIRO.PAK#1, LEVEL 2, stands where the base has /HIRO/HIRO.PAK#0, LEVEL 1"])
        self.assertEqual(slot_problems(self.base, [levels[0], levels[1], {**levels[2], "shown": "FINAL 2"}], BASE_PACKS),
                         ["/HIRO/HIROFI.PAK#0, FINAL 2, stands where the base has /HIRO/HIROFI.PAK#0, FINAL 1"])

    def test_the_file_keys_the_identity_the_rules_the_layout_the_art_the_objects_and_the_levels_in_order(self):
        art = {"quads": {}, "sheets": {}, "tint": {}}
        models = {"readings": {}, "types": {}, "jump": {}}
        data = release_json("eu", {"hz": 50}, {"room": {}, "packs": []}, art, models, {"/HIRO/HIRO.PAK#0": {}})
        self.assertEqual(list(data), ["id", *IDENTITY, "rules", "packs", "art", "objects", "levels"])
        self.assertEqual(data["id"], "eu")
        self.assertEqual({k: data[k] for k in IDENTITY}, {k: RELEASES["eu"][k] for k in IDENTITY})
        self.assertEqual((data["rules"], data["packs"], data["art"], data["objects"], data["levels"]),
                         ({"hz": 50}, {"room": {}, "packs": []}, art, models, {"/HIRO/HIRO.PAK#0": {}}))


COPYCAT = "/HIRO/COPYCAT.PAK"
ROOMS = [level(COPYCAT, i, theme=t) for i, t in enumerate(("HIRO", "INCA", "MARS"))]


class TheRooms(unittest.TestCase):
    def setUp(self):
        self.base = {slot(l): l for l in BASE_LEVELS + ROOMS[::-1]}

    def test_without_a_map_the_committed_rooms_say_the_world_each_is_played_in_and_the_executable_is_not_read(self):
        with mock.patch("kula_build.copycat_worlds") as read:
            self.assertEqual(rooms_of(SimpleNamespace(map=None), self.base, COPYCAT), ["HIRO", "INCA", "MARS"])
        read.assert_not_called()

    def test_with_a_map_the_executables_worlds_come_back_where_the_committed_rooms_are_played_in_them(self):
        code = SimpleNamespace(map={})
        with mock.patch("kula_build.copycat_worlds", return_value=["HIRO", "INCA", "MARS"]) as read:
            self.assertEqual(rooms_of(code, self.base, COPYCAT), ["HIRO", "INCA", "MARS"])
        read.assert_called_once_with(code)

    def test_a_room_played_in_another_world_than_the_committed_one_stops_the_build_naming_both_lists(self):
        with mock.patch("kula_build.copycat_worlds", return_value=["HIRO", "HELL", "MARS"]):
            with self.assertRaises(SystemExit) as stop:
                rooms_of(SimpleNamespace(map={}), self.base, COPYCAT)
        self.assertIn("HIRO, HELL, MARS", str(stop.exception))
        self.assertIn("HIRO, INCA, MARS", str(stop.exception))


SHADE = [1, 0, 2, 0, 2, 0]    # the top face alone in its shade
STONES = [[0], [1]]
US_WORLDS = worlds(A=PALETTES, B=PALETTES)
ATLASES = atlases(US_WORLDS)


def skins_for(blobs):
    """The skins the build reads a tint with, as the committed table carries them: the arcade
    stones, the shade each face wears and each world's tint, the mean of its own stones."""
    return {"sets": {"arcade": {"stone": STONES}}, "shade": {w: SHADE for w in blobs},
            "tint": {w: tint(b, STONES, SHADE) for w, b in blobs.items()}}


class TheArt(unittest.TestCase):
    def test_the_base_records_a_digest_a_world_and_no_sheet_or_tint_of_its_own(self):
        self.assertEqual(base_art(US_WORLDS),
                         {"quads": {w: digest(b) for w, b in US_WORLDS.items()}, "sheets": {}, "tint": {}})

    def test_a_tint_is_the_mean_of_the_stones_first_quads_in_the_top_faces_shade(self):
        blob = US_WORLDS["A"]
        self.assertEqual(tint(blob, STONES, SHADE), mean(blob, [0, 1], SHADE[FACE.index("-z")]))
        self.assertNotEqual(tint(blob, STONES, SHADE), tint(blob, STONES, [0] * len(SHADE)))

    def test_a_world_with_another_model_table_or_other_quads_than_the_base_stops_the_build_naming_it(self):
        theirs = {"A": tgi_blob(textures=2, models=((0, 1),)), "B": tgi_blob(textures=2)}
        with self.assertRaises(SystemExit) as stop:
            release_art("eu", theirs, skins_for(US_WORLDS), base_art(US_WORLDS)["quads"], ATLASES)
        self.assertIn("A", str(stop.exception))
        self.assertNotIn("B", str(stop.exception))

    def test_the_sheets_are_named_a_world_in_drawing_order_as_paths_under_public(self):
        theirs = worlds(A=BOTH, B=BRIGHT)
        art, pixels = release_art("eu", theirs, skins_for(US_WORLDS), base_art(US_WORLDS)["quads"], ATLASES)
        self.assertEqual(art["quads"], base_art(US_WORLDS)["quads"])
        self.assertEqual(art["sheets"], {"A": [f"tex/eu/{SHARED}.png", "tex/eu/A.png"], "B": [f"tex/eu/{SHARED}.png"]})
        self.assertEqual(set(pixels), {SHARED, "A"})

    def test_a_world_whose_every_cell_is_the_bases_has_no_sheet(self):
        theirs = worlds(A=BRIGHT, B=PALETTES)
        art, pixels = release_art("jp", theirs, skins_for(US_WORLDS), base_art(US_WORLDS)["quads"], ATLASES)
        self.assertEqual(art["sheets"], {"A": ["tex/jp/A.png"]})
        self.assertEqual(list(pixels), ["A"])

    def test_the_tint_is_recorded_for_the_worlds_whose_stones_do_not_average_to_the_bases_colour(self):
        theirs = worlds(A=BOTH, B=BRIGHT)
        art, _ = release_art("jp", theirs, skins_for(US_WORLDS), base_art(US_WORLDS)["quads"], ATLASES)
        self.assertEqual(art["tint"], {"A": tint(theirs["A"], STONES, SHADE)})
        self.assertNotEqual(art["tint"]["A"], tint(US_WORLDS["A"], STONES, SHADE))


class TheObjects(unittest.TestCase):
    def test_the_base_records_the_readings_the_meshes_are_read_with_and_no_model_arc_motion_or_skins_of_its_own(self):
        self.assertEqual(mesh_readings({**READINGS, "coin.bob": 3}), READINGS)
        self.assertEqual(base_objects(READINGS), {"readings": READINGS, "types": {}, "jump": {}, "motion": {}, "skins": {}})

    def test_a_reading_the_executable_has_no_instruction_for_is_recorded_as_none(self):
        self.assertEqual(mesh_readings(Readings({**READINGS, "jump.skip": None})), {**READINGS, "jump.skip": None})

    def test_another_release_carries_the_readings_beside_the_types_and_the_arc_its_file_changes(self):
        base, sheet = committed(ggi(), set(PLACED))
        rows = [[0, 0, -48], [61, 0, -96], [117, 0, -144]]
        g = ggi(types={7: EXITS, 28: [quad(5, dz=40)]}, arc=(4, rows))
        out = release_objects(g, base, READINGS, sheet)
        self.assertEqual(list(out), ["readings", "types", "jump", "motion", "skins"])
        self.assertEqual(out["readings"], READINGS)
        self.assertEqual(list(out["types"]), ["28"])
        self.assertNotEqual(out["types"]["28"], base["types"]["28"])
        self.assertEqual(out["jump"], {"count": 4, "rows": rows})
        self.assertEqual(release_objects(ggi(), base, READINGS, sheet),
                         {"readings": READINGS, "types": {}, "jump": {}, "motion": {}, "skins": {}})

    def test_the_motion_and_the_skins_its_executable_changes_come_after_the_arc_as_given(self):
        base, sheet = committed(ggi(), set(PLACED))
        out = release_objects(ggi(), base, READINGS, sheet, motion={"hz": 50, "kinds": {"5": {"dwell": 40}}},
                              skins={"hides": {"other": []}})
        self.assertEqual(list(out), ["readings", "types", "jump", "motion", "skins"])
        self.assertEqual((out["motion"], out["skins"]), ({"hz": 50, "kinds": {"5": {"dwell": 40}}}, {"hides": {"other": []}}))

    def test_the_file_lays_each_model_and_each_entry_of_the_tables_on_a_line_of_its_own_and_reads_back_the_same(self):
        base, sheet = committed(ggi(), set(PLACED))
        g = ggi(types={7: [quad(7, dz=40), quad(9, dz=40)], 28: [ARROW]})
        motion = {"hz": 50, "play": {"clock": {"second": 50}, "wait": {"fire": 21}},
                  "types": {"30": {"breathe": {"full": 5000}}, "32": {"lasts": {"word": 300}}}, "kinds": {"5": {"dwell": 40}}}
        skins = {"hides": {"other": [1, 2]}}
        data = release_json("eu", {"hz": 50}, {"packs": []}, {},
                            release_objects(g, base, READINGS, sheet, motion=motion, skins=skins), {})
        text = laid_out(data)
        self.assertEqual(json.loads(text), data)
        lines = [line.strip().rstrip(",") for line in text.splitlines()]
        for m in data["objects"]["types"]["7"]:
            self.assertIn(json.dumps(m, separators=(",", ":")), lines)
        self.assertEqual(sum(line.startswith('{"box":') for line in lines), 2)
        for key, value in (("hz", 50), ("play", motion["play"]), ("30", motion["types"]["30"]), ("32", motion["types"]["32"]),
                           ("5", motion["kinds"]["5"]), ("hides", skins["hides"])):
            self.assertIn(f'"{key}": ' + json.dumps(value, separators=(",", ":")), lines)
        self.assertNotIn("\0", text)


MOTION = {"hz": 60, "turn": 4096, "play": {"clock": {"tick": 1, "second": 50}, "wait": {"fire": 25}},
          "types": {"30": {"breathe": {"full": 6000, "tick": 50}}, "32": {"turn": 20, "lasts": {"word": 360}},
                    "35": {"turn": -16, "take": {"points": 10, "clock": {"from": 5999, "second": 50}}}},
          "kinds": {"5": {"speed": 25, "dwell": 48}, "7": {"cycle": [[1, 2]]}}}
SKINS = {"textures": 56, "shade": {"A": [1, 0]}, "turn": {"A": 2}, "light": {"A": [[1, 2, 3]]},
         "tint": {"A": [1, 2, 3], "B": [4, 5, 6]}, "hides": {"other": [1]}, "cycles": {"fire": [1, 2]}}
RULES = {"hz": 60, "clock": {"fill": 50}, "hourglass": {"from": 5999, "second": 50, "points": 10}}


def changed(table, *changes):
    """A copy of the table with each value set at its dotted path."""
    out = json.loads(json.dumps(table))
    for path, value in changes:
        *keys, last = path.split(".")
        node = out
        for k in keys:
            node = node[k]
        node[last] = value
    return out


class TheTables(unittest.TestCase):
    def test_the_overlay_writes_a_key_whole_where_it_differs_and_a_type_or_a_kind_whole_where_any_value_in_it_does(self):
        theirs = changed(MOTION, ("hz", 50), ("types.32.lasts.word", 300), ("kinds.5.dwell", 40))
        self.assertEqual(motion_overlay(theirs, MOTION),
                         {"hz": 50, "types": {"32": {"turn": 20, "lasts": {"word": 300}}}, "kinds": {"5": {"speed": 25, "dwell": 40}}})
        self.assertEqual(motion_overlay(changed(MOTION, ("play.wait.fire", 21)), MOTION),
                         {"play": {"clock": {"tick": 1, "second": 50}, "wait": {"fire": 21}}})
        self.assertEqual(motion_overlay(changed(MOTION), MOTION), {})

    def test_a_table_lacking_an_entry_of_the_bases_or_keyed_otherwise_stops_the_build_naming_what_is_apart(self):
        theirs = changed(MOTION)
        del theirs["kinds"]["7"]
        with self.assertRaises(SystemExit) as stop:
            motion_overlay(theirs, MOTION)
        self.assertIn("kinds lack 7", str(stop.exception))
        theirs = changed(MOTION, ("glow", {}))
        with self.assertRaises(SystemExit) as stop:
            motion_overlay(theirs, MOTION)
        self.assertIn("glow", str(stop.exception))

    def test_the_skins_overlay_writes_a_key_whole_and_refuses_one_the_artwork_gives(self):
        self.assertEqual(skins_overlay(changed(SKINS, ("hides.other", [1, 2])), SKINS), {"hides": {"other": [1, 2]}})
        self.assertEqual(skins_overlay(changed(SKINS), SKINS), {})
        for path, value in (("textures", 57), ("shade.A", [0, 0]), ("turn.A", 3), ("light.A", [[3, 2, 1]])):
            with self.subTest(key=path):
                with self.assertRaises(SystemExit) as stop:
                    skins_overlay(changed(SKINS, (path, value)), SKINS)
                self.assertIn(path.split(".")[0], str(stop.exception))

    def test_a_worlds_tint_is_left_to_the_artwork_entry_where_that_names_the_world_and_refused_where_it_does_not(self):
        theirs = changed(SKINS, ("tint.A", [3, 2, 1]), ("hides.other", [1, 2]))
        self.assertEqual(skins_overlay(theirs, SKINS, ["A"]), {"hides": {"other": [1, 2]}})
        self.assertEqual(skins_overlay(changed(SKINS, ("tint.A", [3, 2, 1])), SKINS, ["A", "B"]), {})
        with self.assertRaises(SystemExit) as stop:
            skins_overlay(theirs, SKINS, ["B"])
        self.assertIn("tint A", str(stop.exception))
        self.assertNotIn("B", str(stop.exception))

    def test_the_table_and_the_rules_have_to_agree_where_both_readers_read_the_same_instructions_a_null_with_a_null(self):
        hold_to_rules(MOTION, RULES)
        nulls = changed(MOTION, ("types.35.take.points", None), ("types.35.take.clock.second", None))
        hold_to_rules(nulls, changed(RULES, ("hourglass.second", None), ("hourglass.points", None)))
        for table, rules, what in ((changed(MOTION, ("hz", 50)), RULES, "frames a second as 50, where the rules read 60"),
                                   (MOTION, changed(RULES, ("clock.fill", 60)), "the clock's ticks a second"),
                                   (changed(MOTION, ("types.35.take.clock.from", 4999)), RULES, "the hourglass's count"),
                                   (nulls, RULES, "the hourglass's seconds as null"),
                                   (MOTION, changed(RULES, ("hourglass.points", None)), "the hourglass's points as 10")):
            with self.subTest(what=what):
                with self.assertRaises(SystemExit) as stop:
                    hold_to_rules(table, rules)
                self.assertIn(what, str(stop.exception))


class ReleaseFile:
    """A release's committed file held to what the build writes for its disc."""
    release = None

    @classmethod
    def setUpClass(cls):
        cls.disc = open_release(cls.release)
        cls.text = RELEASE_FILES[cls.release].read_text()
        cls.data = json.loads(cls.text)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def written(self):
        if self.release == BASE:
            code = code_of(self.disc, BASE)
            return release_json(BASE, rules_of(code, BASE), layout_of(self.disc), base_art(tgis_of(self.disc)),
                                base_objects(mesh_readings(readings(code))), {})
        return other_release(self.disc, self.release)[0]

    def test_the_committed_file_is_what_the_build_writes(self):
        self.assertEqual(self.text, laid_out(self.written()))

    def test_the_file_names_its_release_and_holds_its_discs_layout(self):
        entry = RELEASES[self.release]
        self.assertEqual([self.data["id"], *(self.data[k] for k in IDENTITY)], [self.release, *(entry[k] for k in IDENTITY)])
        self.assertEqual(self.data["packs"], packs_json(self.disc))

    def test_every_sheet_the_file_names_stands_at_the_atlass_size_and_nothing_else_lies_beside_it(self):
        sizes = {}

        def size(path):
            if path not in sizes:
                sizes[path] = read_png(path)[:2]
            return sizes[path]

        named = set()
        for world, paths in self.data["art"]["sheets"].items():
            for p in paths:
                named.add(PUBLIC / p)
                self.assertTrue((PUBLIC / p).is_file(), p)
                self.assertEqual(size(PUBLIC / p), size(TEX / f"{world}.png"), p)
        folder = TEX / self.release
        self.assertEqual(set(folder.glob("*.png")) if folder.is_dir() else set(), named)


@unittest.skipUnless(os.environ.get(DISC_VARS["us"]), f"needs the disc under ${DISC_VARS['us']}")
class TheBaseFile(ReleaseFile, unittest.TestCase):
    release = "us"

    def test_the_base_has_no_variant_no_sheet_no_tint_and_no_model_of_its_own_and_its_layout_is_the_packs_file(self):
        self.assertEqual(self.data["levels"], {})
        self.assertEqual((self.data["art"]["sheets"], self.data["art"]["tint"]), ({}, {}))
        self.assertEqual((self.data["objects"]["types"], self.data["objects"]["jump"]), ({}, {}))
        self.assertEqual((self.data["objects"]["motion"], self.data["objects"]["skins"]), ({}, {}))
        self.assertEqual(json.dumps(self.data["packs"], indent=1), PACKS.read_text())


@unittest.skipUnless(os.environ.get(DISC_VARS["eu"]), f"needs the PAL disc under ${DISC_VARS['eu']}")
class ThePalFile(ReleaseFile, unittest.TestCase):
    release = "eu"


@unittest.skipUnless(os.environ.get(DISC_VARS["jp"]), f"needs the Japanese disc under ${DISC_VARS['jp']}")
class TheJapaneseFile(ReleaseFile, unittest.TestCase):
    release = "jp"


if __name__ == "__main__":
    unittest.main()
