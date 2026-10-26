"""Unit tests for the level writer's disc check: python3 -m unittest discover -s tools/tests

The disc classes at the end need one, the figures' class the disc under $KULA_DISC and
the rebuild's classes each release's own, every one skipped without its variable.
"""

import json
import os
import re
import struct
import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import DISC_VARS, EXE, RELEASES, open_disc, open_release, packs  # noqa: E402
from kula_kwl import (  # noqa: E402
    BARE,
    CAPS,
    CAPTIVATORS,
    CRUMBLING_KIND,
    DATA,
    EXIT,
    HIDDEN_EXIT,
    INNER,
    KEY,
    LENGTH_CAP,
    MOVING_SPIKES,
    NUMBERED,
    PLAIN_ONLY,
    START,
    canonical,
    project_of_level,
)
from kula_kwl_check import (  # noqa: E402
    DROPPED,
    F5_LEVELS,
    NO_TRAILER,
    RESIDUALS,
    UNFLAGGED,
    UNTRACED,
    check,
    compare,
    diff_words,
    executable,
    figure_failures,
    residuals,
    slot_figures,
    stripped,
    trio_failures,
)
from kula_level import (  # noqa: E402
    BLOCK_KINDS,
    FACES,
    FIRST_RECORD,
    GRID_BYTES,
    LASER_KIND,
    PLATFORM_KIND,
    SPANS,
    UNPLACED_KIND,
    Level,
)
from kula_pak import Pak  # noqa: E402
from test_kula_kwl import WORLD, obj, plain, playground, project, start  # noqa: E402
from test_kula_level import block, level, untrailed  # noqa: E402

EDITOR_DOC = Path(__file__).resolve().parents[2] / "docs" / "editor.md"
FORMAT_DOC = Path(__file__).resolve().parents[2] / "docs" / "level-format.md"
ANNOTATIONS_DOC = Path(__file__).resolve().parents[2] / "docs" / "annotations.md"
BARE_FACES = re.compile(r"the form the disc holds on ([\d,]+) of its empty faces")
UNSET_SLOTS = re.compile(r"(\d+) to (\d+) of its (\d+) platforms, (\d+) to (\d+) of its (\d+) crumbling blocks, "
                         r"(\d+) to (\d+) of its (\d+) vanishing blocks and (\d+) to (\d+) of its (\d+) lasers by slot")
NUMBERED_LEVELS = re.compile(r"numbers its pickups as the writer does on all (\d+) levels that number them")
NUMBER_RUNS = re.compile(r"runs 0 to n-1 with no repeats on (\d+) of the (\d+) levels that have any\. "
                         r"The (\w+) with a repeat are ((?:[A-Z]+ \d+, )*[A-Z]+ \d+ and [A-Z]+ \d+),")
LEFT_OBJECTS = re.compile(r"The disc keeps (\d+) objects on the other slots of those four kinds, on (\d+) levels, "
                          r"and they read as what an editor leaves behind: (\d+) are a fire or a type 4 alone")
EXITS_KEPT = re.compile(r"the disc keeps a second on (\w+) of them and a third on one of those, ([A-Z]+ \d+), "
                        r"on records the game never walks")
HIDDEN_KEPT = re.compile(r"the disc keeps a second on (\w+) of them, ([A-Z]+ \d+) and ([A-Z]+ \d+), "
                         r"on records the game never walks")
KEYS_ON_DISC = re.compile(r"One to (\w+) a level on the disc: (\d+) levels with one, (\d+) with two, (\d+) with three, "
                          r"(\w+) with four, (\w+) with five and (\w+) with six\.")
KEYS_KEPT = re.compile(r"([A-Z]+ \d+)'s fifth key stands on its settings record and (\w+) of ([A-Z]+ \d+)'s keys on "
                       r"crumbling blocks, records the game never walks")
SLOT_SENTENCES = {EDITOR_DOC: (BARE_FACES, UNSET_SLOTS, NUMBERED_LEVELS), FORMAT_DOC: (NUMBER_RUNS, LEFT_OBJECTS),
                  ANNOTATIONS_DOC: (EXITS_KEPT, HIDDEN_KEPT, KEYS_ON_DISC, KEYS_KEPT)}
WORDS = {w: n for n, w in enumerate("nought one two three four five six seven eight nine ten".split())}


def titles():
    """The map's title for each shipped level, by its pack and index."""
    return {(l["pack"], l["index"]): l.get("shown", l["name"]) for l in json.loads(DATA.read_text())["levels"]}


def held_by_record(disc, types):
    """Per level, by its pack and index, how many things of each type stand on the
    records of each kind."""
    out = {}
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            held = Counter()
            for r in Level(pak.level(i), pak.name(i), theme).records:
                for s in r.slots[0 if r.kind < BLOCK_KINDS else 2 if r.kind in SPANS else 1:]:
                    if s[1] in types:
                        held[s[1], r.kind] += 1
            out[path, i] = held
    return out


def held_of(held, typ, walked=None):
    """How many things of a type a level holds, or only those on the records the game
    walks, or only those on the others."""
    return sum(n for (t, kind), n in held.items() if t == typ and walked in (None, kind < BLOCK_KINDS))


class TheCompare(unittest.TestCase):
    def test_a_record_dropped_whole_is_a_failure_and_not_a_count(self):
        L = Level(canonical(project_of_level(Level(playground()), world=WORLD)))
        p = project_of_level(L, world=WORLD)
        self.assertEqual(compare(L, Level(canonical(p))), [])
        gone = dict(p, blocks=[b for b in p["blocks"] if b["cell"] != [12, 14, 17]] + [{"cell": [12, 14, 17], "kind": 0}])
        self.assertIn("the records differ by cell and kind", compare(L, Level(canonical(gone))))
        self.assertIn("the blocks differ", compare(L, Level(canonical(dict(p, blocks=p["blocks"][1:])))))
        phased = json.loads(json.dumps(p))
        next(b for b in phased["blocks"] if b["kind"] == 7)["phase"] = 3
        self.assertIn("the phase at (10, 14, 17) differs", compare(L, Level(canonical(phased))))
        self.assertEqual(residuals(Counter(RESIDUALS["us"]), Counter(DROPPED["us"]), "us"), [])
        self.assertEqual(residuals(Counter(RESIDUALS["us"]) + Counter({"kind 7 slot 0 f3": 2}), Counter(DROPPED["us"]), "us"),
                         ["2 x kind 7 slot 0 f3, where the table lists 0"])

    def test_the_type_of_a_vanishing_blocks_other_slots_is_held_to_the_disc_and_their_other_words_are_not(self):
        C = Level(canonical(project([plain((5, 5, 5), f0=start()), {"cell": [6, 5, 5], "kind": 7, "phase": 0}])))
        blob = bytearray(C.blob)
        for w, v in ((1, 9), (17, 1), (18, 5), (49, 0), (95, 2)):
            struct.pack_into("<h", blob, GRID_BYTES + 6 + 256 + 2 * w, v)
        classes = Counter()
        diff_words(Level(bytes(blob)), C, classes, {}, "us")
        self.assertEqual(dict(classes), {"kind 7 slot 1 type": 1, "kind 7 slot 3 type": 1})

    def test_the_per_type_constants_are_held_to_the_mode_of_the_discs_objects(self):
        self.assertEqual(trio_failures({31: Counter({(386, 1, -100): 70, (0, 0, 0): 2})}), [])
        self.assertEqual(trio_failures({31: Counter({(386, 1, -100): 2, (0, 0, 0): 3})}),
                         ["type 31 carries (0, 0, 0) on 3 of 5 objects, where the writer holds (386, 1, -100)"])
        self.assertEqual(trio_failures({53: Counter({(-1, -1, -1): 4})}), [])

    def test_the_stripping_names_what_the_rebuild_leaves_out(self):
        kept, gone = stripped(Level(playground()))
        self.assertEqual((len(kept), dict(gone)), (8, {}))
        flagless = level({(5, 5, 5): FIRST_RECORD, (6, 5, 5): FIRST_RECORD + 1},
                         [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), block((6, 5, 5)),
                          block((0, 0, 0), kind=UNPLACED_KIND)])
        kept, gone = stripped(Level(flagless))
        self.assertEqual(len(kept), 1)
        self.assertEqual(dict(gone), {"settings records with no flag set": 1, "records carrying nothing": 1})

    def test_a_level_with_no_trailer_is_compared_on_its_records_and_counted_under_the_trailer_class(self):
        faces = {0: obj(START, 3, 0, 0), **{j: list(BARE) for j in range(1, FACES)}}
        L = Level(untrailed({(5, 5, 5): FIRST_RECORD}, [block((5, 5, 5), faces=faces)]), "BONUS 30")
        C = Level(canonical(project_of_level(L, world=WORLD)))
        self.assertEqual((L.trailer, C.trailer.f[4], compare(L, C)), (None, 99, []))
        classes = Counter()
        diff_words(L, C, classes, {}, "eu")
        self.assertEqual(dict(classes), {})
        self.assertEqual(dict(stripped(L)[1]), {NO_TRAILER: 1})


class TheTables(unittest.TestCase):
    def test_every_table_names_the_three_releases_and_the_japanese_tables_are_the_us_tables(self):
        for table in (RESIDUALS, DROPPED, F5_LEVELS):
            self.assertEqual(list(table), list(RELEASES))
            self.assertEqual(table["jp"], table["us"])

    def test_the_pal_tables_move_three_counts_add_the_trailer_class_and_mask_no_level(self):
        self.assertEqual(set(RESIDUALS["eu"]), set(RESIDUALS["us"]))
        self.assertEqual({what for what in RESIDUALS["us"] if RESIDUALS["eu"][what] != RESIDUALS["us"][what]},
                         {"kind 0..4 object type 8 f2", "kind 7 slot 1 type"})
        self.assertEqual({what for what in DROPPED["us"] if DROPPED["eu"][what] != DROPPED["us"][what]}, {UNFLAGGED})
        self.assertEqual(set(DROPPED["eu"]) - set(DROPPED["us"]), {NO_TRAILER})
        self.assertEqual(F5_LEVELS["eu"], frozenset())

    def test_the_residuals_are_read_against_the_release_named(self):
        for release in RELEASES:
            with self.subTest(release):
                self.assertEqual(residuals(Counter(RESIDUALS[release]), Counter(DROPPED[release]), release), [])
        moved = residuals(Counter(RESIDUALS["us"]), Counter(DROPPED["us"]), "eu")
        self.assertEqual([line.split(", where")[0] for line in moved],
                         [f"{RESIDUALS['us'][what]} x {what}" for what in ("kind 0..4 object type 8 f2", "kind 7 slot 1 type")]
                         + [f"0 levels with {NO_TRAILER}", f"{DROPPED['us'][UNFLAGGED]} levels with {UNFLAGGED}"])


class TheDocuments(unittest.TestCase):
    def test_the_sentences_the_disc_test_reads_still_match_its_patterns_without_the_disc(self):
        for doc, patterns in SLOT_SENTENCES.items():
            text = doc.read_text()
            for pattern in patterns:
                with self.subTest((doc.name, pattern.pattern)):
                    self.assertIsNotNone(pattern.search(text), f"{doc.name} has no sentence matching {pattern.pattern}")


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc")
class TheDisc(unittest.TestCase):
    def test_the_caps_and_the_loader_figures_are_the_executables_own(self):
        from kula_motion_code import Code
        with open_disc() as disc:
            r = executable(Code(disc.read_file(EXE)))
        for what in ("records", "faces", "lights", "spikes", "captivators", "crumbling", "vanishing", "objects"):
            self.assertEqual(CAPS[what], r[what], what)
        self.assertEqual(set(CAPS) - set(r), set(UNTRACED))
        self.assertEqual(LENGTH_CAP, r["platform.length"])
        self.assertEqual(MOVING_SPIKES, r["spikes.type"])
        self.assertEqual(PLAIN_ONLY - {MOVING_SPIKES}, r["glow.types"])
        self.assertEqual((KEY, BLOCK_KINDS), (r["key.type"], r["block.kinds"]))
        self.assertEqual((r["numbered.from"], r["numbered.from"] + r["numbered.count"]), (min(NUMBERED), max(NUMBERED) + 1))
        self.assertEqual(INNER, range(r["inner.from"], r["inner.below"]))
        self.assertEqual(min(CAPTIVATORS), r["captivators.from"])
        self.assertEqual(figure_failures(r), [])

    def test_the_documents_slot_figures_are_the_discs(self):
        with open_disc() as disc:
            f = slot_figures(disc)
        doc = EDITOR_DOC.read_text()
        bare = BARE_FACES.search(doc)
        self.assertEqual(int(bare.group(1).replace(",", "")), f["bare"])
        unset = UNSET_SLOTS.search(doc)
        self.assertEqual([int(g) for g in unset.groups()],
                         [*f["unset"][PLATFORM_KIND], *f["unset"][6], *f["unset"][7], *f["unset"][LASER_KIND]])
        numbered = NUMBERED_LEVELS.search(doc)
        self.assertEqual((int(numbered.group(1)), f["ordered"]), (f["numbered"], f["numbered"]))
        repeats = sorted(titles()[k] for k in f["repeats"])
        self.assertEqual(repeats, ["BONUS 16", "FINAL 11", "FINAL 13", "LEVEL 134", "LEVEL 94"])
        runs = NUMBER_RUNS.search(FORMAT_DOC.read_text())
        self.assertEqual((int(runs.group(1)), int(runs.group(2))), (f["numbered"] - len(f["repeats"]), f["numbered"]))
        self.assertEqual(runs.group(3), "five")
        self.assertEqual(sorted(runs.group(4).replace(" and ", ", ").split(", ")), repeats)
        left = LEFT_OBJECTS.search(FORMAT_DOC.read_text())
        self.assertEqual(tuple(int(g) for g in left.groups()), f["left"])

    def test_annotations_counts_of_what_the_disc_keeps_on_records_never_walked_are_the_discs(self):
        title = titles()
        with open_disc() as disc:
            held = held_by_record(disc, (EXIT, HIDDEN_EXIT, KEY))
        doc = ANNOTATIONS_DOC.read_text()

        def at_least(typ, n):
            return sorted(title[k] for k, c in held.items() if held_of(c, typ) >= n)

        for typ in (EXIT, HIDDEN_EXIT):
            self.assertEqual([k for k, c in held.items() if held_of(c, typ, walked=True) > 1], [], typ)
        exits = EXITS_KEPT.search(doc)
        self.assertEqual((WORDS[exits.group(1)], [exits.group(2)]), (len(at_least(EXIT, 2)), at_least(EXIT, 3)))
        hidden = HIDDEN_KEPT.search(doc)
        self.assertEqual((WORDS[hidden.group(1)], sorted(hidden.group(2, 3))),
                         (len(at_least(HIDDEN_EXIT, 2)), at_least(HIDDEN_EXIT, 2)))
        tally = KEYS_ON_DISC.search(doc)
        keys = Counter(held_of(c, KEY) for c in held.values() if held_of(c, KEY))
        self.assertEqual([WORDS.get(g) or int(g) for g in tally.groups()], [max(keys), *(keys[n] for n in range(1, 7))])
        kept = KEYS_KEPT.search(doc)
        self.assertEqual({title[k]: {kind: n for (t, kind), n in c.items() if t == KEY and kind >= BLOCK_KINDS}
                          for k, c in held.items() if held_of(c, KEY, walked=False)},
                         {kept.group(1): {UNPLACED_KIND: 1}, kept.group(3): {CRUMBLING_KIND: WORDS[kept.group(2)]}})


class Rebuilt:
    """Every level of a release's disc rebuilt and held to the disc and to the release's tables."""
    release = None

    @classmethod
    def setUpClass(cls):
        cls.disc = open_release(cls.release)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def test_every_level_rebuilt_plays_as_the_disc_and_differs_in_the_words_listed_alone(self):
        failures, classes, dropped = check(self.disc, self.release, out=lambda *_: None)
        self.assertEqual(failures, [])
        self.assertEqual(dict(classes), RESIDUALS[self.release])
        self.assertEqual(dict(dropped), DROPPED[self.release])
        self.assertEqual(residuals(classes, dropped, self.release), [])


@unittest.skipUnless(os.environ.get(DISC_VARS["us"]), f"needs the disc under ${DISC_VARS['us']}")
class TheDiscRebuilt(Rebuilt, unittest.TestCase):
    release = "us"


@unittest.skipUnless(os.environ.get(DISC_VARS["eu"]), f"needs the PAL disc under ${DISC_VARS['eu']}")
class ThePalDiscRebuilt(Rebuilt, unittest.TestCase):
    release = "eu"


@unittest.skipUnless(os.environ.get(DISC_VARS["jp"]), f"needs the Japanese disc under ${DISC_VARS['jp']}")
class TheJapaneseDiscRebuilt(Rebuilt, unittest.TestCase):
    release = "jp"


if __name__ == "__main__":
    unittest.main()
