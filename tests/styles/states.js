// This map's half of the style proof: its interface states, joined from the list of each subject,
// and how the page is opened for one.
import { viewerStates } from "./viewerstates.js";
import { editorStates } from "./editorstates.js";
import { playStates } from "./playstates.js";

export { REST, open, settled } from "./statehelpers.js";

/** The states: `stands` is absent from the plain map, `held` leaves the pointer where it is. */
export const states = [...viewerStates, ...editorStates, ...playStates];
