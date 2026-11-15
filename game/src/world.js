// The map, built from mapdata: boxes and cylinders for cover, canvas-painted textures
// for the ground, walls and containers, a dusk sky dome, and the site markers.
// Everything is generated at load; the game ships no image or model files.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOXES, CYLINDERS, SITES, LAMPS, BOUNDS } from './mapdata.js';
import { mulberry32 } from './rng.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function groundTexture() {
  return canvasTexture(1024, (g, s) => {
    g.fillStyle = '#77644a';
    g.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Fine, low-contrast speckle: the canvas stretches over 64 m, so coarse
    // marks read as blotches from eye height.
    for (let i = 0; i < 14000; i += 1) {
      const v = 100 + Math.floor(rnd() * 34);
      g.fillStyle = `rgb(${v + 14},${v - 4},${v - 26})`;
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    // Worn asphalt lanes.
    g.fillStyle = 'rgba(52,48,44,0.55)';
    g.fillRect(0, s * 0.42, s, s * 0.16);
    g.fillRect(s * 0.44, 0, s * 0.12, s);
    // Painted lane lines and hazard stripes.
    g.strokeStyle = 'rgba(242,232,213,0.5)';
    g.lineWidth = 5;
    g.setLineDash([26, 22]);
    g.beginPath();
    g.moveTo(0, s * 0.5);
    g.lineTo(s, s * 0.5);
    g.moveTo(s * 0.5, 0);
    g.lineTo(s * 0.5, s);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,179,71,0.75)';
    for (let i = 0; i < 8; i += 1) {
      g.save();
      g.translate(s * 0.08 + i * 26, s * 0.86);
      g.rotate(-0.6);
      g.fillRect(0, 0, 12, 44);
      g.restore();
    }
  }, 1, 1);
}

function wallTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#4a4034';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    const speckle = mulberry32(77);
    for (let i = 0; i < 300; i += 1) g.fillRect(speckle() * s, speckle() * s, 3, 3);
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.beginPath();
    g.moveTo(0, s / 2);
    g.lineTo(s, s / 2);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, s - 18, s, 18);
  }, 4, 2);
}

function containerTexture(base, label) {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 10, s);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 16; x < s; x += 32) g.fillRect(x, 0, 4, s);
    g.fillStyle = 'rgba(242,232,213,0.85)';
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(label, s / 2, s / 2 + 16);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, s - 26, s, 26);
  }, 1, 1);
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1b2340');
  grad.addColorStop(0.45, '#4a3550');
  grad.addColorStop(0.72, '#b45a38');
  grad.addColorStop(0.88, '#ffb347');
  grad.addColorStop(1, '#c98a4b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function letterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(22,18,14,0.55)';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.9, 1.9, 1);
  return sprite;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[name]), roughness: 0.9, metalness: 0.04 });
  }
  // Textured materials keep a white color: three.js diffuse is color x map,
  // and the canvas textures already carry the palette hue, so a tinted color
  // darkens them twice (the ground material's white x texture is the pattern).
  mats.surface.map = wallTexture();
  mats.surface.color.set(0xffffff);
  mats.rust.map = containerTexture('#8c4a2f', 'SANDVEIL');
  mats.rust.color.set(0xffffff);
  mats.teal.map = containerTexture('#3f7d7a', 'FREIGHT 07');
  mats.teal.color.set(0xffffff);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.maxX - BOUNDS.minX + 8, BOUNDS.maxZ - BOUNDS.minZ + 8),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Sky dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  function box(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(rt, rb, h, x, y, z, material, segments) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), mats[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  for (const [w, h, d, x, y, z, material] of BOXES) box(w, h, d, x, y, z, material);
  for (const [rt, rb, h, x, y, z, material, segments] of CYLINDERS) cylinder(rt, rb, h, x, y, z, material, segments);

  // Site markers: a floating letter and a glowing ring on the ground.
  const markers = {};
  for (const site of SITES) {
    const sprite = letterSprite(site.label, PALETTE.accent);
    sprite.position.set(site.cx, 5.4, site.cz);
    scene.add(sprite);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.5, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.cx, 0.03, site.cz);
    scene.add(ring);
    markers[site.id] = { sprite, ring };
  }

  // Lamp posts: pole, head and glow sprite; three real point lights at the hot spots.
  const glowMat = new THREE.SpriteMaterial({
    map: (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const g = canvas.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,179,71,1)');
      grad.addColorStop(0.4, 'rgba(255,179,71,0.5)');
      grad.addColorStop(1, 'rgba(255,179,71,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(canvas);
    })(),
    transparent: true,
    depthWrite: false,
  });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  LAMPS.forEach(([x, z], index) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 8), mats.hairline);
    pole.position.set(x, 2.3, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), lampHeadMat);
    head.position.set(x, 4.6, z);
    group.add(head);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.3, 1.3, 1);
    glow.position.set(x, 4.55, z);
    scene.add(glow);
    if (index < 3) {
      const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.8);
      light.position.set(x, 4.4, z);
      scene.add(light);
    }
  });

  // Lighting: low amber sun with shadows, cool dusk fill, warm hemisphere.
  // Bright enough that shadow sides read instead of going black.
  scene.fog = new THREE.Fog(new THREE.Color('#8a5a3a'), 30, 90);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#5a5f8a'), new THREE.Color('#6d5b41'), 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb347'), 2.6);
  sun.position.set(30, 26, 18);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8fb5'), 1.0);
  fill.position.set(-24, 18, -20);
  scene.add(fill);

  // Drifting dust motes: one Points cloud over the yard, lit by the dusk sun.
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 220;
  const dustPos = new Float32Array(dustCount * 3);
  const dustRand = mulberry32(20261115);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = BOUNDS.minX + dustRand() * (BOUNDS.maxX - BOUNDS.minX);
    dustPos[i * 3 + 1] = 0.3 + dustRand() * 5.5;
    dustPos[i * 3 + 2] = BOUNDS.minZ + dustRand() * (BOUNDS.maxZ - BOUNDS.minZ);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = 16;
  dustCanvas.height = 16;
  {
    const g = dustCanvas.getContext('2d');
    const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,220,170,1)');
    grad.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
  }
  const dustTex = new THREE.CanvasTexture(dustCanvas);
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ map: dustTex, size: 0.14, transparent: true, opacity: 0.4, depthWrite: false, color: new THREE.Color(PALETTE.accent) }),
  );
  scene.add(dust);

  return {
    colliders,
    shootables,
    group,
    markers,
    animate(time) {
      dust.position.x = Math.sin(time * 0.07) * 1.5;
      dust.position.z = Math.cos(time * 0.05) * 1.5;
      dust.rotation.y = time * 0.004;
    },
  };
}
