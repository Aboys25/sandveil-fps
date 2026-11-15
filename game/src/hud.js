// The DOM HUD: health, armour, ammo, money, timer, score, kill feed, banners, the buy
// menu and a live minimap. It never touches the simulation; main.js pushes numbers in
// and reads the play and buy callbacks out. DOM writes are cached so unchanged values
// cost nothing.
import { PALETTE, TEAM_NAMES } from './palette.js';
import { BOXES, SITES, BOUNDS } from './mapdata.js';
import { BUY_MENU } from './match.js';

const COPY = {
  start: { title: 'SANDVEIL', copy: 'Depot 7, dusk. Plant the pulse charge or hold the yard — first team to 5 rounds takes the match.', action: 'Deploy' },
  paused: { title: 'SANDVEIL', copy: 'Paused. Click to return to the depot.', action: 'Resume' },
  end: { title: 'Match over', copy: '', action: 'Play again' },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const stats = $('overlay-stats');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armourNum = $('armour-num');
  const armourFill = $('armour-fill');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const roundNum = $('round-num');
  const grenadeEl = $('grenades');
  const bombEl = $('bomb-status');
  const killfeed = $('killfeed');
  const bannerEl = $('banner');
  const bannerSub = $('banner-sub');
  const promptEl = $('prompt');
  const promptText = $('prompt-text');
  const promptFill = $('prompt-fill');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('vignette');
  const dmgDir = $('dmgdir');
  const scopeEl = $('scope');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyTimerEl = $('buy-timer');
  const spectateEl = $('spectate');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let dmgTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Minimap background, drawn once: walls, sites and lane markings.
  const mapBg = document.createElement('canvas');
  mapBg.width = minimap.width;
  mapBg.height = minimap.height;
  {
    const g = mapBg.getContext('2d');
    const sx = minimap.width / (BOUNDS.maxX - BOUNDS.minX);
    const sz = minimap.height / (BOUNDS.maxZ - BOUNDS.minZ);
    const toX = (x) => (x - BOUNDS.minX) * sx;
    const toZ = (z) => (z - BOUNDS.minZ) * sz;
    g.fillStyle = 'rgba(22,18,14,0.85)';
    g.fillRect(0, 0, minimap.width, minimap.height);
    g.fillStyle = '#4a3d2c';
    for (const [w, , d, x, , z] of BOXES) g.fillRect(toX(x - w / 2), toZ(z - d / 2), w * sx, d * sz);
    g.fillStyle = '#ffb347';
    g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const site of SITES) {
      g.fillText(site.label, toX(site.cx), toZ(site.cz) + 4);
      g.strokeStyle = 'rgba(255,179,71,0.5)';
      g.strokeRect(toX(site.minX), toZ(site.minZ), (site.maxX - site.minX) * sx, (site.maxZ - site.minZ) * sz);
    }
  }

  // Buy menu rows, built once from the catalog.
  for (const item of BUY_MENU) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.buy = item.id;
    row.innerHTML = `<span class="buy-key">${BUY_MENU.indexOf(item) + 1}</span><span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => callbacks.onBuy(item.id));
    buyItems.appendChild(row);
  }

  play.addEventListener('click', () => callbacks.onPlay());

  return {
    setHealth(hp, armour) {
      setText(healthNum, 'hp', String(Math.ceil(hp)));
      setText(armourNum, 'ar', String(Math.ceil(armour)));
      const hpW = `${Math.max(0, hp)}%`;
      const arW = `${Math.max(0, armour)}%`;
      if (last.hpw !== hpW) {
        last.hpw = hpW;
        healthFill.style.width = hpW;
      }
      if (last.arw !== arW) {
        last.arw = arW;
        armourFill.style.width = arW;
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wn', name);
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyEl, 'money', `$${value}`);
    },
    setTimer(text, urgent) {
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('urgent', !!urgent);
    },
    setScore(atk, def, round) {
      setText(scoreAtk, 'sa', String(atk));
      setText(scoreDef, 'sd', String(def));
      setText(roundNum, 'rn', `ROUND ${round}`);
    },
    setGrenades(frags, smokes) {
      setText(grenadeEl, 'gr', `Frag ${frags} · Smoke ${smokes}`);
    },
    setBombStatus(text, visible) {
      setText(bombEl, 'bomb', text);
      bombEl.classList.toggle('show', !!visible);
    },
    setSpectate(name) {
      setText(spectateEl, 'spec', name ? `Spectating ${name}` : '');
      spectateEl.classList.toggle('show', !!name);
    },
    addKill(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = 'kill-row';
      const color = killerTeam === 'atk' ? PALETTE.atk : PALETTE.def;
      row.innerHTML = `<b style="color:${color}">${killer}</b><span>${headshot ? ' ◉ ' : ' ✕ '}</span><span>${victim}</span>`;
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    banner(text, sub = '', holdMs = 2600) {
      bannerEl.textContent = text;
      bannerSub.textContent = sub;
      bannerEl.classList.add('show');
      bannerSub.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        bannerEl.classList.remove('show');
        bannerSub.classList.remove('show');
      }, holdMs);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      bannerEl.classList.remove('show');
      bannerSub.classList.remove('show');
    },
    showPrompt(text, progress) {
      promptText.textContent = text;
      promptFill.style.width = `${Math.round((progress ?? 0) * 100)}%`;
      promptEl.classList.add('show');
    },
    hidePrompt() {
      promptEl.classList.remove('show');
    },
    setCrosshairSpread(px) {
      const gap = 3 + px;
      if (last.gap === gap) return;
      last.gap = gap;
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(strength) {
      vignette.style.opacity = String(Math.min(0.85, 0.25 + strength));
      clearTimeout(last.vig);
      last.vig = setTimeout(() => {
        vignette.style.opacity = '0';
      }, 180);
    },
    damageFrom(angleDeg) {
      dmgDir.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
      dmgDir.style.opacity = '1';
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => {
        dmgDir.style.opacity = '0';
      }, 700);
    },
    setScoped(on) {
      if (last.scope === on) return;
      last.scope = on;
      scopeEl.classList.toggle('show', on);
    },
    showBuyMenu(show, money, team) {
      buyMenu.classList.toggle('show', show);
      if (!show) return;
      for (const row of buyItems.children) {
        const item = BUY_MENU.find((i) => i.id === row.dataset.buy);
        const blocked = item.kind === 'kit' && team !== 'def';
        row.classList.toggle('cant', blocked || money < item.price);
      }
    },
    setBuyTimer(seconds) {
      setText(buyTimerEl, 'bt', `Buy time ${Math.max(0, Math.ceil(seconds))}s — press B to close`);
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = data.title || text.title;
      copy.textContent = data.copy || text.copy;
      play.textContent = text.action;
      stats.innerHTML = data.stats || '';
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    drawMinimap(player, allies, foes, bomb, playerYaw) {
      const g = mapCtx;
      const sx = minimap.width / (BOUNDS.maxX - BOUNDS.minX);
      const sz = minimap.height / (BOUNDS.maxZ - BOUNDS.minZ);
      const toX = (x) => (x - BOUNDS.minX) * sx;
      const toZ = (z) => (z - BOUNDS.minZ) * sz;
      g.drawImage(mapBg, 0, 0);
      if (bomb && (bomb.state === 'planted' || bomb.state === 'dropped')) {
        g.fillStyle = '#e5484d';
        g.beginPath();
        g.arc(toX(bomb.position.x), toZ(bomb.position.z), 4, 0, Math.PI * 2);
        g.fill();
      }
      for (const foe of foes) {
        g.fillStyle = '#e5484d';
        g.beginPath();
        g.arc(toX(foe.x), toZ(foe.z), 3, 0, Math.PI * 2);
        g.fill();
      }
      for (const ally of allies) {
        g.fillStyle = ally.team === 'atk' ? PALETTE.atk : PALETTE.def;
        g.beginPath();
        g.arc(toX(ally.x), toZ(ally.z), 3, 0, Math.PI * 2);
        g.fill();
      }
      // The player: a triangle pointing where they face.
      g.save();
      g.translate(toX(player.x), toZ(player.z));
      g.rotate(Math.atan2(Math.sin(playerYaw), Math.cos(playerYaw)) + Math.PI);
      g.fillStyle = '#f2e8d5';
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(4, 5);
      g.lineTo(-4, 5);
      g.closePath();
      g.fill();
      g.restore();
    },
  };
}
