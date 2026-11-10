import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { fromLevel } from "../../public/js/format/project.js";
import { address } from "../../public/js/viewer/ui/address.js";
import { shareLink } from "../../public/js/editor/sharelink.js";
import { ISSUE_FORM, ISSUE_MOST, issueFor, mailtoFor } from "../../public/js/editor/sendlink.js";

const ORIGIN = "https://example.test/map/";
const LINK = `${ORIGIN}#SHARED/L3K9ZQ2/45,35/fit/33/sAbc-_9&=?`;
const TITLE = "Spiral & Co";
const AUTHOR = "Ada #1";
const SUBJECT = `A level for the community levels: ${TITLE}`;
const parts = { cam: { yaw: 45, pitch: 35 }, target: null, fitted: true, slice: 33, picked: null };
const templates = mapData.levels.map((l) => fromLevel(l));

/** The query of `url` as the browser would hand it to a page: its keys in order and its values. */
const query = (url) => {
  const q = new URL(url).searchParams;
  return { keys: [...q.keys()], get: (k) => q.get(k) };
};

test("the message goes to the address it is given, with the title as its subject and the title, the author, the link, the grant and a line for the rest as its body", () => {
  const url = mailtoFor({ title: TITLE, author: AUTHOR, link: LINK, address: address() });
  assert.ok(url.startsWith(`mailto:${address()}?`), url);
  const { keys, get } = query(url);
  assert.deepEqual(keys, ["subject", "body"]);
  assert.equal(get("subject"), SUBJECT);
  assert.equal(
    get("body"),
    [
      `${TITLE}, by ${AUTHOR}.`,
      LINK,
      `This level is my own, not an edit of one of the game's levels, and I share it under CC BY 4.0, credited to ${AUTHOR}.`,
      "Anything else goes here.",
    ].join("\r\n\r\n"),
  );
});

test("every part of the message is encoded, so the # and & of the link and of the texts reach the message whole", () => {
  const url = mailtoFor({ title: TITLE, author: AUTHOR, link: LINK, address: address() });
  const after = url.slice(url.indexOf("?") + 1);
  assert.ok(!after.includes("#"), after);
  assert.equal(after.split("&").length, 2, after);
  assert.ok(after.includes(encodeURIComponent(LINK)), after);
  assert.ok(after.includes(encodeURIComponent(TITLE)), after);
});

test("the form opens on the repository, under its template, with the title and the link as its keys", () => {
  const url = issueFor({ title: TITLE, link: LINK });
  const at = new URL(url);
  assert.equal(at.origin, "https://github.com");
  assert.equal(at.pathname, "/RetroAtlas/KulaWorldMap/issues/new");
  const { keys, get } = query(url);
  assert.deepEqual(keys, ["template", "title", "link"]);
  assert.equal(get("template"), "level.yml");
  assert.equal(get("title"), SUBJECT);
  assert.equal(get("link"), LINK);
  assert.ok(url.startsWith(`${ISSUE_FORM}&`), url);
  assert.ok(!url.slice(url.indexOf("?")).includes("#"), url);
});

test("the form is filled up to the cap and opened bare past it", () => {
  assert.equal(ISSUE_MOST, 3500);
  assert.equal(
    ISSUE_FORM,
    "https://github.com/RetroAtlas/KulaWorldMap/issues/new?template=level.yml",
  );
  const room = ISSUE_MOST - issueFor({ title: TITLE, link: "" }).length;
  const atCap = issueFor({ title: TITLE, link: "a".repeat(room) });
  assert.equal(atCap.length, ISSUE_MOST);
  assert.equal(query(atCap).get("link"), "a".repeat(room));
  assert.equal(issueFor({ title: TITLE, link: "a".repeat(room + 1) }), ISSUE_FORM);
});

test("a lone surrogate in a text is replaced before it is encoded, so a title or an author a hostile file carries still gives both addresses", () => {
  const lone = "Spi\ud800ral";
  const url = mailtoFor({ title: lone, author: "A\udc00da", link: LINK, address: address() });
  assert.equal(query(url).get("subject"), "A level for the community levels: Spi\ufffdral");
  assert.ok(query(url).get("body").startsWith("Spi\ufffdral, by A\ufffdda.\r\n\r\n"), url);
  const form = issueFor({ title: lone, link: LINK });
  assert.equal(query(form).get("title"), "A level for the community levels: Spi\ufffdral");
  assert.equal(query(form).get("link"), LINK);
  const whole = mailtoFor({ title: "Añо 😀", author: AUTHOR, link: LINK, address: address() });
  assert.equal(query(whole).get("subject"), "A level for the community levels: Añо 😀");
});

test("the form's required tick states the grant the message states, with the name in the Author field in the author's place", () => {
  const body = query(
    mailtoFor({ title: TITLE, author: AUTHOR, link: LINK, address: address() }),
  ).get("body");
  const grant = body.split("\r\n\r\n")[2];
  assert.ok(grant.endsWith(`, credited to ${AUTHOR}.`), grant);
  const tick = grant.replace(`${AUTHOR}.`, "the name in its Author field.");
  const form = readFileSync(
    new URL("../../.github/ISSUE_TEMPLATE/level.yml", import.meta.url),
    "utf8",
  );
  const lines = form.split("\n").map((line) => line.trim());
  const at = lines.indexOf(`- label: ${tick}`);
  assert.ok(at > 0, form);
  assert.equal(lines[at + 1], "required: true");
  assert.equal(lines.filter((line) => line.startsWith("- label: ")).length, 1);
});

test("every shipped level's link fills the form", () => {
  for (const [i, p] of templates.entries()) {
    const url = issueFor({ title: p.title, link: shareLink(p, parts, ORIGIN) });
    assert.notEqual(url, ISSUE_FORM, mapData.levels[i].name);
    assert.ok(url.length <= ISSUE_MOST, `${mapData.levels[i].name}: ${url.length}`);
  }
});
