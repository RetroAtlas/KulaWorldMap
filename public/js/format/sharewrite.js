// Writing the segment that carries a level, through the vendored deflate.
import { deflate } from "./deflate.js";
import { writeProject } from "./project.js";
import { LETTER } from "./share.js";

const CHUNK = 1 << 15;

function base64url(bytes) {
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The segment that carries the project: its canonical text deflated at level 9, as base64url. */
export const encodeLevel = (project) =>
  LETTER + base64url(deflate(new TextEncoder().encode(writeProject(project)), 9));
