// Depot 7: a freight depot at dusk. Data only — world.js builds the meshes from it.
// Coordinates: x east, z south, y up. Attackers spawn south-east, defenders north-west.
// Site A is the west warehouse, Site B the east fuel yard; three lanes join them.
export const BOUNDS = { minX: -28, maxX: 28, minZ: -22, maxZ: 22, wallH: 5 };

// [width, height, depth, x, yCenter, z, material] — every box is a collider and a bullet stop.
export const BOXES = [
  // Outer walls (with a gate gap on the south wall for looks; it stays shut by a fence box).
  [56.8, 5, 0.8, 0, 2.5, -22.4, 'surface'],
  [56.8, 5, 0.8, 0, 2.5, 22.4, 'surface'],
  [0.8, 5, 44.8, -28.4, 2.5, 0, 'surface'],
  [0.8, 5, 44.8, 28.4, 2.5, 0, 'surface'],
  // Site A warehouse: north, west and south walls (door gap at x -20.2..-17.8), open east.
  [12, 4.6, 0.6, -19, 2.3, -13, 'surface'],
  [0.6, 4.6, 10, -24.5, 2.3, -8, 'surface'],
  [3.8, 4.6, 0.6, -22.1, 2.3, -3, 'surface'],
  [3.8, 4.6, 0.6, -15.9, 2.3, -3, 'surface'],
  // Site B fuel yard: north, east and south walls (door gap at x 17.8..20.2), open west.
  [12, 4.6, 0.6, 19, 2.3, -14, 'surface'],
  [0.6, 4.6, 10, 24.5, 2.3, -9, 'surface'],
  [3.8, 4.6, 0.6, 15.9, 2.3, -4, 'surface'],
  [3.8, 4.6, 0.6, 22.1, 2.3, -4, 'surface'],
  // Mid blocks: two halls with a 4 m corridor between them, and the mid-doors wall.
  [5, 4.6, 6, -4.5, 2.3, 0, 'surface'],
  [5, 4.6, 6, 4.5, 2.3, 0, 'surface'],
  [3.8, 4.6, 0.6, -3.1, 2.3, -6, 'surface'],
  [3.8, 4.6, 0.6, 3.1, 2.3, -6, 'surface'],
  // Containers and heavy cover.
  [6, 2.6, 2.4, -20, 1.3, -9.5, 'rust'],
  [6, 2.6, 2.4, 8, 1.3, 14, 'teal'],
  [4.8, 2.6, 2.4, -12, 1.3, 12, 'rust'],
  [2.4, 2.6, 6, 25, 1.3, 8, 'teal'],
  // Crates: crouch cover along the lanes and inside the sites.
  [1.4, 1.1, 1.4, -22, 0.55, 4, 'olive'],
  [1.4, 1.1, 1.4, -19, 0.55, -6, 'olive'],
  [1.4, 1.1, 1.4, -15.5, 0.55, -10.5, 'olive'],
  [1.4, 1.1, 1.4, -16.5, 0.55, -5.5, 'hairline'],
  [2.2, 1.1, 1.2, 16, 0.55, -7, 'olive'],
  [1.4, 1.1, 1.4, 21.5, 0.55, -6.5, 'olive'],
  [1.4, 1.1, 1.4, 22.5, 0.55, -11, 'hairline'],
  [1.2, 0.9, 1.2, 12, 0.45, -3, 'olive'],
  [1.2, 0.9, 1.2, -12, 0.45, -3.5, 'olive'],
  [2.4, 1.1, 1.2, -8, 0.55, 8, 'hairline'],
  [2.4, 1.1, 1.2, 8, 0.55, -10, 'hairline'],
  [1.2, 0.9, 1.2, 2, 0.45, 10, 'olive'],
  [1.2, 0.9, 1.2, -2, 0.45, -10, 'olive'],
  [1.4, 1.1, 1.4, 16, 0.55, 4, 'hairline'],
  [1.4, 1.1, 1.4, -16, 0.55, 10, 'hairline'],
  // Mid-door cover: crates just off the corridor, so the mid fight has corners.
  [1.2, 0.9, 1.2, -3, 0.45, -4.5, 'olive'],
  [1.2, 0.9, 1.2, 3, 0.45, -4.5, 'olive'],
  // Sandbag lines and low barriers (waist-high: shoot over, not through).
  [3.2, 1.0, 0.8, -19, 0.5, -11.5, 'sand'],
  [3.2, 1.0, 0.8, 19, 0.5, -12, 'sand'],
  [2.6, 1.0, 0.8, 0, 0.5, -8.5, 'sand'],
  [2.6, 1.0, 0.8, -6, 0.5, 14, 'sand'],
  // Spawn shelters.
  [5, 3.4, 0.5, 24, 1.7, 18.5, 'surface'],
  [5, 3.4, 0.5, -24, 1.7, -18.5, 'surface'],
];

// [radiusTop, radiusBottom, height, x, yCenter, z, material, segments] — colliders are boxes.
export const CYLINDERS = [
  [1.6, 1.6, 3.4, 16, 1.7, -11.5, 'concrete', 20],
  [1.6, 1.6, 3.4, 22, 1.7, -11.5, 'concrete', 20],
  [0.45, 0.45, 1.1, -22.5, 0.55, -1, 'rust', 12],
  [0.45, 0.45, 1.1, 23, 0.55, 3, 'rust', 12],
  [0.45, 0.45, 1.1, 14, 0.55, 8, 'teal', 12],
  [0.45, 0.45, 1.1, -14, 0.55, 6, 'teal', 12],
  [0.45, 0.45, 1.1, -9, 0.55, -12, 'rust', 12],
  [0.45, 0.45, 1.1, 9, 0.55, -13, 'rust', 12],
  // Approach barrels: cover on the walks up to each site.
  [0.45, 0.45, 1.1, -13, 0.55, -1.5, 'rust', 12],
  [0.45, 0.45, 1.1, 13.5, 0.55, -1.5, 'teal', 12],
];

// Bomb sites: plant anywhere inside the rectangle.
export const SITES = [
  { id: 'A', label: 'A', minX: -24, maxX: -14, minZ: -13, maxZ: -3, cx: -19, cz: -8 },
  { id: 'B', label: 'B', minX: 14, maxX: 24, minZ: -14, maxZ: -4, cx: 19, cz: -9 },
];

export const SPAWNS = {
  atk: [
    [20, 17], [22, 15], [18, 15], [23, 17], [21, 14],
  ],
  def: [
    [-20, -17], [-22, -15], [-18, -15], [-23, -17], [-21, -14],
  ],
};

// Waypoint graph for the bots: [x, z] nodes and bidirectional edges. Routes avoid walls.
export const NODES = [
  [20, 16], [10, 16], [0, 16], [-10, 16], [-20, 16], [-22, 8], [-22, 0], [-19, -3],
  [-19, -8], [-22, -11], [-20, -16], [-12, -16], [0, -16], [12, -16], [19, -14],
  [22, -12], [19, -9], [19, -4], [22, 0], [22, 8], [12, 10], [6, 4], [0, 2],
  [0, -4], [-4, -8], [-12, -6], [4, -8], [12, -6], [0, 10],
];

export const EDGES = [
  [0, 1], [0, 19], [0, 20], [1, 2], [2, 3], [2, 28], [3, 4], [4, 5], [5, 6], [6, 7],
  [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15], [15, 16],
  [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 28], [22, 23],
  [23, 24], [23, 26], [24, 25], [25, 8], [26, 27], [27, 16], [21, 18],
];

// Where defenders hold, and the direction they face (radians, 0 = facing -z).
export const HOLD_SPOTS = {
  A: [
    { node: 9, yaw: 0.6 }, { node: 8, yaw: 2.6 },
  ],
  B: [
    { node: 15, yaw: -0.6 }, { node: 16, yaw: 2.8 },
  ],
  mid: [
    { node: 23, yaw: 3.1 }, { node: 12, yaw: 3.1 },
  ],
};

// Floodlight poles: [x, z] — a pole, a lamp head and a warm glow sprite.
export const LAMPS = [
  [-19, -8], [19, -9], [0, 2], [20, 16], [-20, -16], [0, -16], [-22, 8], [22, 8],
];
