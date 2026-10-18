/* 3D layer: the robot arm, its cell, and the lattice of the finale.
   frame(t) poses everything as a pure function of time and returns screen-space data
   (trails, anchors) that the 2D overlay draws on top. */
import * as THREE from 'three';
import { RoomEnvironment } from './RoomEnvironment.js';
import { RoundedBoxGeometry } from './RoundedBoxGeometry.js';

const W = 1920, H = 1080;
const COL = { cream: 0xDFD8D0, white: 0xffffff, black: 0x202020, gold: 0xB9986A, bronze: 0xB56654, brown: 0x7A6B5A };
const L1 = 0.78, L2 = 0.66, HS = 0.45, LT = 0.25;   // link lengths, shoulder height, wrist→grasp point
const CUBE = 0.12, LIFT = 0.30;

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const P = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const outCubic = x => 1 - Math.pow(1 - x, 3);
const outBack = x => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const vl = (a, b, p) => new THREE.Vector3(lerp(a.x, b.x, p), lerp(a.y, b.y, p), lerp(a.z, b.z, p));
function noise1(x, seed) {   // smooth deterministic noise, roughly in [-1, 1]
  return (Math.sin(x * 1.7 + seed * 12.9898) * .5 + Math.sin(x * 3.1 + seed * 78.233) * .3 + Math.sin(x * 5.3 + seed * 37.719) * .2);
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let renderer, scene, camera, key, rim, hemi, fill, gridLight, floor, floorMat, gridTex, platform;
const M = {};
const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());

// ---------- arm ----------
function buildArm(m, shadows = true) {
  const root = new THREE.Group();
  const add = (parent, geo, mat, pos, rot) => {
    const me = new THREE.Mesh(geo, mat);
    if (pos) me.position.set(...pos);
    if (rot) me.rotation.set(...rot);
    me.castShadow = shadows; me.receiveShadow = shadows;
    parent.add(me); return me;
  };
  add(root, G('base', () => new THREE.CylinderGeometry(.34, .38, .1, 64)), m.dark, [0, .05, 0]);
  add(root, G('baseRing', () => new THREE.TorusGeometry(.342, .007, 8, 96)), m.gold, [0, .1, 0], [Math.PI / 2, 0, 0]);
  const yaw = new THREE.Group(); yaw.position.y = .1; root.add(yaw);
  add(yaw, G('turret', () => new THREE.CylinderGeometry(.2, .24, .24, 64)), m.cream, [0, .12, 0]);
  add(yaw, G('turretCap', () => new THREE.CylinderGeometry(.205, .205, .03, 64)), m.dark, [0, .255, 0]);
  const sh = new THREE.Group(); sh.position.y = HS - .1; yaw.add(sh);
  add(sh, G('shHub', () => new THREE.CylinderGeometry(.15, .15, .34, 64)), m.dark, null, [Math.PI / 2, 0, 0]);
  for (const z of [-.172, .172]) add(sh, G('shRing', () => new THREE.TorusGeometry(.15, .008, 8, 96)), m.gold, [0, 0, z]);
  add(sh, G('upper', () => new RoundedBoxGeometry(L1 + .1, .18, .16, 4, .06)), m.cream, [L1 / 2, 0, 0]);
  add(sh, G('upperStripe', () => new THREE.BoxGeometry(L1 - .3, .045, .163)), m.dark, [L1 / 2, 0, 0]);
  add(sh, G('upperAccent', () => new THREE.BoxGeometry(.08, .047, .165)), m.gold, [L1 / 2 + (L1 - .3) / 2 + .04, 0, 0]);
  const el = new THREE.Group(); el.position.x = L1; sh.add(el);
  add(el, G('elHub', () => new THREE.CylinderGeometry(.11, .11, .26, 64)), m.dark, null, [Math.PI / 2, 0, 0]);
  for (const z of [-.132, .132]) add(el, G('elRing', () => new THREE.TorusGeometry(.11, .007, 8, 96)), m.gold, [0, 0, z]);
  add(el, G('fore', () => new RoundedBoxGeometry(L2 + .06, .13, .12, 4, .05)), m.cream, [L2 / 2, 0, 0]);
  add(el, G('foreStripe', () => new THREE.BoxGeometry(L2 - .3, .03, .123)), m.dark, [L2 / 2, 0, 0]);
  const wr = new THREE.Group(); wr.position.x = L2; el.add(wr);
  add(wr, G('wrHub', () => new THREE.CylinderGeometry(.075, .075, .18, 48)), m.dark, null, [Math.PI / 2, 0, 0]);
  for (const z of [-.092, .092]) add(wr, G('wrRing', () => new THREE.TorusGeometry(.075, .006, 8, 64)), m.gold, [0, 0, z]);
  add(wr, G('wrLink', () => new THREE.CylinderGeometry(.055, .06, .1, 48)), m.dark, [.06, 0, 0], [0, 0, Math.PI / 2]);
  const roll = new THREE.Group(); roll.position.x = .11; wr.add(roll);
  add(roll, G('flange', () => new THREE.CylinderGeometry(.068, .068, .018, 48)), m.gold, null, [0, 0, Math.PI / 2]);
  add(roll, G('palm', () => new RoundedBoxGeometry(.06, .09, .25, 3, .02)), m.dark, [.04, 0, 0]);
  const fL = add(roll, G('finger', () => new RoundedBoxGeometry(.13, .04, .026, 2, .01)), m.cream, [.135, 0, .1]);
  const fR = add(roll, G('finger', () => null), m.cream, [.135, 0, -.1]);
  for (const f of [fL, fR]) add(f, G('pad', () => new THREE.BoxGeometry(.06, .042, .006)), m.gold, [.035, 0, 0]);
  return { root, yaw, sh, el, wr, roll, fL, fR };
}

// gripper pointing angle phi in the arm plane (-PI/2 = straight down)
function ik(T, roll = 0, phi = -Math.PI / 2) {
  const r = Math.hypot(T.x, T.z);
  const yaw = Math.atan2(-T.z, T.x);
  const wx = r - LT * Math.cos(phi), wy = T.y - LT * Math.sin(phi) - HS;
  let D = Math.hypot(wx, wy); D = clamp(D, .2, L1 + L2 - 1e-3);
  const base = Math.atan2(wy, wx);
  const a1 = base + Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const ex = L1 * Math.cos(a1), ey = L1 * Math.sin(a1);
  const a2 = Math.atan2(wy - ey, wx - ex);
  return [yaw, a1, a2 - a1, phi - a2, roll];
}
function pose(arm, T, g = 1, roll = 0, phi = -Math.PI / 2) {
  const local = T.clone().sub(arm.root.position);
  const q = ik(local, roll, phi);
  arm.yaw.rotation.y = q[0]; arm.sh.rotation.z = q[1]; arm.el.rotation.z = q[2]; arm.wr.rotation.z = q[3]; arm.roll.rotation.x = q[4];
  const z = lerp(CUBE / 2 + .014, .11, g);
  arm.fL.position.z = z; arm.fR.position.z = -z;
  return q;
}
function addJitter(arm, k, s) {   // "incorrect movement": perturb joints
  arm.sh.rotation.z += noise1(s * 2.2, k + 1) * .16;
  arm.el.rotation.z += noise1(s * 2.6, k + 7) * .22;
  arm.wr.rotation.z += noise1(s * 3.1, k + 13) * .35;
  arm.yaw.rotation.y += noise1(s * 1.9, k + 19) * .18;
}

// ---------- pick & place cycle ----------
// u in [0,1): descend, close, lift, transfer, descend, open, lift. Returns grasp point, grip openness, holding flag.
function cycle(u, A, B) {
  const up = v => V(v.x, v.y + LIFT, v.z);
  const seg = (a, b) => ease(P(u, a, b));
  let pos, g = 1, hold = false;
  if (u < .12) pos = vl(up(A), A, seg(0, .12));
  else if (u < .22) pos = A.clone();
  else if (u < .34) pos = vl(A, up(A), seg(.22, .34));
  else if (u < .62) {   // sweep around the base
    const p = seg(.34, .62);
    const ra = Math.hypot(A.x, A.z), rb = Math.hypot(B.x, B.z);
    const aa = Math.atan2(A.z, A.x), ab = Math.atan2(B.z, B.x);
    const r = lerp(ra, rb, p) - Math.sin(Math.PI * p) * .12, a = lerp(aa, ab, p);
    pos = V(r * Math.cos(a), lerp(A.y, B.y, p) + LIFT + Math.sin(Math.PI * p) * .14, r * Math.sin(a));
  }
  else if (u < .74) pos = vl(up(B), B, seg(.62, .74));
  else if (u < .84) pos = B.clone();
  else pos = vl(B, up(B), seg(.84, .98));
  if (u >= .12 && u < .22) g = 1 - seg(.12, .2);
  else if (u >= .22 && u < .74) g = 0;
  else if (u >= .74 && u < .84) g = seg(.76, .84);
  hold = u >= .2 && u < .78;
  return { pos, g, hold };
}
// alternating A->B, B->A cycles on a continuous phase s
function cycleAt(s, A, B) {
  const n = Math.floor(s), u = s - n;
  const c = n % 2 === 0 ? cycle(u, A, B) : cycle(u, B, A);
  c.n = n; c.u = u;
  c.objAt = c.hold ? c.pos : (u < .2 ? (n % 2 === 0 ? A : B) : (n % 2 === 0 ? B : A));
  return c;
}

// ---------- objects ----------
function makeObj(kind, mat) {
  let geo;
  if (kind === 'cube') geo = G('cube', () => new RoundedBoxGeometry(CUBE, CUBE, CUBE, 3, .012));
  else if (kind === 'cyl') geo = G('cyl', () => new THREE.CylinderGeometry(.055, .055, .14, 48));
  else if (kind === 'sphere') geo = G('sphere', () => new THREE.SphereGeometry(.065, 48, 32));
  else if (kind === 'ring') geo = G('ring', () => new THREE.TorusGeometry(.06, .022, 24, 64));
  else if (kind === 'knot') geo = G('knot', () => new THREE.TorusKnotGeometry(.055, .018, 160, 20, 2, 3));
  else if (kind === 'cone') geo = G('cone', () => new THREE.ConeGeometry(.065, .14, 48));
  else if (kind === 'tall') geo = G('tall', () => new RoundedBoxGeometry(.08, .2, .08, 3, .01));
  const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true;
  scene.add(me); return me;
}
const H0 = { cube: .06, cyl: .07, sphere: .065, ring: .082, knot: .08, cone: .07, tall: .1 };

// ---------- world ----------
let main, ghosts = [], gridArms = [], gridCubes = [], mainCube, target, targetCross, props = [], dropCube;
let lattice, latticeNodes, latticeOrig, latticeNodesOrig, lattice2;
const objs = {};

function makeGridTexture(line, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = line; g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);
  g.lineWidth = 1; g.globalAlpha = .5;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); }
  const tx = new THREE.CanvasTexture(c);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(60, 60); tx.anisotropy = 8;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export async function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  camera = new THREE.PerspectiveCamera(35, W / H, .05, 200);

  M.cream = new THREE.MeshPhysicalMaterial({ color: 0xEAE4DC, roughness: .36, metalness: 0, clearcoat: .7, clearcoatRoughness: .22 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: .3, metalness: .75 });
  M.gold = new THREE.MeshStandardMaterial({ color: COL.gold, roughness: .22, metalness: 1 });
  M.goldObj = new THREE.MeshPhysicalMaterial({ color: COL.gold, roughness: .3, metalness: .85, clearcoat: .4 });
  M.bronzeObj = new THREE.MeshPhysicalMaterial({ color: COL.bronze, roughness: .45, metalness: .1, clearcoat: .5 });
  M.brownObj = new THREE.MeshPhysicalMaterial({ color: COL.brown, roughness: .5, metalness: .1, clearcoat: .3 });
  M.creamObj = new THREE.MeshPhysicalMaterial({ color: 0xF2EEE8, roughness: .35, clearcoat: .6 });
  M.blackObj = new THREE.MeshPhysicalMaterial({ color: 0x232221, roughness: .3, metalness: .2, clearcoat: .8 });
  M.ghost = new THREE.MeshStandardMaterial({ color: COL.bronze, emissive: COL.bronze, emissiveIntensity: .55, transparent: true, opacity: .16, depthWrite: false, roughness: .5 });
  const ghostMats = { cream: M.ghost, dark: M.ghost, gold: M.ghost };

  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, .2); scene.add(hemi);
  key = new THREE.SpotLight(0xffe9cf, 60, 0, .55, .75, 1.6);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .02;
  scene.add(key); scene.add(key.target);
  rim = new THREE.DirectionalLight(COL.gold, 2.0); rim.position.set(-3, 2.5, -3); scene.add(rim);
  fill = new THREE.DirectionalLight(0xffffff, .4); fill.position.set(3, 1.5, -2); scene.add(fill);
  gridLight = new THREE.DirectionalLight(0xffe9cf, 0); gridLight.position.set(6, 12, 8); scene.add(gridLight);

  gridTex = makeGridTexture('#3a342c', '#141312');
  floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: gridTex, roughness: .55, metalness: .2 });
  floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  platform = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, .012, 128), new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: .4, metalness: .5 }));
  platform.position.y = .006; platform.receiveShadow = true; scene.add(platform);
  const pring = new THREE.Mesh(new THREE.TorusGeometry(1.5, .006, 8, 200), M.gold); pring.rotation.x = Math.PI / 2; pring.position.y = .012; platform.add(pring);

  main = buildArm(M); scene.add(main.root);
  for (let k = 0; k < 5; k++) {
    const g = buildArm(ghostMats, false); scene.add(g.root); ghosts.push(g);
    g.root.children.forEach(ch => { if (ch.isMesh) ch.visible = false; });
    g.yaw.children.forEach(ch => { if (ch.isMesh) ch.visible = false; });
  }
  for (let i = -5; i <= 5; i++) for (let j = -3; j <= 3; j++) {
    if (i === 0 && j === 0) continue;
    const a = buildArm(M, false); a.root.position.set(i * 2.7, 0, j * 2.7); scene.add(a.root); gridArms.push(a);
    const c = makeObj('cube', M.creamObj); c.castShadow = false; gridCubes.push(c);
  }
  mainCube = makeObj('cube', M.creamObj);
  dropCube = mainCube;
  // precise target marker
  target = new THREE.Mesh(new THREE.TorusGeometry(.1, .004, 8, 96), M.gold); target.rotation.x = Math.PI / 2; scene.add(target);
  targetCross = new THREE.Group();
  for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .002, .004), M.gold); b.rotation.y = r; targetCross.add(b); }
  scene.add(targetCross);
  // shared props for the cream and physical scenes
  objs.gold = makeObj('cube', M.goldObj);
  objs.cyl = makeObj('cyl', M.bronzeObj);
  objs.sphere = makeObj('sphere', M.creamObj);
  objs.ring = makeObj('ring', M.brownObj);
  objs.cone = makeObj('cone', M.blackObj);
  objs.tall = makeObj('tall', M.creamObj);
  objs.cube2 = makeObj('cube', M.blackObj);
  objs.knot = makeObj('knot', M.bronzeObj);
  const rnd = mulberry32(7);
  const kinds = ['cube', 'cyl', 'sphere', 'cone', 'tall', 'ring'];
  const pm2 = [M.goldObj, M.bronzeObj, M.brownObj, M.creamObj, M.blackObj];
  for (let i = 0; i < 18; i++) { const o = makeObj(kinds[i % kinds.length], pm2[Math.floor(rnd() * pm2.length)]); o.userData.k = kinds[i % kinds.length]; props.push(o); }

  // lattice for the finale
  const ico = new THREE.IcosahedronGeometry(1, 3);
  const wire = new THREE.WireframeGeometry(ico);
  latticeOrig = wire.attributes.position.array.slice();
  lattice = new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: COL.gold, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(lattice);
  const pts = new THREE.BufferGeometry(); pts.setAttribute('position', new THREE.BufferAttribute(ico.attributes.position.array.slice(), 3));
  latticeNodesOrig = pts.attributes.position.array.slice();
  const dot = document.createElement('canvas'); dot.width = dot.height = 64;
  const dg = dot.getContext('2d'); const gr = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,240,215,.9)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
  dg.fillStyle = gr; dg.fillRect(0, 0, 64, 64);
  latticeNodes = new THREE.Points(pts, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: 0xF2E6D2, size: .035, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(latticeNodes);
  lattice2 = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xDFD8D0, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(lattice2);

  buildPhase();
}

// ---------- presets ----------
function preset(name, o = {}) {
  const dark = name === 'dark';
  const bg = o.bg ?? (dark ? 0x0c0b0a : 0xD9D1C7);
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, o.fogNear ?? (dark ? 5 : 9), o.fogFar ?? (dark ? 16 : 34));
  hemi.color.set(dark ? 0xffffff : 0xFFF8F0); hemi.groundColor.set(dark ? 0x222222 : 0x8a7b6a);
  hemi.intensity = o.hemi ?? (dark ? .12 : 1.2);
  key.color.set(o.keyColor ?? (dark ? 0xffe9cf : 0xFFF6EC));
  key.intensity = o.key ?? (dark ? 70 : 55);
  key.angle = o.keyAngle ?? (dark ? .5 : .9);
  key.position.set(...(o.keyPos ?? (dark ? [2.2, 4.6, 2.6] : [3, 6.5, 3.5])));
  key.target.position.set(...(o.keyTarget ?? [.4, 0, 0]));
  rim.intensity = o.rim ?? (dark ? 2.6 : .6);
  rim.color.set(o.rimColor ?? COL.gold);
  fill.intensity = o.fill ?? (dark ? .25 : .5);
  scene.environmentIntensity = o.env ?? (dark ? .35 : .9);
  if (dark) { floorMat.map = gridTex; floorMat.color.set(o.floor ?? 0xffffff); floorMat.roughness = .5; floorMat.metalness = .25; }
  else { floorMat.map = null; floorMat.color.set(o.floor ?? 0xC4BAAD); floorMat.roughness = .85; floorMat.metalness = 0; }
  floorMat.needsUpdate = true;
  platform.visible = o.platform ?? dark;
  gridLight.intensity = o.grid ?? 0;
}

let viewShift = 0;
function cam(pos, look, fov = 35) {
  camera.position.copy(pos); camera.fov = fov;
  if (Math.abs(viewShift) > .5) camera.setViewOffset(W, H, -viewShift, 0, W, H); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.lookAt(look); camera.updateMatrixWorld();
}
function orbit(angle, radius, height, look, fov = 35) {
  cam(V(look.x + Math.cos(angle) * radius, height, look.z + Math.sin(angle) * radius), look, fov);
}
const _v = new THREE.Vector3();
function project(p) {
  _v.copy(p).project(camera);
  return [(_v.x + 1) / 2 * W, (1 - _v.y) / 2 * H, _v.z];
}

function hideAll() {
  main.root.visible = false; ghosts.forEach(g => g.root.visible = false);
  gridArms.forEach(a => a.root.visible = false); gridCubes.forEach(c => c.visible = false);
  mainCube.visible = false; target.visible = false; targetCross.visible = false;
  Object.values(objs).forEach(o => o.visible = false); props.forEach(o => o.visible = false);
  lattice.visible = latticeNodes.visible = lattice2.visible = false;
  platform.visible = false; floor.visible = true;
}
function place(o, p, ry = 0, s = 1, rx = 0, rz = 0) { o.visible = s > .001; o.position.copy(p); o.rotation.set(rx, ry, rz); o.scale.setScalar(Math.max(s, .001)); }

// ============================================================ shot R: repetition (9.0–24.9)
const RA = V(.95, .06, .42), RB = V(.95, .06, -.42);
let phaseTable = [], PH_DT = 1 / 240, PH_T0 = 9.0, SLIP_T = 17.05, slipCycle = 0;
function buildPhase() {
  const sp1 = t => t < 10.4 ? .42 : t < 12.6 ? lerp(.42, 3.8, ease(P(t, 10.4, 12.6))) : lerp(3.8, .42, outCubic(P(t, 12.6, 13.6)));
  let s = .62;   // start mid-transfer so the first frame already moves
  phaseTable = [];
  for (let t = PH_T0; t <= 13.6 + 1e-9; t += PH_DT) { phaseTable.push(s); s += sp1(t) * PH_DT; }
  const sA = s;
  let n = Math.ceil(sA + .42 * 3.45); if (n % 2) n++;
  const sTarget = n + .30;   // lift moment of an A->B cycle exactly at SLIP_T
  slipCycle = n;
  const c = (sTarget - sA) / (SLIP_T - 13.6);
  for (let t = 13.6 + PH_DT; t <= 25; t += PH_DT) {
    s += (t < SLIP_T ? c : .42) * PH_DT; phaseTable.push(s);
  }
}
const phaseAt = t => { const f = (clamp(t, PH_T0, 24.99) - PH_T0) / PH_DT, i = Math.floor(f); const a = phaseTable[i], b = phaseTable[Math.min(i + 1, phaseTable.length - 1)]; return lerp(a, b, f - i); };

function dropState(t) {   // the slipping cube after SLIP_T
  const c = cycleAt(phaseAt(SLIP_T), RA, RB);
  const p0 = c.pos.clone();
  const tau = t - SLIP_T;
  const g = 9.8, h = p0.y - .06;
  const tf = Math.sqrt(2 * h / g);
  let y, x = p0.x, z = p0.z, rx = 0, rz = 0;
  if (tau < tf) { y = p0.y - .5 * g * tau * tau; x += tau * .5; rx = tau * 6; }
  else {
    const t2 = tau - tf, v = g * tf * .32, tb = 2 * v / g;
    y = .06 + (t2 < tb ? v * t2 - .5 * g * t2 * t2 : 0);
    const slide = 1 - Math.exp(-t2 * 5);
    x += tf * .5 + slide * .22; z += slide * .1;
    rx = tf * 6 + slide * (Math.PI / 2 - tf * 6); rz = slide * .3;
  }
  return { p: V(x, y, z), rx, rz };
}

function shotR(t) {
  const gp = ease(P(t, 18.3, 20.5));
  preset('dark', { fogNear: lerp(5, 12, gp), fogFar: lerp(16, 34, gp), grid: lerp(0, 2.2, gp), hemi: lerp(.12, .35, gp) });
  const s = phaseAt(t);
  const c = cycleAt(s, RA, RB);
  main.root.visible = true; main.root.position.set(0, 0, 0);
  pose(main, c.pos, c.g);
  const out = { trails: [], anchors: {} };
  // main cube (slips at SLIP_T)
  if (t < SLIP_T) place(mainCube, c.objAt, c.hold ? main.yaw.rotation.y : 0);
  else { const d = dropState(t); place(mainCube, d.p, .3, 1, d.rx, d.rz); }

  // ghosts: incorrect movements
  const gA = clamp(P(t, 15.25, 15.7) - P(t, 18.4, 19.0));
  M.ghost.opacity = .17 * gA;
  ghosts.forEach((g, k) => {
    g.root.visible = gA > 0.01;
    if (!g.root.visible) return;
    const off = V(noise1(t * 2.1, k * 3 + 1) * .14, noise1(t * 2.7, k * 3 + 2) * .08, noise1(t * 1.8, k * 3 + 3) * .16);
    pose(g, c.pos.clone().add(off), c.g);
    addJitter(g, k, t);
  });

  // camera
  if (t < 14.2) {
    const p = outCubic(P(t, 9.0, 11.0));
    orbit(lerp(1.05, .62, P(t, 9, 14.2)), lerp(6.2, 3.5, p), lerp(2.4, 1.45, p), V(.45, .42, 0), 34);
  } else if (t < 18.3) {
    orbit(lerp(.42, .18, P(t, 14.2, 18.3)), lerp(3.6, 3.3, P(t, 14.2, 18.3)), 1.15, V(.7, .45, 0), 34);
  } else {
    const p = ease(P(t, 18.3, 21.4));
    const pos = vl(V(.7 + Math.cos(.18) * 3.3, 1.15, Math.sin(.18) * 3.3), V(7.5, 9.5, 9.0), p);
    const look = vl(V(.7, .45, 0), V(0, 0, 0), p);
    pos.add(V(-1, 0, 1).multiplyScalar(P(t, 21.4, 25) * 1.2));
    cam(pos, look, lerp(34, 40, p));
  }
  // grid of identical cells
  const gridOn = t > 18.3;
  gridArms.forEach((a, i) => {
    a.root.visible = gridOn; gridCubes[i].visible = gridOn;
    if (!gridOn) return;
    const T = c.pos.clone().add(a.root.position);
    pose(a, T, c.g);
    place(gridCubes[i], c.objAt.clone().add(a.root.position), c.hold ? a.yaw.rotation.y : 0);
  });
  platform.visible = !gridOn || t < 19.5;

  // trails (sampled along the phase, so identical loops overlap)
  const trail = (origin, color, alpha, width, jitterK = -1) => {
    const pts = [];
    const span = jitterK >= 0 ? 1.2 : 2.0;
    for (let q = s - span; q <= s; q += .008) {
      const cc = cycleAt(q, RA, RB).pos.add(origin);
      if (jitterK >= 0) {
        const tq = t - (s - q) / .42;
        cc.add(V(noise1(tq * 2.1, jitterK * 3 + 1) * .14, noise1(tq * 2.7, jitterK * 3 + 2) * .08, noise1(tq * 1.8, jitterK * 3 + 3) * .16));
      }
      pts.push(project(cc));
    }
    out.trails.push({ pts, color, alpha, width });
  };
  if (t < 18.6) trail(V(0, 0, 0), '#B9986A', .85 * (1 - P(t, 18.3, 18.6)), 2.2);
  if (gA > .01) ghosts.forEach((g, k) => trail(V(0, 0, 0), '#B56654', .75 * gA, 1.4, k));
  if (gridOn) {
    const a = P(t, 19.0, 20.0) * .55;
    gridArms.forEach(ga => trail(ga.root.position, '#B56654', a, 1.3));
    trail(V(0, 0, 0), '#B56654', a, 1.3);
  }
  out.anchors.tip = project(c.pos);
  out.anchors.cube = project(mainCube.position);
  out.anchors.ghost = project(c.pos.clone().add(V(0, .45, .25)));
  out.anchors.base = project(V(0, .9, 0));
  out.episode = s;
  return out;
}

// ============================================================ shot G: quality, cream studio (24.9–35.0)
function shotG(t) {
  const out = { trails: [], anchors: {} };
  main.root.visible = true; main.root.position.set(0, 0, 0);
  const A1 = V(.82, .06, .5), T1 = V(1.0, .06, -.32);
  if (t < 32.4) {
    preset('cream');
    // precise placement 24.9–27.3, then hold; diverse objects appear
    const u = clamp((t - 24.9) / 2.5, 0, .999);
    let c = cycle(Math.min(u, .999), A1, T1);
    if (t > 27.4) {   // after placing: hover then move to the stack task
      const p = ease(P(t, 27.4, 29.2));
      c = { pos: vl(V(T1.x, T1.y + LIFT, T1.z), V(.7, .5, .2), p), g: 1, hold: false };
    }
    let cube2At = null;
    if (t > 29.2) {   // stack the black cube onto the gold one, 29.6–32.2
      const SA = V(.62, .06, .62), SB = V(1.0, .06 + CUBE, -.32);
      const su = clamp((t - 29.6) / 2.6, 0, .999);
      const cc = cycle(su, SA, SB);
      const pre = ease(P(t, 29.2, 29.6));
      c = { pos: t < 29.6 ? vl(V(.7, .5, .2), V(SA.x, SA.y + LIFT, SA.z), pre) : cc.pos, g: t < 29.6 ? 1 : cc.g, hold: t >= 29.6 && cc.hold };
      cube2At = c.hold ? c.pos : (t < 29.6 || su < .2 ? SA : SB);
    }
    pose(main, c.pos, c.g);
    if (cube2At) place(objs.cube2, cube2At, c.hold ? main.yaw.rotation.y : 0);
    const goldPos = t < 24.9 + .2 * 2.5 ? A1 : (c.hold && t < 27.4 ? c.pos : T1);
    place(objs.gold, goldPos, c.hold && t < 27.4 ? main.yaw.rotation.y : 0);
    const tOn = P(t, 25.1, 25.5);
    target.visible = targetCross.visible = true;
    target.position.set(T1.x, .003, T1.z); target.scale.setScalar(lerp(.01, 1, outBack(tOn)));
    targetCross.position.set(T1.x, .003, T1.z); targetCross.scale.setScalar(lerp(.01, 1, outBack(tOn)));
    // diverse objects pop in
    const dv = [[objs.cyl, V(.35, H0.cyl, .95)], [objs.sphere, V(1.25, H0.sphere, .25)], [objs.ring, V(.55, .022, -.85), Math.PI / 2], [objs.cone, V(1.35, H0.cone, -.75)], [objs.tall, V(.15, H0.tall, -1.05)]];
    dv.forEach(([o, p, rx], i) => {
      const a = outBack(P(t, 26.05 + i * .13, 26.45 + i * .13));
      place(o, p, i * .7, a, rx || 0);
    });
    if (!(t > 29.2)) place(objs.cube2, V(.62, .06, .62), 0, outBack(P(t, 26.7, 27.1)));
    // camera
    if (t < 29.2) orbit(lerp(.95, .7, P(t, 24.9, 29.2)), lerp(3.9, 3.4, ease(P(t, 24.9, 27))), lerp(2.1, 1.6, ease(P(t, 24.9, 27))), V(.75, .3, 0), 33);
    else orbit(lerp(-.15, .3, P(t, 29.2, 32.4)), 3.9, 1.7, V(.75, .4, .1), 32);
    // diverse planned trajectories (gold arcs to each object)
    const arcA = clamp(P(t, 26.1, 26.6) - P(t, 28.6, 29.1));
    if (arcA > 0) dv.forEach(([o, p], i) => {
      const k = clamp((t - 26.1 - i * .12) / .7);
      if (k <= 0) return;
      const from = V(.7, .55, .1), to = V(p.x, p.y + .12, p.z);
      const pts = [];
      for (let q = 0; q <= k; q += .02) {
        const m = vl(from, to, q); m.y += Math.sin(Math.PI * q) * .35;
        pts.push(project(m));
      }
      out.trails.push({ pts, color: '#B9986A', alpha: .9 * arcA, width: 2, dash: [8, 8] });
      out.anchors['obj' + i] = project(V(p.x, p.y + .16, p.z));
    });
    // placement trail
    if (t < 27.6) {
      const pts = [];
      for (let q = 0; q <= Math.min(u, .999); q += .006) pts.push(project(cycle(q, A1, T1).pos));
      out.trails.push({ pts, color: '#B9986A', alpha: .95 * (1 - P(t, 27.3, 27.6)), width: 2.4 });
    }
    out.anchors.target = project(V(T1.x, .02, T1.z));
    out.anchors.gold = project(objs.gold.position);
    out.anchors.tip = project(c.pos);
  } else {
    // unseen object: new floor tone, a torus knot, grasp & lift (32.4–35.0)
    preset('cream', { floor: 0xC9BBA8, bg: 0xD9CFC2 });
    const K = V(.9, H0.knot, .1);
    const u = clamp((t - 32.3) / 3.4, 0, .62);
    const c = cycle(u, K, V(.9, H0.knot, -.5));
    pose(main, c.pos, c.g, .6);
    place(objs.knot, c.hold ? c.pos : K, c.hold ? main.yaw.rotation.y + .6 : .6, outBack(P(t, 32.4, 32.8)));
    orbit(lerp(.55, .85, P(t, 32.4, 35)), lerp(2.6, 2.3, P(t, 32.4, 35)), lerp(.75, .9, P(t, 32.4, 35)), V(.9, .2, .05), 28);
    out.anchors.knot = project(V(K.x, objs.knot.position.y + .16, K.z));
    out.anchors.tip = project(c.pos);
  }
  return out;
}

// ============================================================ shot P: the physical world, dark & letterboxed (35.0–47.4)
const ENV = [
  { label: 'LOW LIGHT', key: 18, keyColor: 0xD9C7AE, rim: 1.2, clutter: 3, ang: .7, obj: 'sphere' },
  { label: 'CLUTTER', key: 70, clutter: 14, ang: -.4, obj: 'cyl' },
  { label: 'NEW SURFACE', key: 60, floor: 0x7A6B5A, clutter: 4, ang: .25, obj: 'cone' },
  { label: 'WARM LIGHT', key: 90, keyColor: 0xE3A27D, rimColor: COL.bronze, clutter: 6, ang: 1.0, obj: 'ring' },
  { label: 'MOVING TARGET', key: 65, clutter: 5, ang: -.15, obj: 'cube', move: true },
  { label: 'UNKNOWN', key: 45, keyColor: 0xffffff, rim: 3.5, clutter: 9, ang: .5, obj: 'knot' },
];
function shotP(t) {
  const out = { trails: [], anchors: {} };
  main.root.visible = true; main.root.position.set(0, 0, 0);
  const C0 = V(.95, .06, .2);
  if (t < 38.3) {   // macro grasp
    preset('dark', { key: 85, keyPos: [1.2, 3.2, 1.8], keyTarget: [.95, 0, .2], keyAngle: .35 });
    const d = ease(P(t, 35.0, 36.7));
    const pos = V(C0.x, lerp(.06 + .32, .06, d), C0.z);
    const g = 1 - ease(P(t, 36.7, 37.5));
    pos.y += ease(P(t, 37.5, 38.3)) * .12;
    pose(main, pos, g);
    place(objs.gold, t > 37.5 ? pos : C0, t > 37.5 ? main.yaw.rotation.y : main.yaw.rotation.y);
    const k = P(t, 35, 38.3);
    cam(V(C0.x + lerp(.42, .3, k), lerp(.3, .24, k), C0.z + lerp(1.15, .8, k)), V(C0.x, .14 + k * .05, C0.z), 24);
    out.anchors.cube = project(objs.gold.position);
  } else if (t < 41.4) {   // push: interact with the physical world
    preset('dark', { key: 75 });
    const z0 = .55, z1 = -.25;
    const k = ease(P(t, 38.6, 41.1));
    const approach = ease(P(t, 38.3, 38.7));
    const tipZ = lerp(z0 + .2, z1 + .12, k);
    const pos = V(.95, lerp(.3, .07, approach), tipZ);
    pose(main, pos, 0, Math.PI / 2);
    const cubeZ = Math.min(z0, tipZ - .13);
    place(objs.gold, V(.95, .06, cubeZ), 0);
    orbit(lerp(.25, .1, P(t, 38.3, 41.4)), 2.6, .75, V(.85, .18, .15), 30);
    out.anchors.cube = project(objs.gold.position);
    out.anchors.cubeFront = project(V(.95, .06, cubeZ - .28));
    out.anchors.cubeTop = project(V(.95, .2, cubeZ));
    out.anchors.cubeBack = project(V(.95, .06, cubeZ + .06));
    out.anchors.floorUnder = project(V(.95, 0, cubeZ));
    const pts = [];
    for (let q = 0; q <= k; q += .01) pts.push(project(V(.95, .005, lerp(z0, z1, q) - .0)));
    out.trails.push({ pts, color: '#B9986A', alpha: .7, width: 2 });
  } else if (t < 43.4) {   // manipulate: pick, rotate, place
    preset('dark', { key: 75 });
    const A = V(.95, .06, -.25), B = V(.8, .06, .55);
    const u = clamp((t - 41.4) / 2.2, 0, .999);
    const c = cycle(u, A, B);
    const roll = Math.sin(Math.PI * P(u, .34, .62)) * 1.6;
    pose(main, c.pos, c.g, roll);
    place(objs.gold, c.hold ? c.pos : (u < .2 ? A : B), c.hold ? main.yaw.rotation.y : 0, 1, c.hold ? roll : 0);
    orbit(lerp(.9, 1.15, P(t, 41.4, 43.4)), 3.0, 1.35, V(.7, .25, .15), 32);
    out.anchors.cube = project(objs.gold.position);
    const b = new THREE.Box3().setFromObject(objs.gold);
    const corners = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(project(V(x, y, z)));
    out.bbox = corners;
    out.pose = objs.gold.position.clone(); out.roll = roll;
  } else {   // environments that never stop changing
    const i = Math.min(ENV.length - 1, Math.floor((t - 43.4) / .5));
    const e = ENV[i], lt = t - 43.4 - i * .5;
    preset('dark', { key: e.key, keyColor: e.keyColor, rim: e.rim, rimColor: e.rimColor, floor: e.floor });
    const rnd = mulberry32(100 + i);
    props.forEach((o, j) => {
      if (j >= e.clutter) return;
      const a = rnd() * Math.PI * 2, r = .7 + rnd() * .8;
      place(o, V(Math.cos(a) * r, H0[o.userData.k] ?? .06, Math.sin(a) * r), rnd() * 6, 1, o.userData.k === 'ring' ? Math.PI / 2 : 0);
    });
    const ta = e.ang;
    let tp = V(Math.cos(-ta) * .95, H0[e.obj] ?? .06, Math.sin(-ta) * .95);
    if (e.move) tp.add(V(0, 0, (lt - .25) * .6));
    const o = { sphere: objs.sphere, cyl: objs.cyl, cone: objs.cone, ring: objs.ring, cube: objs.gold, knot: objs.knot }[e.obj];
    place(o, tp, .4, 1, e.obj === 'ring' ? Math.PI / 2 : 0);
    const reach = ease(clamp(lt / .45));
    pose(main, V(tp.x * .85, lerp(.5, tp.y + .05, reach), tp.z * .85), lerp(1, .55, reach), .3);
    const camA = [.6, -.9, .2, 1.4, -.3, .9][i];
    orbit(camA + lt * .3, [3.2, 4.2, 2.6, 3.0, 2.8, 3.6][i], [1.3, 2.4, .8, 1.2, .9, 1.7][i], V(.4, .25, 0), [32, 38, 28, 30, 30, 34][i]);
    out.env = e.label; out.envIndex = i;
    out.anchors.obj = project(V(tp.x, tp.y + .2, tp.z));
  }
  return out;
}

// ============================================================ shot F: the lattice (70.9–81.0)
function shotF(t) {
  preset('dark', { bg: 0x0b0a09, fogNear: 2, fogFar: 40, platform: false });
  floor.visible = false;
  lattice.visible = latticeNodes.visible = lattice2.visible = true;
  const grow = ease(P(t, 70.9, 76.4));
  const scale = lerp(.55, 7.5, grow);
  const collapse = ease(P(t, 76.9, 79.6));
  const pos = lattice.geometry.attributes.position;
  for (let i = 0; i < pos.array.length; i += 3) {
    const k = 1 - collapse * (1 - .0);
    pos.array[i] = latticeOrig[i] * scale * k; pos.array[i + 1] = latticeOrig[i + 1] * scale * k; pos.array[i + 2] = latticeOrig[i + 2] * scale * k;
  }
  pos.needsUpdate = true;
  const np = latticeNodes.geometry.attributes.position;
  for (let i = 0; i < np.array.length; i += 3) {
    const k = 1 - collapse;
    np.array[i] = latticeNodesOrig[i] * scale * k; np.array[i + 1] = latticeNodesOrig[i + 1] * scale * k; np.array[i + 2] = latticeNodesOrig[i + 2] * scale * k;
  }
  np.needsUpdate = true;
  const rot = t * .12;
  lattice.rotation.set(rot * .6, rot, 0); latticeNodes.rotation.copy(lattice.rotation);
  lattice2.rotation.set(-rot * .4, -rot * 1.3, 0); lattice2.scale.setScalar(scale * 1.25 * (1 - collapse));
  lattice.material.opacity = .6 * (1 - P(t, 78.4, 79.8)) * P(t, 70.9, 71.6);
  latticeNodes.material.opacity = .9 * (1 - P(t, 79.0, 80.0)) * P(t, 70.9, 71.6);
  latticeNodes.material.size = lerp(.07, .05, grow);
  lattice2.material.opacity = .22 * (1 - collapse) * P(t, 70.9, 71.6);
  const d = lerp(4.2, 9.0, grow) - collapse * 3.5;
  cam(V(Math.sin(t * .05) * d * .3, Math.cos(t * .07) * .4, d), V(0, 0, 0), 40);
  return { trails: [], anchors: { center: project(V(0, 0, 0)) }, collapse };
}

// ============================================================ dispatcher
export function frame(t) {
  hideAll();
  viewShift = (t >= 24.9 && t < 29.2) ? 330 * ease(P(t, 24.9, 25.6)) : (t >= 29.2 && t < 35.0) ? 400 : 0;
  let out = null;
  if (t >= 9.0 && t < 24.9) out = shotR(t);
  else if (t >= 24.9 && t < 35.0) out = shotG(t);
  else if (t >= 35.0 && t < 47.4) out = shotP(t);
  else if (t >= 70.9 && t < 81.0) out = shotF(t);
  if (!out) return { visible: false };
  renderer.render(scene, camera);
  out.visible = true;
  return out;
}
