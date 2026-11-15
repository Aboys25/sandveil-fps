// One seeded RNG for the whole game: bot decisions, spread and scatter all draw from
// it, so ?seed=N replays the same round and the screenshot setups are deterministic.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, array) {
  return array[Math.floor(random() * array.length) % array.length];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}
