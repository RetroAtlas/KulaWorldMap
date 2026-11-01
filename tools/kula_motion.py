#!/usr/bin/env python3
"""What the executable does to each thing every frame, read off its code.

    python3 tools/kula_motion.py                 # every reading, with its address
    python3 tools/kula_motion.py --table         # the table the build ships
    python3 tools/kula_motion.py --release eu    # the PAL executable's readings, each at its own address

Every number is the immediate of one instruction or the multiplier a short
run of shifts and adds applies to a register, read by matching the
instruction it lives in, so a build that lays the code out differently stops
this with a message rather than yielding a number that looks like a reading.
Another release's executable is read through its map under maps/, which says
where each instruction matched on the US executable stands on it, and where
the release has no instruction for a reading, the one that stands in its
place is matched and the reading is null, which stops this too wherever the
table has no rule for a null. The game runs its loop once per vertical
blank.
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
from kula_disc import BASE, RELEASES, open_release
from kula_motion_blocks import CRUMBLING, blocks, platform, standing
from kula_motion_code import BLOCK, GP_INIT, PHASES, RECORD_INIT, TURN, Code, Map, Readings, dispatch
from kula_motion_effects import (EFFECT_HUD, EFFECT_TABLE, effect_places, effect_setup, effect_sine, effect_tables,
                                 effects)
from kula_motion_harms import CLEARED, harms
from kula_motion_jump import FLIGHT_THIRD, jump
from kula_motion_light import (GLINT_RECORDS, GLINT_STATE, GLINT_TIMES, LIGHT_ROOT, SHADOW_SQUARE, glint, glow, light,
                               root_table, shadow_half, spike_cycle, vanish_cycle)
from kula_motion_roll import body, moves, roll
from kula_motion_run import GAME_MODE_READ, LEVEL_MODE_READ, NEXT_ROUND, WORDS_TABLE, play, words
from kula_motion_simon import SIMON_FILL, SIMON_STORE
from kula_motion_take import devices, end_cases, exits, take
from kula_motion_things import (BUTTON_REACH, DICE_TIMES, LASER_LEVELS, QUARTER, QUARTERED, WORLD_AXES, laser,
                                spin_orders)
from kula_release import rules as release_rules

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
        code.check(addr, pattern)
    out = Readings({"names": code.names()})
    for _, key, _, addr, pattern in IMMEDIATES:
        out[key] = code.immediate(addr, pattern)
    for _, key, _, addr, count, src, dst in MULTIPLIERS:
        out[key] = code.multiplier(addr, count, src, dst)
    for _, key, _, start, end, base, span, calls in SCANS:
        out[key] = code.resolved(start, end, base, span, calls)
    out["button.reach"] = round(code.word_of(*BUTTON_REACH) ** 0.5)
    out["flight.third"] = round(2 ** 32 / code.word_of(*FLIGHT_THIRD))
    out["next.round"] = round(2 ** 32 / code.word_of(*NEXT_ROUND))
    mode = code.named("NEXT_MODE")
    out["next.mode.load"] = code.word(mode)
    stores = code.stores_to(mode)
    out["next.mode.clears"] = sorted(a for a, rt in stores if rt == 0)
    out["next.mode.writes"] = sorted(a for a, rt in stores if rt != 0)
    out["simon.store"] = code.address(*SIMON_STORE)
    out["simon.fill.from"] = code.address(*SIMON_FILL)
    out["dice.times"] = code.word_of(*DICE_TIMES)
    out["glint.times"] = code.word_of(*GLINT_TIMES)
    out["glint.seed"] = code.word(code.address(*GLINT_STATE))
    out["glint.at"], out["glint.frame.at"] = (code.address(*pair) for pair in GLINT_RECORDS)
    out["gp"] = code.address(*GP_INIT)
    if out["gp"] != code.gp:
        sys.exit(f"the start sets gp to 0x{out['gp']:08x}, not the 0x{code.gp:08x} the release table gives")
    out["record"] = code.address(*RECORD_INIT)
    if out["record"] != code.record:
        sys.exit(f"the ball's routine forms its record at 0x{out['record']:08x}, not the 0x{code.record:08x} the release table gives")
    out["mode.word"] = code.address(*LEVEL_MODE_READ)
    out["game.mode.word"] = code.address(*GAME_MODE_READ)
    out["glow.counter.load"] = int.from_bytes(code.read(out["gp"] + out["glow.counter.at"], 2), "little", signed=True)
    out["glow.clear"] = [code.address(*pair) for pair in CLEARED]
    for name, addr in code.named("SCREEN_WORDS").items():
        out[f"screen.load.{name}"] = code.word(addr)
    for _, key, _, *args in DIVISORS:
        out[key] = code.divisor(*args)
    for _, key, _, *args in GREYS:
        out[key] = code.grey(*args)
    start, end = (code.address(*pair) for pair in LASER_LEVELS)
    out["laser.levels"] = list(code.read(start, end - start))
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
    dispatch(code, code.named("TAKE_TYPES"), code.named("TAKE_CASES"), code.named("TAKE_TAIL"), "the contact walk")
    dispatch(code, code.named("LOADER_TYPES"), code.named("LOADER_CASES"), code.named("LOADER_PLAIN"), "the loader")
    dispatch(code, code.named("END_FACES"), end_cases(code), None, "the end landing")
    return out


def table(r, platform_speed, hz):
    """The motion table by type and by kind of block, in the game's units.

    A cycle is a frame program per phase, and the moving spikes say beside it
    on which of its frames they kill. The platform's speed is the one the
    level data holds, scaled as the loader scales it where it does. The
    jump's skip is null where the count falls to nothing by one with no skip,
    and the fall a hop over nothing starts is null where it starts at the
    last frame's change along the normal rather than at a constant, and the
    fast star's points a frame are null where the hazards routine tests
    nothing for its type. A type
    the loader lifts into an entry of its own says how far off its face the
    game draws the model's origin, and a type the game draws a shadow under
    says which sprite, how far off its face it lies and how strong it is, and
    the type whose models glint says how. A pickup says what it takes for the
    ball to take it and what that scores, a device under the ball what it
    does there, a kind or a type that can hurt the ball what it does, a kind
    the ball slides on, breaks or rides what it does to the roll, each kind
    the word the ball keeps for standing on it, and the level's own words,
    the clock's, the endings', the end screen's, a bonus level's, an
    ending's, a run's, the Simon rooms', the fly-in's and the screen's words,
    sit under `play`. The devices' light and each device's colours, by world
    and then by circuit where it has one, sit apart from the types, whose
    entries are what moves, as do the effects a pickup or a teleport starts,
    their tables, their sprites' colours and the flash, under `effects`; the
    frames of a second ship as given.
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
        42: {"form": {"rate": r["hedgehog.form"], "past": r["hedgehog.form.past"]},
             "orbit": {"radius": r["hedgehog.orbit.radius"],
                       "rate": [r["hedgehog.orbit.brown"], r["hedgehog.orbit.green"]]}},
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
        5: platform(r, platform_speed),
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
    return {"hz": hz, "turn": TURN, "standoff": r["captivator.standoff"],
            "dice": {"seed": r["dice.seed"], "times": r["dice.times"], "plus": r["dice.plus"]},
            "shadow": {"half": r["shadow.half"]},
            "glow": {**r["glow"], "colours": colours},
            "play": play(r),
            "effects": effects(r),
            "types": {str(t): types[t] for t in sorted(types)},
            "kinds": {str(k): kinds[k] for k in sorted(kinds)}}


def read(release=BASE, disc=None):
    """The release's executable off its image, read through its map where it has one."""
    blob = open_release(release, disc).read_file(RELEASES[release]["exe"])
    return Code.of(release, blob, Map.load(release) if Map.exists(release) else None)


def show_readings(code, hz):
    for addr, pattern, what in CHECKS:
        code.check(addr, pattern)
        print(f"  0x{code.at(addr):08x}  {what}")
    run = readings(code)
    rows = []
    for group, key, what, addr, pattern in IMMEDIATES:
        rows.append((group, what, code.at(addr), code.immediate(addr, pattern)))
    for group, key, what, addr, count, src, dst in MULTIPLIERS:
        rows.append((group, what, code.at(addr), code.multiplier(addr, count, src, dst)))
    for group, key, what, start, end, base, span, calls in SCANS:
        rows.append((group, what, code.at(start), code.resolved(start, end, base, span, calls)))
    rows.append(("on a block", "boost button: sinks while the ball is within, units",
                 code.at(BUTTON_REACH[0]), run["button.reach"]))
    rows.append(("the fly-in", "the curve's second point lies this share of eight blocks along the side on",
                 code.at(FLIGHT_THIRD[0]), run["flight.third"]))
    rows.append(("the level's clock and its end", "the bonus slots come round every this many, by the reciprocal",
                 code.at(NEXT_ROUND[0]), run["next.round"]))
    rows.append(("the level's clock and its end", "the word the next-level routine's other starts hang on, as the "
                 "executable loads it", code.named("NEXT_MODE"), run["next.mode.load"]))
    rows.append(("the level's clock and its end", "stores to that word through gp or $at, every one of nothing",
                 run["next.mode.clears"][0], len(run["next.mode.clears"])))
    rows.append(("the Simon rooms", f"the sequence a move is held to lies at 0x{run['simon.store']:08x}, this many "
                 "halfwords by the reset", code.at(SIMON_STORE[0]), run["simon.store.last"] + 1))
    rows.append(("the Simon rooms", "the reset fills it from the halfword this many bytes past its first",
                 code.at(SIMON_FILL[0]), run["simon.fill.from"] - run["simon.store"]))
    rows.append(("dice", "a draw multiplies the state by this", code.at(DICE_TIMES[0]),
                 run["dice.times"]))
    rows.append(("gem's glints", "a draw multiplies the generator's state by this", code.at(GLINT_TIMES[0]),
                 run["glint.times"]))
    rows.append(("gem's glints", "the generator's state as the executable loads it", code.address(*GLINT_STATE),
                 run["glint.seed"]))
    for name, what in (("wide", "the screen's width as the executable loads it"), ("high", "and its height"),
                       ("distance", "the projection's screen distance"), ("across", "the scale across, of 4096"),
                       ("down", "and the scale down")):
        rows.append(("the view in play", what, code.named("SCREEN_WORDS")[name], run[f"screen.load.{name}"]))
    for group, key, what, hi, hp, lo, lp, sa, sp in DIVISORS:
        rows.append((group, what, code.at(hi), code.divisor(hi, hp, lo, lp, sa, sp)))
    for group, key, what, hi, hp, lo, lp in GREYS:
        rows.append((group, what, code.at(hi), code.grey(hi, hp, lo, lp)))
    counter = run["gp"] + run["glow.counter.at"]
    rows.append(("what harms the ball", "the glow's counter as the executable loads it", counter,
                 run["glow.counter.load"]))
    rows.append(("what harms the ball",
                 f"the start clears this many bytes from 0x{run['glow.clear'][0]:08x}, the counter at 0x{counter:08x} among them",
                 code.at(CLEARED[0][0]), run["glow.clear"][1] - run["glow.clear"][0]))
    rows.append(("the level's mode", f"the level's mode word the ending's view reads, 0x{run['mode.word']:08x}, "
                 "lies this far past gp", code.at(LEVEL_MODE_READ[0]), run["mode.word"] - run["gp"]))
    rows.append(("the level's mode", f"and the game's mode word, which the mode routine reads, 0x{run['game.mode.word']:08x}, "
                 "this far", code.at(GAME_MODE_READ[0]), run["game.mode.word"] - run["gp"]))
    rows.append(("shadows", "the square reaches this far either way of its middle, units",
                 code.address(*SHADOW_SQUARE), run["shadow.half"]))
    rows.append(("invisible block", "rows of the square root it measures a corner by",
                 code.address(*LIGHT_ROOT), len(run["light.root"])))
    levels = run["laser.levels"]
    rows.append(("laser", f"steps in the beam's table, levels {min(levels)} to {max(levels)}",
                 code.address(*LASER_LEVELS[0]), len(levels)))
    sprites = 0x80000000 | code.word(code.address(*WORDS_TABLE))
    for index, word in words(code).items():
        rows.append(("the level's clock and its end", f"the end screen's word at {index}, in two sprites",
                     sprites + 4 + 8 * index, word))
    for at, t in sorted(run["effect.tables"].items()):
        kinds = [k for k, p in enumerate(run["effect.pointers"]) if p == at]
        rows.append(("the effects", f"the table at 0x{at:08x}, kinds {', '.join(map(str, kinds))}, runs this many frames of "
                     f"{t['count']} particles", code.named("EFFECT_POINTERS")[0] + 4 * kinds[0], t["frames"]))
    rows.append(("the effects", "the sine table gives this at a quarter turn", run["effect.sine.at"], run["effect.sine.one"]))
    for name in ("clock", "teleport"):
        rows.append(("the effects", f"the HUD point the {name}'s effect starts at, x, y and the third word",
                     code.address(*EFFECT_HUD[name]), ",".join(map(str, run["effect.hud.at"][name]))))
    order = {g: i for i, g in enumerate(dict.fromkeys(r[0] for r in rows))}
    rows.sort(key=lambda r: (order[r[0]], r[2]))
    last = None
    for group, what, addr, value in rows:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {'absent' if value is None else value:>6}  {what}")
    print(f"\nangles are in {TURN}ths of a turn, units are {BLOCK} to a block, a frame is 1/{hz} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=list(RELEASES), default=BASE, help="the release whose executable is read")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to the release's own variable")
    ap.add_argument("--table", action="store_true", help="print the table the build ships")
    ap.add_argument("--platform-speed", type=int, default=30,
                    help="the speed word the level data gives a moving platform")
    args = ap.parse_args()
    code = read(args.release, args.disc)
    hz = release_rules(code, args.release)["hz"]
    if args.table:
        print(json.dumps(table(readings(code), args.platform_speed, hz), indent=1))
    else:
        show_readings(code, hz)


if __name__ == "__main__":
    main()
