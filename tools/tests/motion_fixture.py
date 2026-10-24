"""What the motion reader's tests share: instruction builders, an executable of a few words and the game's numbers."""

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code  # noqa: E402

R = {"at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7, "t0": 8, "s0": 16, "s5": 21, "zero": 0,
     "gp": 28, "sp": 29, "ra": 31}


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


def sw(rt, rs, imm):
    return (0x2B << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sh(rt, rs, imm):
    return (0x29 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sb(rt, rs, imm):
    return (0x28 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


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


def swl(rt, rs, imm):
    return (0x2A << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def swr(rt, rs, imm):
    return (0x2E << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


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
    "pill.lethargy.players": 2, "pill.lethargy.blanks": 2, "gp": 0x800a2f38,
    "rock.scale": 64, "rock.shift": 5, "rock.round": 31,
    "flash.code": 44, "flash.sprite": 6, "flash.laid": 128, "screen.grey": 128, "screen.phase": 1024,
    "screen.magnitude": 780, "screen.idle.step": 106, "screen.tint.outer": 96, "screen.tint.green": 112,
    "screen.page.gate": 257, "screen.sprite.width": 256, "screen.sprite.rest": -256, "screen.wane": -5,
    "screen.step": 213, "screen.rest.across": 4096, "screen.rest.down": 3840, "screen.reset.across": 4096,
    "screen.reset.down": 3840, "screen.end": 80, "screen.fade": -8, "screen.load.wide": 320,
    "screen.load.high": 240, "screen.load.distance": 160, "screen.load.across": 4096, "screen.load.down": 3840,
    "pill.invincible.step": -1, "pill.bouncy": 840, "pill.bouncy.hold": 839, "pill.bouncy.grow": 1,
    "pill.bouncy.latch": 4, "pill.bouncy.latch.step": 1,
    "glow.gate": -1, "glow.gate.word": 556, "glow.counter.at": 6076, "glow.step": 100, "glow.round.rest": 8291,
    "glow.round.shift": 13, "glow.red.under": 4096, "glow.red.rest": 4095, "glow.red.shift": 12,
    "glow.green.from": -2049, "glow.green.span": 4095, "glow.green.phase": -2048, "glow.green.rest": 2047,
    "glow.green.shift": 12, "glow.blue.gate": 4097, "glow.blue.phase": -4096, "glow.blue.rest": -1,
    "glow.blue.shift": 12, "glow.gain": 3, "glow.gain.green": 3, "glow.gain.blue": 3, "glow.counter.load": 0,
    "glow.clear": [0x800a4220, 0x800fb1e8],
    "sunglasses.word": 840, "sunglasses.step": -1, "sunglasses.blinks": 21, "sunglasses.blink": 9,
    "sunglasses.flag.on": 1, "sunglasses.flag": 1, "sunglasses.blink.step": -1, "sunglasses.blink.step.on": -1,
    "sunglasses.blink.count.step": -1, "sunglasses.blink.count.step.on": -1, "sunglasses.blink.on": 9,
    "sunglasses.blink.off": 9,
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
    "start.wait": 20, "start.guard": 20, "laser.cell": -2, "laser.lay": -2, "laser.heat": 1900, "fire.kind": 1,
    "fire.burn": 40, "fire.landed": 1, "fire.land": 600, "fire.limit.gate": 2001, "fire.cool": -15, "heat.chill": -150,
    "end.fire.swell": -4, "fire.swell": 210, "heat.shake": 40, "heat.shake.big": 126, "heat.shake.over": 25,
    "acid.top.gate": 2001, "acid.top": 2000, "acid.kind": 4, "acid.gain": 300, "end.acid.wait": -6,
    "acid.gain.wait": 300, "end.exit.landing": 1, "end.hidden.landing": 3, "end.bonus.landing": 2,
    "spikes12.type": 12, "spikes11.type": 11, "spikes11.deadly": 1, "wait.spikes.landing": 10,
    "wait.spikes.standing": 9, "end.captivator.still": -5, "catch.type53": 53, "catch.near.gate": 16200,
    "corkscrew.type": 56, "corkscrew.rise": 400, "corkscrew.rise.y": 400, "corkscrew.rise.z": 400,
    "captivator.standoff": 456,
    "catch.square": 44999, "dying.flash": 1024, "dying.flash.full": 4096, "tint.full": -4096, "tint.own": 400,
    "tint.other": 2000, "simon.done": 1, "simon.wrong": 2, "end.view.x": -8, "end.view.y": 3, "end.view.z": 10,
    "end.view.swing": 12, "end.view.swing.bonus": 58, "end.view.off": 1400, "end.view.off.bonus": 3400,
    "end.view.reach": 1000, "end.view.reach.bonus": 3000, "end.view.off.hidden": 400, "end.view.mode.bonus": 1,
    "end.view.mode.bonus.eye": 1, "mode.at": 9372, "mode.word": 0x800a53d4, "game.mode.word": 0x800a33b0,
    "mode.key": 31, "mode.kinds": 5, "mode.slots": 6, "mode.bonus": 1, "mode.settings": 9, "mode.hidden.flag": 1,
    "mode.hidden": 2, "mode.simon": 1, "death.most.gate": 5001, "death.most": 5000,
    "death.over": 4, "death.levels": 15, "death.each": 50, "death.each.final": 50,
    "death.finals": 2, "fruit.bit.43": 1, "fruit.bit.44": 2, "fruit.bit.45": 4, "fruit.bit.46": 8, "fruit.bit.47": 16,
    "fruit.bit.all": 31, "next.one": 1, "next.final": 151, "next.hidden.out": 3, "next.slots": 15, "next.hidden": 18,
    "next.fruit.mask": 31, "next.fruit": 31, "next.slots.bonus": 15, "next.bonus.first": 15, "next.fruit.back": 31,
    "next.fruit.back.mask": 31, "next.back.gate.0": 6, "next.bonus.0": 15, "next.back.gate.1": 11, "next.bonus.1": 16,
    "next.bonus.2": 17, "next.chain.end": 18, "next.start.bonus": 15, "run.worlds": 10, "next.levels": 15,
    "next.levels.final": 2, "next.round.times": 3, "next.third": 5, "next.round": 3, "next.mode.load": 0,
    "next.mode.clears": [0x800482e4, 0x8004adc4, 0x8004b5dc], "next.mode.writes": [],
    "simon.mode": 1, "simon.verdict.stands": 2, "simon.rest": -1, "simon.idle.step": 1, "simon.pad.up": 16,
    "simon.latch.up": 1, "simon.pad.cross": 16384, "simon.latch.cross": 1, "simon.latch.set": 1, "simon.latch.step": 1,
    "simon.latch": 5, "simon.idle.latch": 3, "simon.rest.flag": -1, "simon.index.half": 1, "simon.flag": 1,
    "simon.idle.turn": 6, "simon.pad.left": 128, "simon.turn.left": 1, "simon.pad.right": 32, "simon.turn.right": -1,
    "simon.empty": -1, "simon.empty.again": -1, "simon.bit.right": 1, "simon.request": 1, "simon.bit.left": 2,
    "simon.bit.forward": 4, "simon.bit.jump": 8, "simon.index.half.store": 1, "simon.verdict.done": 1,
    "simon.verdict.wrong": 2, "simon.index.step": 1, "simon.pass": 1, "simon.pass.shift": 1, "simon.start.mode": 1,
    "simon.wait": 10, "simon.round.step": 1, "simon.grow": 2, "simon.fill": -1, "simon.store.last": 1023,
    "simon.fill.down": -1, "simon.fill.step": -2, "simon.first": 1, "simon.starter.flip": 1, "simon.menu.start": 1,
    "simon.points.last": 1, "simon.loop.mode": 1, "simon.other": 1, "simon.players.shift": 1, "simon.point": 1,
    "simon.next.mode": 1, "simon.world.step": 1, "simon.room.step": 1, "simon.next.worlds": 10, "simon.points.gate": 6,
    "simon.points.gate.other": 6, "simon.menu.cross": 16384, "simon.menu.gate": 6, "simon.menu.gate.other": 6,
    "simon.menu.over": -1, "simon.next.levels": 15, "simon.store": 0x800d7f84, "simon.fill.from": 0x800d8782,
    "effect.slots.last": 11, "effect.colour.a": 100, "effect.colour.b": 50, "effect.colour.c": 80, "effect.colour.d": 127,
    "effect.colour.e": 60, "effect.colour.f": 20, "effect.sprites": 7, "effect.full": 128, "effect.quad": 40,
    "effect.most": 16, "effect.third": 4, "effect.players": 1, "effect.gone": -1, "effect.row.quad": 2,
    "effect.row.double": 1, "effect.header": 4, "effect.dice": 4096, "effect.hud.shift": 18, "effect.hud.shift.sine": 18,
    "effect.prims": 160, "effect.depth.shift": 2, "effect.near": 121, "effect.dice.world": 4096, "effect.whole.shift": 16,
    "effect.whole.one": 1, "effect.whole.shift.sine": 16, "effect.whole.one.sine": 1, "effect.world.shift": 16,
    "effect.world.shift.sine": 16, "effect.light.shift": 9, "effect.light.shift.g": 9, "effect.light.shift.b": 9,
    "effect.table.shift": 3, "effect.row.step": 8, "effect.angle.step": 2, "effect.particle": 40, "effect.step": 1,
    "teleport.flash.on": 1, "teleport.flash.modes": 2, "teleport.flash.from": 268, "teleport.flash.mode.last": 2,
    "teleport.flash.from.last": 254, "teleport.flash.from.1": 261, "teleport.flash.run.on": 1, "teleport.flash.step": -20,
    "teleport.flash.step.1": -13, "teleport.flash.step.last": -6, "teleport.flash.level": 1, "teleport.flash.level.mode": 2,
    "teleport.flash.level.from": 254, "teleport.flash.blend": 1, "teleport.flash.semi": 1, "teleport.flash.wide": 1,
    "teleport.flash.high": 1, "teleport.flash.len": 5, "teleport.flash.quad": 40, "effect.table.send": 4100,
    "effect.kind.42": 7, "effect.kind.32": 9, "effect.kind.34": 9, "effect.kind.33": 9, "effect.kind.38": 8,
    "effect.hud.key.right": 6, "effect.hud.key.down": 11, "effect.hud.z": -1, "effect.kind.31": 6, "effect.kind.36": 7,
    "effect.kind.37": 2, "effect.kind.43": 4, "effect.kind.44": 4, "effect.kind.45": 4, "effect.kind.46": 4,
    "effect.kind.47": 4, "effect.kind.27": 4, "effect.kind.35.hud": 1, "effect.kind.35": 10, "effect.kind.5.hud": 3,
    "teleport.flash.word": 1, "effect.table.words": 1026, "effect.entry": 184, "effect.player": 2944, "effect.buffer": 80,
    "effect.table.mul": 513,
    "effect.pointers": [0x800988f8, 0x80098d2c, 0x800999ac, 0x800992f4, 0x80098f90, 0x80098f90, 0x800999ac, 0x800999ac,
                        0x80099cd0, 0x80099698, 0x80098f90, 0],
    "effect.colours": [[100, 50, 100], [80, 80, 80], [127, 60, 60], [20, 20, 127], [127, 127, 0], [20, 20, 80],
                       [127, 127, 127]],
    "effect.tables": {
        0x800988f8: {"count": 2, "frames": 2, "rows": [[[6, 0, 1330, 107], [0, 0, 80, 107]],
                                                        [[6, 83, 1330, 107], [0, 83, 155, 107]]]},
        0x80098d2c: {"count": 2, "frames": 1, "rows": [[[0, 0, 0, 167], [1, 2558, 3333, 107]]]},
        0x800999ac: {"count": 2, "frames": 2, "rows": [[[5, 0, 0, 0], [6, 0, 2580, 0]],
                                                        [[5, 3763, 200, 35], [6, 4013, 2580, 17]]]},
        0x800992f4: {"count": 2, "frames": 2, "rows": [[[0, 0, 0, 107], [3, 0, 0, 0]],
                                                        [[4, -1, -3373, 0], [3, 667, 833, 206]]]},
        0x80098f90: {"count": 2, "frames": 2, "rows": [[[0, 0, 3413, 0], [1, -1, 2580, 0]],
                                                        [[0, 0, 3413, 23], [1, 127, 2655, 0]]]},
        0x80099cd0: {"count": 2, "frames": 1, "rows": [[[0, 0, 0, 107], [2, 0, 0, 0]]]},
        0x80099698: {"count": 2, "frames": 2, "rows": [[[6, -1, 0, 255], [2, 0, 4330, 90]],
                                                        [[6, 3628, 1353, 248], [2, 0, 4405, 83]]]}},
    "effect.sine.at": 0x8009c20c, "effect.sine.one": 4096,
    "effect.hud.at": {"clock": [160, 28, -1], "teleport": [160, 166, -1],
                      "fruit": [[208, 217, -1], [228, 216, -1], [253, 216, -1], [278, 216, -1], [299, 218, -1]]},
    "effect.table.at": [0x800d2e20, 0x800d2e20, 0x800d2e20],
    "look.below": 250, "look.ahead": 800, "flight.unit.shift": 12, "flight.above": 100, "flight.quarter.shift": 2,
    "flight.half.shift": 1, "flight.third": 3, "flight.first": 13, "flight.end.gate": 1025, "flight.least": 1,
    "flight.curve.shift": 15, "flight.yaw": -1024, "flight.pitch": 250, "flight.bank.from": 1024, "flight.bank.shift": 1,
    "flight.below": 250, "flight.out.shift": 10, "flight.ahead": 800, "flight.out": 14000, "flight.hold": 2000,
    "flight.slow.gate": 929, "flight.step": 16, "flight.end.gate.after": 1025, "flight.done": 1, "flight.gate": 1000,
    "ice.kind": 2, "cold.gain": 40, "cold.top.gate": 501, "cold.back": 400, "cold.wane": -10, "arrow.type": 28,
    "crumble.size": 512, "crumble.shrink": -26, "crumble.whole": 1, "crumble.broken": 2, "crumble.broken.seen": 2,
    "crumble.breaking": 3, "crumble.code.input": 96, "crumble.edge.hold": 301, "crumble.edge.back": 401,
    "crumble.edge.push": 40, "ride.kind": 5, "ride.body.off": 101, "ride.bias": 512, "ride.bias.back": -512,
    "ride.bias.travel": -512, "ride.rumble": 70, "ride.beam": -2,
    "ride.face.x": 1, "ride.face.x.back": 4, "ride.face.y": 2, "ride.face.y.back": 3, "ride.face.z": 5,
    "ride.along.x": 1, "ride.along.x.back": 4, "ride.along.face.x.back": 4, "ride.along.y.from": -2, "ride.along.y.span": 2,
    "ride.along.face.y.from": -2, "ride.along.face.y.span": 2, "ride.along.z.back": 5, "ride.along.face.z.back": 5,
    "ride.along.yes": 1, "ride.body.count.less": -1, "ride.body.block": 512, "ride.body.axis.x": 1, "ride.body.axis.y": 2,
    "ride.body.axis.z": 5, "ride.body.ends": 256, "ride.body.ends.back": -256, "ride.end.kind": 5, "ride.end.kind.under": 5,
    "ride.end.tolerance": 100, "ride.end.bias": 512, "ride.end.block": 512, "ride.end.low": 156, "ride.end.high": 356,
    "standing.centre": 256, "standing.shift": 9, "standing.first": 5, "standing.kind.1": 1, "standing.kind.2": 2,
    "standing.kind.3": 3, "standing.kind.4": 4, "standing.kind.5": 5, "standing.kind.6": 6, "standing.kind.7": 7,
    "standing.word.3": 93, "standing.word.5": 95, "standing.word.6": 96, "standing.word.7": 97, "standing.style.1": 1,
    "standing.style.2": 2, "standing.style.3": 3, "standing.style.4": 4, "standing.style.word.3": 93,
    "standing.nothing": -1, "standing.none": -1,
}


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
