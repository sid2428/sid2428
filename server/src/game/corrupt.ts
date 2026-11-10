const GLITCH = '#%@&?!/<>*+=';

/** FNV-1a over three small integers, mapped to 0..1. Same input always gives the same output. */
function noise(a: number, b: number, c: number): number {
  let hash = 2166136261;
  for (const value of [a, b, c]) {
    hash ^= value & 0xffff;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 16777619);
  return (hash >>> 0) / 4294967296;
}

function glitchAt(x: number, y: number, seed: number): string {
  return GLITCH.charAt(Math.floor(noise(y, x, seed + 7) * GLITCH.length));
}

/**
 * Replaces roughly `ratio` of the non-space characters. A fixed seed makes this monotonic:
 * characters corrupted at a low ratio stay corrupted at every higher ratio, and nothing flickers.
 */
export function corruptLine(line: string, ratio: number, seed: number, y = 0): string {
  if (ratio <= 0) return line;
  let out = '';
  for (let x = 0; x < line.length; x++) {
    const ch = line.charAt(x);
    out += ch !== ' ' && noise(x, y, seed) < ratio ? glitchAt(x, y, seed) : ch;
  }
  return out;
}

export function corruptRows(rows: readonly string[], ratio: number, seed: number): string[] {
  return rows.map((row, y) => corruptLine(row, ratio, seed, y));
}
