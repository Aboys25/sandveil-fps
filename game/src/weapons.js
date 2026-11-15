// The armoury: five hitscan guns defined as data, each with its own box-built view
// model. Spread grows with movement and falls when aiming still, so stopping to aim
// pays; recoil kicks the player's view. Damage, falloff and pellets live here too.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: { name: 'VK-7 Rifle', slot: 'primary', price: 2500, damage: 26, headMult: 3.2, rate: 0.098, mag: 30, reserve: 90, pellets: 1, spreadStill: 0.0035, spreadMove: 0.03, recoil: 0.011, reload: 2.0, auto: true, falloff: 18, zoom: 1 },
  smg: { name: 'Kestrel-9 SMG', slot: 'primary', price: 1500, damage: 20, headMult: 2.8, rate: 0.075, mag: 32, reserve: 96, pellets: 1, spreadStill: 0.008, spreadMove: 0.038, recoil: 0.008, reload: 1.7, auto: true, falloff: 14, zoom: 1 },
  shotgun: { name: 'Breacher-12', slot: 'primary', price: 1200, damage: 11, headMult: 2.0, rate: 0.7, mag: 6, reserve: 24, pellets: 8, spreadStill: 0.05, spreadMove: 0.07, recoil: 0.05, reload: 2.6, auto: false, falloff: 9, zoom: 1 },
  dmr: { name: 'Longbow DMR', slot: 'primary', price: 4000, damage: 85, headMult: 3.8, rate: 0.45, mag: 10, reserve: 30, pellets: 1, spreadStill: 0.0009, spreadMove: 0.05, recoil: 0.035, reload: 2.8, auto: false, falloff: 40, zoom: 2.6 },
  pistol: { name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 24, headMult: 3.0, rate: 0.16, mag: 12, reserve: 48, pellets: 1, spreadStill: 0.005, spreadMove: 0.025, recoil: 0.012, reload: 1.5, auto: false, falloff: 16, zoom: 1 },
};

const MUZZLE_TIME = 0.055;

function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createWeapons(camera) {
  // View-model materials carry a little of their own colour as emissive, so the
  // held gun reads against dark ground without washing out into one flat tone.
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), emissive: new THREE.Color(PALETTE.hairline), emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), emissive: new THREE.Color(PALETTE.muted), emissiveIntensity: 0.18, roughness: 0.45, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), emissive: new THREE.Color(PALETTE.rust), emissiveIntensity: 0.15, roughness: 0.8, metalness: 0.05 });
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.olive), emissive: new THREE.Color(PALETTE.olive), emissiveIntensity: 0.15, roughness: 0.85, metalness: 0.05 });

  // One view model per gun, all parented to the camera; only the held one shows.
  // Each silhouette differs: a dark receiver, a light barrel, a warm stock, and
  // magazine, grip and sight boxes that break the outline.
  const models = {};
  const rifle = new THREE.Group();
  rifle.add(box(0.08, 0.09, 0.4, 0, 0, 0, dark), box(0.035, 0.035, 0.5, 0, 0.03, -0.42, metal), box(0.07, 0.09, 0.2, 0, -0.02, 0.3, wood), box(0.06, 0.13, 0.09, 0, -0.1, -0.02, dark), box(0.06, 0.12, 0.08, 0, -0.09, 0.12, gripMat), box(0.025, 0.07, 0.06, 0, 0.08, -0.28, metal));
  models.rifle = rifle;
  const smg = new THREE.Group();
  smg.add(box(0.075, 0.085, 0.28, 0, 0, 0, dark), box(0.035, 0.035, 0.24, 0, 0.02, -0.24, metal), box(0.05, 0.14, 0.07, 0, -0.1, 0.02, gripMat), box(0.05, 0.11, 0.07, 0, -0.09, -0.08, metal), box(0.06, 0.07, 0.16, 0, -0.01, 0.22, wood));
  models.smg = smg;
  const shotgun = new THREE.Group();
  shotgun.add(box(0.085, 0.09, 0.46, 0, 0, 0, wood), box(0.045, 0.045, 0.52, 0, 0.04, -0.42, metal), box(0.07, 0.06, 0.24, 0, -0.06, -0.28, dark), box(0.07, 0.09, 0.22, 0, -0.02, 0.32, wood));
  models.shotgun = shotgun;
  const dmr = new THREE.Group();
  dmr.add(box(0.075, 0.085, 0.5, 0, 0, 0, dark), box(0.03, 0.03, 0.52, 0, 0.03, -0.48, metal), box(0.06, 0.06, 0.18, 0, 0.09, -0.08, metal), box(0.06, 0.12, 0.08, 0, -0.09, 0.02, gripMat), box(0.07, 0.08, 0.24, 0, -0.01, 0.32, wood));
  models.dmr = dmr;
  const pistol = new THREE.Group();
  pistol.add(box(0.06, 0.07, 0.2, 0, 0, -0.04, metal), box(0.05, 0.12, 0.07, 0, -0.08, 0.05, gripMat), box(0.02, 0.03, 0.04, 0, 0.05, -0.12, dark));
  models.pistol = pistol;
  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.rotation.y = 0.06;
    model.scale.setScalar(0.94);
    model.visible = false;
    camera.add(model);
  }

  // Muzzle flash: a small additive star that flares at the barrel tip for one frame
  // or two. The radial texture keeps it a glow, not a cardboard diamond.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  {
    const g = flashCanvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,244,214,1)');
    grad.addColorStop(0.35, 'rgba(255,179,71,0.9)');
    grad.addColorStop(1, 'rgba(255,179,71,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(flashCanvas), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  flash.position.set(0.21, -0.16, -1.0);
  flash.rotation.z = Math.PI / 4;
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = {
    primary: 'rifle',
    sidearm: 'pistol',
    held: 'primary',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    swapLeft: 0,
  };

  function currentId() {
    return state.held === 'primary' ? state.primary : state.sidearm;
  }
  function current() {
    return WEAPONS[currentId()];
  }
  function showHeld() {
    for (const [id, model] of Object.entries(models)) model.visible = id === currentId();
  }
  showHeld();

  function step(dt, moving, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.swapLeft = Math.max(0, state.swapLeft - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[currentId()];
    const targetX = aiming && current().zoom > 1 ? 0 : 0.24;
    const targetY = aiming && current().zoom > 1 ? -0.148 : -0.2;
    model.position.x += (targetX - model.position.x) * Math.min(1, dt * 18);
    model.position.y += (targetY - model.position.y) * Math.min(1, dt * 18);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2 + (moving ? Math.sin(performance.now() * 0.009) * 0.006 : 0);
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = current();
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      model.rotation.z = 0.3 * Math.sin((1 - state.reloadLeft / def.reload) * Math.PI);
      if (state.reloadLeft === 0) {
        const slot = ammo[currentId()];
        const take = Math.min(def.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
        model.rotation.z = 0;
      }
    }
    flash.visible = state.flash > 0;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
  }

  return {
    state,
    ammo,
    current,
    currentId,
    step,
    ready() {
      return ammo[currentId()].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.swapLeft === 0;
    },
    canFire() {
      return state.cooldown === 0 && state.reloadLeft === 0 && state.swapLeft === 0;
    },
    pullTrigger() {
      const def = current();
      state.cooldown = def.rate;
      state.flash = MUZZLE_TIME;
      state.kick = 0.05 + def.recoil * 0.6;
    },
    takeRound() {
      if (ammo[currentId()].mag <= 0) return false;
      ammo[currentId()].mag -= 1;
      return true;
    },
    reload() {
      const def = current();
      const slot = ammo[currentId()];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed, airborne, aiming) {
      const def = current();
      let spread = def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMove;
      if (airborne) spread += 0.03;
      if (aiming) spread *= def.zoom > 1 ? 0.25 : 0.6;
      return spread;
    },
    switchTo(slot) {
      if (state.held === slot || state.swapLeft > 0) return;
      state.held = slot;
      state.reloadLeft = 0;
      state.swapLeft = 0.28;
      showHeld();
    },
    buy(id) {
      const def = WEAPONS[id];
      if (!def || def.slot !== 'primary') return false;
      state.primary = id;
      ammo[id] = { mag: def.mag, reserve: def.reserve };
      if (state.held === 'primary') showHeld();
      return true;
    },
    refillAll() {
      for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
  };
}
