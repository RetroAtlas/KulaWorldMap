"""Unit tests for the aligner: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from align_fixture import ANCHORS, ORDER, anchors_of, base, broken, recast, renamed, reworked, shifted, twins  # noqa: E402
from kula_align import (LISTS, MODULES, TIERS, VOTING, Anchor, Left, align, anchors, loose, pair_by_votes,  # noqa: E402
                        report, shape, show, windows)

US = base()
ROWS = anchors_of(US)
DISTINCT = 3437       # the addresses the readers' lists hold between them


def placed(copy):
    """Every anchor's tier, address and text on the copy, by key, and the anchors left."""
    placements, left = align(US.listing, copy.listing, ROWS)
    return {a.key: placements[a.address] for a in ROWS if a.address in placements}, left


class Shapes(unittest.TestCase):
    def test_a_shape_drops_the_numbers_and_keeps_the_registers_and_a_loose_shape_drops_both(self):
        for text, strict, both in (("addiu $v0, $zero, 300", "addiu $v0, $zero, #", "addiu $, $, #"),
                                   ("lw $v0, -17288($at)", "lw $v0, #($at)", "lw $, #($)"),
                                   ("jal 0x80052ab8", "jal #", "jal #"),
                                   ("beq $t1, $zero, 0x80051d10", "beq $t1, $zero, #", "beq $, $, #"),
                                   ("sll $v0, $v0, 2", "sll $v0, $v0, #", "sll $, $, #"),
                                   ("lui $v0, 0x8888", "lui $v0, #", "lui $, #"),
                                   ("mfc2 $t7, sxy0", "mfc2 $t7, sxy0", "mfc2 $, sxy0"),
                                   ("add $t7, $zero, $v0", "add $t7, $zero, $v0", "add $, $, $"),
                                   ("ctc2 $a2, bfc", "ctc2 $a2, bfc", "ctc2 $, bfc"), ("cc", "cc", "cc"),
                                   ("jr $ra", "jr $ra", "jr $"), ("nop", "nop", "nop"), ("rtps", "rtps", "rtps")):
            with self.subTest(text):
                self.assertEqual((shape(text), loose(text)), (strict, both))

    def test_a_word_that_does_not_decode_is_its_own_shape(self):
        self.assertEqual(shape(".word 0x1234abcd"), ".word 0x1234abcd")
        self.assertEqual(loose(".word 0x1234abcd"), ".word 0x1234abcd")


class Windows(unittest.TestCase):
    def test_the_window_places_every_anchor_of_the_shifted_copy_at_a_strict_tier(self):
        copy = shifted()
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        for anchor in ROWS:
            with self.subTest(anchor.key):
                at, tier, text = tiers[anchor.key]
                self.assertTrue(tier.startswith("strict"), tier)
                self.assertEqual(at, copy.places[anchor.key])
                self.assertEqual(shape(text), US.listing.shape[US.listing.position(anchor.address)])
        self.assertEqual(tiers["pill.lethargy"].text, "addiu $v0, $zero, 360")
        self.assertEqual({tiers[key].tier for key in ("twin.count", "pill.invincible", "clock.shown.hi")},
                         {"strict10", "strict5", "strict3"})

    def test_an_anchor_whose_window_a_put_in_word_breaks_is_placed_by_the_pairs_offset_or_the_alignment_and_says_so(self):
        copy = broken()
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        by_tier = {"offset": {"the pill tests its word", "pill.invincible"},
                   "aligned": {"clock.shown.sa", "clock.plus", "clock.grey.hi", "clock.grey.lo"}}
        for anchor in ROWS:
            with self.subTest(anchor.key):
                at, tier, text = tiers[anchor.key]
                self.assertEqual(tier, next((t for t, keys in by_tier.items() if anchor.key in keys), tier))
                self.assertTrue(tier in by_tier or tier.startswith("strict"), tier)
                self.assertEqual(at, copy.places[anchor.key])
                self.assertEqual(shape(text), US.listing.shape[US.listing.position(anchor.address)])

    def test_a_renamed_routines_anchors_are_placed_by_the_alignment_at_the_renamed_tier_with_the_releases_text(self):
        copy = renamed()
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertEqual(tiers["the spikes read their phase"], (copy.places["the spikes read their phase"], "renamed",
                                                                "lh $v0, 6($s5)"))
        self.assertEqual(tiers["and store it"], (copy.places["and store it"], "renamed", "sw $v0, 12($s5)"))
        self.assertEqual({key: tiers[key].tier for key in ("spikes.down", "and test it", "spikes.hold", "spikes.step")},
                         {"spikes.down": "offset", "and test it": "offset", "spikes.hold": "offset", "spikes.step": "strict5"})
        for routine, _, _, key in ANCHORS:
            if routine != "spikes":
                self.assertTrue(tiers[key].tier.startswith("strict"), key)
                self.assertEqual(tiers[key].at, copy.places[key])

    def test_a_renamed_routine_no_other_shadows_is_placed_by_the_loose_window_which_casts_no_vote(self):
        copy = recast()
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertEqual(tiers["twin.count"], (copy.places["twin.count"], "loose10", "addiu $v0, $zero, 7"))
        for routine, _, _, key in ANCHORS:
            if routine != "twin":
                self.assertEqual((tiers[key].tier.startswith("strict"), tiers[key].at), (True, copy.places[key]), key)
        us, other = US.listing, copy.listing
        hits = windows(us, other, sorted({us.position(a.address) for a in ROWS}))
        i = us.position(US.places["twin.count"])
        self.assertEqual(hits[i], ("loose10", other.position(copy.places["twin.count"])))
        self.assertNotIn(us.function(i)[0], pair_by_votes(us, other, hits, {}))

    def test_an_anchor_whose_instruction_is_another_on_the_copy_is_left_with_the_function_its_own_is_paired_with(self):
        copy = reworked()
        tiers, left = placed(copy)
        self.assertNotIn("pill.invincible", tiers)
        function = copy.listing.function(copy.listing.position(copy.places["pill.lethargy"]))[0]
        self.assertEqual(left, [Left(Anchor("fixture", "IMMEDIATES", "pill.invincible", US.places["pill.invincible"]),
                                     "it lies outside the aligned stretches of its pair", copy.listing.address(function))])
        self.assertEqual(copy.listing.text[copy.listing.position(copy.places["pill.invincible"])], "ori $v0, $zero, 840")
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_an_anchor_whose_window_matches_at_two_positions_is_left_and_named(self):
        copy = twins()
        tiers, left = placed(copy)
        self.assertNotIn("twin.count", tiers)
        self.assertEqual(left, [Left(Anchor("fixture", "IMMEDIATES", "twin.count", US.places["twin.count"]),
                                     "its function is unpaired, its shapes standing at 2 places", None)])
        for key, (at, tier, _) in tiers.items():
            self.assertEqual((tier.startswith("strict"), at), (True, copy.places[key]), key)

    def test_an_address_given_by_hand_is_placed_once_the_functions_are_paired_and_casts_no_vote(self):
        copy = shifted()
        us, other = US.listing, copy.listing
        hand = [Anchor("", "", "", US.starts["vanish"] + 4 * 11), Anchor("", "", "", US.starts["vanish"])]
        placements, left = align(us, other, ROWS, hand=hand)
        self.assertEqual(placements[hand[0].address], (copy.starts["vanish"] + 4 * 11, "strict10", "lh $v0, 6($s5)"))
        self.assertEqual(left, [Left(hand[1], "its function is unpaired", None)])
        self.assertEqual({a: p for a, p in placements.items() if a != hand[0].address}, align(us, other, ROWS)[0])


class Functions(unittest.TestCase):
    def test_the_functions_split_at_their_returns(self):
        listing = US.listing
        starts = [listing.position(US.starts[name]) for name in ORDER[1:] + ("tail",)]
        self.assertEqual(listing.starts, [0] + starts)
        self.assertEqual(listing.function(listing.position(US.starts["clock"]) + 5), (starts[0], starts[1]))
        self.assertEqual(listing.function(starts[-1] + 3), (starts[-1], len(listing.text)))

    def test_the_functions_pair_by_the_votes_of_the_widest_windows(self):
        copy = shifted()
        us, other = US.listing, copy.listing
        hits = windows(us, other, sorted({us.position(a.address) for a in ROWS}))
        pairs = pair_by_votes(us, other, hits, {})
        expected = {us.function(us.position(US.starts[name]))[0]: other.function(other.position(copy.starts[name]))[0]
                    for name in ORDER if name != "vanish"}
        self.assertEqual(pairs, expected)

    def test_a_function_with_split_votes_stays_unpaired_and_a_narrow_window_does_not_vote(self):
        us, other = US.listing, shifted().listing
        i = us.position(US.places["clock.plus"])
        j = other.position(shifted().places["clock.plus"])
        elsewhere = other.position(shifted().places["spikes.hold"])
        self.assertEqual(pair_by_votes(us, other, {i: (VOTING[0], j)}, {}), {us.function(i)[0]: other.function(j)[0]})
        self.assertEqual(pair_by_votes(us, other, {i: (VOTING[0], j), i + 1: (VOTING[1], elsewhere)}, {}), {})
        self.assertEqual(pair_by_votes(us, other, {i: ("strict3", j)}, {}), {})
        self.assertEqual(pair_by_votes(us, other, {i: ("loose10", j)}, {}), {})
        self.assertEqual(pair_by_votes(us, other, {i: (VOTING[0], j)}, {us.function(i)[0]: 0}), {})


class Anchors(unittest.TestCase):
    def test_the_readers_lists_hold_this_many_distinct_addresses_and_every_entry_of_every_list_is_among_them(self):
        rows = anchors()
        addresses = {a.address for a in rows}
        self.assertEqual(len(addresses), DISTINCT)
        self.assertEqual({a.module for a in rows}, {m.__name__ for m in MODULES})
        self.assertEqual({a.list for a in rows}, set(LISTS))
        for module in MODULES:
            held = [entry[0] for entry in module.CHECKS]
            held += [entry[3] for entry in getattr(module, "IMMEDIATES", ())]
            held += [entry[3] + 4 * i for entry in getattr(module, "MULTIPLIERS", ()) for i in range(entry[4])]
            held += [entry[k] for entry in getattr(module, "DIVISORS", ()) for k in (3, 5, 7)]
            held += [entry[k] for entry in getattr(module, "GREYS", ()) for k in (3, 5)]
            held += [entry[k] for entry in getattr(module, "SCANS", ()) for k in (3, 4)]
            held += [call[0] for entry in getattr(module, "SCANS", ()) for call in entry[7]]
            with self.subTest(module.__name__):
                self.assertTrue(held)
                self.assertEqual([hex(a) for a in held if a not in addresses], [])
                self.assertEqual(len([a for a in rows if a.module == module.__name__]), len(held))


class Printouts(unittest.TestCase):
    def test_the_report_counts_the_tiers_and_names_every_anchor_left_by_module_and_list(self):
        copy = twins()
        placements, left = align(US.listing, copy.listing, ROWS)
        out = io.StringIO()
        with redirect_stdout(out):
            report("eu", placements, left, ROWS)
        text = out.getvalue()
        self.assertIn(f"Kula World: {len(ROWS) - 1} of {len(ROWS)} addresses placed\n  strict10 ", text)
        self.assertEqual([tier for tier in TIERS if f"  {tier:<9}" in text], ["strict10"])
        self.assertIn("\nleft: 1 anchors at 1 addresses\n\nfixture IMMEDIATES\n  0x", text)
        self.assertIn("  twin.count: its function is unpaired, its shapes standing at 2 places\n", text)

    def test_the_report_counts_the_anchors_alone_where_an_address_given_by_hand_is_among_the_rows(self):
        copy = shifted()
        hand = [Anchor("", "", "", US.starts["vanish"] + 4 * 11), Anchor("", "", "", US.starts["vanish"])]
        texts = []
        for rows in ((), hand):
            out = io.StringIO()
            with redirect_stdout(out):
                report("eu", *align(US.listing, copy.listing, ROWS, hand=rows), ROWS)
            texts.append(out.getvalue())
        self.assertEqual(texts[0], texts[1])
        self.assertTrue(texts[0].startswith(f"Kula World: {len(ROWS)} of {len(ROWS)} addresses placed\n  strict10 "))
        self.assertTrue(texts[0].endswith("\nleft: 0 anchors at 0 addresses\n"))

    def test_the_listing_shows_the_bases_window_beside_its_place(self):
        copy = shifted()
        placements, left = align(US.listing, copy.listing, ROWS)
        address = US.places["pill.lethargy"]
        out = io.StringIO()
        with redirect_stdout(out):
            show(US.listing, copy.listing, address, ROWS, placements, left)
        lines = out.getvalue().splitlines()
        self.assertEqual(lines[0], f"0x{address:08x}, fixture IMMEDIATES pill.lethargy: placed at "
                                   f"0x{copy.places['pill.lethargy']:08x} by strict10")
        self.assertEqual(len(lines), 22)
        marked = [line for line in lines if "<--" in line]
        self.assertEqual(len(marked), 1)
        self.assertIn(f"0x{address:08x}  addiu $v0, $zero, 360  <--", marked[0])
        self.assertIn(f"0x{copy.places['pill.lethargy']:08x}  addiu $v0, $zero, 360  <--", marked[0])

    def test_the_listing_of_a_left_anchor_says_of_its_function_what_its_why_and_its_pair_say(self):
        for copy in (twins(), reworked()):
            placements, left = align(US.listing, copy.listing, ROWS)
            (entry,) = left
            out = io.StringIO()
            with redirect_stdout(out):
                show(US.listing, copy.listing, entry.anchor.address, ROWS, placements, left)
            text = out.getvalue()
            with self.subTest(entry.anchor.key):
                self.assertTrue(text.startswith(f"0x{entry.anchor.address:08x}, fixture IMMEDIATES {entry.anchor.key}: "
                                                f"left, {entry.why}\n  0x"))
                if entry.pair is None:
                    self.assertTrue(entry.why.startswith("its function is unpaired"))
                    self.assertTrue(text.endswith(" is unpaired\n"))
                else:
                    self.assertTrue(entry.why.startswith("it lies outside the aligned stretches of its pair"))
                    self.assertIn(f"\nthe function from 0x{US.listing.address(0):08x} is paired with the one from "
                                  f"0x{entry.pair:08x}, ", text)
                    self.assertIn(f"\n  0x{copy.places['pill.invincible']:08x}  ori $v0, $zero, 840\n", text)

    def test_the_listing_of_an_address_given_by_hand_heads_with_the_address_alone(self):
        copy = shifted()
        hand = Anchor("", "", "", US.starts["vanish"] + 4 * 11)
        out = io.StringIO()
        with redirect_stdout(out):
            show(US.listing, copy.listing, hand.address, ROWS, *align(US.listing, copy.listing, ROWS, hand=[hand]))
        self.assertTrue(out.getvalue().startswith(f"0x{hand.address:08x}: placed at 0x{copy.starts['vanish'] + 4 * 11:08x} "
                                                  "by strict10\n"))


if __name__ == "__main__":
    unittest.main()
