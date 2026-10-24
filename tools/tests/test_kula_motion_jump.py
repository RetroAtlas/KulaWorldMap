"""Unit tests for the jump and the fly-in: python3 -m unittest discover -s tools/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_motion_jump import flight, jump  # noqa: E402
from motion_fixture import GAME  # noqa: E402


class Jump(unittest.TestCase):
    def test_the_jump_ships_its_speed_its_count_rule_and_its_landings(self):
        j = jump(GAME)
        self.assertEqual((j["speed"], j["skip"], j["snap"], j["far"], j["long"], j["scale"]), (33, 2, 1024, 1536, 3, [3, 2]))
        self.assertEqual((j["catch"], j["wall"], j["low"], j["bounce"], j["recentre"]), (12, 412, 100, -10, 8))
        self.assertEqual(j["boost"], {"roll": 151, "frames": 10, "fire": 231})
        self.assertEqual((j["arm"], j["keep"]), (1, 2))

    def test_a_jump_at_another_speed_or_landing_elsewhere_stops_the_reading(self):
        for change in ({"jump.speed": 30}, {"jump.snap": 512}, {"jump.far": 1024}, {"jump.rows": 6},
                       {"jump.step": -2}):
            with self.assertRaises(SystemExit):
                jump({**GAME, **change})

    def test_a_wall_met_elsewhere_than_a_roll_meets_it_stops_the_reading(self):
        for change in ({"jump.wall": 400}, {"jump.ceiling.ahead": 400}, {"jump.wall.low": 90},
                       {"jump.ceiling.behind": 100}, {"jump.recentre": 4}, {"jump.bounce": -5}, {"boost.type": 9}):
            with self.assertRaises(SystemExit):
                jump({**GAME, **change})

    def test_a_long_jump_word_that_would_not_survive_to_the_jump_or_would_land_it_long_stops_the_reading(self):
        for change in ({"jump.arm": 2}, {"jump.keep": 1}, {"jump.keep": 4}):
            with self.assertRaises(SystemExit):
                jump({**GAME, **change})

    def test_a_hop_on_other_rows_or_reading_another_row_than_the_next_stops_the_reading(self):
        for change in ({"hop.rows": 6}, {"hop.skip": 1}, {"hop.step": -2}, {"hop.row": 4}, {"hop.ahead": 4}):
            with self.assertRaises(SystemExit):
                jump({**GAME, **change})


class Flight(unittest.TestCase):
    def test_the_fly_in_ships_its_hold_its_steps_its_turns_and_its_curve(self):
        self.assertEqual(flight(GAME), {"hold": 2000, "gate": 1000, "done": 1, "end": 1024, "step": 16, "slow": 928,
                                        "first": 13, "least": 1, "frames": 68, "yaw": -1024, "bank": 2048, "pitch": 250,
                                        "below": 250, "ahead": 800, "out": 14000,
                                        "curve": {"above": 100, "back": [4096, 3072, 2048, 0],
                                                  "left": [4096, 1707, 0, 0]}})

    def test_the_fly_in_flies_68_frames_and_the_pad_is_read_on_the_70th(self):
        f = flight(GAME)
        t, inc, steps = 0, f["first"], []
        while t <= f["end"]:
            steps.append(f["step"] if t <= f["slow"] else inc)
            if t > f["slow"]:
                inc = max(inc - 1, f["least"])
            t += steps[-1]
        self.assertEqual(steps, [16] * 59 + [13, 12, 11, 10, 9, 8, 7, 6, 5])
        self.assertEqual((len(steps), t), (f["frames"], f["end"] + 1))
        # the pad's gate frame by frame, the hold and the live mark written at a frame's end, where the game writes them
        wait, live, read, standing = GAME["start.wait"], True, None, 0
        for frame in range(1, 80):
            wait = max(wait - 1, 0)
            if wait == 0 and live:
                read = frame
                break
            standing += wait >= f["gate"]
            if frame <= f["frames"]:
                live, wait = False, f["hold"] if frame < f["frames"] else f["done"]
            else:
                live = True
        self.assertEqual((read, standing), (70, 67))


if __name__ == "__main__":
    unittest.main()
