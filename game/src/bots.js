// The bots: nine AI soldiers with a shared brain. Each thinks at 8 Hz and steers at
// 60 Hz: waypoint routes from the nav graph (via its lane node, then the site),
// a vision cone with line-of-sight and smoke checks, hearing that turns heads
// toward gunfire, burst fire with aim error, radio callouts when it spots,
// plants, defuses or rotates, and objective play — attackers push a site and
// plant, defenders hold, rotate and defuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, moveBody, hasLineOfSight, findPath, buildAdjacency } from './physics.js';
import { NODES, EDGES } from './mapdata.js';
import { zoneOf } from './plans.js';
import { pick, range } from './rng.js';

const NAMES = ['Rook', 'Havoc', 'Sable', 'Fenn', 'Nomad', 'Vex', 'Onyx', 'Bram', 'Kite'];
const EYE = 1.55;
const THINK_HZ = 8;
const VISION_RANGE = 42;
const VISION_COS = Math.cos(1.05);

export function createBots(scene, colliders, hooks) {
  const adjacency = buildAdjacency(NODES.length, EDGES);
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.72, 0.28);
  const headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const legGeo = new THREE.BoxGeometry(0.17, 0.72, 0.17);
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.62);
  const mats = {
    atk: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.atk), emissive: new THREE.Color(PALETTE.atk), emissiveIntensity: 0.22, roughness: 0.7 }),
    def: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.def), emissive: new THREE.Color(PALETTE.def), emissiveIntensity: 0.22, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 }),
    skin: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sand), roughness: 0.8 }),
  };
  const bots = [];
  const hitMeshes = [];
  const eyePos = new THREE.Vector3();
  const chestPos = new THREE.Vector3();
  const shootFrom = new THREE.Vector3();
  const shootDir = new THREE.Vector3();

  function buildModel(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, mats[team]);
    torso.position.y = 1.18;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, mats.skin);
    head.position.y = 1.72;
    head.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), mats[team]);
    band.position.y = 1.8;
    const legL = new THREE.Mesh(legGeo, mats.dark);
    legL.position.set(-0.13, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, mats.dark);
    legR.position.set(0.13, 0.36, 0);
    const armL = new THREE.Mesh(armGeo, mats[team]);
    armL.position.set(-0.24, 1.2, -0.2);
    armL.rotation.x = -1.25;
    armL.rotation.z = 0.3;
    const armR = new THREE.Mesh(armGeo, mats[team]);
    armR.position.set(0.24, 1.2, -0.2);
    armR.rotation.x = -1.25;
    armR.rotation.z = -0.3;
    const gun = new THREE.Mesh(gunGeo, mats.dark);
    gun.position.set(0.1, 1.28, -0.45);
    group.add(torso, head, band, legL, legR, armL, armR, gun);
    return { group, torso, head, band, armL, armR, legL, legR, gun };
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const dx = NODES[i][0] - x;
      const dz = NODES[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function makeBot(index, team, name) {
    const model = buildModel(team);
    scene.add(model.group);
    const bot = {
      index,
      team,
      name,
      body: makeBody(0, 0, 0.34, 1.72),
      model,
      yaw: 0,
      health: 100,
      armour: 0,
      alive: true,
      isPlayer: false,
      weapon: 'rifle',
      skill: 0.45 + hooks.random() * 0.35,
      mode: 'advance',
      path: [],
      pathIndex: 0,
      holdYaw: 0,
      holdNode: 0,
      target: null,
      lastKnown: new THREE.Vector3(),
      hasKnown: false,
      reactLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      shotLeft: 0,
      strafeDir: 1,
      strafeLeft: 0,
      thinkLeft: (index * 0.13) % (1 / THINK_HZ),
      investigate: null,
      alert: 0,
      carrier: false,
      calloutLeft: 0,
      planting: 0,
      defusing: 0,
      walkPhase: hooks.random() * 6,
      fall: 0,
      chest: new THREE.Vector3(),
    };
    model.torso.userData.actor = bot;
    model.torso.userData.part = 'torso';
    model.head.userData.actor = bot;
    model.head.userData.part = 'head';
    // Legs and arms count as torso hits: without them ~44% of the standing
    // silhouette lets shots pass through to the wall behind.
    for (const limb of [model.legL, model.legR, model.armL, model.armR]) {
      limb.userData.actor = bot;
      limb.userData.part = 'torso';
    }
    hitMeshes.push(model.torso, model.head, model.legL, model.legR, model.armL, model.armR);
    bot.damage = (amount, head, attacker) => damageBot(bot, amount, head, attacker);
    bots.push(bot);
    return bot;
  }

  function damageBot(bot, amount, head, attacker) {
    if (!bot.alive) return 0;
    let dealt = amount;
    if (bot.armour > 0) {
      const absorbed = Math.min(bot.armour, dealt * 0.5);
      bot.armour -= absorbed;
      dealt -= absorbed;
    }
    bot.health = Math.max(0, bot.health - dealt);
    if (bot.health <= 0) {
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      hooks.onKill(bot, attacker, head);
      if (bot.carrier) hooks.onCarrierDown(bot);
    } else {
      // Being shot reveals the shooter's rough direction.
      bot.alert = 1;
      if (attacker && attacker.body) {
        bot.lastKnown.copy(attacker.body.position);
        bot.hasKnown = true;
      }
    }
    return dealt;
  }

  function routeTo(bot, node) {
    const start = nearestNode(bot.body.position.x, bot.body.position.z);
    bot.path = findPath(adjacency, start, node);
    bot.pathIndex = 0;
  }

  // Radio: a bot calls what it sees and does, at most one call every 5 seconds,
  // so the feed reads as a team talking, not a spam log. main.js shows only the
  // player's own team — hearing the enemy's radio would give the game away.
  function callout(bot, text) {
    if (bot.calloutLeft > 0 || !hooks.onCallout) return;
    bot.calloutLeft = 5;
    hooks.onCallout(bot.name, text, bot.team);
  }

  function faceToward(bot, x, z, dt, rate = 7) {
    const want = Math.atan2(-(x - bot.body.position.x), -(z - bot.body.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function canSee(bot, actor) {
    const from = eyePos.set(bot.body.position.x, bot.body.position.y + EYE, bot.body.position.z);
    const to = chestPos.set(actor.body.position.x, actor.body.position.y + 1.25, actor.body.position.z);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > VISION_RANGE) return 0;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    if ((dx * fx + dz * fz) / (dist || 1) < VISION_COS && dist > 3) return 0;
    if (!hasLineOfSight(from.x, from.y, from.z, to.x, to.y, to.z, colliders)) return 0;
    if (hooks.smokeBlocks(from.x, from.y, from.z, to.x, to.y, to.z)) return 0;
    return dist;
  }

  function acquireTarget(bot) {
    let best = null;
    let bestDist = Infinity;
    for (const actor of hooks.getActors()) {
      if (actor.team === bot.team || !actor.alive) continue;
      const dist = canSee(bot, actor);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        best = actor;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.reactLeft = range(hooks.random, 0.28, 0.5) * (1.15 - bot.skill * 0.5);
        callout(bot, `Contact, ${zoneOf(best.body.position.x, best.body.position.z)}!`);
      }
      bot.target = best;
      bot.lastKnown.copy(best.body.position);
      bot.hasKnown = true;
      bot.alert = 1;
    } else if (bot.target && !bot.target.alive) {
      bot.target = null;
    } else if (bot.target && canSee(bot, bot.target) === 0) {
      // Lost sight: keep hunting the last known position for a while.
      bot.alert = Math.max(bot.alert, 0.6);
      if (hooks.random() < 0.1) bot.target = null;
    }
  }

  function shootAt(bot, dt) {
    if (!bot.target || bot.reactLeft > 0) return;
    bot.shotLeft = Math.max(0, bot.shotLeft - dt);
    if (bot.shotLeft > 0) return;
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(hooks.random() * 3);
      bot.burstPause = 0;
    }
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.burstPause = range(hooks.random, 0.35, 0.7);
    const def = hooks.weaponDef(bot.weapon);
    bot.shotLeft = def.rate;
    const from = shootFrom.set(bot.body.position.x, bot.body.position.y + EYE, bot.body.position.z);
    const target = bot.target;
    const aimY = target.body.position.y + (hooks.random() < 0.16 ? 1.68 : 1.25);
    const dir = shootDir.set(target.body.position.x - from.x, aimY - from.y, target.body.position.z - from.z);
    const dist = dir.length();
    dir.normalize();
    const err = (1.25 - bot.skill) * 0.028 * (1 + dist / 26) + (target.moving ? 0.012 : 0);
    dir.x += (hooks.random() * 2 - 1) * err;
    dir.y += (hooks.random() * 2 - 1) * err;
    dir.z += (hooks.random() * 2 - 1) * err;
    dir.normalize();
    hooks.shootRay(from, dir, 80, bot, def);
    hooks.onNoise(from.x, from.z, 30, 'shot');
  }

  function think(bot, dt) {
    bot.thinkLeft -= dt;
    if (bot.thinkLeft > 0) return;
    bot.thinkLeft = 1 / THINK_HZ;
    bot.alert = Math.max(0, bot.alert - dt * 4);
    acquireTarget(bot);
    const bomb = hooks.bombState();
    if (bot.target) {
      bot.mode = 'engage';
      return;
    }
    if (bot.team === 'atk') {
      if (bot.carrier && bomb.state === 'carried' && hooks.inSite(bot.body.position.x, bot.body.position.z, hooks.targetSite())) {
        if (bot.mode !== 'plant') callout(bot, `Planting at Site ${hooks.targetSite()}!`);
        bot.mode = 'plant';
        return;
      }
      if (bomb.state === 'dropped' && hooks.nearestAttacker() === bot) {
        callout(bot, 'Recovering the charge!');
        // Only re-route from a distance: close in, the direct seek in steer()
        // finishes the job, and re-routing every think would drag the bot
        // back to the nearest nav node.
        const dx = bomb.position.x - bot.body.position.x;
        const dz = bomb.position.z - bot.body.position.z;
        if (Math.hypot(dx, dz) > 2.5) routeTo(bot, nearestNode(bomb.position.x, bomb.position.z));
        bot.mode = 'advance';
        bot.afterArrive = 'hold';
        return;
      }
      if (bomb.state === 'planted') {
        // Guard the planted bomb from a nearby hold.
        if (bot.mode !== 'hold') {
          bot.holdNode = nearestNode(bomb.position.x, bomb.position.z);
          routeTo(bot, bot.holdNode);
          bot.mode = 'advance';
          bot.afterArrive = 'hold';
        }
        return;
      }
      if (bot.mode === 'advance' && bot.pathIndex >= bot.path.length && bot.afterArrive !== 'push') {
        bot.mode = 'hold';
        bot.holdYaw = bot.yaw;
        return;
      }
      if (bot.investigate) {
        routeTo(bot, nearestNode(bot.investigate.x, bot.investigate.z));
        bot.mode = 'advance';
        bot.afterArrive = 'hold';
        bot.investigate = null;
        return;
      }
      if (bot.mode === 'hold' && bot.alert < 0.3 && !hooks.inSite(bot.body.position.x, bot.body.position.z, hooks.targetSite())) {
        // Regroup: rejoin the push toward the target site.
        routeTo(bot, hooks.siteNode(hooks.targetSite()));
        bot.mode = 'advance';
      }
      if (bot.mode !== 'advance' && bot.mode !== 'plant' && bot.mode !== 'hold') {
        routeTo(bot, hooks.siteNode(hooks.targetSite()));
        bot.mode = 'advance';
      }
    } else {
      if (bomb.state === 'planted') {
        if (bot.mode !== 'defuse') {
          callout(bot, 'Defusing the charge!');
          routeTo(bot, nearestNode(bomb.position.x, bomb.position.z));
          bot.mode = 'defuse';
        }
        return;
      }
      if (bot.investigate && bot.mode === 'hold') {
        callout(bot, `Rotating to ${zoneOf(bot.investigate.x, bot.investigate.z)}!`);
        routeTo(bot, nearestNode(bot.investigate.x, bot.investigate.z));
        bot.mode = 'advance';
        bot.afterArrive = 'hold';
        bot.investigate = null;
        return;
      }
      if (bot.mode === 'advance' && bot.afterArrive === 'hold' && bot.pathIndex >= bot.path.length) {
        bot.mode = 'hold';
      }
      if (bot.mode !== 'hold' && bot.mode !== 'defuse' && bot.mode !== 'advance') {
        routeTo(bot, bot.holdNode);
        bot.mode = 'advance';
        bot.afterArrive = 'hold';
      }
    }
  }

  function steer(bot, dt, frozen) {
    const body = bot.body;
    bot.moving = false;
    let wishX = 0;
    let wishZ = 0;
    let speed = 4.6;
    if (bot.mode === 'engage' && bot.target) {
      faceToward(bot, bot.target.body.position.x, bot.target.body.position.z, dt, 9);
      bot.strafeLeft -= dt;
      if (bot.strafeLeft <= 0) {
        bot.strafeDir *= -1;
        bot.strafeLeft = range(hooks.random, 0.6, 1.3);
      }
      const side = bot.strafeDir;
      wishX = Math.cos(bot.yaw) * side;
      wishZ = -Math.sin(bot.yaw) * side;
      speed = 2.6;
      // Close distance when far, back off when point-blank.
      const dx = bot.target.body.position.x - body.position.x;
      const dz = bot.target.body.position.z - body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 18) {
        wishX += (dx / dist) * 0.8;
        wishZ += (dz / dist) * 0.8;
      } else if (dist < 4) {
        wishX -= (dx / dist) * 0.6;
        wishZ -= (dz / dist) * 0.6;
      }
    } else if (bot.mode === 'plant') {
      faceToward(bot, hooks.siteCenter(hooks.targetSite()).x, hooks.siteCenter(hooks.targetSite()).z, dt, 5);
      bot.planting += dt;
      if (bot.planting >= 3) {
        bot.planting = 0;
        hooks.onPlant(bot);
      }
    } else if (bot.mode === 'defuse') {
      const bomb = hooks.bombState();
      const dx = bomb.position.x - body.position.x;
      const dz = bomb.position.z - body.position.z;
      if (Math.hypot(dx, dz) < 1.6) {
        faceToward(bot, bomb.position.x, bomb.position.z, dt, 5);
        bot.defusing += dt;
        if (bot.defusing >= 5) {
          bot.defusing = 0;
          hooks.onDefuse(bot);
        }
      } else if (bot.pathIndex < bot.path.length) {
        followPath(bot, dt);
      } else {
        // Path exhausted: the nearest nav node can sit metres from a corner
        // plant, so steer straight at the bomb for the last leg.
        seekPoint(bot, dt, bomb.position.x, bomb.position.z);
      }
      return;
    } else if (bot.mode === 'hold') {
      // Scan: slow sweep around the hold facing.
      bot.yaw = bot.holdYaw + Math.sin(hooks.time() * 0.5 + bot.index) * 0.5;
      if (bot.alert > 0.5 && bot.hasKnown) faceToward(bot, bot.lastKnown.x, bot.lastKnown.z, dt, 6);
    } else if (bot.pathIndex < bot.path.length) {
      followPath(bot, dt);
      return;
    } else if (bot.team === 'atk' && hooks.bombState().state === 'dropped' && hooks.nearestAttacker() === bot) {
      // Recovering: the path is exhausted but the bomb sits off the nav
      // graph, so steer straight at it instead of holding at the node.
      const bomb = hooks.bombState();
      const dx = bomb.position.x - body.position.x;
      const dz = bomb.position.z - body.position.z;
      if (Math.hypot(dx, dz) > 1.2) {
        seekPoint(bot, dt, bomb.position.x, bomb.position.z);
        return;
      }
      bot.mode = 'hold';
      bot.afterArrive = null;
    } else if (bot.afterArrive === 'push') {
      // Reached the lane waypoint: push on to the target site.
      routeTo(bot, hooks.siteNode(hooks.targetSite()));
      bot.afterArrive = null;
      bot.mode = 'advance';
    } else if (bot.afterArrive === 'hold') {
      bot.mode = 'hold';
      bot.afterArrive = null;
    }
    if (frozen) {
      wishX = 0;
      wishZ = 0;
    }
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) {
      wishX /= len;
      wishZ /= len;
    }
    const blend = Math.min(1, 30 * dt / speed);
    body.velocity.x += (wishX * speed - body.velocity.x) * blend;
    body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
    body.velocity.y -= 20 * dt;
    moveBody(body, dt, colliders);
    bot.moving = len > 0;
    // Separation from nearby allies, so bots do not stack.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = body.position.x - other.body.position.x;
      const dz = body.position.z - other.body.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.01 && d2 < 0.81) {
        const d = Math.sqrt(d2);
        body.position.x += (dx / d) * dt * 1.2;
        body.position.z += (dz / d) * dt * 1.2;
      }
    }
  }

  function followPath(bot, dt) {
    const node = NODES[bot.path[bot.pathIndex]];
    if (!node) {
      bot.pathIndex = bot.path.length;
      return;
    }
    const dx = node[0] - bot.body.position.x;
    const dz = node[1] - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.9) {
      bot.pathIndex += 1;
      return;
    }
    faceToward(bot, node[0], node[1], dt, 8);
    const speed = 4.6;
    const blend = Math.min(1, 30 * dt / speed);
    bot.body.velocity.x += ((dx / dist) * speed - bot.body.velocity.x) * blend;
    bot.body.velocity.z += ((dz / dist) * speed - bot.body.velocity.z) * blend;
    bot.body.velocity.y -= 20 * dt;
    moveBody(bot.body, dt, colliders);
    bot.moving = true;
  }

  // Direct steering toward a point, for the last leg off the nav graph (a
  // corner plant, a dropped bomb). Same movement model as followPath: face
  // the target, accelerate, slide along colliders axis by axis.
  function seekPoint(bot, dt, x, z) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    faceToward(bot, x, z, dt, 8);
    const speed = 4.6;
    const blend = Math.min(1, 30 * dt / speed);
    bot.body.velocity.x += ((dx / dist) * speed - bot.body.velocity.x) * blend;
    bot.body.velocity.z += ((dz / dist) * speed - bot.body.velocity.z) * blend;
    bot.body.velocity.y -= 20 * dt;
    moveBody(bot.body, dt, colliders);
    bot.moving = true;
  }

  function syncModel(bot, dt) {
    const model = bot.model;
    model.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.35);
      model.group.rotation.x = -bot.fall * 1.5;
      model.group.position.y = -bot.fall * 0.1;
      return;
    }
    model.group.rotation.set(0, bot.yaw, 0);
    if (bot.moving) {
      bot.walkPhase += dt * 9;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      model.legL.rotation.x = swing;
      model.legR.rotation.x = -swing;
    } else {
      model.legL.rotation.x *= 0.8;
      model.legR.rotation.x *= 0.8;
    }
    bot.chest.set(bot.body.position.x, bot.body.position.y + 1.25, bot.body.position.z);
  }

  return {
    bots,
    hitMeshes,
    spawn(names, assignments) {
      // assignments: [{ team, x, z, yaw, weapon, holdNode, holdYaw, carrier }]
      for (let i = 0; i < assignments.length; i += 1) {
        const a = assignments[i];
        let bot = bots[i];
        if (!bot) bot = makeBot(i, a.team, names[i] || NAMES[i % NAMES.length]);
        bot.team = a.team;
        bot.body.position.set(a.x, 0, a.z);
        bot.body.velocity.set(0, 0, 0);
        bot.yaw = a.yaw;
        bot.health = 100;
        bot.armour = a.armour || 0;
        bot.alive = true;
        bot.weapon = a.weapon;
        bot.mode = 'advance';
        bot.afterArrive = a.team === 'def' ? 'hold' : null;
        bot.holdNode = a.holdNode ?? nearestNode(a.x, a.z);
        bot.holdYaw = a.holdYaw ?? a.yaw;
        bot.carrier = !!a.carrier;
        bot.calloutLeft = 0;
        bot.target = null;
        bot.hasKnown = false;
        bot.planting = 0;
        bot.defusing = 0;
        bot.shotLeft = 0;
        bot.fall = 0;
        bot.investigate = null;
        bot.path = [];
        bot.pathIndex = 0;
        bot.model.group.rotation.set(0, a.yaw, 0);
        bot.model.group.visible = true;
        bot.model.torso.material = mats[a.team];
        bot.model.band.material = mats[a.team];
        bot.model.armL.material = mats[a.team];
        bot.model.armR.material = mats[a.team];
        if (a.team === 'atk') {
          // Route via the plan's lane waypoint, then push the site.
          routeTo(bot, a.viaNode ?? hooks.siteNode(hooks.targetSite()));
          bot.afterArrive = 'push';
        } else {
          routeTo(bot, bot.holdNode);
          bot.afterArrive = 'hold';
        }
        syncModel(bot, 0);
      }
      for (let i = assignments.length; i < bots.length; i += 1) {
        bots[i].alive = false;
        bots[i].model.group.visible = false;
      }
    },
    step(dt, frozen) {
      for (const bot of bots) {
        if (!bot.alive) {
          syncModel(bot, dt);
          continue;
        }
        if (frozen) {
          syncModel(bot, dt);
          continue;
        }
        bot.reactLeft = Math.max(0, bot.reactLeft - dt);
        bot.calloutLeft = Math.max(0, bot.calloutLeft - dt);
        think(bot, dt);
        steer(bot, dt, frozen);
        if (bot.mode === 'engage') shootAt(bot, dt);
        syncModel(bot, dt);
      }
    },
    hearNoise(x, z, radius, kind) {
      for (const bot of bots) {
        if (!bot.alive || bot.mode === 'engage') continue;
        const dx = bot.body.position.x - x;
        const dz = bot.body.position.z - z;
        if (dx * dx + dz * dz > radius * radius) continue;
        bot.alert = 1;
        bot.investigate = { x, z };
        // Defenders near a site rotate toward heavy contact at the other site.
        if (bot.team === 'def' && kind === 'shot' && bot.mode === 'hold') {
          bot.investigate = { x, z };
        }
      }
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    carrierBot() {
      return bots.find((b) => b.carrier && b.alive) || null;
    },
  };
}
