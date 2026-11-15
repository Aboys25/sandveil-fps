// Round plans: the team call for the round, picked fresh every round. Attackers
// get a named plan — a target site and one lane waypoint per bot, so the push
// arrives from more than one direction — and defenders get a setup that spreads
// their holds across the sites. match.js picks the plan; main.js hands the lane
// and hold assignments to the bots; bots.js routes via its lane node and then
// pushes the site. zoneOf() names the map zone a position sits in, for the
// radio callouts.
import { SITES } from './mapdata.js';
import { pick } from './rng.js';

// Attack plans: lanes are nav-node ids, one per attacker bot in spawn order;
// each bot routes to its lane node first, then pushes the target site.
export const ATTACK_PLANS = [
  { name: 'RUSH A', site: 'A', lanes: [6, 23, 5, 24, 7] },
  { name: 'SPLIT B', site: 'B', lanes: [18, 26, 21, 27, 17] },
  { name: 'MID PUSH A', site: 'A', lanes: [22, 23, 28, 24, 21] },
  { name: 'MID PUSH B', site: 'B', lanes: [22, 23, 28, 26, 21] },
  { name: 'DEFAULT A', site: 'A', lanes: [5, 22, 18, 24, 6] },
  { name: 'DEFAULT B', site: 'B', lanes: [18, 22, 5, 26, 27] },
];

// Defense setups: indices into the combined hold-spot pool
// [A, A, B, B, mid, mid], one per defender bot in spawn order.
export const DEFENSE_SETUPS = [
  { name: 'SETUP 2-1-2', holds: [0, 2, 4, 1, 3] },
  { name: 'STACK A', holds: [0, 1, 4, 5, 2] },
  { name: 'STACK B', holds: [2, 3, 4, 5, 0] },
];

export function choosePlan(random) {
  return { attack: pick(random, ATTACK_PLANS), defense: pick(random, DEFENSE_SETUPS) };
}

// The zone name for a position: site rectangles first, then the mid band,
// then the north/south yards. Callouts say "Contact, mid!" not coordinates.
export function zoneOf(x, z) {
  for (const site of SITES) {
    if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return `Site ${site.id}`;
  }
  if (Math.abs(x) < 8) return 'mid';
  if (z > 10) return 'south yard';
  if (z < -12) return 'north yard';
  return x < 0 ? 'west yard' : 'east yard';
}
