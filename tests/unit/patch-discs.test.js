import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { discs, releases } from "./fixtures.js";
import { openDisc } from "../../public/js/format/iso.js";
import { SECTOR_RAW, USER, USER_OFF, sector } from "../../public/js/format/sectors.js";
import { identify, placements, plan, planAll } from "../../public/js/format/patch.js";
import { fromLevel } from "../../public/js/format/project.js";
import { writeKwl } from "../../public/js/format/kwl.js";
import { deflate } from "../../public/js/format/deflate.js";
import { IN_PLACE, REBUILD, RECOMPRESS, fitAll } from "../../public/js/format/pak.js";
import {
  BOOT,
  SYNTHETIC_PACK,
  SYNTHETIC_SECTORS,
  booting,
  bytesOf,
  streamOf,
  synthetic,
  syntheticImage,
  withCnf,
} from "./synthetic.js";

// The synthetic image boots the US executable; a copy booting another is the
// same image with its SYSTEM.CNF rewritten, so what differs is the boot line.
const IMAGE = syntheticImage();
const [US, EU, JP] = discs;
const MISSING = "19 of the 21 packs are missing";
const NONE = "SYSTEM.CNF names none of the three discs' executables";
const inflate = async (bytes) => new Uint8Array(inflateSync(bytes));
const short = (count, disc) =>
  `the image has ${SYNTHETIC_SECTORS} sectors, not the ${count} of the ${disc} disc`;
const known = async (image, table = discs) => identify(await openDisc(new Blob([image])), table);
const HELL = "/HELL/HELL.PAK";
const BONUS_30 = 17;
const hellOf = (r) => r.packs.packs.find((p) => p.path === HELL);

test("the table is the three discs, each with the executable it boots", () => {
  assert.deepEqual(
    discs.map((r) => [r.id, r.name, r.boot]),
    [
      ["us", "Roll Away", "SLUS_007.24"],
      ["eu", "Kula World", "SCES_010.00"],
      ["jp", "Kula Quest", "SCPS_100.64"],
    ],
  );
  assert.ok(BOOT.includes(US.boot));
});

test("the image is known by its structure and its boot line, and warned about where it is not the disc it boots", async () => {
  assert.deepEqual(await known(IMAGE), {
    release: "us",
    warnings: [short("109,607", "Roll Away"), MISSING],
  });
  const odd = await known(new Uint8Array([...IMAGE, 0]));
  assert.equal(odd.release, "us");
  assert.equal(odd.warnings[0], "the image is 101,137 bytes, which is not whole sectors of 2352");
  const other = IMAGE.slice();
  const pvd = IMAGE.slice(16 * SECTOR_RAW + USER_OFF, 16 * SECTOR_RAW + USER_OFF + USER);
  pvd.set(bytesOf("SATURN".padEnd(32)), 8);
  other.set(sector(16, pvd, 0x09), 16 * SECTOR_RAW);
  const saturn = await known(other);
  assert.equal(saturn.release, "us");
  assert.ok(saturn.warnings.includes("the system identifier is 'SATURN', not PLAYSTATION"));
});

test("an image booting another disc's executable is that disc and is held to its count", async () => {
  assert.deepEqual(await known(booting(EU.boot)), {
    release: "eu",
    warnings: [short("108,471", "Kula World"), MISSING],
  });
  assert.deepEqual(await known(booting(JP.boot)), {
    release: "jp",
    warnings: [short("136,980", "Kula Quest"), MISSING],
  });
  assert.deepEqual(await known(booting(US.boot.toLowerCase())), await known(IMAGE));
});

test("an image booting none of the three is told so in one sentence and held to no count", async () => {
  for (const image of [booting("SLES_000.00"), withCnf("TCB = 4\r\nEVENT = 16\r\n"), withCnf("")])
    assert.deepEqual(await known(image), { release: null, warnings: [NONE, MISSING] });
});

test("an image of its disc's own count is not warned about its size", async () => {
  const table = discs.map((r) => (r.id === US.id ? { ...r, sectors: SYNTHETIC_SECTORS } : r));
  assert.deepEqual(await known(IMAGE, table), { release: "us", warnings: [MISSING] });
});

test("a plan and a set's plan carry the image's disc beside its warnings", async () => {
  const blob = new Blob([booting(EU.boot)]);
  const stream = streamOf(synthetic(6));
  const one = await plan(await openDisc(blob), SYNTHETIC_PACK, 1, stream, "Spiral", inflate, discs);
  assert.equal(one.release, "eu");
  assert.deepEqual(one.warnings, [short("108,471", "Kula World"), MISSING]);
  const items = [{ pack: SYNTHETIC_PACK, slot: 1, stream, title: "Spiral" }];
  const planned = await planAll(blob, items, inflate, discs);
  assert.equal(planned.release, "eu");
  assert.deepEqual(planned.warnings, one.warnings);
  assert.deepEqual(planned.placed, [one]);
  assert.deepEqual(await planAll(blob, [], inflate, discs), {
    placed: [],
    writes: [],
    release: "eu",
    warnings: one.warnings,
  });
});

test("the placements name the folder they are given, and leave it unsaid where there is none", () => {
  for (const r of discs)
    assert.equal(
      placements("/discs/x.bin", "out/spiral", r.boot)[1],
      `ePSXe and PCSX-ReARMed read it from their patches folder as ${r.boot}, with no extension`,
    );
  const unknown = placements("/discs/x.bin", "out/spiral", null);
  assert.equal(unknown.length, 2);
  assert.ok(unknown.every((line) => !line.includes("patches folder")));
  assert.deepEqual(unknown, [
    placements("/discs/x.bin", "out/spiral", US.boot)[0],
    placements("/discs/x.bin", "out/spiral", US.boot)[2],
  ]);
});

test("a copy of the PAL BONUS 30 fits each disc's HELL.PAK as the box works it out before the image, in place on EU and by a rebuild on US and JP", () => {
  const [us, eu, jp] = releases;
  const doc = fromLevel(eu.levels[`${HELL}#${BONUS_30}`]);
  const item = {
    slot: BONUS_30,
    size: streamOf(doc).length,
    size9: deflate(writeKwl(doc), RECOMPRESS).length,
    title: `${doc.title} (EU)`,
  };
  const shipped = hellOf(eu).slots[BONUS_30].size;
  assert.ok(item.size < shipped, `${item.size} against the disc's ${shipped}`);
  const [onEu] = fitAll(hellOf(eu), [item]);
  assert.equal(onEu.path, IN_PLACE);
  assert.equal(onEu.room, shipped - item.size);
  for (const [r, room] of [
    [us, 87],
    [jp, 149],
  ]) {
    const [f] = fitAll(hellOf(r), [item]);
    assert.equal(f.path, REBUILD, r.id);
    assert.equal(f.recompressed, false, r.id);
    assert.equal(f.room, room, r.id);
  }
});
