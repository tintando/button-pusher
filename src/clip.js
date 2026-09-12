// Signed-distance model of the clip.
//
// Everything is one field. Ears, swellings, fillets and blends fall out of
// smooth mins rather than being drawn by hand, which is what lets the shape
// reorganise itself when the numbers change.
//
// Frame: tube axis is +Z, tube centred on the axis. z = 0 is the bottom edge of
// the shell. The print bed is the lowest point of the part: z = 0 until a peg
// hangs below the shell and pulls it down. The back of the clip (bumps inside,
// thumb pad outside) faces +X; the opening faces -X.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ssstep = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const dssstep = (t) => { if (t <= 0 || t >= 1) return 0; const u = t * (1 - t); return 30 * u * u; };
const len2 = (a, b) => Math.sqrt(a * a + b * b);

function smin(a, b, k) {
  if (k <= 1e-9) return a < b ? a : b;
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
const smax = (a, b, k) => -smin(-a, -b, k);

// Intersection of two half-spaces (negative inside) with the shared edge
// rounded off by r. Exact for the flat case, close enough elsewhere.
function rint(a, b, r) {
  const x = a + r, y = b + r;
  const m = x > y ? x : y;
  const mx = x > 0 ? x : 0, my = y > 0 ? y : 0;
  return (m < 0 ? m : 0) + Math.sqrt(mx * mx + my * my) - r;
}

export function build(P) {
  const Rt = P.tubeDia / 2;
  const test = !!P.testPiece;
  const wrapDeg = test ? P.testWrap : P.wrap;
  const halfWrap = (wrapDeg * Math.PI) / 360;
  // The mouth does not have to sit opposite the pegs. The opening offset swings
  // it round the tube: the wrap total and the pegs stay where they are, one arm
  // grows and the other shrinks. A test slice is all back and no arms, so it
  // ignores the offset entirely.
  const ARM_MIN = (40 * Math.PI) / 180;
  const offWant = test ? 0 : (P.openingOffset * Math.PI) / 180;
  const off = test ? 0 : clamp(offWant, ARM_MIN - halfWrap, halfWrap - ARM_MIN);
  const hA = halfWrap + off, hB = halfWrap - off;   // each arm, from the peg axis
  const sA = Rt * hA, sB = Rt * hB;
  const wall = P.wall;
  const rim = Math.min(P.rimRound, wall * 0.45);
  const kBump = Math.min(P.baseFillet, wall * 0.6);
  const kFoot = P.edgeBlend;
  const cr = P.cornerRound;

  // ---- the curve ---------------------------------------------------------
  // Each arm has its own u, 0 at the peg axis and 1 at that arm's tip. The gap
  // closes to nothing just inside the lip, and the lip then opens outwards, so
  // the closest approach - the contact - lands there on its own rather than
  // being drawn as a pad. Anchoring u on the pegs rather than on the middle of
  // the arc is what keeps the full air gap behind the bumps however far round
  // the mouth is swung.
  const Rin0 = Rt - P.endPreload;          // what the grip closes down to
  const NARC = 48;

  // The lip is walked out from there as a chain of tangent arcs. Both of its
  // numbers say how it bends *against the tube*: the curl is the turn it makes
  // away from the shell's own curve - a quarter turn points it straight out, a
  // half turn rolls it right over into a hook facing back the way it came -
  // and the flare radius is how tight that turn is.
  //
  // Two things about the walk. It goes round the real cross-section and not
  // the unrolled one, because unrolling stretches everything tangentially by
  // r/Rt and a wall stacked up in it comes out as much as a fifth thicker than
  // it was set. Here both faces are offsets of the one curve, so the wall is
  // the wall. And the turn eases in over its first stretch rather than
  // starting at full tightness, so the lip leaves the shell curving exactly as
  // the shell curves. Leaving it tangentially is not enough on its own: a step
  // in the curvature is a crease you can see, however smooth the join is on
  // paper.
  function lipOf(rho, phi) {
    // The run-in, long enough that the curvature arrives at no more than a
    // tenth of a mm-1 per mm travelled - 1.875 is how much steeper than
    // average the ramp gets in the middle. A wide flare barely needs any; a
    // tight one wants a few mm; and none of them get more than the whole lip.
    const ease = Math.min(rho * phi, Math.max(1.875 / (0.1 * rho), 0.8));
    const L = rho * phi + ease / 2;        // easing in costs half its length
    const dt = L / NARC;
    let px = Rin0, py = 0, head = Math.PI / 2;
    const cx = [], cy = [], rr = [], sg = [];
    const jx = [px], jy = [py], tx = [0], ty = [1];
    for (let i = 0; i < NARC; i++) {
      // the tube's own curvature, less the turn the lip is making off it
      let k = 1 / Rin0 - ssstep(((i + 0.5) * dt) / ease) / rho;
      if (Math.abs(k) < 1e-5) k = k < 0 ? -1e-5 : 1e-5;      // dead straight
      const R = 1 / k;
      const ox = px - R * Math.sin(head), oy = py + R * Math.cos(head);
      const dp = k * dt, co = Math.cos(dp), si = Math.sin(dp);
      const vx = px - ox, vy = py - oy;
      px = ox + vx * co - vy * si; py = oy + vx * si + vy * co;
      head += dp;
      cx.push(ox); cy.push(oy); rr.push(Math.abs(R)); sg.push(k > 0 ? 1 : -1);
      jx.push(px); jy.push(py); tx.push(Math.cos(head)); ty.push(Math.sin(head));
    }
    // How far round the tube it got, how far off the tube it stands, and how
    // far out its outer face reaches - which past a quarter turn is no longer
    // the tip. The material is always on the right of the walk, so the outer
    // face is one wall over that way.
    const outR = (i) => len2(jx[i] + wall * ty[i], jy[i] - wall * tx[i]);
    let span = 0, rise = 0, outMax = Rin0 + wall;
    const nodes = [];
    for (let i = 0; i <= NARC; i++) {
      const a = Math.atan2(jy[i], jx[i]), R = len2(jx[i], jy[i]);
      nodes.push([a, R]);
      if (a > span) span = a;
      if (R - Rin0 > rise) rise = R - Rin0;
      if (outR(i) > outMax) outMax = outR(i);
    }
    // How much walk is left at each join, so the square end can be cut where
    // the walk runs out rather than by a plane laid across the whole arm. Past
    // about 150 degrees that plane comes back round far enough to shave the
    // root of the lip it belongs to.
    const rest = jx.map((_, i) => (NARC - i) * dt);
    return { cx, cy, rr, sg, jx, jy, tx, ty, nodes, rise, outMax, rest,
             reach: span * Rt, tipOut: outR(NARC) };
  }

  function armCurve(sEnd, sign) {
    const phi = (P.flareCurl * Math.PI) / 180;
    let rho = P.flareCurl < 0.5 ? 0 : P.flareRadius, held = '', lip = null;
    if (rho > 0) {
      // The wall goes round the inside of the same bend, so the lip cannot
      // turn tighter than the wall is thick and still have an outer face. And
      // the turn has to fit on the arm it is on. The wall wins: a bend it
      // cannot make is not a bend.
      const rhoMin = 1 / (1 / Rin0 + 1 / (wall + 0.4));
      if (rho < rhoMin) { rho = rhoMin; held = 'wall'; }
      lip = lipOf(rho, phi);
      for (let i = 0; i < 12 && lip.reach > 0.9 * sEnd; i++) {
        const want = (rho * (0.9 * sEnd)) / lip.reach;
        held = 'arm';
        if (want <= rhoMin) { rho = rhoMin; held = 'wall'; lip = lipOf(rho, phi); break; }
        rho = want; lip = lipOf(rho, phi);
      }
    }
    const reach = lip ? Math.min(lip.reach, 0.9 * sEnd) : 0;
    const s0 = sEnd - reach;
    const uc = s0 / sEnd;
    const gripFrac = Math.min(P.gripSpan, uc * 0.95);
    // The inner face over the back and the grip, as a function of where you
    // are round the tube. The lip is not one of those - it can double back
    // over itself - so this holds at what the grip closed to and everything
    // out past the lip's start reads the chain instead.
    const at = (u) => Rin0 + (P.airGap + P.endPreload) * ssstep((uc - u) / gripFrac);
    // How fast it is closing, which is how far the wall there leans off radial.
    const slope = (u) => -((P.airGap + P.endPreload) * dssstep((uc - u) / gripFrac)) / gripFrac;
    const bare = { at, slope, rho: 0, phi, held, reach, rise: 0, s0, n: 0, nodes: [],
                   outMax: Rin0 + wall, gapUnder: 0 };
    if (!lip) return bare;
    // Swing the chain round to where the arm ends, mirrored for arm B.
    const th0 = (sign * s0) / Rt, co = Math.cos(th0), si = Math.sin(th0);
    const put = (X, Y) => [X.map((v, i) => v * co - sign * Y[i] * si),
                           Y.map((v, i) => X[i] * si + sign * v * co)];
    const [cx, cy] = put(lip.cx, lip.cy);
    const [jx, jy] = put(lip.jx, lip.jy);
    const [tx, ty] = put(lip.tx, lip.ty);
    return {
      ...bare, rho, rise: lip.rise, n: NARC, outMax: lip.outMax,
      cx, cy, rr: lip.rr, sg: lip.sg, jx, jy, tx, ty, rest: lip.rest,
      nodes: lip.nodes.map(([a, R]) => [s0 / Rt + a, R]),
      gapUnder: lip.tipOut - Rin0 - wall,
    };
  }
  const curveA = armCurve(sA, 1), curveB = armCurve(sB, -1);
  // Inner surface at a signed arc length from the peg axis, over the back and
  // the grip. Past the lip's start it holds at what the grip closed to.
  const RinAt = (s) => (s >= 0 ? curveA.at(s / sA) : curveB.at(-s / sB));

  // ---- where the bumps sit ----------------------------------------------
  const pTipR = Math.max(0.5, P.pusherDia / 2);
  const lTipR = P.locatorDia / 2;
  // The pegs are placed off the gear, never off themselves: centre to centre is
  // the button's radius, the bare metal between the two features, and the
  // hole's radius. Resize a peg to tune its fit and the pegs stay put.
  const sep = P.buttonDia / 2 + P.bumpGap + P.holeDia / 2;
  const dir = P.locatorAbove ? 1 : -1;
  // The gap is measured straight up the tube, and the locator then slides round
  // it on its own. Sideways is sideways: it never pulls the locator down.
  let ps = 0, pz = P.shellHeight / 2 + P.shellOffset;
  let ls = ps + P.bumpAround;
  let lz = pz + dir * sep;

  // Drawn at rest, not mid-push: the pusher tip lands on the button, flush with
  // the outside of the tube, and the locator sits down in its hole. That is the
  // position the curve is drawn in too, so the grip and the pegs agree with
  // each other. Where they end up once you push is the shell's business.
  const pRef = RinAt(ps), lRef = RinAt(ls);
  const pT = pRef - Rt;                                   // bump height, wall face to tip
  const lT = lRef - Rt + P.locatorReach;
  // A peg stays at its own diameter until it is clear of the tube, then flares
  // into the wall. Anything wider that could pass the tube's surface would foul
  // the hole, and a push drives the whole clip in, so both pegs hold their
  // width over the travel and the neck as well as their own depth in the hole.
  const pFS = clamp(pT - P.pusherReach - P.bumpNeck, 0.35, pT - 0.35);
  const lFS = clamp(lT - P.locatorReach - P.pusherReach - P.bumpNeck, 0.35, lT - 0.35);
  const pW0 = pTipR + pFS * P.bumpTaper, pD0 = pTipR + pFS * P.overhangSlope;
  const lW0 = lTipR + lFS * P.bumpTaper, lD0 = lTipR + lFS * P.overhangSlope;
  const pCham = Math.min(P.pegChamfer, pTipR * 0.9), lCham = Math.min(P.pegChamfer, lTipR * 0.9);

  // ---- test piece: a short slice carrying both bumps ---------------------
  let H = P.shellHeight;
  if (test) {
    const lowest = Math.min(pz - pD0, lz - lD0) - P.swellMargin;
    const shift = P.testMargin - lowest;
    pz += shift; lz += shift;
    H = Math.max(pz + pW0, lz + lW0) + P.swellMargin + P.testMargin;
  }

  // ---- lopsided ends, and where the bed ends up --------------------------
  // A peg that has drifted off an edge leaves nothing bearing on the tube at
  // its own height, so pushing the button rocks the clip. The ends grow past
  // the peg to put that material back: upwards off the top edge, and - now the
  // shell is no longer nailed to the bed - downwards off the bottom one. Going
  // down they double as feet. The bed drops to meet them, so the part still
  // prints standing on three points, with the shell's bottom edge in mid air.
  const runFrac = clamp(P.endRun, 0.1, 1);
  const lift = Math.max(0, pz + pTipR + P.endLevel - H);
  const lowPeg = Math.min(pz - pTipR, lz - lTipR);          // lowest peg edge
  const earBot = Math.min(pz - pD0, lz - lD0) - P.swellMargin;
  // Nothing moves while both pegs are still on the shell. Once one hangs below,
  // the ends follow it down, the overshoot easing in over its own length so the
  // part does not jump off the bed the moment a peg crosses the edge.
  const hang = Math.max(0, -lowPeg);
  const drop = hang > 0 ? hang + P.endLevel * sstep(hang / Math.max(P.endLevel, 0.1)) : 0;
  const zFloor = -drop;                                     // the print bed
  // The two arms can be different lengths, so each works its ends out for
  // itself. The descent is given no more run than it has drop, so it stays near
  // 45 degrees or steeper - a bottom edge laid back further than that prints
  // over air - but never less than a few mm, or a shallow drop would land
  // inside the corner rounding and leave no foot at all. It lands short of the
  // end and then keeps plunging past the bed, so the bed cuts a flat foot
  // rather than grazing a tangent.
  function endShape(sEnd) {
    const s0 = sEnd * (1 - runFrac);
    const footLen = Math.min(cr + 1.5, sEnd * 0.15);
    const runMax = Math.max(sEnd - s0 - footLen, 1);
    const run = clamp(drop, Math.min(3, runMax), runMax);
    return { s0, span: sEnd - s0 + 1e-6, run, sBot: sEnd - footLen - run };
  }
  const endA = endShape(sA), endB = endShape(sB);
  const endAt = (s) => (s >= 0 ? endA : endB);
  const zTopAt = lift > 0
    ? (s) => { const e = endAt(s); return H + lift * ssstep((Math.abs(s) - e.s0) / e.span); }
    : () => H;
  const under = rim + cr + 2;
  const zBotAt = drop > 0
    ? (s) => {
        const e = endAt(s);
        const t = ssstep((Math.abs(s) - e.sBot) / e.run);
        return -(drop * t + under * t * t * t * t);
      }
    : () => -under;

  // ---- shell outline, in unrolled (arc length, height) coordinates -------
  // `e` is how far past the end of the arm the point is, which the caller works
  // out: straight across the arm while the shell is flat to the tube, and
  // square across the lip once it has started to arch away.
  function foot(s, z, e) {
    return rint(rint(e, z - zTopAt(s), cr), zBotAt(s) - z, cr);
  }

  // A swelling: the bump's footprint on the wall, grown by the margin, swept
  // back to the nearest point still inside the shell. Inside the outline it
  // changes nothing; past the edge it becomes a rounded ear that stays joined.
  function makePatch(bs, bz, W, D, m) {
    const A = W + m;
    const up = W + m, dn = D + m;
    const cz = bz + (up - dn) / 2;
    const B = (up + dn) / 2;
    const as = clamp(bs, -sB, sA);              // nearest point still on the shell
    const az = clamp(cz, 0, H);
    const dx = (bs - as) / A, dy = (cz - az) / B;
    const L2 = dx * dx + dy * dy;
    const sc = Math.min(A, B);
    // A wider, flatter pad sits at the anchor and is blended in, so an ear
    // leaves the shell edge as a spreading bulge rather than a parallel tab.
    const rootA = A * 1.75, rootB = B * 0.6, rootSc = Math.min(rootA, rootB);
    return (s, z) => {
      const ex = (s - as) / A, ey = (z - az) / B;
      const t = L2 > 1e-12 ? clamp((ex * dx + ey * dy) / L2, 0, 1) : 0;
      const d = (len2(ex - dx * t, ey - dy * t) - 1) * sc;
      const r = (len2((s - as) / rootA, (z - az) / rootB) - 1) * rootSc;
      return smin(d, r, sc * 0.7);
    };
  }
  const patchP = makePatch(ps, pz, pW0, pD0, P.swellMargin);
  const patchL = makePatch(ls, lz, lW0, lD0, P.swellMargin);

  // ---- a bump ------------------------------------------------------------
  // A straight peg at full diameter, chamfered at the tip so it finds its hole,
  // flaring into the wall only once it is clear of the tube. Deliberately
  // lopsided: the underside of the flare runs away at the overhang limit so it
  // prints standing up with nothing under it.
  function makeBump(bs, bz, tipR, T, fs, dish) {
    const bth = bs / Rt;
    const Rref = RinAt(bs);
    const taper = P.bumpTaper, slope = P.overhangSlope;
    // The diameter is measured across the widest point of the chamfer; the
    // chamfer then decides how much flat tip is left beyond it.
    const cham = Math.min(P.pegChamfer, tipR * 0.9);
    const chamL = Math.min(cham / Math.tan((P.chamferAngle * Math.PI) / 180), (T - fs) * 0.9);
    const faceR = tipR - cham;
    const soft = Math.min(0.35, faceR * 0.5, Math.max(0.08, cham * 0.4));
    const chamK = cham > 0.01 ? cham / chamL : 0;   // radius gained per mm back from the tip
    let Cx = 0, Cy = 0, Cz = 0, Rd = 0;
    if (dish > 0.01) {
      const rho = faceR * 0.72;
      Rd = (rho * rho + dish * dish) / (2 * dish);
      const rc = (Rref - T) - (Rd - dish);
      Cx = rc * Math.cos(bth); Cy = rc * Math.sin(bth); Cz = bz;
    }
    return (x, y, z, r, th) => {
      const t = Rref - r;
      const fl = t < fs ? fs - (t < 0 ? 0 : t) : 0;   // 0 anywhere past the flare line
      let W = tipR + fl * taper;
      const dv = z - bz;
      let b = dv >= 0 ? W : tipR + fl * slope;
      if (chamK > 0) {
        const cone = faceR + chamK * (T - t);      // tipR at the chamfer's base, faceR at the tip
        W = smin(W, cone, soft);
        b = smin(b, cone, soft);
      }
      const du = r * (th - bth);
      const e = len2(du / W, dv / b);
      let d = rint((e - 1) * Math.min(W, b), t - T, soft);
      const out = r - Rref;                       // stop at the inner wall face
      if (out > d) d = out;
      if (Rd > 0) {
        const dx = x - Cx, dy = y - Cy, dz = z - Cz;
        d = smax(d, -(Math.sqrt(dx * dx + dy * dy + dz * dz) - Rd), 0.35);
      }
      return d;
    };
  }
  const bumpP = makeBump(ps, pz, pTipR, pT, pFS, P.tipDish);
  const bumpL = makeBump(ls, lz, lTipR, lT, lFS, 0);

  // ---- thumb pad ---------------------------------------------------------
  const padR = P.padSize / 2;
  const padBulge = P.padBulge;
  let TCx = 0, TCy = 0, TCz = 0, TRd = 0;
  if (P.padDish > 0.01) {
    TRd = (padR * padR + P.padDish * P.padDish) / (2 * P.padDish);
    const Rout0 = RinAt(ps) + wall + padBulge;
    const rc = Rout0 + TRd - P.padDish;
    const bth = ps / Rt;
    TCx = rc * Math.cos(bth); TCy = rc * Math.sin(bth); TCz = pz;
  }
  const chamfer = 0.5;

  function sdf(x, y, z) {
    const r = Math.sqrt(x * x + y * y);
    // Unwrap the angle about the middle of the mouth, so the seam always falls
    // in clear air halfway between the two lips. -X stops being that middle as
    // soon as the arms differ, and an arm tip landing on the seam is cut flat.
    let th = Math.atan2(y, x) - off;
    if (th > Math.PI) th -= 2 * Math.PI; else if (th < -Math.PI) th += 2 * Math.PI;
    th += off;
    const s = Rt * th;
    const bulge = padBulge > 0 ? padBulge * ssstep(1 - len2(s - ps, z - pz) / padR) : 0;
    // How far out from the inner face the point is, and how far past the end of
    // the arm. Over the back both are the flat answers - straight out, straight
    // across. Along the lip both come off the chain the lip was walked on, so
    // the wall goes round the bend keeping its thickness rather than being
    // stacked up radially and going thin, and the end is cut square across it.
    const c = s >= 0 ? curveA : curveB;
    const as = s >= 0 ? s : -s;
    let out, past;
    if (c.n > 0 && as > c.s0) {
      // Which arc of the lip the point is beside. The joins are square across
      // the curve, so which side of one a point falls only ever changes once
      // along the chain and a bisection finds it.
      let lo = 1, hi = c.n;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if ((x - c.jx[m]) * c.tx[m] + (y - c.jy[m]) * c.ty[m] > 0) lo = m + 1; else hi = m;
      }
      const k = lo - 1;
      out = c.sg[k] * (len2(x - c.cx[k], y - c.cy[k]) - c.rr[k]);
      // how far along the walk the point is, past where the walk ended
      past = (x - c.jx[lo]) * c.tx[lo] + (y - c.jy[lo]) * c.ty[lo] - c.rest[lo];
    } else {
      // Straight out from the axis - but where the grip is closing, the wall
      // leans off radial and a radial measure would keep its height and lose
      // its thickness. Divide by how steeply it leans and it is square to the
      // face again, which is where it is measured.
      const sE = s >= 0 ? sA : sB, u = as / sE;
      // r floors at the tube: inside it the lean means nothing and would
      // divide the whole shell away as the axis is approached.
      const lean = (Rt * c.slope(u)) / (sE * Math.max(r, Rt));
      out = (r - c.at(u)) / Math.sqrt(1 + lean * lean);
      past = as - sE;
    }
    const band = Math.max(-out, out - (wall + bulge));

    let f = foot(s, z, past);
    f = smin(f, patchP(s, z), kFoot);
    f = smin(f, patchL(s, z), kFoot);

    let d = rint(f, band, rim);
    d = smin(d, bumpP(x, y, z, r, th), kBump);
    d = smin(d, bumpL(x, y, z, r, th), kBump);

    if (TRd > 0) {
      const dx = x - TCx, dy = y - TCy, dz = z - TCz;
      d = smax(d, -(Math.sqrt(dx * dx + dy * dy + dz * dz) - TRd), 0.6);
    }
    // flat base on the bed, with a small chamfer so there is no sharp lip
    const e = zFloor + chamfer - z;
    if (e > 0) d += e;
    const bed = zFloor - z;
    return d > bed ? d : bed;
  }

  // ---- bounds ------------------------------------------------------------
  // The lip's outer face wanders off on a curve of its own, so ask the chain
  // how far out it actually got rather than guessing from the tip.
  const Rmax = Math.max(Rt + P.airGap + wall, curveA.outMax, curveB.outMax) + padBulge + rim + 1;
  // The arc the shell sweeps is no longer symmetric, so take its box from both
  // ends plus every quarter turn that falls between them.
  const aLo = -hB - 0.2, aHi = hA + 0.2;
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  const see = (x, y) => {
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x);
    by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  };
  const reach = (a) => see(Rmax * Math.cos(a), Rmax * Math.sin(a));
  reach(aLo); reach(aHi);
  for (let k = -4; k <= 4; k++) {
    const a = (k * Math.PI) / 2;
    if (a > aLo && a < aHi) reach(a);
  }
  // the peg tips reach inside the tube, wherever round it they have ended up
  for (const [bs, deep] of [[ps, 0], [ls, P.locatorReach]])
    see((Rt - deep) * Math.cos(bs / Rt), (Rt - deep) * Math.sin(bs / Rt));
  const zTopMax = Math.max(
    H + lift,
    pz + pW0 + P.swellMargin + kFoot,
    lz + lW0 + P.swellMargin + kFoot,
  ) + 1.5;
  const bounds = [bx0 - 1.5, by0 - 1.5, zFloor - 1.0, bx1 + 1.5, by1 + 1.5, zTopMax];

  // ---- what the numbers came out as -------------------------------------
  // How far an arm's lip hooks past the tube: pull the clip off through its own
  // mouth and this is how far that arm has to spread to let the tube out. Zero
  // means it does not hook at all and the clip can be levered off that side.
  // A generous flare works against it (the lip curls away from the tube), so
  // this is measured off the curve rather than read off the wrap angle.
  //
  // The tube leaves the way it came in, straight out through the middle of the
  // mouth, and the opening offset is exactly what swings that off the peg axis.
  // Measured against the pegs instead, the same C read as two different clips
  // depending on which way round it was turned (one arm short of the tube's
  // widest point and the other far past it) when swinging the mouth costs no
  // retention at all. So the angle here is taken from the middle of the mouth,
  // the way the seam in the field already is.
  // The inner face of an arm walked as a curve - the grip in arc length, then
  // the lip round its own centre - handing out (angle from the peg axis,
  // radius). Past a quarter turn the lip is no longer a function of where you
  // are round the tube, so anything that has to see the real surface walks this
  // rather than asking RinAt.
  function innerWalk(c, sEnd, fn) {
    for (let i = 0; i <= 240; i++) {
      const s = (c.s0 * i) / 240;
      fn(s / Rt, c.at(s / sEnd));
    }
    for (const [a, R] of c.nodes) fn(a, R);
  }
  // `sign` is which side of the tube the arm is on, so its angle from the pegs
  // can be turned into one from the middle of the mouth. Both arms then run out
  // to the same half-wrap, which is what they do on the tube.
  function hookOf(c, sEnd, sign) {
    let best = -1e9, any = false;
    innerWalk(c, sEnd, (a, R) => {
      const am = a - sign * off;
      if (am < Math.PI / 2) return;
      any = true;
      const y = R * Math.sin(am);
      if (Rt - y > best) best = Rt - y;
    });
    return any ? best : -1;
  }
  const hookA = hookOf(curveA, sA, 1), hookB = hookOf(curveB, sB, -1);
  const degOf = (h) => ((h * 180) / Math.PI).toFixed(0);
  const mmOf = (k) => Math.max(k, 0).toFixed(1);

  // What each peg leaves itself in the feature it enters, per side.
  const pFit = (P.buttonDia - P.pusherDia) / 2, lFit = (P.holeDia - P.locatorDia) / 2;

  const warn = [], note = [];
  if (P.airGap <= P.pusherReach)
    warn.push(`Air gap (${P.airGap} mm) is not more than the pusher reach (${P.pusherReach} mm): the shell hits the tube before the button is down.`);
  else if (P.airGap < P.pusherReach + 0.5)
    note.push('Only just enough air behind the bumps for a full push.');
  const hookLow = Math.min(hookA, hookB);
  if (!test && hookLow < 0.3)
    warn.push(Math.max(hookA, hookB) < 0.3
      ? `Neither arm hooks past the tube: the wrap reaches only ${degOf(halfWrap)}° each side of the mouth, catching ${mmOf(hookA)} and ${mmOf(hookB)} mm. That is friction, not geometry, holding the clip on, and the button can push it off. Wrap further round.`
      : `One arm hooks only ${mmOf(hookLow)} mm past the tube against the other's ${mmOf(Math.max(hookA, hookB))} mm, so pressing the button can lever the clip off that side. Its lip has had to give up curl to fit on the arm, so wind the wrap up, or take the flare radius down so both arms can carry the same turn.`);
  else if (!test && hookLow < 1)
    note.push(`Each arm hooks only ${mmOf(hookLow)} mm past the tube. It will hold, but there is not much in it, so wrap further round if the button can lever it off.`);
  if (Math.abs(off - offWant) > 1e-9)
    note.push(`Opening offset held to ${degOf(off)}° by the wrap: any further and an arm would be shorter than 40°.`);
  // A push drives the whole clip in, so the locator needs air behind it as well
  // as the pusher. A locator slid far round can end up out on a closing arm.
  const lGap = lRef - Rt;
  if (lGap < P.pusherReach - 1e-9)
    warn.push(`The locator sits where the shell has already closed to ${lGap.toFixed(2)} mm off the tube, less than the ${P.pusherReach} mm push, so the shell bottoms out beside it before the button is down. Bring it back round the tube, wrap further, or widen the air gap.`);
  else if (lGap < P.airGap - 0.05)
    note.push(`The locator sits where the gap has closed to ${lGap.toFixed(2)} mm, against ${P.airGap.toFixed(1)} mm behind the pusher.`);
  if (drop > 0 && earBot > zFloor + 0.05)
    warn.push(`The tall-end overshoot puts the bed ${(earBot - zFloor).toFixed(1)} mm below the lowest swelling, so the swelling hangs in air. Shorten the overshoot, or give the swelling more margin.`);
  if (drop > 0.6)
    note.push(`A peg reaches down to ${lowPeg.toFixed(1)} mm, past the bottom edge, so the ends grew ${drop.toFixed(1)} mm down to stand level with it. The bottom edge between them floats ${drop.toFixed(1)} mm off the bed and prints as a short bridge.`);
  else if (drop > 0)
    warn.push(`A peg is a hair past the bottom edge, so the shell now floats ${drop.toFixed(2)} mm off the bed, less than a layer, and awkward to print. Nudge the shell offset either way.`);
  if (lift > 0)
    note.push(`The pusher reaches to ${(pz + pTipR).toFixed(1)} mm, past the ${H.toFixed(1)} mm top edge, so the ends grew ${lift.toFixed(1)} mm taller on that side to keep the clip standing square.`);
  if (pz + pW0 + P.swellMargin > H && lift === 0)
    note.push('The pusher swelling reaches the top edge and is bulging it out.');
  if (lz + lW0 + P.swellMargin > H)
    note.push('The locator is out past the top edge on a rounded ear.');
  if (drop > 0 && pz - pD0 - P.swellMargin < 0)
    note.push('The pusher is out below the bottom edge on a rounded ear.');
  if (drop > 0 && lz - lD0 - P.swellMargin < 0)
    note.push('The locator is out below the bottom edge on a rounded ear.');
  if (drop === 0 && Math.min(pz - pD0, lz - lD0) - P.swellMargin < 0)
    note.push('A swelling runs past the bottom edge; the bed cuts it flat into a wider foot.');
  if (pFit <= 0)
    warn.push(`The pusher peg is \u2300${P.pusherDia} against a \u2300${P.buttonDia} button, so it lands on the rim of the hole rather than following the button down. Take it under the button's diameter.`);
  else if (pFit < 0.1)
    note.push(`Only ${pFit.toFixed(2)} mm a side between the pusher and the button, so it will bind if either is out by a layer.`);
  if (lFit <= 0)
    warn.push(`The locator peg is \u2300${P.locatorDia} and the hole is \u2300${P.holeDia}: it will not go in.`);
  else if (lFit < 0.15)
    note.push(`Only ${lFit.toFixed(2)} mm a side between the locator and its hole: tight for cold, wet hands.`);
  if (P.locatorDia >= P.pusherDia)
    note.push('The locator peg is not smaller than the pusher: check that is what you meant.');
  if (lTipR - lCham < 0.5 || pTipR - pCham < 0.5)
    note.push('The chamfer leaves almost no flat tip. The peg will still find its hole but will locate loosely.');
  if (lCham < P.pegChamfer - 1e-9)
    note.push(`Chamfer held down to ${lCham.toFixed(2)} mm on the locator by its diameter, leaving a ${((lTipR - lCham) * 2).toFixed(1)} mm tip.`);
  // How wide each peg is where it crosses into its hole at full push.
  const wideAt = (fs, tipR, clear) => {
    const fl = Math.max(0, fs - Math.max(clear, 0));
    return tipR + fl * Math.max(P.bumpTaper, P.overhangSlope);
  };
  const pushW = wideAt(pFS, pTipR, pT - P.pusherReach);
  const lPushW = wideAt(lFS, lTipR, lT - P.locatorReach - P.pusherReach);
  if (pushW > P.buttonDia / 2 + 1e-9)
    warn.push(`At full push the pusher is \u2300${(pushW * 2).toFixed(1)} where it crosses into the \u2300${P.buttonDia} hole, so its base catches the rim. Widen the air gap, shorten the reach, or thin the neck.`);
  if (lPushW > P.holeDia / 2 + 1e-9)
    warn.push(`At full push the locator is \u2300${(lPushW * 2).toFixed(1)} where it crosses into the \u2300${P.holeDia} hole, so its base catches the rim. Shorten the pusher reach or the locator reach, or thin the neck.`);
  if (kBump < P.baseFillet - 1e-9)
    note.push(`Bump fillet held down to ${kBump.toFixed(1)} mm by the wall thickness.`);
  const gapUnder = curveA.gapUnder;
  if (curveA.held === 'wall')
    note.push(`Flare radius held to ${curveA.rho.toFixed(1)} mm: a ${wall.toFixed(1)} mm wall cannot turn tighter than that and keep an outer face.`);
  else if (curveA.held === 'arm')
    note.push(`Flare radius held to ${curveA.rho.toFixed(1)} mm, which is as much of the arm as the curl can have.`);
  if (curveA.rho > 0 && curveA.phi > Math.PI / 2 && gapUnder < 1.2)
    note.push(`The lip has curled back to ${gapUnder.toFixed(1)} mm off the shell behind it. A slot that narrow will not print open, so widen the flare radius if you want to see through it.`);

  return {
    sdf,
    bounds,
    info: {
      Rt, H, wrapDeg, lift, drop, zFloor, sA, sB,
      offset: (off * 180) / Math.PI, offArc: off * Rt,
      pusherFit: pFit, locatorFit: lFit,
      armA: (hA * 180) / Math.PI, armB: (hB * 180) / Math.PI, hookA, hookB,
      pusher: { s: ps, z: pz, tipR: pTipR, T: pT, tipAt: pRef - pT, base: pW0, drop: pD0, reach: P.pusherReach, peg: pT - pFS, cham: pCham, face: pTipR - pCham },
      locator: { s: ls, z: lz, tipR: lTipR, T: lT, tipAt: lRef - lT, base: lW0, drop: lD0, reach: P.locatorReach, peg: lT - lFS, cham: lCham, face: lTipR - lCham },
      separation: sep, around: P.bumpAround,
      arch: { curl: (curveA.phi * 180) / Math.PI, rhoA: curveA.rho, rhoB: curveB.rho,
              rise: curveA.rise, reach: curveA.reach, gapUnder,
              // where arm A's lip ends up, for anything that wants to measure it
              tip: curveA.n ? [curveA.jx[curveA.n], curveA.jy[curveA.n]] : null },
      overallHeight: zTopMax - 1.5 - zFloor,
      outerRadius: Rt + P.airGap + wall + padBulge,
      warn, note,
    },
  };
}
