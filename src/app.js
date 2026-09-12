import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { PARAMS, GROUPS, DEFAULTS, sanitise } from './params.js';
import { tubeGeometry } from './tube.js';

const STORE = 'button-pusher/params';
const OPEN = 'button-pusher/readout-open';
let P = load();

function load() {
  try { return sanitise(JSON.parse(localStorage.getItem(STORE) || '{}')); }
  catch { return { ...DEFAULTS }; }
}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch {} };

// ---------------------------------------------------------------- controls
const controls = document.getElementById('controls');
const widgets = {};
for (const g of GROUPS) {
  const det = document.createElement('details');
  det.open = g.open;
  det.innerHTML = `<summary>${g.label}</summary>` + (g.note ? `<p class="gnote">${g.note}</p>` : '');
  for (const d of PARAMS.filter((p) => p.group === g.id)) {
    const el = document.createElement('div');
    el.className = 'p' + (d.bool ? ' boolean' : '');
    if (d.bool) {
      el.innerHTML = `<input type="checkbox" id="c_${d.key}"><label for="c_${d.key}">${d.label}</label>`
        + (d.help ? `<div class="hint">${d.help}</div>` : '');
      const cb = el.querySelector('input');
      cb.checked = !!P[d.key];
      cb.addEventListener('change', () => { P[d.key] = cb.checked ? 1 : 0; changed(false, d.view); });
      widgets[d.key] = { set: (v) => { cb.checked = !!v; } };
    } else {
      el.innerHTML = `<div class="top"><label for="n_${d.key}">${d.label}</label>
        <span class="val"><input type="number" id="n_${d.key}" min="${d.min}" max="${d.max}" step="${d.step}"><span class="unit">${d.unit}</span></span></div>
        <input type="range" min="${d.min}" max="${d.max}" step="${d.step}">`
        + (d.help ? `<div class="hint">${d.help}</div>` : '');
      const num = el.querySelector('input[type=number]');
      const rng = el.querySelector('input[type=range]');
      const put = (v, live) => {
        P[d.key] = Math.min(d.max, Math.max(d.min, v));
        num.value = P[d.key]; rng.value = P[d.key];
        changed(live, d.view);
      };
      num.value = rng.value = P[d.key];
      rng.addEventListener('input', () => put(+rng.value, true));
      rng.addEventListener('change', () => put(+rng.value, false));
      num.addEventListener('change', () => put(+num.value, false));
      widgets[d.key] = { set: (v) => { num.value = v; rng.value = v; } };
    }
    det.appendChild(el);
  }
  controls.appendChild(det);
}
const syncWidgets = () => { for (const k in widgets) widgets[k].set(P[k]); };

const readoutBox = document.getElementById('readoutBox');
readoutBox.open = localStorage.getItem(OPEN) !== 'no';
readoutBox.addEventListener('toggle', () => {
  try { localStorage.setItem(OPEN, readoutBox.open ? 'yes' : 'no'); } catch {}
});

document.getElementById('hints').addEventListener('change', (e) =>
  document.body.classList.toggle('nohints', !e.target.checked));
document.getElementById('reset').addEventListener('click', () => {
  P = { ...DEFAULTS }; syncWidgets(); changed(false);
});
document.getElementById('copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(JSON.stringify(P, null, 2));
  e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy'), 1200);
});
document.getElementById('paste').addEventListener('click', () => {
  const t = prompt('Paste settings JSON');
  if (!t) return;
  try { P = sanitise(JSON.parse(t)); syncWidgets(); changed(false); }
  catch { alert('That is not settings JSON.'); }
});

// ------------------------------------------------------------------- scene
const holder = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
holder.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);
const camera = new THREE.PerspectiveCamera(34, 1, 1, 2000);
camera.up.set(0, 0, 1);
camera.position.set(105, -62, 52);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xa8c4e6, 0x2a2620, 1.1));
const key = new THREE.DirectionalLight(0xfff2e0, 2.1); key.position.set(70, -90, 90); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb6ff, 0.8); rim.position.set(-80, 60, 20); scene.add(rim);
const under = new THREE.DirectionalLight(0xffd9a0, 0.35); under.position.set(20, 40, -60); scene.add(under);

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clipMat = new THREE.MeshStandardMaterial({
  color: 0xe0b070, roughness: 0.52, metalness: 0.02, side: THREE.DoubleSide,
});
const clipMesh = new THREE.Mesh(new THREE.BufferGeometry(), clipMat);
scene.add(clipMesh);

const tubeMat = new THREE.MeshStandardMaterial({
  color: 0x8d949c, roughness: 0.35, metalness: 0.5, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
});
const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
scene.add(tube);

// solid / see-through / hidden for the tube; the gear features are holes in it
const tubeMode = document.getElementById('tubeMode');
const showGear = document.getElementById('showGear');
function fade(mat, a) {
  mat.opacity = a;
  mat.transparent = a < 1;
  mat.depthWrite = a >= 1;
  mat.needsUpdate = true;
}
// The tube is a real section of tube, with the button and the locator holes
// cut through its wall. The wedge that "tube shown" takes out comes off the
// front, the side the clip's opening faces, and follows it round when the
// opening is swung off the peg axis, so the features stay on the tube.
let tubeSpan = { R: 24, top: 25, bot: 0, centre: 0, holes: [] };
function applyTube() {
  const { R, top, bot, centre, holes } = tubeSpan;
  const len = Math.max(90, (top - bot) * 2.6), mid = (top + bot) / 2;
  tube.geometry.dispose();
  tube.geometry = tubeGeometry(THREE, {
    R, wall: P.tubeWall, shownDeg: P.tubeShown, centre,
    z0: mid - len / 2, z1: mid + len / 2,
    holes: showGear.checked ? holes : [],
  });
  tube.visible = tubeMode.value !== 'off';
  fade(tubeMat, tubeMode.value === 'solid' ? 1 : P.tubeAlpha / 100);
}
tubeMode.addEventListener('change', applyTube);
showGear.addEventListener('change', applyTube);
// a handle for tools/browsercheck.mjs to measure what actually got built
globalThis.__preview = { tube, clipMesh, span: () => tubeSpan };

const bed = new THREE.GridHelper(120, 12, 0x3f4a58, 0x252c35);
bed.rotation.x = Math.PI / 2;
scene.add(bed);

document.getElementById('showBed').addEventListener('change', (e) => (bed.visible = e.target.checked));
document.getElementById('section').addEventListener('change', (e) => {
  clipMat.clippingPlanes = e.target.checked ? [clipPlane] : null;
  tubeMat.clippingPlanes = e.target.checked ? [clipPlane] : null;
  clipMat.needsUpdate = tubeMat.needsUpdate = true;
});
const spin = document.getElementById('spin');

function resize() {
  const w = holder.clientWidth, h = holder.clientHeight;
  // setSize writes the CSS size as well as the drawing buffer. Skipping that
  // leaves the canvas laid out at its buffer size, which is the container
  // times the pixel ratio, so on any HiDPI screen it overflows and you see the
  // top-left corner of the render.
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let last = performance.now();
(function loop(t) {
  requestAnimationFrame(loop);
  const dt = (t - last) / 1000; last = t;
  if (spin.checked) {
    const a = dt * 0.35, c = Math.cos(a), s = Math.sin(a);
    const p = camera.position.clone().sub(orbit.target);
    camera.position.set(p.x * c - p.y * s, p.x * s + p.y * c, p.z).add(orbit.target);
  }
  orbit.update();
  renderer.render(scene, camera);
})(performance.now());

// ------------------------------------------------------------------ worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const statusEl = document.getElementById('status');
let seq = 0, busy = false, pending = null, framed = false;
const quality = document.getElementById('quality');
quality.addEventListener('change', () => request(+quality.value));

// dragging a slider gets a coarse mesh, letting go gets the real one
function changed(live, viewOnly) {
  save();
  if (viewOnly) { applyTube(); return; }   // nothing in the field changed
  request(live ? Math.max(+quality.value, 0.9) : +quality.value);
}

function request(res) {
  pending = { params: P, res, want: 'mesh' };
  pump();
}
function pump() {
  if (busy || !pending) return;
  busy = true;
  const job = pending; pending = null;
  statusEl.classList.add('busy');
  statusEl.textContent = 'building…';
  worker.postMessage({ id: ++seq, ...job });
}

worker.onerror = (e) => {
  statusEl.classList.remove('busy');
  statusEl.textContent = 'worker failed: ' + (e.message || e.type);
  console.error('worker', e.message, e.filename, e.lineno);
  busy = false;
};

worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.want === 'stl') { saveSTL(m); busy = false; pump(); return; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  clipMesh.geometry.dispose();
  clipMesh.geometry = geo;
  updateScene(m.info, m.stats);
  statusEl.classList.remove('busy');
  statusEl.textContent = `${(m.stats.tris / 1000).toFixed(0)}k triangles · ${m.res.toFixed(2)} mm grid · ${m.ms.toFixed(0)} ms`;
  busy = false;
  pump();
};

// --------------------------------------------------------------- the scene
function updateScene(info, stats) {
  const R = info.Rt;
  tubeSpan = {
    R, top: stats.max[2], bot: stats.min[2], centre: info.offArc,
    // the features themselves, straight off the gear numbers
    holes: [
      { u: info.pusher.s, v: info.pusher.z, r: P.buttonDia / 2 },
      { u: info.locator.s, v: info.locator.z, r: P.holeDia / 2 },
    ],
  };
  applyTube();
  bed.position.z = info.zFloor;

  if (!framed) {
    framed = true;
    const c = new THREE.Vector3(
      (stats.min[0] + stats.max[0]) / 2, (stats.min[1] + stats.max[1]) / 2, (stats.min[2] + stats.max[2]) / 2);
    const rad = 0.5 * Math.hypot(
      stats.max[0] - stats.min[0], stats.max[1] - stats.min[1], stats.max[2] - stats.min[2]);
    const d = (rad / Math.sin((camera.fov * Math.PI) / 360)) * 0.95;
    orbit.target.copy(c);
    camera.position.copy(c).add(new THREE.Vector3(0.88, -0.46, 0.30).normalize().multiplyScalar(d));
  }
  readout(info, stats);
}

const fmt = (v, n = 1) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(n);
// The two arms only bend to different radii when the curl has had to be held
// back to fit on the shorter of them.
const archR = (a) => (Math.abs(a.rhoA - a.rhoB) < 0.05
  ? `${fmt(a.rhoA)} mm` : `${fmt(a.rhoA)} / ${fmt(a.rhoB)} mm`);
const edgeRel = (v) => `${fmt(Math.abs(v))} mm ${v < -1e-9 ? 'below' : 'above'} the bottom edge`;
function readout(info, stats) {
  const size = [stats.max[0] - stats.min[0], stats.max[1] - stats.min[1], stats.max[2] - stats.min[2]];
  const rows = [
    ['Overall size', `${fmt(size[0])} × ${fmt(size[1])} × ${fmt(size[2])} mm`],
    ['Shell height / tallest point', `${fmt(info.H)} / ${fmt(stats.max[2])} mm`],
    ['Pusher height', edgeRel(info.pusher.z)],
    ['Locator height', edgeRel(info.locator.z)],
    ['Bump centres apart', info.around
      ? `${fmt(info.separation)} mm up · ${fmt(info.around)} mm round`
      : `${fmt(info.separation)} mm`],
    ['Peg to feature', `${fmt(info.pusherFit, 2)} / ${fmt(info.locatorFit, 2)} mm a side`],
    ['Pusher peg', `⌀${fmt(info.pusher.tipR * 2)} to a ⌀${fmt(info.pusher.face * 2)} tip, ${fmt(info.pusher.peg)} mm proud`],
    ['Locator peg', `⌀${fmt(info.locator.tipR * 2)} to a ⌀${fmt(info.locator.face * 2)} tip, ${fmt(info.locator.peg)} mm proud`],
    ['Push travel', `${fmt(P.pusherReach)} mm of ${fmt(P.airGap)} mm available`],
    ['Arms from the pegs', `${fmt(info.armA, 0)}° / ${fmt(info.armB, 0)}°`],
    ['Lip hook past the tube', `${fmt(Math.max(info.hookA, 0))} / ${fmt(Math.max(info.hookB, 0))} mm`],
    ['Lip curl', info.arch.curl > 0.5
      ? `${fmt(info.arch.curl, 0)}° on r ${archR(info.arch)}, ${fmt(info.arch.rise)} mm out`
      : 'none'],
    ['Ends grown', `${fmt(info.lift)} mm up · ${fmt(info.drop)} mm down to the bed`],
    ['Volume', `${fmt(stats.volume / 1000, 2)} cm³ · about ${fmt((stats.volume / 1000) * 1.21, 0)} g in TPU`],
  ];
  document.getElementById('readout').innerHTML = rows
    .map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  document.getElementById('messages').innerHTML =
    info.warn.map((w) => `<div class="msg warn">${w}</div>`).join('') +
    info.note.map((n) => `<div class="msg note">${n}</div>`).join('');
  // The messages live inside the readout, so the summary has to carry the news
  // when it is shut.
  const nw = info.warn.length, nn = info.note.length;
  const badge = document.getElementById('msgCount');
  badge.className = nw ? 'warn' : '';
  badge.textContent = nw ? ` · ${nw} warning${nw > 1 ? 's' : ''}`
    : nn ? ` · ${nn} note${nn > 1 ? 's' : ''}` : '';
}

// ------------------------------------------------------------------- STL
document.getElementById('stl').addEventListener('click', () => {
  statusEl.classList.add('busy');
  statusEl.textContent = 'meshing for export…';
  worker.postMessage({ id: ++seq, params: P, res: 0.3, want: 'stl' });
});
function saveSTL(m) {
  const name = (P.testPiece ? 'button-pusher-test-piece' : 'button-pusher') +
    `-${P.tubeDia}mm-gap${P.bumpGap}-wall${P.wall}.stl`;
  const url = URL.createObjectURL(new Blob([m.stl], { type: 'model/stl' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  statusEl.classList.remove('busy');
  statusEl.textContent = `saved ${name} · ${(m.stats.tris / 1000).toFixed(0)}k triangles`;
}

resize();
request(+quality.value);
