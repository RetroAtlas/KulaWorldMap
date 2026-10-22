// A level from elsewhere taken in as a draft, by one rule wherever it is
// opened from: the file read for what it holds, the draft made marked saved,
// since the file is the record, and the reader's report said once.
import { toast } from "../viewer/ui/toast.js";
import { readLevelFile } from "./files.js";
import * as drafts from "./drafts.js";

/** "Read with 3 repairs", or "Read with notes" where every line is on a value kept as it was. */
export const readWith = (repairs) =>
  repairs ? `Read with ${repairs} repair${repairs === 1 ? "" : "s"}` : "Read with notes";

/** What a file holds, read in `world`, or null where it holds no level, which one toast says, or where the question a pack or an image asks is declined. */
export async function readLevel(file, world) {
  try {
    return await readLevelFile(file, file.name, world);
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
