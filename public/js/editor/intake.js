// A level from elsewhere taken in as a draft, by one rule wherever it is
// opened from: the file read for what it holds, the draft made marked saved,
// since the file is the record, and the reader's report said once; a file
// that holds several levels makes a draft of each, said once as a count.
import { toast } from "../viewer/ui/toast.js";
import { readLevelFile } from "./files.js";
import * as drafts from "./drafts.js";

/** "Read with 3 repairs", or "Read with notes" where every line is on a value kept as it was. */
export const readWith = (repairs) =>
  repairs ? `Read with ${repairs} repair${repairs === 1 ? "" : "s"}` : "Read with notes";

/** What a file holds, read in `world`, a read or a patch's array of them, or null where it holds no level, which one toast says, or where the question a pack, an image or a patch asks is declined; `held` is the disc box's image for a patch to read over. */
export async function readLevel(file, world, held = null) {
  try {
    return await readLevelFile(file, file.name, world, held);
  } catch (e) {
    toast(e.message);
    return null;
  }
}

/** A draft marked saved out of a read, since the file is the record, with the reader's report as one toast; its id, or null where the store has none to give. */
export function draftOf(read) {
  const id = drafts.create(read.project, { saved: Date.now() });
  if (id === null) return null;
  const { report, repairs } = read;
  if (report.length) toast(report.length === 1 ? report[0] : `${readWith(repairs)}.`);
  return id;
}

/** Drafts marked saved out of several reads of one file, as draftOf makes one, with how many opened from `name` as one toast; their ids, as many as the store gives. */
export function draftsOf(reads, name) {
  if (reads.length === 1) {
    const id = draftOf(reads[0]);
    return id === null ? [] : [id];
  }
  const ids = [];
  for (const read of reads) {
    const id = drafts.create(read.project, { saved: Date.now() });
    if (id === null) break;
    ids.push(id);
  }
  if (ids.length) toast(`Opened ${ids.length} level${ids.length === 1 ? "" : "s"} from ${name}.`);
  return ids;
}
