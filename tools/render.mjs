// Offline sphere-tracer. Renders the field straight, with no meshing in the
// way, so what you see is what the SDF says.
import fs from 'node:fs';
import path from 'node:path';
import { encodePNG } from './png.mjs';
import { build } from '../src/clip.js';
import { DEFAULTS, sanitise } from '../src/params.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function render(sdf, opts) {
  const { w = 460, h = 460, eye, target, fov = 34, up = [0, 0, 1], bg = [24, 26, 30] } = opts;
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, up));
  const realUp = cross(right, fwd);
  const px = new Uint8Array(w * h * 3);
  const tan = Math.tan((fov * Math.PI) / 360);
  const grad = (p, e) => norm([
    sdf(p[0] + e, p[1], p[2]) - sdf(p[0] - e, p[1], p[2]),
    sdf(p[0], p[1] + e, p[2]) - sdf(p[0], p[1] - e, p[2]),
    sdf(p[0], p[1], p[2] + e) - sdf(p[0], p[1], p[2] - e),
  ]);
  const dist = Math.hypot(...sub(target, eye));
  const key = norm([-0.4, -0.8, 0.7]);
  const fill = norm([0.9, 0.3, 0.2]);
  for (let y = 0; y < h; y++) {
    const sy = (1 - (2 * (y + 0.5)) / h) * tan;
    for (let x = 0; x < w; x++) {
      const sx = ((2 * (x + 0.5)) / w - 1) * tan * (w / h);
      const dir = norm([
        fwd[0] + right[0] * sx + realUp[0] * sy,
        fwd[1] + right[1] * sx + realUp[1] * sy,
        fwd[2] + right[2] * sx + realUp[2] * sy,
      ]);
      let t = Math.max(0, dist - 95), hit = false, d = 0;
      for (let i = 0; i < 260; i++) {
        const p0 = eye[0] + dir[0] * t, p1 = eye[1] + dir[1] * t, p2 = eye[2] + dir[2] * t;
        d = sdf(p0, p1, p2);
        if (d < 0.0025) { hit = true; break; }
        t += Math.max(d * 0.75, 0.004);
        if (t > dist + 130) break;
      }
      const o = (y * w + x) * 3;
      if (!hit) { px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; continue; }
      const p = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
      const n = grad(p, 0.02);
      let ao = 0;
      for (let i = 1; i <= 5; i++) {
        const s = i * 0.45;
        ao += (s - sdf(p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s)) / Math.pow(2, i);
      }
      ao = Math.max(0, Math.min(1, 1 - 1.4 * ao));
      const l = 0.16 + 0.72 * Math.max(0, dot(n, key)) + 0.26 * Math.max(0, dot(n, fill));
      const spec = Math.pow(Math.max(0, dot(norm([key[0] - dir[0], key[1] - dir[1], key[2] - dir[2]]), n)), 28) * 0.35;
      const base = [0.86, 0.62, 0.30];
      for (let c = 0; c < 3; c++) {
        const v = Math.pow(Math.min(1, base[c] * l * ao + spec), 1 / 2.2);
        px[o + c] = Math.round(255 * v);
      }
    }
  }
  return { w, h, px };
}

function orbit(target, r, azDeg, elDeg) {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [target[0] + r * Math.cos(el) * Math.cos(az), target[1] + r * Math.cos(el) * Math.sin(az), target[2] + r * Math.sin(el)];
}

const overrides = {};
let tag = 'clip';
for (const a of process.argv.slice(2)) {
  const [k0, v] = a.split('=');
  const k = k0.replace(/^--/, '');
  if (v === undefined) continue;
  if (k === 'tag') tag = v; else overrides[k] = Number(v);
}
const P = sanitise({ ...DEFAULTS, ...overrides });
const model = build(P);
const c = model.info;
const target = [8, 0, c.zFloor + c.overallHeight / 2];
const out = path.resolve('out');
fs.mkdirSync(out, { recursive: true });

const views = [
  ['3q', orbit(target, 105, 32, 20), model.sdf],
  ['back', orbit(target, 100, 0, 6), model.sdf],
  ['top', orbit(target, 95, 25, 72), model.sdf],
  ['section', orbit(target, 95, 90, 8), (x, y, z) => Math.max(model.sdf(x, y, z), y)],
];
for (const [name, eye, f] of views) {
  const t0 = Date.now();
  const img = render(f, { eye, target });
  fs.writeFileSync(path.join(out, `${tag}-${name}.png`), encodePNG(img.w, img.h, img.px));
  process.stdout.write(`${name} ${Date.now() - t0}ms  `);
}
console.log('\n' + JSON.stringify({ warn: c.warn, note: c.note }));
