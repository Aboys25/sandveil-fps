// Procedural sound: every effect is synthesised with WebAudio (oscillators and filtered
// noise), so the game ships no audio files and makes no network request. Sounds are
// positioned by volume only; the listener sits at the camera.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1.2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(when, dur, { freq = 1000, q = 0.8, gain = 0.5, type = 'bandpass', slide = 0 } = {}) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, when);
    if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), when + dur);
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(when);
    src.stop(when + dur + 0.05);
  }

  function tone(when, dur, { freq = 440, gain = 0.3, type = 'sine', slide = 0 } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), when + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(amp).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function at(distance) {
    // Distance falloff for world sounds: full volume within 6 m, gone past 45 m.
    return Math.max(0, 1 - Math.max(0, distance - 6) / 39);
  }

  return {
    unlock() {
      ensure();
    },
    shoot(kind, distance = 0) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const v = distance === 0 ? 1 : at(distance);
      if (v <= 0) return;
      const crack = kind === 'shotgun' ? 900 : kind === 'dmr' ? 1400 : 1800;
      noise(t, 0.14, { freq: crack, q: 0.6, gain: 0.55 * v, slide: -crack * 0.7 });
      tone(t, 0.09, { freq: kind === 'shotgun' ? 120 : 170, gain: 0.35 * v, type: 'triangle', slide: -80 });
    },
    dryFire() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, { freq: 2200, gain: 0.15, type: 'square' });
    },
    reload() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.04, { freq: 900, gain: 0.2, type: 'square' });
      tone(t + 0.35, 0.04, { freq: 700, gain: 0.2, type: 'square' });
      tone(t + 0.8, 0.05, { freq: 1200, gain: 0.25, type: 'square' });
    },
    hit(killed, head = false) {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.06, { freq: killed ? 520 : head ? 1320 : 880, gain: 0.3, type: 'sine' });
      if (killed) tone(ctx.currentTime + 0.07, 0.09, { freq: 780, gain: 0.3, type: 'sine' });
    },
    step(quiet) {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.07, { freq: 420, q: 0.7, gain: quiet ? 0.05 : 0.13, slide: -180 });
    },
    hurt() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.12, { freq: 140, gain: 0.4, type: 'sawtooth', slide: -60 });
    },
    beep(rate = 1) {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.07, { freq: 1320 * rate, gain: 0.25, type: 'square' });
    },
    explosion(distance = 0) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const v = distance === 0 ? 1 : Math.max(0.25, at(distance));
      noise(t, 1.1, { freq: 400, q: 0.4, gain: 0.8 * v, type: 'lowpass', slide: -300 });
      tone(t, 0.7, { freq: 90, gain: 0.5 * v, type: 'sine', slide: -50 });
    },
    bounce(distance = 0) {
      if (!ensure()) return;
      const v = distance === 0 ? 1 : at(distance);
      if (v <= 0) return;
      tone(ctx.currentTime, 0.06, { freq: 300, gain: 0.25 * v, type: 'triangle', slide: -120 });
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.08, { freq: 660, gain: 0.25, type: 'sine' });
      tone(t + 0.08, 0.12, { freq: 990, gain: 0.25, type: 'sine' });
    },
    round(won) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = won ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((freq, i) => tone(t + i * 0.13, 0.18, { freq, gain: 0.28, type: 'triangle' }));
    },
    plant() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.1, { freq: 440, gain: 0.3, type: 'square' });
      tone(t + 0.15, 0.1, { freq: 440, gain: 0.3, type: 'square' });
    },
  };
}
