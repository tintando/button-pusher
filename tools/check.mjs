// Meshes a spread of parameter sets and checks each one is a single, closed,
// outward-facing solid, with the pegs where the numbers say they should be.
import { build } from '../src/clip.js';
import { DEFAULTS, sanitise, PARAMS } from '../src/params.js';
import { meshFromSDF, meshStats } from '../src/mesh.js';

const CASES = {
  'defaults': {},
  'test piece': { testPiece: 1 },
  'thin wall, wide wrap': { wall: 1.6, wrap: 320, flareCurl: 55, flareRadius: 9 },
  'thick wall, tight wrap': { wall: 4.5, wrap: 185, flareCurl: 0 },
  'short shell, wide gap': { shellHeight: 14, bumpGap: 26 },
  'pusher above the shell': { shellOffset: 17.5, locatorAbove: 0 },
  'pusher at the base': { shellOffset: -8 },
  'shell slid up': { shellOffset: -11 },
  'peg a hair past the edge': { shellOffset: -9 },
  'locator below': { shellOffset: 13.5, locatorAbove: 0 },
  'no chamfer': { pegChamfer: 0 },
  'long pointed chamfer': { pegChamfer: 2, chamferAngle: 25 },
  'locator below the shell': { locatorAbove: 0, expectDrop: 1 },
  'pusher below the shell': { shellOffset: -18, expectDrop: 1 },
  'both pegs below': { shellOffset: -20, locatorAbove: 0, expectDrop: 1 },
  'peg base fouls the hole': { airGap: 3.2, pusherDia: 8, expectWarn: 1 },
  'tight peg fits': { pusherDia: 7.9, locatorDia: 5.9, holeDia: 6 },
  'peg wider than its hole': { locatorDia: 7, holeDia: 6, expectWarn: 1 },
  'overshoot under the ear': { shellOffset: -18, endLevel: 8, swellMargin: 0.5, expectWarn: 1 },
  'locator round the tube': { bumpAround: 12 },
  'locator far round': { bumpAround: 26, shellHeight: 34, shellOffset: -4 },
  'opening offset': { wrap: 300, openingOffset: 25 },
  'offset the other way': { wrap: 300, openingOffset: -25, locatorAbove: 0 },
  'offset with a hanging peg': { wrap: 290, openingOffset: 20, shellOffset: -18, expectDrop: 1 },
  'offset with the locator round': { wrap: 300, openingOffset: 20, bumpAround: 10 },
  'offset keeps its hook': { openingOffset: 20 },
  'offset held by the wrap': { wrap: 170, openingOffset: -60, expectWarn: 1 },
  'quarter turn lip': { flareCurl: 90, flareRadius: 5 },
  'hooked lip': { flareCurl: 180, flareRadius: 5 },
  'lip curled onto itself': { flareCurl: 165, flareRadius: 3.5 },
  'curl the wall cannot make': { flareCurl: 180, flareRadius: 2, wall: 4.5 },
  'curl bigger than its arm': { flareCurl: 120, flareRadius: 40, wrap: 190 },
  'wide gentle curl': { flareCurl: 30, flareRadius: 30, wrap: 300 },
  // a real extension, measured: \u230015.3 button, \u23009.3 locator hole, 7.15 mm of
  // bare metal between them, on a short shell that hangs the pusher off its
  // bottom edge and stands the part on grown feet
  '47 mm extension': {
    tubeDia: 47, buttonDia: 15.3, pusherDia: 14.7, pusherReach: 2.9,
    holeDia: 9.3, locatorDia: 8.75, locatorReach: 2, bumpGap: 7.15, bumpAround: -1,
    airGap: 3, wall: 3, wrap: 292, openingOffset: -22, shellHeight: 21, shellOffset: -12,
    flareCurl: 66, flareRadius: 7.65, gripSpan: 0.6, endPreload: 0.05, endRun: 0.25,
    cornerRound: 2, rimRound: 1.05, bumpNeck: 0.6, pegChamfer: 0.6, bumpTaper: 0.5,
    baseFillet: 1.5, padDish: 1, expectDrop: 1,
  },
  'small tube': { tubeDia: 30, buttonDia: 5, pusherDia: 4.4, holeDia: 4, locatorDia: 3, bumpGap: 6, shellHeight: 16, shellOffset: 0 },
  'big tube': { tubeDia: 72, buttonDia: 14, pusherDia: 13, holeDia: 10, locatorDia: 8, bumpGap: 18, shellHeight: 40, shellOffset: 0 },
  'no curl, no dish': { flareCurl: 0, padDish: 0, padBulge: 0, tipDish: 0 },
  'tall shell': { shellHeight: 60, shellOffset: 0 },
};

// The wall, measured square to the outer face rather than radially, from clear
// of the swellings on arm A out to the tip of its lip. Two things used to go
// wrong out here and neither shows up in a triangle count: a wall stacked up
// radially thins as the shell leans off parallel, and a lip built in unrolled
// coordinates fattens as it curls. Both read as the wall not being the wall.
function wallScan(M, P) {
  const I = M.info, z = I.H * 0.5;
  const f = (x, y) => M.sdf(x, y, z);
  const grad = (x, y) => {
    const e = 1e-4;
    const gx = (f(x + e, y) - f(x - e, y)) / (2 * e), gy = (f(x, y + e) - f(x, y - e)) / (2 * e);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  };
  const snap = (x, y) => {
    for (let i = 0; i < 40; i++) {
      const d = f(x, y), [nx, ny] = grad(x, y);
      x -= nx * d; y -= ny * d;
      if (Math.abs(d) < 1e-9) break;
    }
    return [x, y];
  };
  const thick = (x, y, nx, ny) => {
    let hi = 0;
    for (let t = 0.02; t < 14; t += 0.02) if (f(x - nx * t, y - ny * t) > 0) { hi = t; break; }
    if (!hi) return NaN;
    let lo = hi - 0.02;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (f(x - nx * m, y - ny * m) > 0) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
  };
  const tip = I.arch.tip;
  if (!tip) return null;
  // start clear of both swellings, and only if there is shell left before the lip
  const a0 = Math.max(Math.abs(I.pusher.s), Math.abs(I.locator.s)) / I.Rt + 0.5;
  const s0 = (I.sA - I.arch.reach) / I.Rt;
  if (!(a0 + 0.1 < s0)) return null;
  let p = snap((I.Rt + P.airGap + P.wall + 2) * Math.cos(a0), (I.Rt + P.airGap + P.wall + 2) * Math.sin(a0));
  let lo = 9, hi = 0;
  for (let i = 0; i < 2000; i++) {
    const [nx, ny] = grad(p[0], p[1]);
    const t = thick(p[0], p[1], nx, ny);
    if (t === t) { if (t < lo) lo = t; if (t > hi) hi = t; }
    if (Math.hypot(p[0] - tip[0], p[1] - tip[1]) < P.wall + 0.6) break;
    p = snap(p[0] - ny * 0.2, p[1] + nx * 0.2);
  }
  return [lo, hi];
}

function topology(positions, indices) {
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + ((e + 1) % 3)];
      const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  let open = 0, weird = 0;
  for (const n of edges.values()) { if (n === 1) open++; else if (n !== 2) weird++; }
  // connected components over vertices
  const n = positions.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]), c = find(indices[t + 2]);
    if (a !== b) parent[b] = a;
    if (a !== c) parent[c] = a;
  }
  const roots = new Set();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return { open, weird, parts: roots.size };
}

const res = Number(process.argv[2] || 0.5);
let bad = 0;
console.log(`grid ${res} mm\n`);
console.log('case'.padEnd(24), 'tris'.padStart(7), 'vol cm3'.padStart(8), 'parts'.padStart(6), 'open'.padStart(5), 'tip err'.padStart(8), 'wall'.padStart(12), '  notes');
for (const [name, over] of Object.entries(CASES)) {
  const expectWarn = !!over.expectWarn;
  const expectDrop = !!over.expectDrop;
  const P = sanitise({ ...DEFAULTS, ...over });
  const M = build(P);
  const g = meshFromSDF(M.sdf, M.bounds, res);
  const st = meshStats(g.positions, g.indices);
  const tp = topology(g.positions, g.indices);

  // where does the material actually stop along each peg's axis?
  const tipErr = [];
  for (const b of [M.info.pusher, M.info.locator]) {
    const th = b.s / M.info.Rt;
    let r = b.tipAt - 2;
    for (; r < M.info.Rt + 12; r += 0.002) if (M.sdf(r * Math.cos(th), r * Math.sin(th), b.z) < 0) break;
    tipErr.push(r - b.tipAt);
  }
  const dishAllowance = 0.02 + (over.tipDish === 0 ? 0 : P.tipDish);
  const wall = wallScan(M, P);
  const problems = [];
  if (wall && (wall[0] < P.wall - 0.06 || wall[1] > P.wall + 0.06))
    problems.push(`wall runs ${wall[0].toFixed(2)}..${wall[1].toFixed(2)} on a ${P.wall} setting`);
  if (tp.parts !== 1) problems.push(`${tp.parts} separate parts`);
  if (tp.open) problems.push(`${tp.open} open edges, not watertight`);
  if (st.volume <= 0) problems.push('inverted winding');
  if (!expectWarn) {
    if (tipErr[0] > dishAllowance + 0.05) problems.push('pusher tip short by ' + tipErr[0].toFixed(2));
    if (Math.abs(tipErr[1]) > 0.05) problems.push('locator tip off by ' + tipErr[1].toFixed(2));
  }
  if (st.min[2] < M.info.zFloor - 0.02) problems.push('material below the print bed');
  if (st.min[2] > M.info.zFloor + 0.3) problems.push('nothing standing on the print bed');
  if (expectDrop && !(M.info.drop > 0)) problems.push('expected the ends to grow down, they did not');
  if (expectWarn && !M.info.warn.length) problems.push('expected a warning, got none');
  if (problems.length) bad++;
  console.log(
    name.padEnd(24),
    String(st.tris).padStart(7),
    (st.volume / 1000).toFixed(2).padStart(8),
    String(tp.parts).padStart(6),
    String(tp.open + tp.weird).padStart(5),
    tipErr.map((e) => e.toFixed(2)).join('/').padStart(8),
    (wall ? `${wall[0].toFixed(2)}..${wall[1].toFixed(2)}` : '-').padStart(12),
    '  ' + (problems.length ? '** ' + problems.join('; ') : 'ok'
      + (M.info.warn.length ? ` (${M.info.warn.length} warning${M.info.warn.length > 1 ? 's' : ''})` : '')
      + (tp.weird ? ` (${tp.weird} pinched edges)` : '')),
  );
}
console.log(bad ? `\n${bad} case(s) with problems` : '\nall clean');
process.exit(bad ? 1 : 0);
