// The preview tube is stitched by hand (two faces cut separately and a bore
// zipped between them), so this checks it comes out closed, that the bores are
// straight cylinders of the right size, and that the normals are unit length.
import { tubeGeometry } from '../src/tube.js';

const THREE = {
  BufferGeometry: class { setAttribute(n, a) { this[n] = a.array; } setIndex(i) { this.idx = i; } },
  Float32BufferAttribute: class { constructor(a) { this.array = a; } },
};

const CASES = {
  'whole tube, two holes': {},
  'wedge out of the front': { shownDeg: 280 },
  'wedge swung round': { shownDeg: 280, centre: 24 * (25 * Math.PI) / 180 },
  'thick wall': { wall: 5 },
  'thin wall': { wall: 0.8 },
  'small tube, big holes': { R: 15, wall: 2, holes: [{ u: 0, v: 12, r: 5 }] },
  'no holes': { holes: [] },
};
const BASE = {
  R: 24, wall: 2, shownDeg: 360, centre: 0, z0: -20, z1: 45,
  holes: [{ u: 0, v: 13, r: 4 }, { u: 0, v: 30, r: 3 }],
};

let bad = 0;
console.log('case'.padEnd(24), 'tris'.padStart(7), 'open'.padStart(5), 'nrm err'.padStart(8), '  bores (chord across, outer / inner)');
for (const [name, over] of Object.entries(CASES)) {
  const o = { ...BASE, ...over };
  const g = tubeGeometry(THREE, o);
  const p = g.position, nr = g.normal, ix = g.idx;
  const Ri = Math.max(0.4, o.R - o.wall);

  // weld by position, then every edge must be shared by exactly two triangles
  const key = (i) => [0, 1, 2].map((k) => Math.round(p[i * 3 + k] * 8192)).join(',');
  const id = new Map(); const w = new Int32Array(p.length / 3);
  for (let i = 0; i < p.length / 3; i++) {
    const k = key(i);
    if (!id.has(k)) id.set(k, id.size);
    w[i] = id.get(k);
  }
  const edges = new Map();
  for (let t = 0; t < ix.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = w[ix[t + e]], b = w[ix[t + ((e + 1) % 3)]];
      if (a === b) continue;
      const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  let open = 0, pinched = 0;
  for (const n of edges.values()) { if (n === 1) open++; else if (n !== 2) pinched++; }

  let nerr = 0;
  for (let i = 0; i < nr.length; i += 3)
    nerr = Math.max(nerr, Math.abs(Math.hypot(nr[i], nr[i + 1], nr[i + 2]) - 1));

  // Every vertex sitting on a bore wall must be exactly the hole's radius from
  // that bore's axis, whatever depth it is at: that is what straight means.
  // Measured across the bore, the way the peg has to pass through it: the
  // direction a hole that followed the curve of the wall would pinch in.
  const notes = [];
  const problems = [];
  for (const h of o.holes) {
    const th = h.u / o.R;
    let out = 0, inn = 0, worst = 0;
    for (let i = 0; i < p.length / 3; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const rho = Math.hypot(x, y);
      const dt = Math.atan2(y, x) - th;
      if (Math.cos(dt) <= 0) continue;
      const across = Math.abs(rho * Math.sin(dt));          // chord across the bore
      const d = Math.hypot(across, z - h.v);                // distance from the bore axis
      // The wall of a bore is the only place a normal is not straight out from
      // the tube's axis, which is what picks its vertices out of the crowd.
      if (Math.abs((x * nr[i * 3] + y * nr[i * 3 + 1]) / rho) > 0.9) continue;
      if (Math.abs(d - h.r) > 0.15) continue;
      if (Math.abs(d - h.r) > worst) worst = Math.abs(d - h.r);
      if (Math.abs(rho - o.R) < 1e-3) out = Math.max(out, across);
      if (Math.abs(rho - Ri) < 1e-3) inn = Math.max(inn, across);
    }
    // the contour is cut by straight lines across grid cells, so it wanders a
    // sliver either side of the true circle - a fraction of a cell, no more
    if (worst > 0.05) problems.push(`bore wall ${worst.toFixed(3)} mm off the \u2300${h.r * 2} circle`);
    const oc = out * 2, ic = inn * 2;
    if (Math.abs(oc - ic) > 0.05)
      problems.push(`⌀${h.r * 2} bore tapers: ${oc.toFixed(2)} in, ${ic.toFixed(2)} out`);
    else if (Math.abs(oc - h.r * 2) > 0.08 || Math.abs(ic - h.r * 2) > 0.08)
      problems.push(`⌀${h.r * 2} bore measures ${oc.toFixed(2)}/${ic.toFixed(2)}`);
    notes.push(`⌀${(h.r * 2).toFixed(1)}: ${oc.toFixed(2)}/${ic.toFixed(2)}`);
  }
  if (open) problems.push(`${open} open edges, not watertight`);
  if (pinched) problems.push(`${pinched} pinched edges`);
  if (nerr > 1e-5) problems.push(`normal off unit by ${nerr.toFixed(4)}`);
  if (problems.length) bad++;
  console.log(
    name.padEnd(24), String(ix.length / 3).padStart(7), String(open).padStart(5),
    nerr.toExponential(1).padStart(8),
    '  ' + (problems.length ? '** ' + problems.join('; ') : notes.join('  ') || 'no holes'));
}
console.log(bad ? `\n${bad} case(s) with problems` : '\nall clean');
process.exit(bad ? 1 : 0);
