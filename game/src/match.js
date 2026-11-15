// The match: one state object for the whole game — phases, rounds, the economy, the
// bomb and the score. main.js steps it, bots.js and the player act through it, hud.js
// reads it. Nothing else keeps match state.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './mapdata.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const BOMB_TIME = 35;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const HALFTIME_ROUND = 4;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 1400;
export const LOSS_REWARD = 1000;
export const PLANT_BONUS = 300;

export const BUY_MENU = [
  { id: 'rifle', name: 'VK-7 Rifle', price: 2500, kind: 'primary' },
  { id: 'smg', name: 'Kestrel-9 SMG', price: 1500, kind: 'primary' },
  { id: 'shotgun', name: 'Breacher-12', price: 1200, kind: 'primary' },
  { id: 'dmr', name: 'Longbow DMR', price: 4000, kind: 'primary' },
  { id: 'armour', name: 'Kevlar Armour', price: 650, kind: 'armour' },
  { id: 'frag', name: 'Frag Grenade', price: 300, kind: 'frag' },
  { id: 'smoke', name: 'Smoke Grenade', price: 300, kind: 'smoke' },
  { id: 'kit', name: 'Defuse Kit', price: 400, kind: 'kit' },
];

export function createMatch(scene, random) {
  // The bomb: a dark case with a blinking light, carried, dropped or planted.
  const bombGroup = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.34, 0.38),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 }),
  );
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.12), lampMat);
  lamp.position.set(0.15, 0.2, 0);
  bombGroup.add(caseMesh, lamp);
  bombGroup.visible = false;
  scene.add(bombGroup);

  const state = {
    phase: 'menu',
    round: 0,
    score: { atk: 0, def: 0 },
    playerTeam: 'atk',
    money: START_MONEY,
    lossStreak: 0,
    targetSite: 'A',
    roundTimer: 0,
    buyTimer: 0,
    endTimer: 0,
    endReason: '',
    roundWinner: null,
    matchWinner: null,
    bomb: { state: 'none', site: null, position: new THREE.Vector3(), carrier: null, timer: 0, beepLeft: 0 },
    loadout: { frags: 0, smokes: 0, kit: false, armour: 0 },
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0 },
    events: [],
    time: 0,
  };

  function emit(type, data = {}) {
    state.events.push({ type, ...data });
  }

  function siteById(id) {
    return SITES.find((s) => s.id === id);
  }

  function inSite(x, z, id) {
    const site = siteById(id);
    return x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ;
  }

  function startMatch() {
    state.round = 0;
    state.score.atk = 0;
    state.score.def = 0;
    state.playerTeam = 'atk';
    state.money = START_MONEY;
    state.lossStreak = 0;
    state.matchWinner = null;
    state.stats = { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0 };
    state.loadout = { frags: 0, smokes: 0, kit: false, armour: 0 };
    startRound();
  }

  function startRound() {
    state.round += 1;
    if (state.round === HALFTIME_ROUND + 1) {
      state.playerTeam = state.playerTeam === 'atk' ? 'def' : 'atk';
      emit('halftime', { team: state.playerTeam });
    }
    state.targetSite = random() < 0.55 ? 'A' : 'B';
    state.phase = 'buy';
    state.buyTimer = BUY_TIME;
    state.roundTimer = ROUND_TIME;
    state.bomb.state = 'carried';
    state.bomb.site = null;
    state.bomb.carrier = null; // assigned by main: the player, or a bot when defending
    state.bomb.timer = 0;
    state.loadout.kit = false;
    emit('roundStart', { round: state.round, site: state.targetSite });
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.endTimer = 4;
    state.roundWinner = winner;
    state.endReason = reason;
    state.score[winner] += 1;
    const playerWon = winner === state.playerTeam;
    if (playerWon) {
      state.money += WIN_REWARD;
      state.lossStreak = 0;
    } else {
      state.money += LOSS_REWARD + Math.min(1500, state.lossStreak * 500);
      state.lossStreak += 1;
    }
    state.money = Math.min(16000, state.money);
    emit('roundEnd', { winner, reason });
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.score.atk > state.score.def ? 'atk' : state.score.def > state.score.atk ? 'def' : null;
      state.phase = 'matchEnd';
      emit('matchEnd', { winner: state.matchWinner });
    }
  }

  function plant(siteId, planter) {
    if (state.bomb.state !== 'carried' && state.bomb.state !== 'dropped') return false;
    state.bomb.state = 'planted';
    state.bomb.site = siteId;
    state.bomb.timer = BOMB_TIME;
    state.bomb.beepLeft = 0;
    state.bomb.carrier = null;
    if (planter === 'player') {
      state.stats.plants += 1;
      state.money += PLANT_BONUS;
    }
    emit('planted', { site: siteId, planter });
    return true;
  }

  function defuse(defuser) {
    if (state.bomb.state !== 'planted') return false;
    state.bomb.state = 'defused';
    if (defuser === 'player') state.stats.defuses += 1;
    emit('defused', { defuser });
    endRound('def', 'Bomb defused');
    return true;
  }

  function onKill(victim, killer, headshot) {
    if (killer === 'player') {
      state.money += KILL_REWARD;
      state.stats.kills += 1;
    }
    if (victim === 'player') state.stats.deaths += 1;
    emit('kill', { victim, killer, headshot });
  }

  function buy(id) {
    const item = BUY_MENU.find((i) => i.id === id);
    if (!item || state.phase !== 'buy') return false;
    if (item.kind === 'kit' && state.playerTeam !== 'def') return false;
    if (item.kind === 'frag' && state.loadout.frags >= 2) return false;
    if (item.kind === 'smoke' && state.loadout.smokes >= 2) return false;
    if (item.kind === 'armour' && state.loadout.armour >= 100) return false;
    if (state.money < item.price) return false;
    state.money -= item.price;
    if (item.kind === 'frag') state.loadout.frags += 1;
    if (item.kind === 'smoke') state.loadout.smokes += 1;
    if (item.kind === 'armour') state.loadout.armour = 100;
    if (item.kind === 'kit') state.loadout.kit = true;
    emit('bought', { item });
    return true;
  }

  function step(dt) {
    state.time += dt;
    if (state.phase === 'buy') {
      state.buyTimer -= dt;
      if (state.buyTimer <= 0) {
        state.phase = 'live';
        emit('live');
      }
    } else if (state.phase === 'live') {
      if (state.bomb.state === 'planted') {
        state.bomb.timer -= dt;
        state.bomb.beepLeft -= dt;
        const rate = state.bomb.timer < 8 ? 0.18 : state.bomb.timer < 18 ? 0.35 : 0.6;
        if (state.bomb.beepLeft <= 0) {
          state.bomb.beepLeft = rate;
          emit('beep', { urgent: state.bomb.timer < 8 });
        }
        if (state.bomb.timer <= 0) {
          state.bomb.state = 'exploded';
          emit('exploded', { site: state.bomb.site });
          endRound('atk', 'Target destroyed');
        }
      } else {
        state.roundTimer -= dt;
        if (state.roundTimer <= 0) {
          state.roundTimer = 0;
          endRound('def', 'Time expired');
        }
      }
    } else if (state.phase === 'roundEnd') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) startRound();
    }
    // Bomb lamp blinks faster as the timer runs down.
    if (state.bomb.state === 'planted') {
      const rate = state.bomb.timer < 8 ? 14 : state.bomb.timer < 18 ? 7 : 3.5;
      lampMat.color.setHex(Math.sin(state.time * rate) > 0 ? 0xe5484d : 0x4a1518);
    }
  }

  function syncBombMesh(carrierPosition) {
    if (state.bomb.state === 'carried' && carrierPosition) {
      bombGroup.visible = true;
      bombGroup.position.set(carrierPosition.x, carrierPosition.y + 0.9, carrierPosition.z);
    } else if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
      bombGroup.visible = true;
      bombGroup.position.set(state.bomb.position.x, 0.18, state.bomb.position.z);
    } else {
      bombGroup.visible = false;
    }
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    plant,
    defuse,
    onKill,
    buy,
    step,
    syncBombMesh,
    inSite,
    siteById,
    drainEvents() {
      const out = state.events;
      state.events = [];
      return out;
    },
  };
}
