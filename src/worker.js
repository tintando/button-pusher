import { build } from './clip.js';
import { sanitise } from './params.js';
import { meshFromSDF, meshStats, toSTL } from './mesh.js';

self.onmessage = (ev) => {
  const { id, params, res, want } = ev.data;
  const t0 = performance.now();
  const P = sanitise(params);
  const model = build(P);
  const g = meshFromSDF(model.sdf, model.bounds, res);
  const stats = meshStats(g.positions, g.indices);
  const ms = performance.now() - t0;
  if (want === 'stl') {
    const stl = toSTL(g.positions, g.indices);
    self.postMessage({ id, want, stl, stats, info: model.info, ms }, [stl]);
    return;
  }
  self.postMessage(
    { id, want, positions: g.positions, normals: g.normals, indices: g.indices, stats, info: model.info, ms, res },
    [g.positions.buffer, g.normals.buffer, g.indices.buffer],
  );
};
