// The preview tube: a real section of extension tube, with the button and the
// locator holes drilled through its wall.
//
// Built in unrolled coordinates (u is arc length around the outside, v is
// height) on a grid that is fine enough everywhere for the tube to look round
// and finer across each hole, then wrapped onto the cylinder. The holes come
// out of a marching-squares pass over that same grid, so their edges stay
// smooth and crack-free against the plain cells around them. Normals are
// written out by hand instead of averaged off the triangles, which means
// duplicated vertices at cell boundaries cost nothing and the surfaces stay
// perfectly smooth.
//
// A hole is a straight cylinder about a radial axis (what a drill leaves), and
// not a shape that follows the curve of the wall. So it is the chord across the
// bore that stays at the hole's diameter, never the arc, and the two faces are
// cut separately: the same bore takes a wider bite out of the inner face than
// out of the outer one. The wall of the bore is then stitched between the two
// contours, off the very points the faces were cut on, so there is nothing to
// crack open between them.

// Grid line positions: a base spacing everywhere, closed up across each band.
function axis(lo, hi, base, bands) {
  const out = new Set([lo, hi]);
  const n = Math.max(1, Math.round((hi - lo) / base));
  for (let i = 1; i < n; i++) out.add(lo + ((hi - lo) * i) / n);
  for (const [c, r] of bands) {
    const step = Math.max(0.25, r / 8);
    // Half a step off centre, so no line lands on the extreme of a hole and
    // pinches the contour to a point there.
    for (let x = c - r - step / 2; x < c + r + step; x += step)
      if (x > lo + 1e-6 && x < hi - 1e-6) out.add(x);
  }
  return [...out].sort((a, b) => a - b);
}

export function tubeGeometry(THREE, o) {
  const { R, z0, z1, shownDeg } = o;
  const Ri = Math.max(0.4, R - o.wall);
  const closed = shownDeg > 359.5;
  const uH = closed ? Math.PI * R : (shownDeg * Math.PI * R) / 360;
  const uC = closed ? 0 : o.centre || 0;   // the wedge follows the clip's mouth
  const circ = 2 * Math.PI * R;
  const du = (u, c) => {
    let d = u - c;
    if (closed) d -= circ * Math.round(d / circ);
    return d;
  };
  // How far round a bore of radius r reaches on the face at radius rho, in
  // grid u. The inner face is always the wider of the two.
  const spread = (r, rho) => R * Math.asin(Math.min(0.999, r / rho));
  // Only cut a hole that lands clear of the edges of what is being drawn, and
  // that a drill could actually leave: past the inner face, not through it.
  const holes = (o.holes || []).filter((h) =>
    h.r > 0.2 && h.r < Ri * 0.9
    && h.v - h.r > z0 + 0.2 && h.v + h.r < z1 - 0.2
    && (closed || Math.abs(du(h.u, uC)) + spread(h.r, Ri) < uH - 0.2));

  // Distance from the nearest bore, on the face at radius rho. Positive is
  // material; nothing to cut leaves the whole rectangle material.
  const fieldOn = (rho) => (u, v) => {
    let f = 1e9;
    for (const h of holes) {
      const dt = du(u, h.u) / R;
      if (Math.cos(dt) <= 0) continue;           // the far side of the tube
      const d = Math.hypot(rho * Math.sin(dt), v - h.v) - h.r;
      if (d < f) f = d;
    }
    return f;
  };
  const nearestHole = (u, v) => {
    let best = 0, bd = 1e9;
    for (let k = 0; k < holes.length; k++) {
      const d = Math.hypot(du(u, holes[k].u), v - holes[k].v);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };

  const cols = axis(uC - uH, uC + uH, Math.max(0.9, R * 0.05),
    holes.map((h) => [h.u, spread(h.r, Ri)]));
  const rows = axis(z0, z1, Math.max(4, (z1 - z0) / 4), holes.map((h) => [h.v, h.r]));

  const pos = [], nrm = [], idx = [];
  const put = (u, v, r, nu, nv, nr) => {
    const t = u / R, c = Math.cos(t), s = Math.sin(t);
    pos.push(r * c, r * s, v);
    // nu runs along the surface, nv up it, nr straight out from the axis
    nrm.push(nr * c - nu * s, nr * s + nu * c, nv);
    return pos.length / 3 - 1;
  };
  const tri = (a, b, c) => idx.push(a, b, c);

  // A polygon of the wall seen face-on. Counter-clockwise in (u, v) faces out.
  const face = (pts, r, out) => {
    const ids = pts.map((p) => put(p[0], p[1], r, 0, 0, out ? 1 : -1));
    for (let k = 1; k + 1 < ids.length; k++)
      out ? tri(ids[0], ids[k], ids[k + 1]) : tri(ids[0], ids[k + 1], ids[k]);
  };
  // The thickness of the wall along an edge, material to the left of p1 -> p2.
  // n1/n2 point away from the material, in (u, v).
  const rim = (p1, p2, n1, n2) => {
    const a = put(p1[0], p1[1], R, n1[0], n1[1], 0);
    const b = put(p1[0], p1[1], Ri, n1[0], n1[1], 0);
    const c = put(p2[0], p2[1], Ri, n2[0], n2[1], 0);
    const d = put(p2[0], p2[1], R, n2[0], n2[1], 0);
    tri(a, b, c); tri(a, c, d);
  };

  // One face of the wall, holes cut out of it. Hands back the contour points of
  // each hole, so the bore can be stitched onto exactly the points it was cut on.
  function sheet(rho, out) {
    const fld = fieldOn(rho);
    const rings = holes.map(() => []);
    for (let i = 0; i + 1 < cols.length; i++) {
      for (let j = 0; j + 1 < rows.length; j++) {
        const c = [[cols[i], rows[j]], [cols[i + 1], rows[j]],
                   [cols[i + 1], rows[j + 1]], [cols[i], rows[j + 1]]];
        const f = [fld(c[0][0], c[0][1]), fld(c[1][0], c[1][1]),
                   fld(c[2][0], c[2][1]), fld(c[3][0], c[3][1])];
        if (f[0] >= 0 && f[1] >= 0 && f[2] >= 0 && f[3] >= 0) { face(c, rho, out); continue; }
        if (f[0] < 0 && f[1] < 0 && f[2] < 0 && f[3] < 0) continue;
        const poly = [], cut = [];
        for (let k = 0; k < 4; k++) {
          const a = c[k], b = c[(k + 1) % 4], fa = f[k], fb = f[(k + 1) % 4];
          if (fa >= 0) poly.push(a);
          if ((fa >= 0) !== (fb >= 0)) {
            const t = fa / (fa - fb);
            const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            poly.push(p); cut.push(p);
          }
        }
        if (poly.length >= 3) face(poly, rho, out);
        if (cut.length === 2) rings[nearestHole(cut[0][0], cut[0][1])].push(cut[0], cut[1]);
      }
    }
    return rings;
  }
  const ringsOut = sheet(R, true), ringsIn = sheet(Ri, false);

  // The wall of one bore: the two contours the drill left, zipped together in
  // the angle round the bore. Every vertex comes off a face's own contour, so
  // the two faces and the bore share their edges exactly.
  function bore(h, outer, inner) {
    const ring = (pts, rho) => {
      const list = pts.map((p) => {
        const dt = du(p[0], h.u) / R;
        return { u: p[0], v: p[1], dt, phi: Math.atan2(p[1] - h.v, rho * Math.sin(dt)) };
      }).sort((a, b) => a.phi - b.phi);
      return list.filter((p, i) => i === 0 || p.phi - list[i - 1].phi > 1e-7);
    };
    const A = ring(outer, R), B = ring(inner, Ri);
    const n = A.length, m = B.length;
    if (n < 3 || m < 3) return;
    // Straight down the bore the normal is square to its axis, so it falls out
    // of the angle round the bore and where the point sits round the tube.
    const vert = (p, rho) => put(p.u, p.v, rho,
      -Math.cos(p.phi) * Math.cos(p.dt), -Math.sin(p.phi), -Math.cos(p.phi) * Math.sin(p.dt));
    const va = A.map((p) => vert(p, R)), vb = B.map((p) => vert(p, Ri));
    let k = 0;                                   // line the rings up to start
    while (k < m && B[k].phi < A[0].phi) k++;
    k %= m;
    const pa = (t) => A[t % n].phi + 2 * Math.PI * Math.floor(t / n);
    const pb = (t) => B[(k + t) % m].phi + 2 * Math.PI * Math.floor((k + t) / m);
    let i = 0, j = 0;
    while (i < n || j < m) {
      const a = va[i % n], b = vb[(k + j) % m];
      if (j >= m || (i < n && pa(i + 1) <= pb(j + 1))) { tri(a, va[(i + 1) % n], b); i++; }
      else { tri(a, vb[(k + j + 1) % m], b); j++; }
    }
  }
  for (let k = 0; k < holes.length; k++) bore(holes[k], ringsOut[k], ringsIn[k]);

  // The free edges of the section itself: the two ends, and the cut faces if
  // it is not a whole tube. Same rule: material to the left.
  for (let i = 0; i + 1 < cols.length; i++) {
    rim([cols[i], z0], [cols[i + 1], z0], [0, -1], [0, -1]);
    rim([cols[i + 1], z1], [cols[i], z1], [0, 1], [0, 1]);
  }
  if (!closed) {
    for (let j = 0; j + 1 < rows.length; j++) {
      rim([uC + uH, rows[j]], [uC + uH, rows[j + 1]], [1, 0], [1, 0]);
      rim([uC - uH, rows[j + 1]], [uC - uH, rows[j]], [-1, 0], [-1, 0]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
