"""Unit tests for the aligner: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from align_fixture import (ANCHORS, ORDER, anchors_of, base, broken, chained, doubled, edged, kept, recast,  # noqa: E402
                           relaid, renamed, returned, reworked, shifted, twins, unshadowed, wedged)
from kula_align import (EDGE, LISTS, MODULES, OUTSIDE, TIERS, UNPAIRED, VOTING, Anchor, Left, align,  # noqa: E402
                        anchors, given, loose, pair_by_constants, pair_by_votes, report, shape, shared, show, windows)

US = base()
ROWS = anchors_of(US)
DISTINCT = 3494       # the addresses the readers' lists hold between them


def placed(copy):
    """Every anchor's tier, address and text on the copy, by key, and the anchors left."""
    placements, left = align(US.listing, copy.listing, ROWS)
    return {a.key: placements[a.address] for a in ROWS if a.address in placements}, left


def voted(copy):
    """The window placements on the copy and the pairs the votes make of them."""
    us, other = US.listing, copy.listing
    hits = windows(us, other, sorted({us.position(a.address) for a in ROWS}))
    return hits, pair_by_votes(us, other, hits, {})


def function_of(copy, name):
    """The first position of the named routine's function on the copy."""
    return copy.listing.function(copy.listing.position(copy.starts[name]))[0]


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

    def test_a_window_hit_outside_the_function_its_own_is_paired_with_is_left_and_lends_no_offset(self):
        copy = returned()
        tiers, left = placed(copy)
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        pair = pairs[function_of(US, "spikes")]
        self.assertEqual(other.address(pair), copy.starts["spikes"])
        stray = hits[us.position(US.places["spikes.step"])]
        self.assertEqual(stray, ("strict3", other.position(copy.places["spikes.step"])))
        self.assertNotEqual(other.function(stray[1])[0], pair)
        self.assertEqual(other.text[stray[1] - 4], "jr $ra")
        self.assertNotIn("spikes.step", tiers)
        self.assertEqual(left, [Left(Anchor("fixture", "IMMEDIATES", "spikes.step", US.places["spikes.step"]), OUTSIDE,
                                     copy.starts["spikes"])])
        self.assertEqual(tiers["spikes.hold"], (copy.places["spikes.hold"], "offset", "addiu $v1, $zero, 14"))
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_two_anchors_landing_on_one_place_are_both_left_naming_each_other(self):
        copy = unshadowed()
        us, other = US.listing, copy.listing
        hand = Anchor("", "", "", US.starts["vanish"] + 4 * 11)
        phase = US.places["the spikes read their phase"]
        placements, left = align(us, other, ROWS, hand=[hand])
        self.assertNotIn(phase, placements)
        self.assertNotIn(hand.address, placements)
        self.assertEqual(left, [Left(Anchor("fixture", "CHECKS", "the spikes read their phase", phase),
                                     f"0x{hand.address:08x} stands at its place too", copy.starts["spikes"]),
                                Left(hand, f"0x{phase:08x} stands at its place too", None)])
        alone, _ = align(us, other, ROWS)
        self.assertEqual(alone[phase], (copy.places["the spikes read their phase"], "strict10", "lh $v0, 6($s0)"))
        self.assertEqual({a: p for a, p in placements.items()}, {a: p for a, p in alone.items() if a != phase})

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

    def test_a_renamed_check_at_the_edge_of_an_aligned_stretch_is_left_while_one_inside_it_is_placed(self):
        copy = edged()
        tiers, left = placed(copy)
        self.assertEqual(tiers["the spikes read their phase"], (copy.places["the spikes read their phase"], "renamed",
                                                                "lh $v0, 6($s5)"))
        self.assertNotIn("and store it", tiers)
        self.assertEqual(left, [Left(Anchor("fixture", "CHECKS", "and store it", US.places["and store it"]), EDGE,
                                     copy.starts["spikes"])])
        self.assertEqual(copy.listing.text[copy.listing.position(copy.places["and store it"])], "sw $v0, 12($s5)")
        self.assertEqual({key: tiers[key].tier for key in ("spikes.down", "and test it", "spikes.hold", "spikes.step")},
                         {"spikes.down": "aligned", "and test it": "aligned", "spikes.hold": "offset", "spikes.step": "strict5"})
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_a_keyed_anchor_renamed_at_the_edge_of_an_aligned_stretch_is_placed(self):
        copy = kept()
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertEqual(tiers["pill.invincible"], (copy.places["pill.invincible"], "renamed", "addiu $t0, $zero, 840"))
        self.assertEqual(tiers["the pill tests its word"].tier, "offset")
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

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

    def test_a_routine_the_votes_cannot_pair_is_paired_by_the_rare_constants_it_shares_and_its_anchors_placed(self):
        copy = relaid()
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        fu, fo = function_of(US, "clock"), function_of(copy, "clock")
        self.assertNotIn(fu, pairs)
        self.assertEqual(pair_by_constants(us, other, hits, pairs), {fu: fo})
        self.assertEqual(shared(us, other, pairs)[fu, fo],
                         {("word", 0x88888889), ("word", 0x00808080), ("immediate", 0x8889), ("immediate", 0x8080),
                          ("call", function_of(US, "step"))})
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertTrue(all(tiers[key].tier.startswith("loose") for routine, _, _, key in ANCHORS if routine == "clock"))
        self.assertEqual(tiers["and marks the clock turned"].text, "sb $v0, 2($a3)")
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_the_anchors_the_windows_leave_in_a_routine_the_constants_pair_are_placed_by_the_alignment(self):
        copy = wedged()
        us, other = US.listing, copy.listing
        inner = ("clock.shown.sa", "clock.plus", "clock.grey.hi", "clock.grey.lo")
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertEqual({key: tiers[key].tier for key in inner}, dict.fromkeys(inner, "aligned"))
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)
        placements, left = align(us, other, ROWS, pairers=(pair_by_votes,))
        self.assertEqual(left, [Left(Anchor("fixture", kind, key, US.places[key]), UNPAIRED, None)
                                for _, _, kind, key in ANCHORS if key in inner])
        self.assertEqual(placements, {a: p for a, p in align(us, other, ROWS)[0].items()
                                      if a not in {US.places[key] for key in inner}})

    def test_a_routine_whose_constants_two_routines_of_the_copy_hold_stays_unpaired(self):
        copy = doubled()
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        fu = function_of(US, "clock")
        self.assertNotIn(fu, pairs)
        self.assertEqual(pair_by_constants(us, other, hits, pairs), {})
        self.assertEqual(len({fo for f, fo in shared(us, other, pairs) if f == fu}), 2)
        tiers, left = placed(copy)
        self.assertEqual({entry.anchor.key for entry in left}, {key for routine, _, _, key in ANCHORS if routine == "clock"})
        self.assertEqual({(entry.why, entry.pair) for entry in left}, {(f"{UNPAIRED}, its shapes standing at 2 places", None)})
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_a_routine_told_by_its_call_alone_is_paired_in_the_round_after_its_callee_and_its_anchor_placed(self):
        copy = chained()
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        clock, caller = function_of(US, "clock"), function_of(US, "caller")
        clock_fo, caller_fo = function_of(copy, "clock"), function_of(copy, "caller")
        self.assertEqual({clock, caller} & set(pairs), set())
        self.assertEqual([f for f, _ in shared(us, other, pairs) if f == caller], [])
        self.assertEqual(shared(us, other, {**pairs, clock: clock_fo})[caller, caller_fo], {("call", clock)})
        self.assertEqual(pair_by_constants(us, other, hits, pairs), {clock: clock_fo, caller: caller_fo})
        tiers, left = placed(copy)
        self.assertEqual(left, [])
        self.assertEqual(tiers["caller.plus"], (copy.places["caller.plus"], "aligned", "addiu $v0, $v0, 5"))
        for key, (at, _, _) in tiers.items():
            self.assertEqual(at, copy.places[key], key)

    def test_a_common_constant_or_one_outside_the_paired_neighbours_order_pairs_nothing(self):
        copy = twins()
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        twin = function_of(US, "twin")
        self.assertNotIn(twin, pairs)
        self.assertEqual([f for f, _ in shared(us, other, pairs) if f == twin], [])
        self.assertEqual(pair_by_constants(us, other, hits, pairs), {})
        copy = relaid()
        us, other = US.listing, copy.listing
        hits, pairs = voted(copy)
        clock, pill, spikes = (function_of(US, name) for name in ("clock", "pill", "spikes"))
        swapped = {**pairs, pill: pairs[spikes], spikes: pairs[pill]}
        self.assertEqual([fo for f, fo in shared(us, other, swapped) if f == clock], [function_of(copy, "clock")])
        self.assertEqual(pair_by_constants(us, other, hits, swapped), {})


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

    def test_an_address_given_by_hand_is_an_anchor_unless_the_rows_hold_it_and_one_off_a_word_or_the_code_exits(self):
        us = US.listing
        address = US.starts["vanish"] + 4 * 11
        self.assertEqual(given(us, ROWS, address), [Anchor("", "", "", address)])
        self.assertEqual(given(us, ROWS, US.places["twin.count"]), [])
        start, end = us.address(0), us.address(len(us.text))
        for bad, sentence in ((address + 2, f"0x{address + 2:08x} is not a multiple of four"),
                              (start - 4, f"0x{start - 4:08x} is not in the Roll Away executable"),
                              (end, f"0x{end:08x} is not in the Roll Away executable"),
                              (end + 2, f"0x{end + 2:08x} is not in the Roll Away executable")):
            with self.subTest(hex(bad)):
                with self.assertRaises(SystemExit) as caught:
                    given(us, ROWS, bad)
                self.assertEqual(caught.exception.code, sentence)


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

    def test_the_report_lists_the_anchors_placed_renamed_before_those_left(self):
        copy = renamed()
        placements, left = align(US.listing, copy.listing, ROWS)
        out = io.StringIO()
        with redirect_stdout(out):
            report("eu", placements, left, ROWS)
        text = out.getvalue()
        phase, store = US.places["the spikes read their phase"], US.places["and store it"]
        self.assertIn(f"\nrenamed: 2 anchors at 2 addresses\n\nfixture CHECKS\n"
                      f"  0x{phase:08x}  the spikes read their phase: at 0x{copy.places['the spikes read their phase']:08x}  "
                      f"lh $v0, 6($s5)\n  0x{store:08x}  and store it: at 0x{copy.places['and store it']:08x}  sw $v0, 12($s5)\n"
                      "\nleft: 0 anchors at 0 addresses\n", text)
        self.assertTrue(text.endswith("\nleft: 0 anchors at 0 addresses\n"))

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
