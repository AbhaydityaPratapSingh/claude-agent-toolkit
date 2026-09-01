/**
 * Each agent gets a stable visual identity derived from its name, so the same
 * agent always looks the same and no two neighbours blur together.
 */
const PALETTE = [
  "#d71921", // nothing red
  "#ff7a45",
  "#f5c518",
  "#5ad469",
  "#3ecfcf",
  "#4d9dff",
  "#9b7bff",
  "#ff6fb5",
  "#c2b280",
  "#7de3a1",
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function accentFor(name) {
  return PALETTE[hash(name) % PALETTE.length];
}

/** Two-character dot-matrix initial mark shown in the card corner. */
export function glyphFor(name) {
  const parts = name
    .split("-")
    .map((p) => p.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  if (!parts.length) return "??";
  const mark =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return mark.toUpperCase();
}
