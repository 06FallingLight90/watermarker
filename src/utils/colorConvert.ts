/** Convert [r, g, b] tuple to hex string like "#rrggbb" */
export function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Convert hex string like "#rrggbb" to [r, g, b] tuple */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
