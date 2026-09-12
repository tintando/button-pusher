// Flat cross-sections with the tube drawn in, for checking gap, wall and reach
// against numbers rather than against a nice render.
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './png.mjs';
import { build } from '../src/clip.js';
import { DEFAULTS, sanitise } from '../src/params.js';

const overrides = {};
let tag = 'clip';
for (const a of process.argv.slice(2)) {
  const [k0, v] = a.split('=');
  const k = k0.replace(/^--/, '');
  if (v === undefined) continue;
  if (k === 'tag') tag = v; else overrides[k] = Number(v);
}
const P = sanitise({ ...DEFAULTS, ...overrides });
const M = build(P);
const I = M.info;
const out = path.resolve('out');
fs.mkdirSync(out, { recursive: true });

const MAT = [222, 176, 104], AIR = [22, 24, 28], TUBE = [46, 92, 132], EDGE = [255, 255, 255], GRID = [40, 44, 50];

function draw(name, W, H, x0, x1, y0, y1, fn) {
  const px = new Uint8Array(W * H * 3);
  const sx = (x1 - x0) / W, sy = (y1 - y0) / H;
  for (let j = 0; j < H; j++) {
    const wy = y1 - (j + 0.5) * sy;
    for (let i = 0; i < W; i++) {
      const wx = x0 + (i + 0.5) * sx;
      const c = fn(wx, wy);
      const o = (j * W + i) * 3;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  fs.writeFileSync(path.join(out, `${tag}-${name}.png`), encodePNG(W, H, px));
  return `${name} ${W}x${H}`;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function shade(d, wx, wy, tubeDist) {
  let c;
  if (d < 0) c = mix(MAT, [255, 235, 200], Math.max(0, 1 + d / 1.4) * 0.55);
  else c = AIR;
  if (Math.abs(d) < 0.09) c = EDGE;
  if (tubeDist !== null) {
    if (tubeDist < 0) c = d < 0 ? [232, 96, 96] : mix(c, TUBE, 0.55);  // red = clash with tube
    if (Math.abs(tubeDist) < 0.09) c = [120, 190, 255];
  }
  if (Math.abs(wx % 5) < 0.035 || Math.abs(wy % 5) < 0.035) c = d < 0 ? mix(c, GRID, 0.25) : mix(c, [70, 76, 86], 0.7);
  return c;
}

// vertical section through both bumps (the plane the bump line lies in)
const th = I.pusher.s / I.Rt;
const cx = Math.cos(th), cy = Math.sin(th);
const lines = [];
lines.push(draw('sec-vert', 760, 640, -6, 40, -3, 43, (x, z) => {
  // x here is radial distance along the bump line's plane
  const d = M.sdf(x * cx, x * cy, z);
  return shade(d, x, z, Math.abs(x) - I.Rt);
}));

// horizontal section through the pusher
lines.push(draw('sec-horiz', 720, 720, -36, 36, -36, 36, (x, y) => {
  const d = M.sdf(x, y, I.pusher.z);
  return shade(d, x, y, Math.hypot(x, y) - I.Rt);
}));

// horizontal section between the bumps (should be clear air over the tube)
const midZ = (I.pusher.z + I.locator.z) / 2;
lines.push(draw('sec-mid', 720, 720, -36, 36, -36, 36, (x, y) => {
  const d = M.sdf(x, y, midZ);
  return shade(d, x, y, Math.hypot(x, y) - I.Rt);
}));

console.log(lines.join('  '));

// ---- numbers ----
function scanRadial(z, thAng, from, to) {
  const spans = [];
  let prev = null, start = 0;
  for (let r = from; r <= to; r += 0.002) {
    const inside = M.sdf(r * Math.cos(thAng), r * Math.sin(thAng), z) < 0;
    if (prev === null) { prev = inside; start = r; }
    else if (inside !== prev) { if (prev) spans.push([start, r]); start = r; prev = inside; }
  }
  if (prev) spans.push([start, to]);
  return spans;
}
const rep = [];
rep.push(['pusher axis   z=' + I.pusher.z, scanRadial(I.pusher.z, th, 5, 40)]);
rep.push(['locator axis  z=' + I.locator.z.toFixed(1), scanRadial(I.locator.z, I.locator.s / I.Rt, 5, 40)]);
rep.push(['between bumps z=' + midZ.toFixed(1), scanRadial(midZ, 0, 5, 40)]);
rep.push(['back, high    z=' + (I.H - 1).toFixed(1), scanRadial(I.H - 1, 0, 5, 40)]);
rep.push(['side  60deg   z=' + (I.H / 2).toFixed(1), scanRadial(I.H / 2, Math.PI / 3, 5, 40)]);
for (const a of [I.armA, -I.armB])
  rep.push(['end ' + (a > 0 ? '+' : '') + a.toFixed(0) + 'deg   z=' + (I.H / 2).toFixed(1),
    scanRadial(I.H / 2, (a * Math.PI) / 180 - Math.sign(a) * 0.02, 5, 40)]);
for (const [label, spans] of rep)
  console.log(label.padEnd(26), spans.map(([a, b]) => `${a.toFixed(2)}..${b.toFixed(2)} (${(b - a).toFixed(2)})`).join('  ') || '(empty)');

// gap between shell and tube, angle by angle, ignoring the pegs
const zProbe = [I.H * 0.15, I.H * 0.5, I.H * 0.85];
let best = [1e9, 0, 0], profile = [];
for (let a = -I.armB; a <= I.armA + 0.001; a += 2.5) {
  const t = (a * Math.PI) / 180;
  const row = [];
  for (const z of zProbe) {
    if (M.sdf(I.Rt * Math.cos(t), I.Rt * Math.sin(t), z) < 0) { row.push('peg'); continue; }
    const spans = scanRadial(z, t, I.Rt, 40);
    if (!spans.length) { row.push('  - '); continue; }
    const g = spans[0][0] - I.Rt;
    row.push(g.toFixed(2).padStart(5));
    if (g < best[0]) best = [g, a, z];
  }
  profile.push(a.toFixed(0).padStart(5) + 'deg ' + row.join(' '));
}
console.log('gap to tube by angle (z = ' + zProbe.map(z => z.toFixed(1)).join(', ') + '):');
for (let i = 0; i < profile.length; i += 4) console.log('   ' + profile.slice(i, i + 4).join(' |'));
console.log(`closest approach ${best[0].toFixed(2)} mm at ${best[1].toFixed(1)}deg, z=${best[2].toFixed(1)}`);
