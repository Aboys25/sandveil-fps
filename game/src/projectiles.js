// Things that fly: frag and smoke grenades with bouncing ballistic arcs, tracer lines,
// impact particles and explosions. Smoke clouds are real volumes: they block bot sight
// through the same segment test bullets use, so a smoke buys a crossing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { overlaps, hasLineOfSight } from './physics.js';

const GRAVITY = 16;
const FRAG_FUSE = 2.2;
const FRAG_RADIUS = 8;
const SMOKE_TIME = 12;
const SMOKE_RADIUS = 3.4;
const TRACER_LIFE = 0.12;

export function createProjectiles(scene, colliders, hooks) {
  const grenades = [];
  const clouds = [];
  const flashes = [];
  let shake = 0;

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.olive), roughness: 0.7 });
  const smokeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.smoke), roughness: 0.9 });
  const smokePuffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.smoke), transparent: true, opacity: 0.32, depthWrite: false });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);

  // Tracer pool: 24 fading lines, reused, never allocated mid-frame.
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  // Impact particle pool: one Points cloud, 240 particles with velocity and life.
  const MAX_PARTICLES = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  const particles = Array.from({ length: MAX_PARTICLES }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  let particleNext = 0;
  const tmpColor = new THREE.Color();

  function spawnTracer(from, to) {
    const tracer = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % tracers.length;
    const attr = tracer.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    tracer.line.visible = true;
    tracer.line.material.opacity = 0.85;
    tracer.life = TRACER_LIFE;
  }

  function spawnImpact(point, colorHex, count = 6, speed = 2.4) {
    tmpColor.set(colorHex);
    for (let i = 0; i < count; i += 1) {
      const slot = particleNext;
      particleNext = (particleNext + 1) % MAX_PARTICLES;
      const p = particles[slot];
      p.life = 0.35 + hooks.random() * 0.25;
      p.vx = (hooks.random() * 2 - 1) * speed;
      p.vy = hooks.random() * speed * 1.2;
      p.vz = (hooks.random() * 2 - 1) * speed;
      const idx = slot * 3;
      pPos[idx] = point.x;
      pPos[idx + 1] = point.y;
      pPos[idx + 2] = point.z;
      pCol[idx] = tmpColor.r;
      pCol[idx + 1] = tmpColor.g;
      pCol[idx + 2] = tmpColor.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function throwGrenade(type, origin, direction, team, thrower) {
    const mesh = new THREE.Mesh(grenadeGeo, type === 'frag' ? fragMat : smokeMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    grenades.push({
      type,
      team,
      thrower,
      mesh,
      velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: type === 'frag' ? FRAG_FUSE : 1.1,
      rest: false,
    });
  }

  function explode(position, team, radius, maxDamage, thrower) {
    hooks.onExplosion(position, team, radius, maxDamage, thrower);
    spawnImpact(position, PALETTE.accent, 26, 5);
    const flashMesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.7, depthWrite: false }));
    flashMesh.position.copy(position);
    flashMesh.scale.setScalar(0.5);
    scene.add(flashMesh);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, radius * 2.5, 1.6);
    light.position.copy(position);
    scene.add(light);
    flashes.push({ mesh: flashMesh, light, life: 0.35, max: radius * 0.55 });
    shake = Math.min(1, shake + 0.7);
  }

  function popSmoke(position) {
    const group = new THREE.Group();
    group.position.copy(position);
    const mat = smokePuffMat.clone();
    for (let i = 0; i < 6; i += 1) {
      const puff = new THREE.Mesh(puffGeo, mat);
      puff.position.set((hooks.random() * 2 - 1) * 1.6, 0.6 + hooks.random() * 1.4, (hooks.random() * 2 - 1) * 1.6);
      puff.scale.setScalar(1.4 + hooks.random() * 1.2);
      group.add(puff);
    }
    scene.add(group);
    clouds.push({ group, mat, x: position.x, y: position.y + 1.2, z: position.z, radius: SMOKE_RADIUS, life: SMOKE_TIME });
  }

  function segmentHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const fx = ax - cx;
    const fy = ay - cy;
    const fz = az - cz;
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (fx * dx + fy * dy + fz * dz);
    const c = fx * fx + fy * fy + fz * fz - r * r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a);
    const t2 = (-b + disc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
  }

  function step(dt) {
    shake = Math.max(0, shake - dt * 2.2);
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        if (g.type === 'frag') explode(g.mesh.position, g.team, FRAG_RADIUS, 110, g.thrower);
        else popSmoke(g.mesh.position);
        continue;
      }
      if (!g.rest) {
        g.velocity.y -= GRAVITY * dt;
        const pos = g.mesh.position;
        const probe = { position: pos, velocity: g.velocity, radius: 0.09, height: 0.18, onGround: false };
        const before = pos.clone();
        pos.x += g.velocity.x * dt;
        if (overlaps(pos.x, pos.y, pos.z, probe, colliders, 0)) {
          pos.x = before.x;
          g.velocity.x *= -0.45;
          hooks.onBounce(pos);
        }
        pos.z += g.velocity.z * dt;
        if (overlaps(pos.x, pos.y, pos.z, probe, colliders, 0)) {
          pos.z = before.z;
          g.velocity.z *= -0.45;
          hooks.onBounce(pos);
        }
        pos.y += g.velocity.y * dt;
        if (pos.y <= 0.09) {
          pos.y = 0.09;
          if (Math.abs(g.velocity.y) > 2) hooks.onBounce(pos);
          g.velocity.y *= -0.4;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
          if (g.velocity.lengthSq() < 1.2) g.rest = true;
        } else if (overlaps(pos.x, pos.y, pos.z, probe, colliders, 0)) {
          pos.y = before.y;
          g.velocity.y *= -0.4;
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      cloud.life -= dt;
      cloud.group.rotation.y += dt * 0.12;
      cloud.mat.opacity = 0.32 * Math.min(1, cloud.life / 2);
      cloud.group.children.forEach((puff) => puff.scale.multiplyScalar(1 + dt * 0.03));
      if (cloud.life <= 0) {
        scene.remove(cloud.group);
        clouds.splice(i, 1);
      }
    }
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.85;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
    let moved = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= 9 * dt;
      const idx = i * 3;
      pPos[idx] += p.vx * dt;
      pPos[idx + 1] += p.vy * dt;
      pPos[idx + 2] += p.vz * dt;
      if (pPos[idx + 1] < 0.02) pPos[idx + 1] = 0.02;
      if (p.life <= 0) pPos[idx + 1] = -10;
      moved = true;
    }
    if (moved) pGeo.attributes.position.needsUpdate = true;
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const f = flashes[i];
      f.life -= dt;
      f.mesh.scale.setScalar(f.max * (1 - f.life / 0.35) + 0.5);
      f.mesh.material.opacity = Math.max(0, f.life / 0.35) * 0.7;
      f.light.intensity = Math.max(0, f.life / 0.35) * 60;
      if (f.life <= 0) {
        scene.remove(f.mesh);
        scene.remove(f.light);
        flashes.splice(i, 1);
      }
    }
  }

  return {
    step,
    throwGrenade,
    spawnTracer,
    spawnImpact,
    explode,
    shakeAmount() {
      return shake;
    },
    addShake(amount) {
      shake = Math.min(1, shake + amount);
    },
    smokeBlocks(ax, ay, az, bx, by, bz) {
      for (const cloud of clouds) {
        if (segmentHitsSphere(ax, ay, az, bx, by, bz, cloud.x, cloud.y, cloud.z, cloud.radius)) return true;
      }
      return false;
    },
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
      for (const cloud of clouds) scene.remove(cloud.group);
      clouds.length = 0;
    },
  };
}

// Blast damage helper shared by grenades and the bomb: line-of-sight checked, falling
// off with distance. `targets` are { team, alive, chest: Vector3, damage(amount, head, attacker) }.
export function blastDamage(position, team, radius, maxDamage, targets, attacker, colliders) {
  for (const target of targets) {
    if (!target.alive || target.team === team) continue;
    const dist = position.distanceTo(target.chest);
    if (dist > radius) continue;
    if (!hasLineOfSight(position.x, position.y, position.z, target.chest.x, target.chest.y, target.chest.z, colliders)) continue;
    const amount = maxDamage * (1 - (dist / radius) * 0.85);
    target.damage(amount, false, attacker);
  }
}
