// Shared movement and sight: one axis-at-a-time box mover for the player and the bots,
// and a segment-vs-box line-of-sight test for bot vision, bullets and explosions.
// No allocation in the hot paths: probes and vectors are reused module-wide.
import * as THREE from 'three';

const probe = new THREE.Box3();
const EPS = 1e-6;

export function makeBody(x, z, radius, height) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
}

// Move a body against the colliders, one axis at a time. Returns the collider hit, if any.
export function moveBody(body, dt, colliders) {
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(nextX, body.position.y, body.position.z, body, colliders, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body.position.x, body.position.y, nextZ, body, colliders, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body.position.x, body.position.y, body.position.z, body, colliders, 0);
  if (hit) {
    if (body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  return hit;
}

export function overlaps(x, y, z, body, colliders, lift) {
  probe.min.set(x - body.radius, y + lift, z - body.radius);
  probe.max.set(x + body.radius, y + body.height - lift, z + body.radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// True when the segment from A to B crosses no collider. Used for sight and for
// deciding whether an explosion's blast reaches a target.
export function hasLineOfSight(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (const box of colliders) {
    if (segmentHitsBox(ax, ay, az, dx, dy, dz, box)) return false;
  }
  return true;
}

function segmentHitsBox(ax, ay, az, dx, dy, dz, box) {
  let tmin = 0;
  let tmax = 1;
  const mins = [box.min.x, box.min.y, box.min.z];
  const maxs = [box.max.x, box.max.y, box.max.z];
  const origins = [ax, ay, az];
  const dirs = [dx, dy, dz];
  for (let i = 0; i < 3; i += 1) {
    const d = dirs[i];
    if (Math.abs(d) < EPS) {
      if (origins[i] < mins[i] || origins[i] > maxs[i]) return false;
    } else {
      let t1 = (mins[i] - origins[i]) / d;
      let t2 = (maxs[i] - origins[i]) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Breadth-first search over the waypoint graph. Returns node ids from start to goal.
export function findPath(adjacency, start, goal) {
  if (start === goal) return [start];
  const prev = new Int16Array(adjacency.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of adjacency[node]) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === goal) {
        const path = [goal];
        let cur = goal;
        while (cur !== start) {
          cur = prev[cur];
          path.push(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return [start];
}

export function buildAdjacency(count, edges) {
  const adjacency = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}
