// Naive surface nets: one vertex per cell that straddles the surface, quads
// around every sign-changing grid edge. Short, watertight, and smooth enough
// for a field that is already smooth.

const CORNER = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGE = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
];

export function sampleField(sdf, bounds, res) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.max(2, Math.ceil((x1 - x0) / res) + 1);
  const ny = Math.max(2, Math.ceil((y1 - y0) / res) + 1);
  const nz = Math.max(2, Math.ceil((z1 - z0) / res) + 1);
  const vals = new Float32Array(nx * ny * nz);
  let i = 0;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * res;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * res;
      for (let ii = 0; ii < nx; ii++) vals[i++] = sdf(x0 + ii * res, y, z);
    }
  }
  return { vals, nx, ny, nz, origin: [x0, y0, z0], res };
}

export function surfaceNets(grid) {
  const { vals, nx, ny, nz, origin, res } = grid;
  const [ox, oy, oz] = origin;
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const positions = [];
  const cn = (i, j, k) => i + nx * (j + ny * k);
  const cc = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const v = [];
        for (let c = 0; c < 8; c++) {
          const o = CORNER[c];
          const val = vals[cn(i + o[0], j + o[1], k + o[2])];
          v.push(val);
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGE[e][0], b = EDGE[e][1];
          if ((mask >> a & 1) === (mask >> b & 1)) continue;
          const t = v[a] / (v[a] - v[b]);
          const A = CORNER[a], B = CORNER[b];
          ax += A[0] + (B[0] - A[0]) * t;
          ay += A[1] + (B[1] - A[1]) * t;
          az += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        cellIdx[cc(i, j, k)] = positions.length / 3;
        positions.push(ox + (i + ax / n) * res, oy + (j + ay / n) * res, oz + (k + az / n) * res);
      }
    }
  }

  const indices = [];
  const quad = (a, b, c, d) => { indices.push(a, b, c, a, c, d); };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = vals[cn(i, j, k)];
        // +X edge: surrounding cells vary in y and z
        if (i < nx - 1 && j > 0 && k > 0 && (v0 < 0) !== (vals[cn(i + 1, j, k)] < 0)) {
          const a = cellIdx[cc(i, j - 1, k - 1)], b = cellIdx[cc(i, j, k - 1)];
          const c = cellIdx[cc(i, j, k)], d = cellIdx[cc(i, j - 1, k)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 < 0 ? quad(a, b, c, d) : quad(a, d, c, b);
        }
        // +Y edge: surrounding cells vary in z and x
        if (j < ny - 1 && k > 0 && i > 0 && (v0 < 0) !== (vals[cn(i, j + 1, k)] < 0)) {
          const a = cellIdx[cc(i - 1, j, k - 1)], b = cellIdx[cc(i - 1, j, k)];
          const c = cellIdx[cc(i, j, k)], d = cellIdx[cc(i, j, k - 1)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 < 0 ? quad(a, b, c, d) : quad(a, d, c, b);
        }
        // +Z edge: surrounding cells vary in x and y
        if (k < nz - 1 && i > 0 && j > 0 && (v0 < 0) !== (vals[cn(i, j, k + 1)] < 0)) {
          const a = cellIdx[cc(i - 1, j - 1, k)], b = cellIdx[cc(i, j - 1, k)];
          const c = cellIdx[cc(i, j, k)], d = cellIdx[cc(i - 1, j, k)];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 < 0 ? quad(a, b, c, d) : quad(a, d, c, b);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Vertex normals straight off the field, which beats averaging facets. */
export function fieldNormals(sdf, positions, h) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    let nx = sdf(x + h, y, z) - sdf(x - h, y, z);
    let ny = sdf(x, y + h, z) - sdf(x, y - h, z);
    let nz = sdf(x, y, z + h) - sdf(x, y, z - h);
    const l = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
  }
  return n;
}

export function meshStats(positions, indices) {
  let vol = 0, area = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
  for (let t = 0; t < indices.length; t += 3) {
    const p = indices[t] * 3, q = indices[t + 1] * 3, r = indices[t + 2] * 3;
    const ax = positions[p], ay = positions[p + 1], az = positions[p + 2];
    const bx = positions[q], by = positions[q + 1], bz = positions[q + 2];
    const cx = positions[r], cy = positions[r + 1], cz = positions[r + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return { volume: vol, area, min: lo, max: hi, tris: indices.length / 3, verts: positions.length / 3 };
}

export function toSTL(positions, indices) {
  const n = indices.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = 'mast-base button pusher';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const p = indices[t] * 3, q = indices[t + 1] * 3, r = indices[t + 2] * 3;
    const ax = positions[p], ay = positions[p + 1], az = positions[p + 2];
    const bx = positions[q], by = positions[q + 1], bz = positions[q + 2];
    const cx = positions[r], cy = positions[r + 1], cz = positions[r + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    dv.setFloat32(o + 12, ax, true); dv.setFloat32(o + 16, ay, true); dv.setFloat32(o + 20, az, true);
    dv.setFloat32(o + 24, bx, true); dv.setFloat32(o + 28, by, true); dv.setFloat32(o + 32, bz, true);
    dv.setFloat32(o + 36, cx, true); dv.setFloat32(o + 40, cy, true); dv.setFloat32(o + 44, cz, true);
    dv.setUint16(o + 48, 0, true);
    o += 50;
  }
  return buf;
}

export function meshFromSDF(sdf, bounds, res) {
  const grid = sampleField(sdf, bounds, res);
  const { positions, indices } = surfaceNets(grid);
  const normals = fieldNormals(sdf, positions, res * 0.35);
  return { positions, indices, normals, grid: [grid.nx, grid.ny, grid.nz] };
}
