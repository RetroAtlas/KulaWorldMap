// The disc a patch is for: the bar US · EU · JP in the box's disc step, pressed
// by hand until an image is read and locked to the disc its boot line names after.
import { el } from "../viewer/ui/dom.js";
import { BASE, nameOf, releaseOf, releases } from "../viewer/release.js";

const LABEL = "The disc the patch is for";
const fromLayout = (name) =>
  `The fits above are worked out for the ${name} disc until the image is given.`;

/** What the status says of an image once it is read, the disc named where it is one of the three. */
export const readAs = (name, r) =>
  r ? `${name} is read, an image of the ${r.name} disc.` : `${name} is read.`;

/** The bar, a button a disc that hands `choose` its id, and the line under it. */
export function discBar(choose) {
  const group = el("span", { id: "patchDiscs", className: "scope release" });
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", LABEL);
  for (const r of releases()) {
    const b = el("button", { type: "button", textContent: r.label, title: nameOf(r) });
    b.setAttribute("aria-label", nameOf(r));
    b.dataset.release = r.id;
    b.onclick = () => choose(r.id);
    group.append(b);
  }
  return { group, note: el("p", { id: "patchFor", className: "sub" }) };
}

/** The bar as the box's state has it: the chosen disc pressed, the rest disabled while a read image locks it, and the line while the fits come from a disc's layout other than the base's. */
export function reflectDiscs({ group, note }, d) {
  for (const b of group.children) {
    const id = b.dataset.release;
    b.setAttribute("aria-pressed", String(id === d.chosen));
    b.disabled = d.release !== null && id !== d.release;
  }
  const own = d.chosen !== BASE && !d.disc && d.rows.length > 0;
  note.textContent = own ? fromLayout(releaseOf(d.chosen).name) : "";
}
