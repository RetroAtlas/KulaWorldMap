// The editor's entry, loaded only when the page is opened to make levels.
import { provideLevels } from "./navigate.js";
import { load } from "./drafts.js";
import { levelFor, wireDrafts } from "./draftlist.js";

export function bootEditor() {
  load();
  provideLevels(levelFor);
  wireDrafts();
}
