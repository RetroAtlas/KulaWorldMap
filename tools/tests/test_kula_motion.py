"""Unit tests for the motion reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
import zlib
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion import (  # noqa: E402
    GLOW_DOUBLE, GLOW_FACE, GLOW_LIFT, GLOW_MAKE, LIGHT_ROOT, LOADER_CASES, LOADER_PLAIN, LOADER_TYPES, PHASES,
    ROOT_ROWS, SHADOW_SQUARE, SPINS, SPUN_AT, STATES, TAKE_CASES, TAKE_TAIL, TAKE_TYPES, WORDS_COUNT, WORDS_TABLE,
    Code, blocks, body, devices, dispatch, exits, flight, glint, glow_lift, glow_spill, harms, jump, laser, light, moves,
    play, roll, root_table, shadow_half, spike_cycle, spin_orders, standing, table, take, vanish_cycle, words)

R = {"at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7, "t0": 8, "s0": 16, "s5": 21, "zero": 0,
     "sp": 29, "ra": 31}


def sll(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6)


def addu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x21


def subu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x23


def addiu(rt, rs, imm):
    return (9 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def lh(rt, rs, imm):
    return (0x21 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def lw(rt, rs, imm):
    return (0x23 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


AT = EXE_BASE + 0x800


def code(*words):
    blob = bytearray(0x800) + b"".join(struct.pack("<I", w) for w in words)
    return Code(bytes(blob))


# The numbers the executable holds, as the reader returns them.
GAME = {
    "spikes.phase.step": 35, "spikes.phase.down": 63, "spikes.phase.held": 96,
    "spikes.phase.retracting": 140, "spikes.phase.down.from": 63,
    "spikes.phase.held.from": 96, "spikes.phase.retracting.from": 140,
    "spikes.down": 63, "spikes.rise": 5, "spikes.rattle": 14, "spikes.hold": 14,
    "spikes.retract": 44, "spikes.harmless": 11, "spikes.phase.down.flag": 2, "spikes.phase.up.flag": 1,
    "spikes.rise.flag": 1, "spikes.retract.flag": 2,
    "vanish.phase.step": 56, "vanish.phase.absent": 2, "vanish.phase.absent.from": 91,
    "vanish.phase.solid.from": 196, "vanish.absent": 91, "vanish.in": 9, "vanish.settle": 5,
    "vanish.solid": 91, "vanish.dim": 9, "vanish.out": 19,
    "vanish.in.over": 9, "vanish.in.scale": 255, "vanish.in.by": 9, "vanish.in.to": 255,
    "vanish.settle.scale": 224, "vanish.settle.by": 5, "vanish.settle.floor": 32, "vanish.settle.to": 128,
    "vanish.dim.at": 32, "vanish.dim.from": 256, "vanish.dim.scale": 224, "vanish.dim.by": 9,
    "vanish.out.at": 255, "vanish.out.scale": 255, "vanish.out.by": 19,
    "laser.reach": 256, "laser.reach.back": -256, "laser.nozzle": 90, "laser.nozzle.back": -90,
    "laser.width": 7, "laser.width.back": -7, "laser.colour.0a": 3, "laser.colour.0b": 11,
    "laser.colour.1": 19, "laser.colour.2": 11, "laser.colour.3": 3, "laser.step": 1,
    "laser.mode": 32, "laser.levels": [31, 27, 23, 19, 15, 11, 25, 11, 12, 4, 6],
    "shadow.sprite": 14, "shadow.sprites": 2, "shadow.half": 150,
    "shadow.drop.50": -200, "shadow.drop.51": -200, "shadow.drop.52": -200, "shadow.drop.53": -200,
    "shadow.strength.50": 128, "shadow.strength.51": 128, "shadow.strength.52": 128,
    "shadow.strength.53": 128, "shadow.sprite.51": 1, "shadow.strength.56": 128,
    "shadow.corkscrew.drop": 170, "shadow.corkscrew.fade": 48,
    "shadow.ball.top": 512, "shadow.ball.shift": 7, "shadow.ball.over": 412,
    "light.kind": 3, "light.near": 350, "light.far": 512, "light.full": 128, "light.full.fade": 128,
    "light.full.turned": 128, "light.scale": 0x4000, "light.bits": 23, "light.bits.high": 9,
    "light.turned.kind": 9, "light.turned.value": 1, "light.turned.near": 1280, "light.turned.far": 1792,
    "light.root": [[362, 150], [256, 106]],
    "glint.model": 36, "glint.cuts": 3, "glint.rows": 3, "glint.record": 348, "glint.row": 1044,
    "glint.head": 28, "glint.slot": 20, "glint.chance": 3, "glint.slots": 16, "glint.flat": 4,
    "glint.frame.cuts": 3, "glint.frame.rows": 3, "glint.frame.record": 348, "glint.frame.row": 1044,
    "glint.rise": 128, "glint.top": 254, "glint.fall": 16,
    "glint.seed": 1, "glint.times": 0x41C64E6D, "glint.plus": 12345,
    "glint.at": 0x800DE034, "glint.frame.at": 0x800DE034,
    "ball.rest": 100, "move.middle": 256, "move.middle.last": 257, "move.middle.past": 256,
    "move.stop": 256, "move.stop.refused": 256, "move.ice": 2, "move.ice.slide": 2,
    "move.climb": 413, "move.touch": 412, "move.wrap": 512, "move.lattice": 33,
    "move.cells.up": 36, "move.cells.on": 12,
    "pad.up": 16, "pad.cross": 16384, "pad.left": 128, "pad.right": 32, "pad.r1": 2048, "pad.r2": 512,
    "pad.turn.left": 1, "pad.turn.right": -1, "pad.repeat": 6,
    "roll.gain": 6, "roll.top.gate": 33, "roll.top": 33, "roll.recentre": 8, "roll.fall.from": -101,
    "roll.fall.span": 327, "roll.fall": -10, "roll.fall.rest": -10, "roll.resume": 101,
    "turn.frames": 19, "turn.step": 53, "turn.frames.right": 19, "turn.step.right": -53, "turn.left": 2,
    "turn.right": 1, "turn.clamp.gate": 11, "turn.clamp": 10,
    "wrap.frames": 13, "wrap.step": 78, "wrap.resume": 100, "climb.frames": 16, "climb.step": -64,
    "arc.1.normal": 38, "arc.1.heading": 8, "arc.2.normal": 32, "arc.2.heading": 22,
    "arc.3.normal": 22, "arc.3.heading": 32, "arc.4.normal": 8, "arc.4.heading": 39,
    "fall.gain": -5, "fall.top.gate": -65, "fall.top": -66, "fall.hop": -30, "fall.spin.gain": 6,
    "fall.spin.top.gate": 34, "fall.spin.top": 33, "fall.spin.wane": -1, "fall.back": 6,
    "fall.wall.gate": 411, "fall.wall": 409, "fall.behind.gate": 102, "fall.behind": 103,
    "land.speed": 33, "land.off": 100, "land.short": 180, "land.short.speed": 33, "land.thud": -66,
    "land.under": 100, "land.lift": 100, "lost": 37, "spin": -5, "spin.rest": -5,
    "squash.frames": 4, "squash.rise": 187, "squash.fall": 100, "squash.ease": -10, "squash.least.gate": 20,
    "squash.least": 20, "squash.fall.reset": 100, "squash.hop.frames": 4, "squash.hop.rise": 187,
    "squash.hop.fall": 100,
    "look.rate": 3, "look.rate.jump": 3, "look.rows": 10, "look.near": 550, "look.to.gate": 33, "look.to": 32,
    "look.least.gate": 10, "look.least": 10, "look.far.gate": 651, "look.far": 650, "look.back": -18,
    "look.back.up": 18, "look.held": 21, "look.held.gate": 651, "look.held.far": 650, "look.up": 21,
    "look.up.back": -18, "look.pitch": 250,
    "jump.speed": 33, "jump.rows": 8, "jump.step": -1, "jump.skip": 2, "jump.row": 2, "jump.recentre": 8,
    "jump.long": 3, "jump.catch": 12, "jump.wall": 412, "jump.wall.high": 412, "jump.wall.low": 100,
    "jump.bounce": -10, "jump.ceiling": 412, "jump.ceiling.ahead": 412, "jump.ceiling.behind": 101,
    "jump.snap": 1024, "jump.far": 1536, "boost.type": 10, "boost.roll": 151, "boost.frames": 10, "boost.fire": 231,
    "jump.arm": 1, "jump.keep": 2,
    "hop.rows": 8, "hop.skip": 2, "hop.step": -1, "hop.ahead": 6, "hop.row": 2,
    "body.one": 4096, "body.one.landing": 4096, "body.mark.wrap": 1, "body.mark.wall": 2, "body.mark.right": 3,
    "body.mark.left": 4, "body.test.wrap": 1, "body.test.right": 3, "body.test.left": 4, "body.test.wall": 2,
    "body.wrap": -256, "body.right": -1024, "body.left": 1024, "body.wall": -1024,
    "time.tick": 50, "ball.breathe.full": 6000,
    "take.live": 1, "take.stand": 386, "take.stand.coin": 406, "take.stand.star": 416, "take.stand.hourglass": 436,
    "take.stand.gem": 436, "take.reach": 25600, "take.reach.key": 22500, "take.reach.fruit": 32400,
    "take.within": 10000, "take.first": -27, "take.open": 1, "take.third": 2,
    "key.points": 1000, "gem.points": 2975, "coin.points.0": 750, "coin.points.1": 500, "coin.points.2": 250,
    "star42.points": 1550, "sunglasses.points": 500, "fruit.points.43": 2500, "fruit.points.44": 2500,
    "fruit.points.45": 2500, "fruit.points.46": 2500, "fruit.points.47": 2500,
    "hourglass.from": 5999, "hourglass.second": 50, "hourglass.points": 10,
    "pill.lethargy": 360, "pill.lethargy.step": -2, "pill.lethargy.ticks": 4, "pill.invincible": 840,
    "pill.invincible.step": -1, "pill.bouncy": 840, "pill.bouncy.hold": 839, "pill.bouncy.grow": 1,
    "pill.bouncy.latch": 4, "pill.bouncy.latch.step": 1,
    "sunglasses.word": 840, "sunglasses.step": -1, "sunglasses.blinks": 21, "sunglasses.blink": 9,
    "crumble.points": 50, "crumble.under": 96,
    "send.type": 5, "send.band": -167, "send.band.span": 179, "send.wait": 15, "send.hold": 15,
    "send.hold.after": 15, "send.mark": 5, "throw.type": 9, "throw.band": -197, "throw.band.span": 119,
    "throw.laser": 6, "rearm": -156, "rearm.span": 201, "exit.type": 7, "exit.hidden.type": 26,
    "clock.tick": 1, "clock.face": 8, "clock.mode": 1, "end.time": -2, "end.lost": -3, "end.exit": 1, "wait.exit": 5,
    "end.hidden": 3, "wait.hidden": 5, "end.bonus": 2, "end.spikes": -1, "wait.spikes": 10, "end.fire": -4,
    "wait.fire": 25, "end.captivator": -5, "wait.captivator": 10, "end.star": -5, "wait.star": 10, "end.acid": -6,
    "wait.acid": 6, "end.laser": -7, "wait.laser": 4, "end.simon": -8, "wait.simon": 25, "wait.simon.done": 25,
    "mark.points": 50, "mark.skips": 3, "mark.under": 356,
    "words.win": 20, "words.last": -2, "words.over": 18, "words.over.state": 3, "words.trial": 2, "words.better": 34,
    "words.slow.gate": 1201, "words.slow": 36, "words.allowance": 60, "words.qualified": 24, "words.failed": 22,
    "words.copycat": 1, "words.won2": 30, "words.won1": 28, "words.equal": 32, "words.trial.won2": 30,
    "words.trial.won1": 28, "words.trial.equal": 32, "words.final.world": 10, "words.final": 12,
    "words": {0: "LOADING!", 2: "SPIKED!", 4: "TIME OUT!", 6: "FELL OFF!", 8: "FIRE!", 10: "CAPTURED!", 12: "ACID!",
              14: "LASER!", 16: "Wrong Move!", 18: "Game Over!", 20: "Well Done!", 22: "You failed to qualify!",
              24: "You qualified!", 28: "Player 1 Won!", 30: "Player 2 Won!", 32: "Equal Time!",
              34: "Very Well Done!", 36: "Level Cleared!"},
    "start.wait": 20, "start.guard": 20, "laser.cell": -2, "laser.heat": 1900, "fire.kind": 1, "fire.burn": 40,
    "fire.landed": 1, "fire.land": 600, "fire.limit.gate": 2001, "fire.cool": -15, "heat.chill": -150,
    "end.fire.swell": -4, "fire.swell": 210, "heat.shake": 40, "heat.shake.big": 126, "heat.shake.over": 25,
    "acid.top.gate": 2001, "acid.top": 2000, "acid.kind": 4, "acid.gain": 300, "end.acid.wait": -6,
    "acid.gain.wait": 300, "end.exit.landing": 1, "end.hidden.landing": 3, "end.bonus.landing": 2,
    "spikes12.type": 12, "spikes11.type": 11, "spikes11.deadly": 1, "wait.spikes.landing": 10,
    "wait.spikes.standing": 9, "end.captivator.still": -5, "catch.type53": 53, "catch.near.gate": 16200,
    "catch.square": 44999, "dying.flash": 1024, "dying.flash.full": 4096, "tint.full": -4096, "tint.own": 400,
    "tint.other": 2000, "simon.done": 1, "simon.wrong": 2, "end.view.x": -8, "end.view.y": 3, "end.view.z": 10,
    "end.view.swing": 12, "end.view.swing.bonus": 58, "end.view.off": 1400, "end.view.off.bonus": 3400,
    "end.view.reach": 1000, "end.view.reach.bonus": 3000, "death.most.gate": 5001, "death.most": 5000,
    "death.over": 4, "death.levels": 15, "death.each": 50, "death.each.final": 50,
    "look.below": 250, "look.ahead": 800, "flight.unit.shift": 12, "flight.above": 100, "flight.quarter.shift": 2,
    "flight.half.shift": 1, "flight.third": 3, "flight.first": 13, "flight.end.gate": 1025, "flight.least": 1,
    "flight.curve.shift": 15, "flight.yaw": -1024, "flight.pitch": 250, "flight.bank.from": 1024, "flight.bank.shift": 1,
    "flight.below": 250, "flight.out.shift": 10, "flight.ahead": 800, "flight.out": 14000, "flight.hold": 2000,
    "flight.slow.gate": 929, "flight.step": 16, "flight.end.gate.after": 1025, "flight.done": 1, "flight.gate": 1000,
    "ice.kind": 2, "cold.gain": 40, "cold.top.gate": 501, "cold.back": 400, "cold.wane": -10, "arrow.type": 28,
    "crumble.size": 512, "crumble.shrink": -26, "crumble.whole": 1, "crumble.broken": 2, "crumble.broken.seen": 2,
    "crumble.breaking": 3, "crumble.code.input": 96, "crumble.edge.hold": 301, "crumble.edge.back": 401,
    "crumble.edge.push": 40, "ride.kind": 5, "ride.land": 101, "ride.bias": 512, "ride.bias.back": -512,
    "ride.bias.travel": -512, "ride.rumble": 70, "ride.beam": -2,
    "standing.centre": 256, "standing.shift": 9, "standing.first": 5, "standing.kind.1": 1, "standing.kind.2": 2,
    "standing.kind.3": 3, "standing.kind.4": 4, "standing.kind.5": 5, "standing.kind.6": 6, "standing.kind.7": 7,
    "standing.word.3": 93, "standing.word.5": 95, "standing.word.6": 96, "standing.word.7": 97, "standing.style.1": 1,
    "standing.style.2": 2, "standing.style.3": 3, "standing.style.4": 4, "standing.style.word.3": 93,
    "standing.nothing": -1, "standing.none": -1,
}


def sw(rt, rs, imm):
    return (0x2B << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def jal(target):
    return (3 << 26) | ((target >> 2) & 0x3FFFFFF)


def beq(rs, rt, at, target):
    return (4 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def jr(rs):
    return (R[rs] << 21) | 8


def lui(rt, imm):
    return (0x0F << 26) | (R[rt] << 16) | (imm & 0xFFFF)


def ori(rt, rs, imm):
    return (0x0D << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def xori(rt, rs, imm):
    return (0x0E << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sra(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6) | 3


class Reads(unittest.TestCase):
    def test_a_divisor_is_read_back_from_its_reciprocal_and_shift(self):
        c = code(lui("a0", 0x6666), ori("a0", "a0", 0x6667), sra("v1", "a2", 4))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 40)
        c = code(lui("a0", 0x38e3), ori("a0", "a0", 0x8e39), sra("v1", "a2", 1))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 9)

    def test_a_word_is_its_lui_and_ori_halves_whatever_the_low_halfs_top_bit(self):
        c = code(lui("v1", 0x41c6), ori("v1", "v1", 0x4e6d), lui("a0", 0x38e3), ori("a0", "a0", 0x8e39))
        self.assertEqual(c.word_of(AT, "lui $v1, {}", AT + 4, "ori $v1, $v1, {}"), 0x41c64e6d)
        self.assertEqual(c.word_of(AT + 8, "lui $a0, {}", AT + 12, "ori $a0, $a0, {}"), 0x38e38e39)

    def test_a_grey_is_the_one_level_of_a_colour_word_in_two_halves(self):
        c = code(lui("v1", 0x0080), ori("v1", "v1", 0x8080), lui("v1", 0x00ff), ori("v1", "v1", 0xff00))
        self.assertEqual(c.grey(AT, "lui $v1, {}", AT + 4, "ori $v1, $v1, {}"), 128)
        with self.assertRaises(SystemExit):
            c.grey(AT + 8, "lui $v1, {}", AT + 12, "ori $v1, $v1, {}")

    def test_an_immediate_is_read_from_the_instruction_it_lives_in(self):
        c = code(addiu("a0", "v1", -75))
        self.assertEqual(c.immediate(AT, "addiu $a0, $v1, {}"), -75)

    def test_a_logic_immediate_is_read_unsigned_as_the_processor_takes_it(self):
        c = code(xori("v0", "v0", 2), xori("v0", "v0", 0x8000))
        self.assertEqual(c.immediate(AT, "xori $v0, $v0, {}"), 2)
        self.assertEqual(c.immediate(AT + 4, "xori $v0, $v0, {}"), 32768)

    def test_another_instruction_there_stops_the_reading(self):
        c = code(addiu("a0", "v0", -75))
        with self.assertRaises(SystemExit):
            c.immediate(AT, "addiu $a0, $v1, {}")

    def test_a_multiplier_is_what_shifts_and_adds_do_to_a_register(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "v0"), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 20)
        c = code(sll("a0", "v1", 2), addu("a0", "a0", "v1"), sll("v1", "a0", 4),
                 subu("v1", "v1", "a0"), sll("v1", "v1", 3))
        self.assertEqual(c.multiplier(AT, 5, "v1", "v1"), 600)

    def test_a_register_the_run_never_derived_stops_the_reading(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "a0"), sll("v1", "v1", 1))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "zero"))
        self.assertEqual(c.multiplier(AT, 2, "v0", "v1"), 4)

    def test_an_instruction_reading_its_first_register_overwrites_nothing_in_the_run(self):
        c = code(sw("zero", "a0", 0), sll("v1", "v0", 2), addu("v1", "v1", "zero"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 4)
        c = code(sll("v1", "v0", 2), sw("v1", "a0", 0), addu("v1", "v1", "v0"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 5)
        c = code(sll("v1", "v0", 2), beq("v1", "zero", AT + 4, AT + 12), addu("v1", "v1", "v0"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 5)

    def test_a_load_in_the_run_is_fine_unless_the_product_reads_it(self):
        c = code(sll("v1", "v0", 1), addu("v1", "v1", "v0"), lh("v0", "a0", 8), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 4, "v0", "v1"), 12)
        c = code(sll("v1", "v0", 1), lh("v0", "a0", 8), addu("v1", "v1", "v0"))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")


class Shadow(unittest.TestCase):
    def square(self, corners):
        """An executable whose draws load these four corners."""
        lui_at, addiu_at = SHADOW_SQUARE
        at = 0x800a0040 - EXE_BASE
        blob = bytearray(at + 8 * len(corners))
        struct.pack_into("<I", blob, lui_at - EXE_BASE, lui("a0", 0x000a))
        struct.pack_into("<I", blob, addiu_at - EXE_BASE, addiu("a0", "a0", 0x40))
        for i, c in enumerate(corners):
            struct.pack_into("<4h", blob, at + 8 * i, *c)
        return Code(bytes(blob))

    def test_the_square_is_read_as_how_far_it_reaches_from_its_middle(self):
        c = self.square([(150, 0, 150, 0), (-150, 0, 150, 0), (150, 0, -150, 0), (-150, 0, -150, 0)])
        self.assertEqual(shadow_half(c), 150)

    def test_a_shape_that_is_not_a_flat_square_stops_the_reading(self):
        for corners in ([(150, 0, 150, 0), (-150, 0, 150, 0), (150, 0, -150, 0), (-150, 0, -140, 0)],
                        [(150, 0, 150, 0), (-150, 9, 150, 0), (150, 0, -150, 0), (-150, 0, -150, 0)]):
            with self.assertRaises(SystemExit):
                shadow_half(self.square(corners))


class Light(unittest.TestCase):
    def table(self, rows):
        """An executable whose light builds the address of these rows."""
        lui_at, addiu_at = LIGHT_ROOT
        at = 0x80070040 - EXE_BASE
        blob = bytearray(at + 16 * len(rows))
        struct.pack_into("<I", blob, lui_at - EXE_BASE, lui("a0", 0x0007))
        struct.pack_into("<I", blob, addiu_at - EXE_BASE, addiu("a0", "a0", 0x40))
        for i, row in enumerate(rows):
            struct.pack_into("<4I", blob, at + 16 * i, *row)
        return Code(bytes(blob))

    def chord(self):
        """The rows the game holds: a straight line between the rounded roots
        of the powers of two either side of a square."""
        out = []
        for zeros in range(ROOT_ROWS):
            low = round((1 << (31 - zeros)) ** 0.5)
            out.append((round((1 << (32 - zeros)) ** 0.5) - low, (1 << (31 - zeros)) - 1, low, 0))
        return out

    def test_a_row_is_the_root_below_a_square_and_the_step_to_the_next(self):
        rows = root_table(self.table(self.chord()))
        self.assertEqual(len(rows), ROOT_ROWS)
        self.assertEqual(rows[14], [362, 150])
        self.assertEqual(rows[13], [512, 212])

    def test_a_row_that_masks_anything_but_its_power_of_two_stops_the_reading(self):
        rows = self.chord()
        rows[5] = (rows[5][0], rows[5][1] >> 1, rows[5][2], 0)
        with self.assertRaises(SystemExit):
            root_table(self.table(rows))

    def test_the_light_ships_both_ways_round_with_the_root_it_measures_by(self):
        lit = light(GAME)
        self.assertEqual((lit["near"], lit["far"], lit["full"], lit["bits"]), (350, 512, 128, 23))
        self.assertEqual(lit["turned"], {"kind": 9, "value": 1, "near": 1280, "far": 1792})
        self.assertEqual(lit["root"], GAME["light.root"])

    def test_a_light_not_full_at_one_brightness_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            light({**GAME, "light.full.turned": 255})

    def test_a_fixed_point_that_does_not_come_back_to_full_stops_the_reading(self):
        for change in ({"light.scale": 0x2000}, {"light.bits.high": 8}):
            with self.assertRaises(SystemExit):
                light({**GAME, **change})

    def test_a_light_on_another_kind_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            light({**GAME, "light.kind": 2})


class Glow(unittest.TestCase):
    OWN = [2, 2, 2, 2]
    EDGE = [[-1, 0, -1, 1, [0, 2, 0, 2]], [-1, 0, 0, 0, [0, 2, 0, 2]], [0, 0, 0, 4, [0, 1, 0, 1]]]

    def maker(self, own=OWN):
        """A routine where the game's makes a light, which takes the face it is
        given at `own`, then the first of three faces for one edge that is
        there."""
        words = [addu("s0", "a0", "zero"), addu("v1", "a2", "zero")]

        def take(levels):
            for i, v in enumerate(levels):
                words.extend([addiu("t0", "zero", v), sw("t0", "sp", 16 + 4 * i)])
            words.extend([jal(GLOW_FACE), 0])
        take(own)
        ends = []
        for dx, _, dz, face, levels in self.EDGE:
            words.extend([addiu("a0", "s0", dx), addiu("a2", "v1", dz), addiu("a3", "zero", face)])
            take(levels)
            ends.append(len(words))
            words.extend([0, 0])
        end = GLOW_MAKE + 4 * len(words)
        for i in ends:
            words[i] = beq("v0", "zero", GLOW_MAKE + 4 * i, end)
        words.extend([jr("ra"), 0])
        blob = bytearray(GLOW_MAKE - EXE_BASE) + b"".join(struct.pack("<I", w) for w in words)
        return Code(bytes(blob))

    def test_a_light_tries_an_edges_faces_in_order_until_one_is_there(self):
        spill = glow_spill(self.maker())
        self.assertEqual(len(spill), 6)
        for face, groups in enumerate(spill):
            self.assertEqual(groups, [[[0, 0, 0, face, self.OWN]], self.EDGE])

    def test_a_light_not_started_from_its_own_face_at_full_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            glow_spill(self.maker(own=[1, 1, 1, 1]))


class Glint(unittest.TestCase):
    def test_the_glint_ships_its_steps_its_slots_and_a_generator_of_its_own(self):
        g = glint(GAME)
        self.assertEqual((g["chance"], g["rise"], g["top"], g["fall"], g["slots"]), (3, 128, 254, 16, 16))
        self.assertEqual((g["rows"], g["cuts"]), (3, 3))
        self.assertEqual(g["dice"], {"seed": 1, "times": 1103515245, "plus": 12345})

    def test_a_frame_that_runs_the_glint_over_other_records_stops_the_reading(self):
        for change in ({"glint.frame.at": 0x800DE038}, {"glint.frame.rows": 2}, {"glint.frame.record": 344}):
            with self.assertRaises(SystemExit):
                glint({**GAME, **change})

    def test_a_record_that_does_not_hold_its_slots_or_a_row_its_records_stops_the_reading(self):
        for change in ({"glint.slots": 15}, {"glint.row": 1040, "glint.frame.row": 1040}):
            with self.assertRaises(SystemExit):
                glint({**GAME, **change})

    def test_a_glint_that_steps_more_than_a_flat_polygons_first_corner_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            glint({**GAME, "glint.flat": 12})


class Lift(unittest.TestCase):
    TELEPORTER = [[6144, 6144, 5120], [5120, 5120, 6144], [5120, 6144, 5120], [6144, 5120, 5120]]

    def code(self, up=13, down=12):
        """An executable whose lit devices lift their light as the game's do."""
        table = 0x800a3308
        blob = bytearray(table - EXE_BASE + 48)
        put = lambda at, w: struct.pack_into("<I", blob, at - EXE_BASE, w)
        for i, w in enumerate((sll("v0", "a1", 1), addu("v0", "v0", "a1"), sll("v0", "v0", 2))):
            put(0x8002d4a4 + 4 * i, w)
        lui_at, lw_at = GLOW_LIFT
        put(lui_at, lui("at", 0x000a))
        put(lw_at, (0x23 << 26) | (R["at"] << 21) | (R["v1"] << 16) | 0x3308)
        for c, triple in enumerate(self.TELEPORTER):
            struct.pack_into("<3I", blob, table - EXE_BASE + 12 * c, *triple)
        for left, right in GLOW_DOUBLE.values():
            put(left, sll("v0", "s5", up))
            put(right, sra("s5", "v0", down))
        return Code(bytes(blob))

    def test_a_lit_teleporter_takes_its_circuits_triple_and_an_exit_or_a_switch_twice_its_light(self):
        lift = glow_lift(self.code())
        self.assertEqual(lift["5"], self.TELEPORTER)
        self.assertEqual(lift["7"], [[8192] * 3])
        self.assertEqual(lift["9"], [[8192] * 3])

    def test_the_shifts_say_how_many_times_over(self):
        self.assertEqual(glow_lift(self.code(up=14))["9"], [[16384] * 3])


def rise_at(seq):
    """Where the spikes leave the ground: the frame after the last flat one."""
    return next(i for i in range(len(seq)) if seq[i - 1] == 0 and seq[i] == 6)


def runs(seq):
    """How long each value lasts, round the cycle, starting from a change."""
    start = next(i for i in range(len(seq)) if seq[i - 1] != seq[i])
    out = []
    for v in seq[start:] + seq[:start]:
        if out and out[-1][0] == v:
            out[-1][1] += 1
        else:
            out.append([v, 1])
    return out


class Cycles(unittest.TestCase):
    def test_the_spikes_run_143_frames_from_flat_to_full_and_back(self):
        seq = [f for f, _ in spike_cycle(GAME, 0)]
        self.assertEqual(len(seq), 143)
        self.assertTrue(all(0 <= f <= 31 for f in seq))
        rise = rise_at(seq)
        twice = seq + seq
        self.assertEqual(twice[rise - 1:rise + 22],
                         [0, 6, 12, 19, 25, 31, 2, 31, 6, 31, 11, 31, 15, 31, 20, 31, 25, 31, 29, 31, 31, 31, 31])
        self.assertEqual(twice[rise + 20:rise + 34], [31] * 14)
        self.assertEqual(twice[rise + 34:rise + 79],
                         [31, 30, 29, 29, 28, 27, 26, 26, 25, 24, 24, 23, 22, 21, 21, 20, 19, 18, 18, 17, 16, 16,
                          15, 14, 13, 13, 12, 11, 10, 10, 9, 8, 8, 7, 6, 5, 5, 4, 3, 2, 2, 1, 0, 0, 0])
        self.assertEqual(runs([f == 0 for f in seq]), [[False, 76], [True, 67]])

    def test_the_spikes_phases_are_35_frames_apart_from_the_second_cycle(self):
        starts = [rise_at([f for f, _ in spike_cycle(GAME, p)]) for p in range(PHASES)]
        self.assertEqual([(starts[0] - s) % 143 for s in starts], [0, 35, 72, 107])

    def test_the_spikes_are_deadly_from_two_frames_before_they_rise_until_11_of_the_retraction_remain(self):
        for p in range(PHASES):
            frames, deadly = map(list, zip(*spike_cycle(GAME, p)))
            rise = 143 + rise_at(frames)
            self.assertEqual((deadly * 3)[rise - 3:rise + 141], [False] + [True] * 68 + [False] * 75)
            self.assertEqual((frames * 3)[rise + 65:rise + 67], [8, 8])
        self.assertEqual([spike_cycle(GAME, p)[0][1] for p in range(PHASES)], [False, False, True, True])

    def test_a_flag_that_is_not_the_hazards_value_as_the_spikes_rise_stops_the_reading(self):
        for change in ({"spikes.rise.flag": 2}, {"spikes.retract.flag": 1}, {"spikes.phase.down.flag": 1},
                       {"spikes.phase.up.flag": 2}):
            with self.assertRaises(SystemExit):
                spike_cycle({**GAME, **change}, 0)

    def test_the_vanishing_block_runs_224_frames_through_its_six_states(self):
        seq = vanish_cycle(GAME, 0)
        self.assertEqual(len(seq), 224)
        self.assertEqual(sorted(runs([s for s, _ in seq])),
                         [[0, 91], [1, 9], [2, 5], [3, 91], [4, 9], [5, 19]])
        self.assertTrue(all(0 <= v <= 255 for _, v in seq))
        self.assertTrue(all(v == 128 for s, v in seq if s == 3))
        self.assertEqual([v for s, v in seq if s == 1], [0, 28, 56, 85, 113, 141, 170, 198, 226])
        self.assertEqual([v for s, v in seq if s == 2], [255, 211, 166, 121, 76])
        self.assertEqual([v for s, v in seq if s == 4], [32, 57, 82, 107, 132, 157, 182, 207, 232])
        self.assertEqual([v for s, v in seq if s == 5][:3] + [v for s, v in seq if s == 5][-2:],
                         [255, 241, 228, 26, 13])

    def test_a_vanishing_ramp_that_does_not_run_over_its_state_stops_the_reading(self):
        for change in ({"vanish.dim.by": 8}, {"vanish.in.over": 8}):
            with self.assertRaises(SystemExit):
                vanish_cycle({**GAME, **change}, 0)

    def test_the_vanishing_block_phases_are_a_quarter_cycle_apart(self):
        appear = [[s for s, _ in vanish_cycle(GAME, p)].index(1) for p in range(PHASES)]
        self.assertEqual([(appear[0] - a) % 224 for a in appear], [0, 56, 112, 168])


class Laser(unittest.TestCase):
    def test_a_circuit_is_its_level_shifted_into_one_channel_or_two(self):
        beam = laser(GAME)
        self.assertEqual(beam["colours"], [[8, 8, 0], [0, 0, 8], [0, 8, 0], [8, 0, 0]])
        self.assertEqual((beam["reach"], beam["nozzle"], beam["width"]), (256, 90, 14))

    def test_a_shift_past_its_channel_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.colour.2": 14})

    def test_a_stretch_short_of_its_faces_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.reach": 200, "laser.reach.back": -200})

    def test_a_blend_that_does_not_add_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.mode": 0})


class Spins(unittest.TestCase):
    def code(self, routine):
        """An executable whose every type's draw builds its spin with `routine`."""
        end = max(SPUN_AT.values()) + 4
        blob = bytearray(end - EXE_BASE)
        for at in SPUN_AT.values():
            struct.pack_into("<I", blob, at - EXE_BASE, jal(routine))
        return Code(bytes(blob))

    def test_a_type_turns_in_the_order_the_routine_its_draw_calls_composes(self):
        for routine, order in SPINS.items():
            self.assertEqual(set(spin_orders(self.code(routine)).values()), {order})

    def test_a_routine_the_reading_does_not_know_stops_it(self):
        with self.assertRaises(SystemExit):
            spin_orders(self.code(0x80060f58))


class Moves(unittest.TestCase):
    STATES = [0x8002f8e4, 0x8003007c, 0x8002fce0, 0x8002f930, 0x80030228, 0x80030228, 0x80030228, 0x8002ff18,
              0x8002fa38]

    def states(self, words=STATES):
        """An executable whose ball dispatches its states through these words."""
        at, _, count = STATES
        blob = bytearray(at - EXE_BASE + 4 * count)
        for i, w in enumerate(words):
            struct.pack_into("<I", blob, at - EXE_BASE + 4 * i, w & 0x0FFFFFFF)
        return Code(bytes(blob))

    def test_the_moves_hold_together_at_the_middle_the_wall_and_the_edge(self):
        moves(self.states(), GAME)

    def test_a_state_sent_elsewhere_stops_the_reading(self):
        words = list(self.STATES)
        words[3], words[8] = words[8], words[3]
        with self.assertRaises(SystemExit):
            moves(self.states(words), GAME)

    def test_a_wall_that_does_not_take_the_ball_touching_it_stops_the_reading(self):
        for change in ({"move.touch": 400}, {"move.climb": 412}, {"ball.rest": 90}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})

    def test_a_middle_not_half_a_block_in_or_an_edge_not_at_the_far_side_stops_the_reading(self):
        for change in ({"move.stop": 255}, {"move.middle.last": 256}, {"move.middle.past": 257}, {"move.wrap": 500}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})

    def test_another_kind_than_ice_another_edge_or_other_strides_stop_the_reading(self):
        for change in ({"move.ice.slide": 1}, {"move.lattice": 34}, {"move.cells.up": 24}, {"move.cells.on": 8}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})


class Roll(unittest.TestCase):
    def test_the_roll_ships_one_top_speed_and_an_arc_that_ends_a_radius_off_the_new_face(self):
        r = roll(GAME)
        self.assertEqual(r["rolling"], {"gain": 6, "top": 33, "middle": 256, "wrap": 512, "climb": 413, "touch": 412,
                                     "resume": 100, "recentre": 8, "repeat": 6, "over": [101, 427]})
        self.assertEqual(r["wrap"]["arc"], [[38, 8], [32, 22], [22, 32], [8, 39]])
        self.assertEqual(sum(n for n, _ in r["wrap"]["arc"]), r["rolling"]["resume"])
        self.assertEqual(sum(h for _, h in r["wrap"]["arc"]), r["rolling"]["resume"] + 1)
        self.assertEqual((r["quarter"], r["climb"]), ({"frames": 19, "step": 53, "clamp": 10}, {"frames": 16, "step": -64}))
        self.assertEqual(r["fall"]["lost"], [-2, 36])
        self.assertEqual((r["fall"]["wall"], r["fall"]["behind"], r["fall"]["hold"]), (409, 103, [411, 102]))
        self.assertEqual((r["spin"], r["squash"]["least"], r["look"]["far"]), (-5, 20, 650))

    def test_a_top_speed_taken_otherwise_at_a_landing_stops_the_reading(self):
        for change in ({"land.speed": 30}, {"land.short.speed": 30}, {"roll.top.gate": 34}, {"fall.spin.top": 32}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_ramp_that_does_not_come_to_a_quarter_turn_stops_the_reading(self):
        for change in ({"wrap.frames": 12}, {"wrap.step": 79}, {"climb.step": -60}, {"turn.frames": 18},
                       {"turn.step.right": -52}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_an_arc_that_does_not_end_off_the_new_face_stops_the_reading(self):
        for change in ({"arc.4.normal": 9}, {"wrap.resume": 90}, {"land.off": 90}, {"land.under": 90}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_pad_bit_shared_doubled_or_a_turn_not_opposite_stops_the_reading(self):
        for change in ({"pad.r1": 16}, {"pad.r2": 3}, {"pad.turn.right": 1}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_gate_not_one_past_its_value_stops_the_reading(self):
        for change in ({"fall.top.gate": -66}, {"turn.clamp.gate": 10}, {"look.to.gate": 32}, {"fall.wall": 408},
                       {"squash.hop.rise": 180}, {"spin.rest": -4}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})


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


class Body(unittest.TestCase):
    def test_the_body_turns_a_quarter_over_the_arc_in_steps_of_a_sixteenth(self):
        self.assertEqual(body(GAME), -256)
        self.assertEqual(body(GAME) * 4, -1024)

    def test_a_mark_not_the_one_the_draw_tests_for_or_shared_stops_the_reading(self):
        for change in ({"body.mark.right": 4}, {"body.test.wall": 3}, {"body.mark.wrap": 0, "body.test.wrap": 0},
                       {"body.mark.left": 3, "body.test.left": 3}):
            with self.assertRaises(SystemExit):
                body({**GAME, **change})

    def test_a_turn_that_is_not_a_quarter_or_another_fixed_point_stops_the_reading(self):
        for change in ({"body.wrap": -200}, {"body.right": -1000}, {"body.left": -1024}, {"body.wall": 1024},
                       {"body.one": 4000}, {"body.one.landing": 1}):
            with self.assertRaises(SystemExit):
                body({**GAME, **change})


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

    def test_a_type_sent_elsewhere_stops_the_reading(self):
        for swap in ({31: TAKE_CASES[37]}, {28: TAKE_CASES[31]}, {36: TAKE_TAIL}):
            with self.assertRaises(SystemExit):
                dispatch(self.cases(TAKE_TYPES, {**TAKE_CASES, **swap}, TAKE_TAIL), TAKE_TYPES, TAKE_CASES, TAKE_TAIL,
                         "the walk")
        with self.assertRaises(SystemExit):
            dispatch(self.cases(LOADER_TYPES, {**LOADER_CASES, 7: LOADER_PLAIN}, LOADER_PLAIN), LOADER_TYPES,
                     LOADER_CASES, LOADER_PLAIN, "the loader")


class Take(unittest.TestCase):
    def test_a_pickup_ships_its_reach_its_stand_and_its_points(self):
        taken, lasting = take(GAME)
        self.assertEqual(taken[31], {"reach": 150, "stand": 386, "points": 1000})
        self.assertEqual(taken[32], {"reach": 160, "stand": 386})
        self.assertEqual(taken[35], {"reach": 160, "stand": 436, "points": 10, "clock": {"from": 5999, "second": 50}})
        self.assertEqual(taken[36], {"reach": 160, "stand": [386, 436, 436], "points": 2975})
        self.assertEqual(taken[37], {"reach": 160, "stand": 406, "points": [750, 500, 250]})
        self.assertEqual(taken[42], {"reach": 160, "stand": 416, "points": 1550})
        for t in range(43, 48):
            self.assertEqual(taken[t], {"reach": 180, "stand": 386, "points": 2500})
        self.assertEqual(set(taken), {31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47})
        self.assertEqual(lasting[32], {"word": 360, "step": 2, "ticks": 4})
        self.assertEqual(lasting[33], {"word": 840, "hold": 839, "latch": 4})
        self.assertEqual(lasting[34], {"word": 840, "step": 1})
        self.assertEqual(lasting[38], {"word": 840, "step": 1, "blink": {"times": 21, "frames": 9}})

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
                                      "simon": "Wrong Move!"})
        self.assertEqual(p["bonus"], {"block": 50, "skips": 3})
        self.assertEqual(p["points"], {"each": 50, "most": 5000, "levels": 15})
        self.assertEqual(p["view"], {"angles": [-8, 3, 10], "swing": 12, "off": 1400, "reach": 1000,
                                     "bonus": {"swing": 58, "off": 3400, "reach": 3000}})
        self.assertEqual(p["flight"], flight(GAME))

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

    def test_an_ending_shared_or_waited_otherwise_stops_the_reading(self):
        for change in ({"end.acid": -4}, {"end.exit": 4}, {"end.star": -4}, {"wait.star": 9}, {"wait.hidden": 4},
                       {"wait.simon.done": 24}, {"mark.under": 300}, {"mark.skips": 2}, {"clock.face": 9},
                       {"exit.type": 8}, {"end.exit.landing": 2}, {"simon.done": 3}, {"end.captivator.still": -4},
                       {"acid.gain.wait": 200}, {"death.each.final": 25}, {"end.time": -3}, {"end.spikes": -2},
                       {"death.most.gate": 5000}, {"death.levels": 14}, {"simon.wrong": 3},
                       {"flight.end.gate.after": 1024}, {"flight.curve.shift": 12}, {"flight.out.shift": 9},
                       {"flight.yaw": -1000}, {"flight.bank.from": 2048}, {"flight.least": 2}, {"flight.pitch": 200},
                       {"flight.below": 200}, {"flight.ahead": 700}, {"flight.hold": 900}, {"flight.done": 1000},
                       {"flight.gate": 20}, {"words.win": 26}, {"words.final": 14}, {"words.last": -1},
                       {"words.trial.won1": 30}, {"words.slow.gate": 1200}, {"words.copycat": 2}):
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
        with mock.patch("kula_motion.WORDS", {0: ("HELLO!", zlib.crc32(dark + light))}):
            self.assertEqual(words(self.code([zlib.compress(dark), zlib.compress(light)])), {0: "HELLO!"})

    def test_another_count_another_pair_not_an_image_or_not_a_stream_stops_the_reading(self):
        dark, light = self.image(b"the relief"), self.image(b"the highlights")
        pair = [zlib.compress(dark), zlib.compress(light)]
        with mock.patch("kula_motion.WORDS", {0: ("HELLO!", zlib.crc32(dark + light))}):
            for c in (self.code(pair, count=WORDS_COUNT - 1), self.code(pair[::-1]),
                      self.code([zlib.compress(self.image(b"the relief", flags=9)), pair[1]]),
                      self.code([pair[0], zlib.compress(b"\x10\0\0")]), self.code([pair[0], b"not deflate"])):
                with self.assertRaises(SystemExit):
                    words(c)


class Harms(unittest.TestCase):
    def test_the_harms_ship_by_kind_and_by_type_with_the_captivators_squared_reach(self):
        h = harms(GAME)
        self.assertEqual(h["kinds"][1]["heat"], {"burn": 40, "land": 600, "limit": 2000, "cool": 15,
                                                 "swell": 210, "shake": {"base": 40, "over": 25, "big": 126}})
        self.assertEqual(h["kinds"][4], {"melt": {"gain": 300, "top": 2000}})
        self.assertEqual(h["kinds"][8], {"harm": {"cell": -2, "heat": 1900}})
        self.assertEqual(h["types"][11], {"harm": {"flag": 1, "standing": 9}})
        self.assertEqual(h["types"][42], {"harm": {"form": 0}})
        for t in (50, 51, 52, 56):
            self.assertEqual(h["types"][t], {"catch": {"square": 44999}})
        self.assertEqual(h["types"][53], {"catch": {"square": 16199}})
        self.assertEqual(h["types"][30], {"dying": {"flash": 1024}, "tint": {"own": 400, "other": 2000}})

    def test_a_harm_read_from_another_kind_type_or_limit_stops_the_reading(self):
        for change in ({"fire.kind": 2}, {"laser.cell": -1}, {"fire.limit.gate": 2000}, {"acid.top.gate": 2000},
                       {"spikes12.type": 11}, {"catch.type53": 52}, {"tint.full": -2048}, {"fire.landed": 2}):
            with self.assertRaises(SystemExit):
                harms({**GAME, **change})


class Blocks(unittest.TestCase):
    def test_the_blocks_under_the_ball_ship_the_cold_the_edge_rule_and_the_ride_by_kind(self):
        b = blocks(GAME)
        self.assertEqual(b[2], {"chill": 150, "cold": {"gain": 40, "over": 500, "back": 400, "wane": 10}})
        self.assertEqual(b[6], {"size": 512, "shrink": 26, "edge": {"hold": 301, "back": 401, "push": 40}})
        self.assertEqual(b[5], {"ride": {"land": 100, "bias": 512, "rumble": 70}})
        self.assertEqual(set(b), {2, 5, 6})

    def test_a_block_read_from_another_kind_or_held_otherwise_stops_the_reading(self):
        for change in ({"ice.kind": 1}, {"arrow.type": 27}, {"ride.kind": 6}, {"crumble.code.input": 95},
                       {"cold.back": 500}, {"cold.wane": 10}, {"crumble.size": 256}, {"crumble.breaking": 2},
                       {"crumble.broken.seen": 3}, {"crumble.edge.hold": 256}, {"crumble.edge.back": 301},
                       {"ride.bias.travel": 512}, {"ride.land": 100}, {"ride.beam": -1}):
            with self.assertRaises(SystemExit):
                blocks({**GAME, **change})


class Standing(unittest.TestCase):
    def test_the_ball_stands_on_each_kind_as_its_own_number_or_one_past_the_types(self):
        self.assertEqual(standing(GAME), {1: 1, 2: 2, 3: 93, 4: 4, 5: 95, 6: 96, 7: 97})

    def test_a_word_read_from_another_kind_or_style_or_a_cell_taken_otherwise_stops_the_reading(self):
        for change in ({"standing.kind.5": 6}, {"standing.style.3": 2}, {"standing.style.word.3": 92},
                       {"standing.word.6": 95}, {"standing.word.5": 50}, {"standing.nothing": 0},
                       {"standing.none": 0}, {"standing.centre": 255}, {"standing.shift": 8}, {"standing.first": 4}):
            with self.assertRaises(SystemExit):
                standing({**GAME, **change})


class Table(unittest.TestCase):
    def test_the_table_carries_a_program_per_phase_and_the_platform_scaled(self):
        r = dict(GAME)
        for key in ("coin.turn", "coin.bob", "coin.bob.reach", "fruit.turn", "fruit.tilt",
                    "fruit.tilt.reach", "fruit.bob", "fruit.bob.reach", "gem.turn",
                    "hourglass.swing", "hourglass.turn", "hourglass.lean", "pill.flip",
                    "pill.turn", "star42.form", "star42.form.past", "star42.orbit.brown",
                    "star42.orbit.green", "star42.orbit.radius", "teleporter.turn",
                    "exit.turn", "exit.turn.open", "platform.dwell", "corkscrew.phase0",
                    "corkscrew.phase1", "corkscrew.phase2", "corkscrew.bounce",
                    "corkscrew.wrap", "corkscrew.rise", "corkscrew.spin", "star52.sway",
                    "star52.sway.reach", "star52.tumble.x", "star52.tumble.y",
                    "star50.tumble.x", "star50.tumble.y", "star50.tumble.z", "star50.travel",
                    "ball53.shake", "ball53.lurch.reach", "ball53.dash", "ball53.settle",
                    "ball53.ways", "wheel.roll",
                    "wheel.travel", "wheel.turning", "wheel.turn.right", "wheel.turn.about",
                    "corkscrew.drop", "ball.breathe", "ball.breathe.reach",
                    "button.start", "button.full", "button.sink", "button.rise", "button.reach",
                    "ball.breathe.full", "ball.breathe.over", "time.tick"):
            r.setdefault(key, 1)
        r.update({"ball.light.down": 2, "ball.light.into": 1, "ball.light.background": 2048,
                  "ball.light.colour": 4000, "ball.light.base": 178})
        r["platform.scale"] = 50
        r["captivator.standoff"] = 456
        r["corkscrew.drop"] = 150
        r.update({"dice.seed": 1, "dice.times": 0x41C64E6D, "dice.plus": 12345})
        r["glow"] = {"every": 19, "part": [1792, 4096], "spill": []}
        r["glow.colours"] = {5: [[[25, 25, 0]] * 4], 7: [[[16, 64, 16]]], 9: [[[25, 25, 0]] * 4]}
        last = (31, 32, 33, 34, 35, 37, 38, 42, 43, 44, 45, 46, 47, 51, 56)
        r["spin.order"] = {t: "zyx" if t in last else "xyz" for t in SPUN_AT}
        r["spin.quarter"] = 1024
        t = table(r, 30)
        self.assertEqual(t["hz"], 60)
        self.assertEqual(t["kinds"]["5"], {"speed": 25, "dwell": 1, "ride": {"land": 100, "bias": 512, "rumble": 70},
                                           "standing": 95})
        self.assertEqual(t["kinds"]["3"]["light"]["far"], 512)
        self.assertEqual(t["glow"]["colours"]["9"], [[[25, 25, 0]] * 4])
        self.assertEqual(t["glow"]["every"], 19)
        self.assertNotIn("glow", t["types"]["5"])
        self.assertEqual(t["kinds"]["8"]["levels"], GAME["laser.levels"])
        self.assertEqual([len(c) for c in t["types"]["11"]["cycle"]], [143] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["cycle"]], [224] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["level"]], [224] * PHASES)
        self.assertEqual(t["types"]["56"]["phases"], [1, 1, 1, 0])
        self.assertEqual(t["types"]["56"]["bounce"]["spin"], -r["corkscrew.spin"])
        for k in ("50", "51", "52", "53"):
            self.assertEqual(t["types"][k]["entry"], {"stand": 200})
        self.assertEqual(t["types"]["56"]["entry"], {"stand": 50})
        self.assertNotIn("entry", t["types"]["37"])
        self.assertEqual(t["dice"], {"seed": 1, "times": 1103515245, "plus": 12345})
        self.assertEqual(t["types"]["36"]["glint"], glint(GAME))
        self.assertEqual(t["types"]["30"]["light"],
                         {"view": [-1, -4, -2], "background": 2048, "colour": 4000, "base": 178})
        self.assertEqual(t["types"]["30"]["rolling"]["top"], 33)
        self.assertEqual(t["types"]["30"]["wrap"], {"frames": 13, "step": 78, "arc": [[38, 8], [32, 22], [22, 32], [8, 39]],
                                                 "body": -256})
        self.assertEqual(t["types"]["30"]["fall"]["short"], 180)
        self.assertEqual(t["types"]["30"]["fall"]["hold"], [411, 102])
        self.assertEqual(t["types"]["30"]["spin"], -5)
        self.assertEqual(t["types"]["30"]["jump"]["far"], 1536)
        self.assertEqual(set(t["types"]["30"]), {"breathe", "light", "shadow", "before", "rolling", "quarter", "wrap", "climb",
                                                 "fall", "spin", "squash", "look", "jump", "dying", "tint"})
        self.assertEqual(t["types"]["43"]["order"], "zyx")
        self.assertEqual(t["types"]["7"]["order"], "xyz")
        self.assertEqual(t["types"]["51"]["order"], "zyx")
        self.assertEqual([t["types"][k].get("axes") for k in ("50", "51", "52", "53")],
                         ["world", None, "world", "world"])
        self.assertEqual(t["types"]["51"]["before"], [0, 0, 1024])
        self.assertEqual(t["types"]["30"]["before"], [2048, 0, 0])
        self.assertNotIn("before", t["types"]["37"])
        self.assertNotIn("glint", t["types"]["37"])
        with self.assertRaises(SystemExit):
            table({**r, "glint.model": 39}, 30)
        self.assertEqual(set(t["types"]["10"]["press"]), {"start", "full", "sink", "rise", "reach"})
        self.assertEqual(t["shadow"], {"half": 150})
        for k in ("50", "52", "53"):
            self.assertEqual(t["types"][k]["shadow"], {"sprite": 0, "off": 0, "strength": 128})
        self.assertEqual(t["types"]["51"]["shadow"],
                         {"sprite": 1, "off": 0, "strength": 128, "turns": True})
        self.assertEqual(t["types"]["56"]["shadow"],
                         {"sprite": 0, "off": 30, "strength": 128, "fade": 48})
        self.assertEqual(t["types"]["30"]["shadow"],
                         {"sprite": 0, "off": 0, "strength": 128, "top": 512, "over": 412,
                          "squash": True})
        self.assertEqual({k for k, v in t["types"].items() if "shadow" in v},
                         {"30", "50", "51", "52", "53", "56"})
        with self.assertRaises(SystemExit):
            table({**r, "shadow.sprite.51": 2}, 30)
        self.assertEqual(set(t["types"]), {str(k) for k in
                                           (5, 7, 9, 10, 11, 26, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42,
                                            43, 44, 45, 46, 47, 50, 51, 52, 53, 56)})
        self.assertEqual(t["types"]["31"]["take"], {"reach": 150, "stand": 386, "points": 1000})
        self.assertEqual(t["types"]["37"]["take"]["points"], [750, 500, 250])
        self.assertEqual([t["types"][k]["lasts"]["word"] for k in ("32", "33", "34", "38")], [360, 840, 840, 840])
        self.assertEqual(t["types"]["32"]["lasts"]["ticks"], 4)
        self.assertNotIn("lasts", t["types"]["33"].get("take", {}))
        self.assertEqual(t["types"]["33"]["turn"], t["types"]["34"]["turn"])
        self.assertEqual(t["types"]["7"]["opened"], {"f3": 0, "f4": 1})
        self.assertEqual(t["types"]["26"]["shut"], {"f4": 0})
        self.assertEqual(t["types"]["5"]["send"]["band"], [167, 345])
        self.assertEqual(t["types"]["9"], {"throw": {"band": [197, 315], "rearm": [156, 356]}})
        self.assertEqual(t["kinds"]["6"], {"points": 50, "size": 512, "shrink": 26,
                                           "edge": {"hold": 301, "back": 401, "push": 40}, "standing": 96})
        self.assertEqual(t["kinds"]["2"], {**blocks(GAME)[2], "standing": 2})
        self.assertEqual({k: v.get("standing") for k, v in t["kinds"].items()},
                         {"1": 1, "2": 2, "3": 93, "4": 4, "5": 95, "6": 96, "7": 97, "8": None})
        self.assertEqual(t["play"]["clock"]["second"], 50)
        self.assertEqual(t["play"]["ending"]["lost"], -3)
        self.assertEqual(set(t["play"]), {"start", "clock", "ending", "wait", "words", "bonus", "points", "view", "flight"})
        self.assertEqual(t["play"], play(GAME))
        self.assertEqual(t["kinds"]["1"], {**harms(GAME)["kinds"][1], "standing": 1})
        self.assertEqual(t["kinds"]["4"], {**harms(GAME)["kinds"][4], "standing": 4})
        self.assertEqual(t["kinds"]["8"]["harm"], {"cell": -2, "heat": 1900})
        self.assertEqual(t["kinds"]["8"]["reach"], 256)
        self.assertEqual(t["types"]["53"]["catch"], {"square": 16199})
        self.assertEqual(t["types"]["11"]["harm"], {"flag": 1, "standing": 9})
        self.assertEqual(set(t["types"]["11"]), {"cycle", "deadly", "harm"})
        self.assertEqual([len(d) for d in t["types"]["11"]["deadly"]], [143] * PHASES)
        self.assertEqual([sum(d) for d in t["types"]["11"]["deadly"]], [68] * PHASES)
        self.assertEqual(set(t["kinds"]), {"1", "2", "3", "4", "5", "6", "7", "8"})


if __name__ == "__main__":
    unittest.main()
