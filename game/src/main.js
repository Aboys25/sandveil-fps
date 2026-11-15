// SANDVEIL — boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. This module wires the pieces: it owns the raycaster both the player
// and the bots shoot through, the plant/defuse interaction, grenade throws, the buy
// flow, spectating, and the deterministic ?shot= setups the screenshots come from.
import * as THREE from 'three';
import { PALETTE, TEAM_NAMES } from './palette.js';
import { mulberry32, pick, range } from './rng.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createProjectiles, blastDamage } from './projectiles.js';
import { createMatch, BUY_TIME, PLANT_TIME, DEFUSE_TIME, BUY_MENU } from './match.js';
import { createHud } from './hud.js';
import { SITES, SPAWNS, HOLD_SPOTS } from './mapdata.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const audio = createAudio();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1f18');
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 300);
scene.add(camera);

const world = createWorld(scene);
const match = createMatch(scene, random);
const player = createPlayer(world.colliders, SPAWNS.atk[0][0], SPAWNS.atk[0][1]);
const weapons = createWeapons(camera);
const projectiles = createProjectiles(scene, world.colliders, {
  random,
  onExplosion(position, team, radius, maxDamage, thrower) {
    const targets = allActors();
    blastDamage(position, team, radius, maxDamage, targets, thrower || BOMB_ACTOR, world.colliders);
    audio.explosion(camera.position.distanceTo(position));
    projectiles.addShake(0.5);
    emitNoise(position.x, position.z, 60, 'blast');
  },
  onBounce(position) {
    audio.bounce(camera.position.distanceTo(position));
  },
});

const BOMB_ACTOR = { name: 'Bomb', team: 'none', isPlayer: false, body: null };
const playerActor = {
  name: 'You',
  isPlayer: true,
  body: player.state.body,
  chest: new THREE.Vector3(),
  moving: false,
  get team() {
    return match.state.playerTeam;
  },
  get alive() {
    return player.state.alive;
  },
  damage(amount, head, attacker) {
    const dealt = player.damage(amount);
    if (dealt > 0) {
      match.state.loadout.armour = player.state.armour;
      audio.hurt();
      hud.damageFlash(dealt / 60);
      projectiles.addShake(0.25);
      // Damage direction: bearing of the attacker relative to where the player faces.
      if (attacker && attacker.body) {
        const feet = player.state.body.position;
        const dx = attacker.body.position.x - feet.x;
        const dz = attacker.body.position.z - feet.z;
        const yaw = player.state.yaw;
        const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
        const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
        hud.damageFrom((Math.atan2(right, fwd) * 180) / Math.PI);
      }
    }
    if (!player.state.alive && dealt > 0) onActorKilled(playerActor, attacker, head);
    return dealt;
  },
};

function allActors() {
  return [playerActor, ...bots.bots];
}

// --- Shared hitscan: one raycaster for the player and every bot. ------------------
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootDirection = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const hitPoint = new THREE.Vector3();

function rayHitsPlayer(origin, dir, maxDist) {
  // Analytic ray vs the player's upright capsule (approximated as a segment + radius).
  const feet = player.state.body.position;
  const height = player.state.height;
  const ox = origin.x - feet.x;
  const oy = origin.y - feet.y;
  const oz = origin.z - feet.z;
  const dx = dir.x;
  const dy = dir.y;
  const dz = dir.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - 0.36 * 0.36;
  let t = -1;
  if (a > 1e-8) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      const y1 = oy + t1 * dy;
      const y2 = oy + t2 * dy;
      if (t1 >= 0 && y1 >= 0 && y1 <= height) t = t1;
      else if (t2 >= 0 && y2 >= 0 && y2 <= height) t = t2;
    }
  }
  if (t < 0 || t > maxDist) return null;
  const y = oy + t * dy;
  return { distance: t, part: y > height - 0.28 ? 'head' : 'torso' };
}

function resolveShot(origin, dir, maxDist, shooter, def) {
  // Walls and bots through the raycaster; the player analytically; nearest wins.
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const targets = world.shootables.concat(bots.hitMeshes);
  const hits = raycaster.intersectObjects(targets, false);
  let best = null;
  for (const hit of hits) {
    const actor = hit.object.userData.actor;
    if (actor && actor === shooter) continue;
    best = { point: hit.point, actor: actor || null, part: hit.object.userData.part || null, distance: hit.distance, wall: !actor };
    break;
  }
  if (shooter !== playerActor && player.state.alive) {
    const pHit = rayHitsPlayer(origin, dir, maxDist);
    if (pHit && (!best || pHit.distance < best.distance)) {
      best = { point: hitPoint.copy(origin).addScaledVector(dir, pHit.distance), actor: playerActor, part: pHit.part, distance: pHit.distance, wall: false };
    }
  }
  if (!best) {
    best = { point: hitPoint.copy(origin).addScaledVector(dir, maxDist), actor: null, part: null, distance: maxDist, wall: false };
  }
  if (best.actor && best.actor.team !== shooter.team) {
    let damage = def.damage;
    const falloff = Math.max(0, best.distance - def.falloff);
    damage = Math.max(def.damage * 0.45, damage - falloff * def.damage * 0.012);
    if (best.part === 'head') damage *= def.headMult;
    const dealt = best.actor.damage(damage, best.part === 'head', shooter);
    if (shooter === playerActor) {
      hud.hitMarker(!best.actor.alive);
      audio.hit(!best.actor.alive, best.part === 'head');
      match.state.stats.damage += dealt;
    }
  } else if (best.wall) {
    projectiles.spawnImpact(best.point, PALETTE.sand, 5, 2);
  }
  projectiles.spawnTracer(origin, best.point);
  return best;
}

function onActorKilled(victim, attacker, headshot) {
  const killerName = attacker ? attacker.name : 'World';
  const killerTeam = attacker ? attacker.team : 'none';
  match.onKill(victim.isPlayer ? 'player' : victim.name, attacker && attacker.isPlayer ? 'player' : killerName, headshot);
  hud.addKill(killerName, victim.name, headshot, killerTeam);
  if (victim.isPlayer) {
    // Death loses the bought primary (CS-style economy): respawn pistol-only.
    weapons.losePrimary();
    // The charge drops where the player fell, so a teammate can recover it.
    if (match.state.bomb.carrier === playerActor) {
      match.state.bomb.state = 'dropped';
      match.state.bomb.position.copy(player.state.body.position);
      match.state.bomb.carrier = null;
    }
    spectateTarget = nearestAliveAlly();
    hud.setSpectate(spectateTarget ? spectateTarget.name : null);
  }
}

function nearestAliveAlly() {
  let best = null;
  let bestDist = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== match.state.playerTeam) continue;
    const d = bot.body.position.distanceToSquared(player.state.body.position);
    if (d < bestDist) {
      bestDist = d;
      best = bot;
    }
  }
  return best;
}

// --- Bots -----------------------------------------------------------------------
const foePings = [];
function emitNoise(x, z, radius, kind) {
  bots.hearNoise(x, z, radius, kind);
}

const bots = createBots(scene, world.colliders, {
  random,
  time: () => match.state.time,
  weaponDef: (id) => WEAPONS[id],
  getActors: allActors,
  smokeBlocks: (ax, ay, az, bx, by, bz) => projectiles.smokeBlocks(ax, ay, az, bx, by, bz),
  bombState: () => match.state.bomb,
  targetSite: () => match.state.targetSite,
  siteNode: (id) => (id === 'A' ? 8 : 16),
  siteCenter: (id) => {
    const site = SITES.find((s) => s.id === id);
    return { x: site.cx, z: site.cz };
  },
  inSite: (x, z, id) => match.inSite(x, z, id),
  nearestAttacker: () => {
    let best = null;
    let bestDist = Infinity;
    const bomb = match.state.bomb;
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team !== 'atk') continue;
      const d = bot.body.position.distanceToSquared(bomb.position);
      if (d < bestDist) {
        bestDist = d;
        best = bot;
      }
    }
    return best;
  },
  shootRay(origin, dir, maxDist, bot, def) {
    muzzlePos.copy(origin);
    resolveShot(origin, dir, maxDist, bot, def);
    audio.shoot(bot.weapon === 'shotgun' ? 'shotgun' : bot.weapon === 'dmr' ? 'dmr' : 'rifle', camera.position.distanceTo(origin));
    foePings.push({ x: bot.body.position.x, z: bot.body.position.z, at: match.state.time, team: bot.team });
  },
  onNoise: emitNoise,
  onCallout: (name, text, team) => {
    // Radio is the player's own team only; the enemy's calls stay unheard.
    if (team === match.state.playerTeam) hud.addCallout(name, text, team);
  },
  onKill: (victim, attacker, head) => onActorKilled(victim, attacker, head),
  onCarrierDown: (bot) => {
    if (match.state.bomb.carrier === bot) {
      match.state.bomb.state = 'dropped';
      match.state.bomb.position.copy(bot.body.position);
      match.state.bomb.carrier = null;
    }
  },
  onPlant: (bot) => {
    match.state.bomb.position.copy(bot.body.position);
    if (match.plant(match.state.targetSite, bot.name)) {
      audio.plant();
    }
  },
  onDefuse: () => {
    match.defuse('bot');
  },
});

// --- HUD + input ------------------------------------------------------------------
let buyOpen = false;
let paused = false;
let spectateTarget = null;
let grenadeCooldown = 0;
let plantProgress = 0;
let defuseProgress = 0;
let stepNoiseLeft = 0;
let bobPhase = 0;

const hud = createHud({
  onPlay: () => {
    audio.unlock();
    if (match.state.phase === 'menu' || match.state.phase === 'matchEnd') {
      match.startMatch();
      weapons.resetMatch();
      respawnRound();
      hud.hideOverlay();
    }
    input.requestLock();
  },
  onBuy: (id) => {
    tryBuy(id);
  },
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    paused = false;
    hud.hideOverlay();
    if (buyOpen) closeBuy();
  } else if (match.state.phase !== 'menu' && match.state.phase !== 'matchEnd' && !buyOpen) {
    paused = true;
    hud.showOverlay('paused');
  }
});

// Clicking the game view re-locks the mouse after the buy menu or a pause.
renderer.domElement.addEventListener('click', () => {
  if (shot || buyOpen || input.state.locked) return;
  const phase = match.state.phase;
  if (phase === 'live' || phase === 'buy') input.requestLock();
});

function tryBuy(id) {
  const item = BUY_MENU.find((i) => i.id === id);
  if (!item) return;
  if (match.buy(id)) {
    audio.buy();
    if (item.kind === 'primary') weapons.buy(id);
    if (item.kind === 'armour') player.state.armour = 100;
    hud.setMoney(match.state.money);
    hud.setGrenades(match.state.loadout.frags, match.state.loadout.smokes);
    hud.showBuyMenu(true, match.state.money, match.state.playerTeam);
    syncHudStatic();
  }
}

function openBuy() {
  if (match.state.phase !== 'buy') return;
  buyOpen = true;
  hud.showBuyMenu(true, match.state.money, match.state.playerTeam);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuy() {
  buyOpen = false;
  hud.showBuyMenu(false, match.state.money, match.state.playerTeam);
  if (match.state.phase !== 'menu' && match.state.phase !== 'matchEnd' && !shot) input.requestLock();
}

// --- Rounds -----------------------------------------------------------------------
let lastRespawnedRound = 0;
function respawnRound() {
  lastRespawnedRound = match.state.round;
  const team = match.state.playerTeam;
  const foeTeam = team === 'atk' ? 'def' : 'atk';
  const spawn = SPAWNS[team][0];
  const yaw = team === 'atk' ? Math.PI * 0.22 : -Math.PI * 0.78;
  player.reset(spawn[0], spawn[1], yaw);
  player.state.armour = match.state.loadout.armour;
  weapons.refillSidearm();
  spectateTarget = null;
  hud.setSpectate(null);
  plantProgress = 0;
  defuseProgress = 0;
  projectiles.clear();

  // Bots: 4 allies, 5 enemies. Weapons scale with the round: pistols and SMGs early,
  // rifles after, one marksman per side from round 3. Attackers take the plan's
  // lane waypoints; defenders take the setup's hold spots.
  const round = match.state.round;
  const plan = match.state.plan;
  const assignments = [];
  const allyNames = ['Rook', 'Havoc', 'Sable', 'Fenn'];
  const foeNames = ['Nomad', 'Vex', 'Onyx', 'Bram', 'Kite'];
  const pickGun = (i) => {
    if (round < 2) return i === 0 ? 'smg' : 'pistol';
    if (round >= 3 && i === 3) return 'dmr';
    return pick(random, ['rifle', 'rifle', 'smg', 'shotgun']);
  };
  const spots = [...HOLD_SPOTS.A, ...HOLD_SPOTS.B, ...HOLD_SPOTS.mid];
  const buildAssignment = (side, spawn, k) => {
    const hold = side === 'def' ? spots[plan.defense.holds[k % plan.defense.holds.length]] : spots[k % spots.length];
    return {
      team: side,
      x: spawn[0],
      z: spawn[1],
      yaw: side === team ? yaw : yaw + Math.PI,
      weapon: pickGun(k),
      armour: round >= 2 ? 50 : 0,
      holdNode: hold.node,
      holdYaw: hold.yaw,
      viaNode: side === 'atk' ? plan.attack.lanes[k % plan.attack.lanes.length] : undefined,
      carrier: false,
    };
  };
  for (let i = 0; i < 4; i += 1) assignments.push(buildAssignment(team, SPAWNS[team][i + 1], i));
  for (let i = 0; i < 5; i += 1) assignments.push(buildAssignment(foeTeam, SPAWNS[foeTeam][i], i));
  bots.spawn([...allyNames, ...foeNames], assignments);
  // The bomb: the player carries it while attacking, else a random attacker bot.
  if (team === 'atk') {
    match.state.bomb.carrier = playerActor;
  } else {
    const carriers = bots.bots.filter((b) => b.alive && b.team === 'atk');
    const carrier = pick(random, carriers);
    carrier.carrier = true;
    match.state.bomb.carrier = carrier;
  }
  hud.setScore(match.state.score.squad, match.state.score.foe, match.state.round);
  hud.setMoney(match.state.money);
  hud.setGrenades(match.state.loadout.frags, match.state.loadout.smokes);
  const planCall = team === 'atk' ? plan.attack.name : plan.defense.name;
  hud.banner(`ROUND ${match.state.round}`, team === 'atk' ? `${planCall} — plant the charge at Site ${match.state.targetSite}` : `${planCall} — defend the sites, stop the plant`, 3000);
}

function syncHudStatic() {
  hud.setHealth(player.state.health, player.state.armour);
  const def = weapons.current();
  const slot = weapons.ammo[weapons.currentId()];
  hud.setAmmo(slot.mag, slot.reserve, def.name);
  hud.setMoney(match.state.money);
}

// --- Shooting ---------------------------------------------------------------------
function playerShoot() {
  if (!weapons.canFire()) return;
  if (!weapons.takeRound()) {
    if (weapons.state.cooldown === 0) {
      weapons.state.cooldown = 0.25;
      audio.dryFire();
    }
    return;
  }
  weapons.pullTrigger();
  const def = weapons.current();
  const spread = weapons.spread(player.groundSpeed(), !player.state.body.onGround, input.state.aiming);
  audio.shoot(def === WEAPONS.shotgun ? 'shotgun' : def === WEAPONS.dmr ? 'dmr' : 'rifle', 0);
  emitNoise(player.state.body.position.x, player.state.body.position.z, 30, 'shot');
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    camera.getWorldDirection(shootDirection);
    shootDirection.x += (random() * 2 - 1) * spread;
    shootDirection.y += (random() * 2 - 1) * spread;
    shootDirection.z += (random() * 2 - 1) * spread;
    shootDirection.normalize();
    resolveShot(camera.position, shootDirection, 90, playerActor, def);
  }
  player.recoil(def.recoil * (0.9 + random() * 0.3), (random() * 2 - 1) * def.recoil * 0.4);
  syncHudStatic();
}

function throwGrenade(type) {
  const loadout = match.state.loadout;
  if (grenadeCooldown > 0 || !player.state.alive) return;
  if (type === 'frag' && loadout.frags <= 0) return;
  if (type === 'smoke' && loadout.smokes <= 0) return;
  if (type === 'frag') loadout.frags -= 1;
  else loadout.smokes -= 1;
  grenadeCooldown = 0.6;
  camera.getWorldDirection(shootDirection);
  const origin = camera.position.clone().addScaledVector(shootDirection, 0.5);
  origin.y -= 0.1;
  projectiles.throwGrenade(type, origin, shootDirection, match.state.playerTeam, playerActor);
  hud.setGrenades(loadout.frags, loadout.smokes);
}

// --- Simulation step ---------------------------------------------------------------
function step(dt) {
  match.step(dt);
  const phase = match.state.phase;
  const frozen = phase === 'buy' || phase === 'roundEnd' || phase === 'matchEnd' || phase === 'menu';

  // Buy menu keys and interaction keys, consumed once per press.
  if (input.consumePress('KeyB') && phase === 'buy') {
    if (buyOpen) closeBuy();
    else openBuy();
  }
  if (phase === 'buy' && !shot) {
    for (let i = 0; i < BUY_MENU.length; i += 1) {
      if (input.consumePress(`Digit${i + 1}`)) tryBuy(BUY_MENU[i].id);
    }
  }
  if (input.consumePress('Digit1')) weapons.switchTo('primary');
  if (input.consumePress('Digit2')) weapons.switchTo('sidearm');
  if (input.consumePress('Digit3')) throwGrenade('frag');
  if (input.consumePress('Digit4')) throwGrenade('smoke');
  if (input.consumePress('KeyR') && weapons.reload()) audio.reload();
  if (input.consumePress('KeyQ')) weapons.switchTo(weapons.state.held === 'primary' ? 'sidearm' : 'primary');

  if (phase === 'live' && player.state.alive && !frozen) {
    if (input.state.firing && weapons.ready()) {
      if (weapons.current().auto || !playerShootHeld) playerShoot();
      playerShootHeld = true;
    } else if (!input.state.firing) {
      playerShootHeld = false;
    }
  }
  if (!input.state.firing) playerShootHeld = false;

  player.step(dt, input.state.keys, frozen || !player.state.alive);
  playerActor.moving = player.groundSpeed() > 0.5;
  playerActor.chest.set(player.state.body.position.x, player.state.body.position.y + 1.25, player.state.body.position.z);
  weapons.step(dt, player.groundSpeed() > 0.5, input.state.aiming);
  bots.step(dt, frozen);
  projectiles.step(dt);
  grenadeCooldown = Math.max(0, grenadeCooldown - dt);
  // Pulse the ring of the site where the charge is live.
  for (const [id, marker] of Object.entries(world.markers)) {
    const live = match.state.bomb.state === 'planted' && match.state.bomb.site === id;
    marker.ring.material.opacity = live ? 0.55 + Math.sin(match.state.time * 6) * 0.3 : 0.55;
  }

  // Footstep noise: running is loud, the quiet walk is not.
  if (phase === 'live' && player.state.alive && player.state.body.onGround) {
    const speed = player.groundSpeed();
    stepNoiseLeft -= dt;
    if (speed > 3 && stepNoiseLeft <= 0) {
      stepNoiseLeft = 0.42;
      const radius = player.state.quiet ? 3 : speed > 5 ? 9 : 6;
      emitNoise(player.state.body.position.x, player.state.body.position.z, radius, 'step');
      audio.step(player.state.quiet);
    }
  }

  // Bomb pickup: the nearest living attacker takes a dropped bomb.
  const bomb = match.state.bomb;
  if (bomb.state === 'dropped' && phase === 'live') {
    const bp = bomb.position;
    if (match.state.playerTeam === 'atk' && player.state.alive && player.state.body.position.distanceTo(bp) < 1.3) {
      bomb.state = 'carried';
      bomb.carrier = playerActor;
      hud.banner('Charge recovered', '', 1500);
    } else {
      for (const bot of bots.bots) {
        if (bot.alive && bot.team === 'atk' && bot.body.position.distanceTo(bp) < 1.3) {
          bot.carrier = true;
          bomb.state = 'carried';
          bomb.carrier = bot;
          break;
        }
      }
    }
  }

  // Plant / defuse interaction: hold E, stay close, stay slow.
  const holdingE = input.state.keys.has('KeyE');
  const slow = player.groundSpeed() < 1.5;
  if (phase === 'live' && player.state.alive && holdingE && slow) {
    if (match.state.playerTeam === 'atk' && bomb.state === 'carried' && bomb.carrier === playerActor) {
      const site = SITES.find((s) => match.inSite(player.state.body.position.x, player.state.body.position.z, s.id));
      if (site) {
        plantProgress += dt / PLANT_TIME;
        hud.showPrompt(`Planting at Site ${site.id}…`, plantProgress);
        if (plantProgress >= 1) {
          plantProgress = 0;
          bomb.position.copy(player.state.body.position);
          if (match.plant(site.id, 'player')) audio.plant();
          hud.hidePrompt();
        }
      } else {
        plantProgress = 0;
        hud.hidePrompt();
      }
    } else if (match.state.playerTeam === 'def' && bomb.state === 'planted') {
      const dist = player.state.body.position.distanceTo(bomb.position);
      if (dist < 1.8) {
        const need = match.state.loadout.kit ? DEFUSE_TIME / 2 : DEFUSE_TIME;
        defuseProgress += dt / need;
        hud.showPrompt('Defusing…', defuseProgress);
        if (defuseProgress >= 1) {
          defuseProgress = 0;
          match.defuse('player');
          hud.hidePrompt();
        }
      } else {
        defuseProgress = 0;
        hud.hidePrompt();
      }
    } else {
      plantProgress = 0;
      defuseProgress = 0;
      hud.hidePrompt();
    }
  } else {
    plantProgress = Math.max(0, plantProgress - dt * 2);
    defuseProgress = Math.max(0, defuseProgress - dt * 2);
    // Hint prompts when the player could act but is not holding E.
    if (phase === 'live' && player.state.alive && plantProgress === 0 && defuseProgress === 0) {
      if (match.state.playerTeam === 'atk' && bomb.state === 'carried' && bomb.carrier === playerActor) {
        const site = SITES.find((s) => match.inSite(player.state.body.position.x, player.state.body.position.z, s.id));
        if (site) hud.showPrompt(`Hold E to plant at Site ${site.id}`, 0);
        else hud.hidePrompt();
      } else if (match.state.playerTeam === 'def' && bomb.state === 'planted' && player.state.body.position.distanceTo(bomb.position) < 1.8) {
        hud.showPrompt('Hold E to defuse', 0);
      } else {
        hud.hidePrompt();
      }
    } else if (plantProgress === 0 && defuseProgress === 0) {
      hud.hidePrompt();
    }
  }

  // Round end by elimination.
  if (phase === 'live') {
    const atkAlive = (match.state.playerTeam === 'atk' && player.state.alive ? 1 : 0) + bots.aliveCount('atk');
    const defAlive = (match.state.playerTeam === 'def' && player.state.alive ? 1 : 0) + bots.aliveCount('def');
    // Elimination reasons name the SQUAD wiped out: the attackers are the
    // player's squad while it attacks, the foe squad after the swap.
    const atkSquad = match.state.playerTeam === 'atk' ? 'squad' : 'foe';
    const defSquad = match.state.playerTeam === 'def' ? 'squad' : 'foe';
    if (bomb.state !== 'planted' && atkAlive === 0) match.endRound('def', `${TEAM_NAMES[atkSquad]} eliminated`);
    else if (defAlive === 0) match.endRound('atk', `${TEAM_NAMES[defSquad]} eliminated`);
  }

  // Bomb mesh follows its carrier.
  if (bomb.state === 'carried' && bomb.carrier) {
    const carrierPos = bomb.carrier === playerActor ? player.state.body.position : bomb.carrier.body.position;
    match.syncBombMesh(new THREE.Vector3(carrierPos.x, carrierPos.y, carrierPos.z));
  } else {
    match.syncBombMesh(null);
  }

  // Match events: banners, sounds, transitions.
  for (const event of match.drainEvents()) {
    if (event.type === 'roundStart') {
      if (lastRespawnedRound !== match.state.round) respawnRound();
    } else if (event.type === 'live') {
      closeBuySilent();
      hud.banner('GO GO GO', '', 1200);
    } else if (event.type === 'roundEnd') {
      const won = event.winner === match.state.playerTeam;
      audio.round(won);
      hud.banner(won ? 'ROUND WON' : 'ROUND LOST', event.reason, 3200);
      hud.setScore(match.state.score.squad, match.state.score.foe, match.state.round);
      hud.setMoney(match.state.money);
    } else if (event.type === 'matchEnd') {
      // The matchEnd winner is a SQUAD key: 'squad' is always the player's
      // squad, whichever side it played in the final round.
      const won = event.winner === 'squad';
      hud.showOverlay('end', {
        title: won ? 'VICTORY' : event.winner ? 'DEFEAT' : 'DRAW',
        copy: `Final score — ${TEAM_NAMES.squad} ${match.state.score.squad} : ${match.state.score.foe} ${TEAM_NAMES.foe}.`,
        stats: `Kills ${match.state.stats.kills} · Deaths ${match.state.stats.deaths} · Plants ${match.state.stats.plants} · Defuses ${match.state.stats.defuses} · Damage ${Math.round(match.state.stats.damage)}`,
      });
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (event.type === 'planted') {
      hud.banner('CHARGE PLANTED', `Site ${event.site} — ${match.state.playerTeam === 'def' ? 'defuse it' : 'defend it'}`, 2600);
      audio.plant();
    } else if (event.type === 'defused') {
      hud.banner('CHARGE DEFUSED', '', 2600);
    } else if (event.type === 'exploded') {
      const dist = camera.position.distanceTo(bomb.position);
      projectiles.explode(bomb.position.clone(), 'atk', 16, 320, null);
      audio.explosion(dist);
    } else if (event.type === 'beep') {
      audio.beep(event.urgent ? 1.25 : 1);
    } else if (event.type === 'halftime') {
      hud.banner('HALFTIME — SIDES SWAP', event.team === 'atk' ? 'You attack now' : 'You defend now', 3000);
    }
  }

  // HUD: timer, bomb status, minimap.
  if (phase === 'buy') {
    hud.setTimer(`BUY ${formatTime(match.state.buyTimer)}`, false);
    hud.setBuyTimer(match.state.buyTimer);
  } else if (bomb.state === 'planted') {
    hud.setTimer(`💣 ${formatTime(bomb.timer)}`, true);
  } else {
    hud.setTimer(formatTime(match.state.roundTimer), match.state.roundTimer < 15);
  }
  hud.setBombStatus(
    bomb.state === 'planted' ? `CHARGE LIVE — SITE ${bomb.site}` : bomb.state === 'carried' && bomb.carrier === playerActor ? 'YOU CARRY THE CHARGE' : '',
    bomb.state === 'planted' || (bomb.state === 'carried' && bomb.carrier === playerActor),
  );
  const allies = [];
  const foes = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dot = { x: bot.body.position.x, z: bot.body.position.z, team: bot.team };
    if (bot.team === match.state.playerTeam) allies.push(dot);
  }
  const now = match.state.time;
  for (let i = foePings.length - 1; i >= 0; i -= 1) {
    if (now - foePings[i].at > 3) foePings.splice(i, 1);
  }
  for (const ping of foePings) {
    if (ping.team !== match.state.playerTeam) foes.push(ping);
  }
  hud.drawMinimap(
    { x: player.state.body.position.x, z: player.state.body.position.z },
    allies,
    foes,
    bomb.state === 'planted' || bomb.state === 'dropped' ? bomb : null,
    player.state.yaw,
  );
  syncHudStatic();
  input.clearPresses();
}

function closeBuySilent() {
  buyOpen = false;
  hud.showBuyMenu(false, match.state.money, match.state.playerTeam);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let playerShootHeld = false;

// --- Render loop ---------------------------------------------------------------------
let lastTime = performance.now();
let accumulator = 0;
let frozenFrame = false;

function syncCamera(dt) {
  const shake = projectiles.shakeAmount();
  const shakeX = (random() * 2 - 1) * shake * 0.02;
  const shakeY = (random() * 2 - 1) * shake * 0.02;
  world.animate(match.state.time);
  if (!player.state.alive && spectateTarget) {
    const ally = spectateTarget;
    camera.position.set(ally.body.position.x, ally.body.position.y + 1.55, ally.body.position.z);
    camera.rotation.set(0, ally.yaw, 0, 'YXZ');
    hud.setScoped(false);
    return;
  }
  const body = player.state.body;
  // Head bob: subtle, only while moving on the ground.
  const speed = player.groundSpeed();
  if (body.onGround && speed > 0.5) bobPhase += dt * speed * 1.6;
  const bobAmp = body.onGround ? Math.min(1, speed / 5.4) * 0.022 : 0;
  camera.position.set(
    body.position.x + Math.cos(bobPhase) * bobAmp * 0.5,
    body.position.y + player.state.eye + Math.sin(bobPhase * 2) * bobAmp,
    body.position.z,
  );
  camera.rotation.set(player.state.pitch + shakeX, player.state.yaw + shakeY, 0, 'YXZ');
  const zooming = input.state.aiming && weapons.current().zoom > 1;
  hud.setScoped(zooming && player.state.alive);
  const targetFov = zooming ? 74 / weapons.current().zoom : 74;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  const spreadPx = weapons.spread(player.groundSpeed(), !body.onGround, input.state.aiming) * 900;
  hud.setCrosshairSpread(Math.min(26, spreadPx));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozenFrame) {
    const look = input.takeLook();
    if (player.state.alive && input.state.locked) {
      const sens = input.state.aiming && weapons.current().zoom > 1 ? 0.0011 : 0.0022;
      player.look(look.x, look.y, sens);
    }
    // Paused: keep rendering (and the camera still), but run no simulation
    // steps — timers, bots and the bomb all freeze behind the overlay.
    if (!paused) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
    syncCamera(dt);
  }
  renderer.render(scene, camera);
}

// --- Deterministic screenshot setups ---------------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + player.state.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera(0.016);
}

function runShot(name) {
  hud.hideOverlay();
  if (name !== 'start') {
    match.startMatch();
    respawnRound();
  }
  if (name === 'start') {
    // The menu as a new player sees it: no match started, vista + overlay only.
    player.state.body.position.set(16, 0, 18);
    aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.drawMinimap({ x: 16, z: 18 }, [], [], null, player.state.yaw);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    player.state.body.position.set(24, 0, 13);
    match.state.money = 4200;
    settle(10);
    aimAt(new THREE.Vector3(10, 1.4, 4));
    hud.showBuyMenu(true, match.state.money, match.state.playerTeam);
    hud.setBuyTimer(BUY_TIME);
  } else if (name === 'play') {
    // Stage a live mid-corridor firefight: a smoke cloud blooming past the
    // defenders, two defenders close in the corridor, an ally firing across
    // the frame, and a radio callout on the feed — all through the game's
    // own systems. The player stands off-centre so the lamp stays out of the
    // sightline.
    player.state.body.position.set(2.2, 0, 8);
    match.state.loadout.smokes = 1;
    aimAt(new THREE.Vector3(0, 5, -10));
    throwGrenade('smoke');
    settle(70);
    match.state.phase = 'live';
    const foes = bots.bots.filter((b) => b.team !== match.state.playerTeam);
    if (foes[0]) {
      foes[0].body.position.set(1.0, 0, -1.5);
      foes[0].yaw = Math.PI;
      foes[0].mode = 'hold';
    }
    if (foes[1]) {
      foes[1].body.position.set(-1.2, 0, -3.0);
      foes[1].yaw = Math.PI * 0.9;
      foes[1].mode = 'hold';
    }
    const allies = bots.bots.filter((b) => b.team === match.state.playerTeam);
    if (allies[0] && foes[0]) {
      allies[0].body.position.set(-3.5, 0, 5.5);
      allies[0].yaw = 0.5;
      allies[0].mode = 'engage';
      allies[0].target = foes[0];
      allies[0].reactLeft = 0;
      allies[0].burstLeft = 2;
    }
    settle(1);
    aimAt(new THREE.Vector3(1.0, 1.4, -1.5));
    playerShoot();
    settle(1);
  } else if (name === 'plant') {
    match.state.phase = 'live';
    match.state.bomb.state = 'planted';
    match.state.bomb.site = 'A';
    match.state.bomb.timer = 24;
    match.state.bomb.position.set(-18.6, 0, -7.6);
    player.state.body.position.set(-15, 0, -6.5);
    settle(6);
    const foes = bots.bots.filter((b) => b.team !== match.state.playerTeam);
    if (foes[0]) {
      foes[0].body.position.set(-16.6, 0, -8.6);
      foes[0].yaw = -2.5;
      foes[0].mode = 'hold';
      foes[0].walkPhase = 0;
    }
    settle(10);
    aimAt(new THREE.Vector3(-18.0, 0.7, -7.9));
    hud.showPrompt('Defusing…', 0.4);
  }
  hud.hideBanner();
  syncHudStatic();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) {
      requestAnimationFrame(paint);
    } else {
      // Refresh the staged radio callout on the last paint: the feed row lives
      // 5 s, and the software-rasterised paints are slow enough to outlive it.
      if (shot === 'play') hud.addCallout('Rook', 'Contact, mid!', match.state.playerTeam);
      // Frozen: no animation loop runs after this, so the frame the capture tool
      // screenshots is exactly the staged one and the page sits idle.
      window.__shotReady = true;
      frozenFrame = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera(0.016);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
