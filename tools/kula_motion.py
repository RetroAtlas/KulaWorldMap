#!/usr/bin/env python3
"""What the executable does to each thing every frame, read off its code.

    python3 tools/kula_motion.py            # every reading, with its address
    python3 tools/kula_motion.py --table    # the table the build ships

Every number is the immediate of one instruction or the multiplier a short
run of shifts and adds applies to a register, read by matching the
instruction it lives in, so a build that lays the code out differently stops
this with a message rather than yielding a number that looks like a reading.
The game runs its loop once per vertical blank.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_motion_blocks
import kula_motion_code
import kula_motion_effects
import kula_motion_harms
import kula_motion_jump
import kula_motion_light
import kula_motion_roll
import kula_motion_run
import kula_motion_simon
import kula_motion_take
import kula_motion_things
from kula_disc import EXE, EXE_BASE, open_disc
from kula_motion_blocks import CRUMBLING, blocks, standing
from kula_motion_code import BLOCK, GP_INIT, HZ, PHASES, TURN, Code, dispatch
from kula_motion_effects import (EFFECT_HUD, EFFECT_POINTERS, EFFECT_TABLE, effect_places, effect_setup, effect_sine,
                                 effect_tables, effects)
from kula_motion_harms import CLEARED, harms
from kula_motion_jump import FLIGHT_THIRD, jump
from kula_motion_light import (GLINT_RECORDS, GLINT_STATE, GLINT_TIMES, LIGHT_ROOT, SHADOW_SQUARE, glint, glow, light,
                               root_table, shadow_half, spike_cycle, vanish_cycle)
from kula_motion_roll import body, moves, roll
from kula_motion_run import GAME_MODE_READ, LEVEL_MODE_READ, NEXT_MODE, NEXT_ROUND, WORDS_TABLE, play, words
from kula_motion_simon import SIMON_FILL, SIMON_STORE
from kula_motion_take import (END_CASES, END_FACES, LOADER_CASES, LOADER_PLAIN, LOADER_TYPES, SCREEN_WORDS,
                              TAKE_CASES, TAKE_TAIL, TAKE_TYPES, devices, exits, take)
from kula_motion_things import (BUTTON_REACH, DICE_TIMES, LASER_LEVELS, QUARTER, QUARTERED, WORLD_AXES, laser,
                                spin_orders)

# What has to be there for the numbers below to mean what the doc says.
CHECKS = [
    *kula_motion_code.CHECKS,
    *kula_motion_things.CHECKS,
    *kula_motion_light.CHECKS,
    *kula_motion_roll.CHECKS,
    *kula_motion_jump.CHECKS,
    *kula_motion_take.CHECKS,
    *kula_motion_harms.CHECKS,
    *kula_motion_blocks.CHECKS,
    *kula_motion_run.CHECKS,
    *kula_motion_simon.CHECKS,
    *kula_motion_effects.CHECKS,
]

# A number that is the immediate of one instruction: the pattern is the
# disassembly with {} where the immediate goes.
IMMEDIATES = [
    *kula_motion_code.IMMEDIATES,
    *kula_motion_things.IMMEDIATES,
    *kula_motion_light.IMMEDIATES,
    *kula_motion_roll.IMMEDIATES,
    *kula_motion_jump.IMMEDIATES,
    *kula_motion_take.IMMEDIATES,
    *kula_motion_harms.IMMEDIATES,
    *kula_motion_blocks.IMMEDIATES,
    *kula_motion_run.IMMEDIATES,
    *kula_motion_simon.IMMEDIATES,
    *kula_motion_effects.IMMEDIATES,
]

# A number that is the multiplier a run of shifts and adds applies to what a
# register held on entry: the run starts at the address and is this many
# instructions long, and the product is read from the last register named.
MULTIPLIERS = [
    *kula_motion_code.MULTIPLIERS,
    *kula_motion_things.MULTIPLIERS,
    *kula_motion_light.MULTIPLIERS,
    *kula_motion_roll.MULTIPLIERS,
    *kula_motion_jump.MULTIPLIERS,
    *kula_motion_take.MULTIPLIERS,
    *kula_motion_harms.MULTIPLIERS,
    *kula_motion_blocks.MULTIPLIERS,
    *kula_motion_run.MULTIPLIERS,
    *kula_motion_simon.MULTIPLIERS,
    *kula_motion_effects.MULTIPLIERS,
]

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and the shift of the high word.
DIVISORS = [
    *kula_motion_code.DIVISORS,
    *kula_motion_things.DIVISORS,
    *kula_motion_light.DIVISORS,
    *kula_motion_roll.DIVISORS,
    *kula_motion_jump.DIVISORS,
    *kula_motion_take.DIVISORS,
    *kula_motion_harms.DIVISORS,
    *kula_motion_blocks.DIVISORS,
    *kula_motion_run.DIVISORS,
    *kula_motion_simon.DIVISORS,
    *kula_motion_effects.DIVISORS,
]

# A brightness or a step of one, a grey held as a colour word in two halves.
GREYS = [
    *kula_motion_code.GREYS,
    *kula_motion_things.GREYS,
    *kula_motion_light.GREYS,
    *kula_motion_roll.GREYS,
    *kula_motion_jump.GREYS,
    *kula_motion_take.GREYS,
    *kula_motion_harms.GREYS,
    *kula_motion_blocks.GREYS,
    *kula_motion_run.GREYS,
    *kula_motion_simon.GREYS,
    *kula_motion_effects.GREYS,
]

# A stretch of code whose every store the scan resolves to an address, none within a span of the
# ball's record: its first and last instruction, the register handed the record, the span's first
# and last word, and the calls the record goes on to, each where, the callee and the argument
# registers holding it with their offsets.
SCANS = [
    *kula_motion_code.SCANS,
    *kula_motion_things.SCANS,
    *kula_motion_light.SCANS,
    *kula_motion_roll.SCANS,
    *kula_motion_jump.SCANS,
    *kula_motion_take.SCANS,
    *kula_motion_harms.SCANS,
    *kula_motion_blocks.SCANS,
    *kula_motion_run.SCANS,
    *kula_motion_simon.SCANS,
    *kula_motion_effects.SCANS,
]


def readings(code):
    """Every number, by its id, after the checks have passed."""
    for addr, pattern, _ in CHECKS:
        code.immediate(addr, pattern)
    out = {}
    for _, key, _, addr, pattern in IMMEDIATES:
        out[key] = code.immediate(addr, pattern)
    for _, key, _, addr, count, src, dst in MULTIPLIERS:
        out[key] = code.multiplier(addr, count, src, dst)
    for _, key, _, start, end, base, span, calls in SCANS:
        out[key] = code.resolved(start, end, base, span, calls)
    out["button.reach"] = round(code.word_of(*BUTTON_REACH) ** 0.5)
    out["flight.third"] = round(2 ** 32 / code.word_of(*FLIGHT_THIRD))
    out["next.round"] = round(2 ** 32 / code.word_of(*NEXT_ROUND))
    out["next.mode.load"] = code.word(NEXT_MODE)
    stores = code.stores_to(NEXT_MODE)
    out["next.mode.clears"] = sorted(a for a, rt in stores if rt == 0)
    out["next.mode.writes"] = sorted(a for a, rt in stores if rt != 0)
    out["simon.store"] = code.address(*SIMON_STORE)
    out["simon.fill.from"] = code.address(*SIMON_FILL)
    out["dice.times"] = code.word_of(*DICE_TIMES)
    out["glint.times"] = code.word_of(*GLINT_TIMES)
    out["glint.seed"] = code.word(code.address(*GLINT_STATE))
    out["glint.at"], out["glint.frame.at"] = (code.address(*pair) for pair in GLINT_RECORDS)
    out["gp"] = code.address(*GP_INIT)
    out["mode.word"] = code.address(*LEVEL_MODE_READ)
    out["game.mode.word"] = code.address(*GAME_MODE_READ)
    out["glow.counter.load"] = int.from_bytes(code.read(out["gp"] + out["glow.counter.at"], 2), "little", signed=True)
    out["glow.clear"] = [code.address(*pair) for pair in CLEARED]
    for name, addr in SCREEN_WORDS.items():
        out[f"screen.load.{name}"] = code.word(addr)
    for _, key, _, *args in DIVISORS:
        out[key] = code.divisor(*args)
    for _, key, _, *args in GREYS:
        out[key] = code.grey(*args)
    start, end = (code.address(*pair) for pair in LASER_LEVELS)
    out["laser.levels"] = list(code.blob[start - EXE_BASE:end - EXE_BASE])
    out["shadow.half"] = shadow_half(code)
    out["light.root"] = root_table(code)
    out["glow"], out["glow.colours"] = glow(code, out)
    out["spin.order"] = spin_orders(code)
    out["spin.quarter"] = code.immediate(*QUARTER)
    out["words"] = words(code)
    out["effect.pointers"], out["effect.colours"] = effect_setup(code, out["effect.slots.last"] + 1, out["effect.sprites"])
    out["effect.tables"] = effect_tables(code, out["effect.pointers"])
    out["effect.sine.at"], out["effect.sine.one"] = effect_sine(code)
    out["effect.hud.at"] = effect_places(code)
    out["effect.table.at"] = [code.address(*pair) for pair in EFFECT_TABLE]
    moves(code, out)
    dispatch(code, TAKE_TYPES, TAKE_CASES, TAKE_TAIL, "the contact walk")
    dispatch(code, LOADER_TYPES, LOADER_CASES, LOADER_PLAIN, "the loader")
    dispatch(code, END_FACES, END_CASES, None, "the end landing")
    return out


def table(r, platform_speed):
    """The motion table by type and by kind of block, in the game's units.

    A cycle is a frame program per phase, and the moving spikes say beside it
    on which of its frames they kill. The platform's speed is the one the
    level data holds, scaled as the loader scales it. A type the loader lifts
    into an entry of its own says how far off its face the game draws the
    model's origin, and a type the game draws a shadow under says which
    sprite, how far off its face it lies and how strong it is, and the type
    whose models glint says how. A pickup says what it takes for the ball
    to take it and what that scores, a device under the ball what it does
    there, a kind or a type that can hurt the ball what it does, a kind the
    ball slides on, breaks or rides what it does to the roll, each kind the
    word the ball keeps for standing on it, and the level's own words, the clock's, the endings', the end screen's, a
    bonus level's, an ending's, a run's, the Simon rooms', the fly-in's and the screen's words, sit under `play`. The devices' light and each device's
    colours, by world and then by circuit where it has one, sit apart from
    the types, whose entries are what moves, as do the effects a pickup or
    a teleport starts, their tables, their sprites' colours and the flash,
    under `effects`.
    """
    bob = {"rate": r["coin.bob"], "reach": r["coin.bob.reach"]}
    fruit = {"turn": r["fruit.turn"],
             "tilt": {"rate": r["fruit.tilt"], "reach": r["fruit.tilt.reach"]},
             "bob": {"rate": r["fruit.bob"], "reach": r["fruit.bob.reach"]}}
    pill = {"turn": r["pill.turn"], "flip": r["pill.flip"]}
    star50 = [r["star50.tumble.x"], r["star50.tumble.y"], r["star50.tumble.z"]]
    stand = r["captivator.standoff"] - BLOCK // 2
    types = {
        5: {"turn": r["teleporter.turn"]},
        10: {"press": {"start": r["button.start"], "full": r["button.full"],
                       "sink": r["button.sink"], "rise": r["button.rise"],
                       "reach": r["button.reach"]}},
        30: {"breathe": {"rate": r["ball.breathe"], "reach": r["ball.breathe.reach"],
                         "full": r["ball.breathe.full"], "over": r["ball.breathe.over"],
                         "tick": r["time.tick"]}},
        7: {"turn": r["exit.turn"], "open": r["exit.turn.open"]},
        26: {"turn": r["exit.turn"], "open": r["exit.turn.open"]},
        31: {"turn": r["coin.turn"], "bob": bob},
        32: dict(pill), 33: dict(pill), 34: dict(pill),
        35: {"turn": r["hourglass.turn"],
             "swing": {"rate": r["hourglass.swing"], "reach": TURN // 2, "lean": r["hourglass.lean"]}},
        36: {"turn": r["gem.turn"]},
        37: {"turn": r["coin.turn"], "bob": bob},
        38: {"turn": r["coin.turn"], "bob": bob},
        42: {"form": {"rate": r["star42.form"], "past": r["star42.form.past"]},
             "orbit": {"radius": r["star42.orbit.radius"],
                       "rate": [r["star42.orbit.brown"], r["star42.orbit.green"]]}},
        11: {"cycle": [[f for f, _ in spike_cycle(r, p)] for p in range(PHASES)],
             "deadly": [[d for _, d in spike_cycle(r, p)] for p in range(PHASES)]},
        50: {"tumble": star50, "travel": r["star50.travel"]},
        51: {"roll": r["wheel.roll"], "travel": r["wheel.travel"],
             "turning": {"frames": r["wheel.turning"], "rate": r["wheel.turn.right"],
                         "about": r["wheel.turn.about"]}},
        52: {"tumble": [r["star52.tumble.x"], r["star52.tumble.y"], 0],
             "sway": {"rate": r["star52.sway"], "reach": r["star52.sway.reach"]}},
        53: {"tumble": star50,
             "shake": {"frames": r["ball53.shake"], "reach": r["ball53.lurch.reach"]},
             "dash": r["ball53.dash"], "settle": r["ball53.settle"], "ways": r["ball53.ways"]},
        56: {"bounce": {"rate": r["corkscrew.bounce"], "wrap": r["corkscrew.wrap"],
                        "rise": r["corkscrew.rise"], "spin": -r["corkscrew.spin"]},
             "phases": [r["corkscrew.phase0"], r["corkscrew.phase1"], r["corkscrew.phase2"], 0]},
    }
    for t in range(43, 48):
        types[t] = dict(fruit)
    types[30].update(roll(r))
    types[30]["jump"] = jump(r)
    types[30]["wrap"]["body"] = body(r)
    taken, lasting = take(r)
    for t, entry in taken.items():
        types[t]["take"] = entry
    for t, entry in lasting.items():
        types[t]["lasts"] = entry
    for t, entry in exits(r).items():
        types[t].update(entry)
    for t, entry in devices(r).items():
        types.setdefault(t, {}).update(entry)
    for t in (50, 51, 52, 53):
        types[t]["entry"] = {"stand": stand}
        types[t]["shadow"] = {"sprite": 0, "off": stand + r[f"shadow.drop.{t}"],
                              "strength": r[f"shadow.strength.{t}"]}
    types[51]["shadow"].update({"sprite": r["shadow.sprite.51"], "turns": True})
    types[56]["entry"] = {"stand": stand - r["corkscrew.drop"]}
    types[56]["shadow"] = {"sprite": 0, "off": stand - r["shadow.corkscrew.drop"],
                           "strength": r["shadow.strength.56"], "fade": r["shadow.corkscrew.fade"]}
    # the ball's light is the camera's rows turned round, in its axes right, down
    # and into the screen
    types[30]["light"] = {"view": [-1, -(1 << r["ball.light.down"]), -(1 << r["ball.light.into"])],
                          "background": r["ball.light.background"], "colour": r["ball.light.colour"],
                          "base": r["ball.light.base"]}
    # the ball's shadow lies as far toward the block from its middle as the
    # middle is off the face, so on the face
    types[30]["shadow"] = {"sprite": 0, "off": 0, "strength": 1 << r["shadow.ball.shift"],
                           "top": r["shadow.ball.top"], "over": r["shadow.ball.over"],
                           "squash": True}
    # a spin's angles are about the game's model axes, and `before` is a turn
    # the model takes ahead of its spin
    for t, order in r["spin.order"].items():
        types[t]["order"] = order
    for t in WORLD_AXES:
        types[t]["axes"] = "world"
    for t in QUARTERED:
        types[t]["before"] = [0, 0, r["spin.quarter"]]
    types[30]["before"] = [TURN // 2, 0, 0]
    if r["glint.model"] not in types:
        sys.exit(f"the glints are of model {r['glint.model']}, which no type in the table is")
    types[r["glint.model"]]["glint"] = glint(r)
    for t, entry in types.items():
        if "shadow" in entry and entry["shadow"]["sprite"] >= r["shadow.sprites"]:
            sys.exit(f"type {t}'s shadow is sprite {entry['shadow']['sprite']} of {r['shadow.sprites']}")
    kinds = {
        5: {"speed": platform_speed * r["platform.scale"] // HZ, "dwell": r["platform.dwell"]},
        7: {"cycle": [[s for s, _ in vanish_cycle(r, p)] for p in range(PHASES)],
            "level": [[v for _, v in vanish_cycle(r, p)] for p in range(PHASES)]},
        3: {"light": light(r)},
        8: laser(r),
        CRUMBLING: {"points": r["crumble.points"]},
    }
    harm = harms(r)
    for k, entry in harm["kinds"].items():
        kinds.setdefault(k, {}).update(entry)
    for t, entry in harm["types"].items():
        types[t].update(entry)
    for k, entry in blocks(r).items():
        kinds.setdefault(k, {}).update(entry)
    for k, word in standing(r).items():
        kinds.setdefault(k, {})["standing"] = word
    colours = {str(t): r["glow.colours"][t] for t in sorted(r["glow.colours"])}
    return {"hz": HZ, "turn": TURN, "standoff": r["captivator.standoff"],
            "dice": {"seed": r["dice.seed"], "times": r["dice.times"], "plus": r["dice.plus"]},
            "shadow": {"half": r["shadow.half"]},
            "glow": {**r["glow"], "colours": colours},
            "play": play(r),
            "effects": effects(r),
            "types": {str(t): types[t] for t in sorted(types)},
            "kinds": {str(k): kinds[k] for k in sorted(kinds)}}


def read(disc=None):
    return Code(open_disc(disc).read_file(EXE))


def show_readings(code):
    for addr, pattern, what in CHECKS:
        code.immediate(addr, pattern)
        print(f"  0x{addr:08x}  {what}")
    rows = []
    for group, key, what, addr, pattern in IMMEDIATES:
        rows.append((group, what, addr, code.immediate(addr, pattern)))
    for group, key, what, addr, count, src, dst in MULTIPLIERS:
        rows.append((group, what, addr, code.multiplier(addr, count, src, dst)))
    for group, key, what, start, end, base, span, calls in SCANS:
        rows.append((group, what, start, code.resolved(start, end, base, span, calls)))
    rows.append(("on a block", "boost button: sinks while the ball is within, units",
                 BUTTON_REACH[0], readings(code)["button.reach"]))
    rows.append(("the fly-in", "the curve's second point lies this share of eight blocks along the side on",
                 FLIGHT_THIRD[0], readings(code)["flight.third"]))
    run = readings(code)
    rows.append(("the level's clock and its end", "the bonus slots come round every this many, by the reciprocal",
                 NEXT_ROUND[0], run["next.round"]))
    rows.append(("the level's clock and its end", "the word the next-level routine's other starts hang on, as the "
                 "executable loads it", NEXT_MODE, run["next.mode.load"]))
    rows.append(("the level's clock and its end", "stores to that word through gp or $at, every one of nothing",
                 run["next.mode.clears"][0], len(run["next.mode.clears"])))
    rows.append(("the Simon rooms", f"the sequence a move is held to lies at 0x{run['simon.store']:08x}, this many "
                 "halfwords by the reset", SIMON_STORE[0], run["simon.store.last"] + 1))
    rows.append(("the Simon rooms", "the reset fills it from the halfword this many bytes past its first",
                 SIMON_FILL[0], run["simon.fill.from"] - run["simon.store"]))
    rows.append(("dice", "a draw multiplies the state by this", DICE_TIMES[0],
                 readings(code)["dice.times"]))
    rows.append(("gem's glints", "a draw multiplies the generator's state by this", GLINT_TIMES[0],
                 readings(code)["glint.times"]))
    rows.append(("gem's glints", "the generator's state as the executable loads it", code.address(*GLINT_STATE),
                 readings(code)["glint.seed"]))
    for name, what in (("wide", "the screen's width as the executable loads it"), ("high", "and its height"),
                       ("distance", "the projection's screen distance"), ("across", "the scale across, of 4096"),
                       ("down", "and the scale down")):
        rows.append(("the view in play", what, SCREEN_WORDS[name], readings(code)[f"screen.load.{name}"]))
    for group, key, what, hi, hp, lo, lp, sa, sp in DIVISORS:
        rows.append((group, what, hi, code.divisor(hi, hp, lo, lp, sa, sp)))
    for group, key, what, hi, hp, lo, lp in GREYS:
        rows.append((group, what, hi, code.grey(hi, hp, lo, lp)))
    glow = readings(code)
    counter = glow["gp"] + glow["glow.counter.at"]
    rows.append(("what harms the ball", "the glow's counter as the executable loads it", counter,
                 glow["glow.counter.load"]))
    rows.append(("what harms the ball",
                 f"the start clears this many bytes from 0x{glow['glow.clear'][0]:08x}, the counter at 0x{counter:08x} among them",
                 CLEARED[0][0], glow["glow.clear"][1] - glow["glow.clear"][0]))
    modes = readings(code)
    rows.append(("the level's mode", f"the level's mode word the ending's view reads, 0x{modes['mode.word']:08x}, "
                 "lies this far past gp", LEVEL_MODE_READ[0], modes["mode.word"] - modes["gp"]))
    rows.append(("the level's mode", f"and the game's mode word, which the mode routine reads, 0x{modes['game.mode.word']:08x}, "
                 "this far", GAME_MODE_READ[0], modes["game.mode.word"] - modes["gp"]))
    rows.append(("shadows", "the square reaches this far either way of its middle, units",
                 code.address(*SHADOW_SQUARE), readings(code)["shadow.half"]))
    rows.append(("invisible block", "rows of the square root it measures a corner by",
                 code.address(*LIGHT_ROOT), len(readings(code)["light.root"])))
    levels = readings(code)["laser.levels"]
    rows.append(("laser", f"steps in the beam's table, levels {min(levels)} to {max(levels)}",
                 code.address(*LASER_LEVELS[0]), len(levels)))
    sprites = 0x80000000 | code.word(code.address(*WORDS_TABLE))
    for index, word in words(code).items():
        rows.append(("the level's clock and its end", f"the end screen's word at {index}, in two sprites",
                     sprites + 4 + 8 * index, word))
    fx = readings(code)
    for at, t in sorted(fx["effect.tables"].items()):
        kinds = [k for k, p in enumerate(fx["effect.pointers"]) if p == at]
        rows.append(("the effects", f"the table at 0x{at:08x}, kinds {', '.join(map(str, kinds))}, runs this many frames of "
                     f"{t['count']} particles", EFFECT_POINTERS[0] + 4 * kinds[0], t["frames"]))
    rows.append(("the effects", "the sine table gives this at a quarter turn", fx["effect.sine.at"], fx["effect.sine.one"]))
    for name in ("clock", "teleport"):
        rows.append(("the effects", f"the HUD point the {name}'s effect starts at, x, y and the third word",
                     code.address(*EFFECT_HUD[name]), ",".join(map(str, fx["effect.hud.at"][name]))))
    order = {g: i for i, g in enumerate(dict.fromkeys(r[0] for r in rows))}
    rows.sort(key=lambda r: (order[r[0]], r[2]))
    last = None
    for group, what, addr, value in rows:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {value:>6}  {what}")
    print(f"\nangles are in {TURN}ths of a turn, units are {BLOCK} to a block, a frame is 1/{HZ} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--table", action="store_true", help="print the table the build ships")
    ap.add_argument("--platform-speed", type=int, default=30,
                    help="the speed word the level data gives a moving platform")
    args = ap.parse_args()
    code = read(args.disc)
    if args.table:
        print(json.dumps(table(readings(code), args.platform_speed), indent=1))
    else:
        show_readings(code)


if __name__ == "__main__":
    main()
