/** Shared text/number/date input styling for the questionnaire — a softer,
 * more premium focus treatment (glow ring, not just a border-color swap)
 * than the app's default form controls. Composed with a caller-supplied
 * width/margin, e.g. `${"mt-1.5 w-full"} ${FIELD_CLASS}`. */
export const FIELD_CLASS =
  "rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";
