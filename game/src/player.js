// The player: acceleration-based movement with crouch, jump and a quiet walk, resolved
// by the shared body mover, plus health, armour and the look angles the camera copies.
import * as THREE from 'three';
import { makeBody, moveBody } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const QUIET_SPEED = 2.8;
const GROUND_ACCEL = 44;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

export function createPlayer(colliders, x, z) {
  const body = makeBody(x, z, RADIUS, STAND_HEIGHT);
  const state = {
    body,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    quiet: false,
    health: 100,
    armour: 0,
    alive: true,
    height: STAND_HEIGHT,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    if (!state.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    state.quiet = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
      body.height = CROUCH_HEIGHT;
    } else if (!wantCrouch && state.crouching) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = frozen ? 0 : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = frozen ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = state.crouching ? CROUCH_SPEED : state.quiet ? QUIET_SPEED : WALK_SPEED;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (!frozen && keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;
    body.velocity.y = Math.max(-30, body.velocity.y);
    moveBody(body, dt, colliders);
  }

  function damage(amount) {
    if (!state.alive) return 0;
    let dealt = amount;
    if (state.armour > 0) {
      const absorbed = Math.min(state.armour, dealt * 0.5);
      state.armour -= absorbed;
      dealt -= absorbed;
    }
    state.health = Math.max(0, state.health - dealt);
    if (state.health <= 0) state.alive = false;
    return dealt;
  }

  function reset(x, z, yaw) {
    body.position.set(x, 0, z);
    body.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.crouching = false;
    state.health = 100;
    state.alive = true;
    state.height = STAND_HEIGHT;
    body.height = STAND_HEIGHT;
  }

  return {
    state,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
