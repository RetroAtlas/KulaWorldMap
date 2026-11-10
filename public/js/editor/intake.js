// A level from elsewhere taken in as a draft, by one rule wherever it is
// opened from: the file read for what it holds, the draft made marked saved,
// since the file is the record, and the reader's report said once; a file
// that holds several levels makes a draft of each, said once as a count, and
// a bundle gathers them into a bundle under its own title.
import { toast } from "../viewer/ui/toast.js";
import { readLevelFile } from "./files.js";
import * as drafts from "./drafts.js";

/** "Read with 3 repairs", or "Read with notes" where every line is on a value kept as it was. */
export const readWith = (repairs) =>
  repairs ? `Read with ${repairs} repair${repairs === 1 ? "" : "s"}` : "Read with notes";

/** "Opened 3 levels from <name>", with "as a bundle" where they were gathered into one. */
export const openedFrom = (n, name, bundled) =>
  `Opened ${n} level${n === 1 ? "" : "s"} from ${name}${bundled ? " as a bundle" : ""}`;

/** What a file gave as a list: a patch's or a bundle's reads as they came, a bundle's head still on them, or one read in a list of one. */
export const readsOf = (read) => (Array.isArray(read) ? read : [read]);

/** What a file holds, read in `world`, a read or a patch's or a bundle's array of them, or null where it holds no level, which one toast says, or where the question a pack, an image or a patch asks is declined; `held` is the disc box's image for a patch to read over. */
export async function readLevel(file, world, held = null) {
  try {
    return await readLevelFile(file, file.name, world, held);
  } catch (e) {
    toast(e.message);
    return null;
  }
}

/** Say a reader's report once: the line itself where there is one, the count of repairs where there are more. */
function said(report, repairs) {
  if (report.length) toast(report.length === 1 ? report[0] : `${readWith(repairs)}.`);
}

/** A draft marked saved out of a read, since the file is the record, with the reader's report as one toast; its id, or null where the store has none to give. */
export function draftOf(read) {
  const id = drafts.create(read.project, { saved: Date.now() });
  if (id === null) return null;
  said(read.report, read.repairs);
  return id;
}

/** Drafts marked saved out of several reads of one file, as draftOf makes one, with how many opened from `name` as one toast, gathered into a bundle where the list carries a bundle's head, whose report is then said as a file's report is; their ids, as many as the store gives. */
export function draftsOf(reads, name) {
  const head = reads.bundle ?? null;
  if (reads.length === 1 && !head) {
    const id = draftOf(reads[0]);
    return id === null ? [] : [id];
  }
  const ids = [];
  for (const read of reads) {
    const id = drafts.create(read.project, { saved: Date.now() });
    if (id === null) break;
    ids.push(id);
  }
  if (!ids.length) return ids;
  let bundled = false;
  if (head) {
    const { title, author, notes } = head;
    bundled = drafts.createBundle({ title, author, notes, levels: ids }) !== null;
  }
  toast(`${openedFrom(ids.length, name, bundled)}.`);
  if (head) said(head.report, head.repairs);
  return ids;
}
