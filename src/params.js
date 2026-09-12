// Every number that shapes the clip. The UI is generated from this list, so
// adding a knob here is all it takes to expose it.

export const GROUPS = [
  { id: 'tube',  label: 'Extension tube',     open: true,
    note: 'The tube the clip goes on. Only the diameter reaches the model: the rest is how the preview draws it.' },
  { id: 'gear',  label: 'Fit to your gear',   open: true,
    note: 'What you measure off the extension you own, and the peg that goes into each. The two are set apart so you can tune the fit without moving anything else.' },
  { id: 'shell', label: 'Shell',              open: true,
    note: 'Size and stiffness of the body.' },
  { id: 'curve', label: 'Curve &amp; ends',       open: false,
    note: 'How the shell hugs the tube, and how the ends behave.' },
  { id: 'bump',  label: 'Bumps &amp; supports',   open: false,
    note: 'Bump shape, the swellings that carry them, print-safe undersides.' },
  { id: 'thumb', label: 'Thumb pad',          open: false, note: '' },
  { id: 'test',  label: 'Test piece',         open: false,
    note: 'A short slice of the same shell carrying both bumps.' },
];

/** @type {{key:string,label:string,unit:string,min:number,max:number,step:number,def:number,group:string,help:string}[]} */
export const PARAMS = [
  // ---- the tube ---------------------------------------------------------
  { key:'tubeDia', label:'Tube diameter', unit:'mm', min:25, max:75, step:0.5, def:48, group:'tube',
    help:'Outside diameter of the mast extension tube. The clip is built around this one: everything else in this group is preview only.' },
  { key:'tubeWall', label:'Tube wall', unit:'mm', min:0.5, max:8, step:0.1, def:2, group:'tube', view:true,
    help:'Drawn thickness of the tube. The clip only ever touches the outside, so this changes nothing about the part.' },
  { key:'tubeShown', label:'Tube shown', unit:'°', min:60, max:360, step:5, def:360, group:'tube', view:true,
    help:'360° is a whole tube. Wind it down and the wedge comes out of the front, the side the clip opens onto, so you can look straight through into the tube and at the back of the button and the hole.' },
  { key:'tubeAlpha', label:'Tube opacity', unit:'%', min:5, max:100, step:5, def:42, group:'tube', view:true,
    help:'How see-through the tube is when the toolbar has it set to see-through. Turn it down to look at the pegs and the button through the tube; up to judge how the clip sits against it.' },

  // ---- fit to your gear -------------------------------------------------
  { key:'buttonDia', label:'Button diameter', unit:'mm', min:3, max:18, step:0.25, def:8, group:'gear',
    help:'Across the metal button, and so across the hole it sits in. Measured off the gear: it places the pegs and draws the hole in the preview, and never sets the size of a peg.' },
  { key:'pusherDia', label:'Pusher peg diameter', unit:'mm', min:1, max:18, step:0.1, def:7.4, group:'gear',
    help:'Across the widest point of the peg\u2019s chamfer. Narrower than the button, so the tip follows the button down into its hole instead of catching the rim, and the readout gives the clearance that leaves.' },
  { key:'pusherReach', label:'Pusher reach', unit:'mm', min:0.5, max:8, step:0.1, def:3, group:'gear',
    help:'How far the tip has to travel past the outside of the tube to send the button all the way down. The clip is drawn at rest, tip on the button, so this is the flex you get out of a push, and it has to be less than the air gap or the shell bottoms out on the tube first. It also sets how much of the peg is kept straight, so the base cannot foul the hole at full push.' },
  { key:'holeDia', label:'Locator hole diameter', unit:'mm', min:2, max:18, step:0.25, def:6, group:'gear',
    help:'Across the hole the locator drops into. Measured off the gear, the same way as the button: it places the pegs and draws the hole, and never sets the size of the peg.' },
  { key:'locatorDia', label:'Locator peg diameter', unit:'mm', min:1.5, max:12, step:0.25, def:4.5, group:'gear',
    help:'Across the widest point of its chamfer. A comfortable bit narrower than the hole above, so it goes in first time with cold, wet, sandy hands.' },
  { key:'locatorReach', label:'Locator reach', unit:'mm', min:0.3, max:6, step:0.1, def:2, group:'gear',
    help:'How far it drops into the hole. Shallow, so a firm pull lifts it back out.' },
  { key:'bumpGap', label:'Bare metal between them', unit:'mm', min:0, max:45, step:0.5, def:10, group:'gear',
    help:'Edge of the button to edge of the locator hole, straight up the tube: the bare stretch of metal you can put a ruler on. The pegs are placed from this and the two feature diameters, so resizing a peg never moves them.' },
  { key:'locatorAbove', label:'Locator above the pusher', unit:'', min:0, max:1, step:1, def:1, group:'gear', bool:true,
    help:'Off puts the locator below the pusher instead.' },
  { key:'bumpAround', label:'Locator round the tube', unit:'mm', min:-30, max:30, step:0.5, def:0, group:'gear',
    help:'How far round the tube the locator hole sits from the button, measured along the surface. 0 puts the two one above the other. This slides it sideways and nothing else: the gap above stays exactly what you set it to, so you can measure the two off your gear one at a time.' },

  // ---- shell ------------------------------------------------------------
  { key:'airGap', label:'Air gap at the back', unit:'mm', min:1, max:9, step:0.1, def:3.5, group:'shell',
    help:'Standoff between shell and tube behind the bumps. Must be more than the pusher reach, or the shell bottoms out before the button does.' },
  { key:'wall', label:'Wall thickness', unit:'mm', min:1.2, max:6, step:0.1, def:2.8, group:'shell',
    help:'The main dial for push feel. Print two or three and pick by hand.' },
  { key:'wrap', label:'Wrap around tube', unit:'°', min:170, max:330, step:1, def:250, group:'shell',
    help:'Comfortably past 180° so geometry, not friction, holds it on.' },
  { key:'openingOffset', label:'Opening offset', unit:'°', min:-60, max:60, step:1, def:0, group:'shell',
    help:'Swings the mouth of the clip round the tube, so the lips are no longer exactly opposite the pegs. The wrap total and the pegs stay put: one arm grows, the other shrinks. It costs no grip: the section is the same C whichever way round it is turned, so both lips go on hooking exactly as far as the wrap says. What it does cost is room: an arm is not allowed below 40°.' },
  { key:'shellHeight', label:'Shell height', unit:'mm', min:8, max:70, step:0.5, def:25, group:'shell',
    help:'Set independently. It never moves on its own: swellings and ears grow instead.' },
  { key:'shellOffset', label:'Shell offset', unit:'mm', min:-40, max:40, step:0.5, def:0.5, group:'shell',
    help:'Slides the shell along the tube relative to the pegs. 0 puts the pusher level with the middle of the shell; positive drops the shell, leaving more of it below the pusher. Far enough the other way and a peg hangs below the bottom edge on an ear of its own, and the print bed drops to meet it.' },
  { key:'flareCurl', label:'Flare curl', unit:'°', min:0, max:180, step:1, def:22, group:'shell',
    help:'How far the lips at the two ends turn away from the tube, so it pushes on by hand. Measured against the shell’s own curve: 90° has the lip pointing straight out, 180° has it rolled right over into a hook facing back the way it came, and 0 leaves the ends following the tube to the tip.' },
  { key:'flareRadius', label:'Flare radius', unit:'mm', min:1, max:40, step:0.5, def:24.5, group:'shell',
    help:'How tight that turn is: small and abrupt, or wide and gentle. The curl above decides the shape, this decides the size. The turn eases in rather than starting at full tightness, so the lip grows out of the shell with no seam and takes a little more of the arm than the bare radius would; the readout gives back how far it ends up standing off the tube.' },

  // ---- curve & ends -----------------------------------------------------
  { key:'gripSpan', label:'Hug transition', unit:'×', min:0.1, max:1, step:0.01, def:0.45, group:'curve',
    help:'Fraction of the half-wrap over which the gap closes from full to nothing. Bigger = more gradual.' },
  { key:'endPreload', label:'End preload', unit:'mm', min:-0.4, max:1, step:0.05, def:0, group:'curve',
    help:'Interference at the ends. Keep near zero: a hard grip will creep and go slack over a season.' },
  { key:'endRun', label:'Grown-end run', unit:'×', min:0.15, max:1, step:0.05, def:0.55, group:'curve',
    help:'How far round from each end the grown strip reaches before tapering back to normal height. A downward one takes only as much run as it has drop, so the descending edge stays steep enough to print.' },
  { key:'endLevel', label:'Grown-end overshoot', unit:'mm', min:0, max:8, step:0.1, def:1.5, group:'curve',
    help:'How far past a peg the grown ends reach when it drifts off an edge of the shell. Downwards this also sets the clearance left under the peg at the print bed.' },
  { key:'cornerRound', label:'Corner rounding', unit:'mm', min:0.2, max:6, step:0.1, def:2, group:'curve',
    help:'Rounding of the shell outline where an end edge meets the top edge.' },
  { key:'rimRound', label:'Rim rounding', unit:'mm', min:0, max:2.5, step:0.05, def:1.1, group:'curve',
    help:'Bullnose on every free edge. Capped at just under half the wall.' },

  // ---- bumps & supports -------------------------------------------------
  { key:'bumpNeck', label:'Peg neck', unit:'mm', min:0, max:3, step:0.1, def:0.6, group:'bump',
    help:'Clear air left between the tube and the start of a peg\u2019s flare at full push. The peg holds its own diameter over its depth in the hole, the push travel and this, so nothing wider than the peg can ever reach the rim.' },
  { key:'pegChamfer', label:'Peg tip chamfer', unit:'mm', min:0, max:3, step:0.05, def:1, group:'bump',
    help:'Lead-in chamfer at the end of each peg. The diameters above are measured across the widest point of the chamfer, so this is what sets the flat tip beyond it: tip = diameter − 2 × chamfer.' },
  { key:'chamferAngle', label:'Chamfer angle', unit:'°', min:20, max:75, step:1, def:45, group:'bump',
    help:'From the peg axis. 45° is a plain chamfer and is the shallowest that stays self-supporting; smaller gives a longer, more pointed lead-in.' },
  { key:'bumpTaper', label:'Bump side taper', unit:'×', min:0.05, max:1.2, step:0.05, def:0.35, group:'bump',
    help:'How much wider the bump gets at its base, sideways and upwards.' },
  { key:'overhangSlope', label:'Underside slope', unit:'×', min:0.4, max:2, step:0.05, def:1, group:'bump',
    help:'Rise per mm of reach on the underside of a bump. 1.0 = 45°, the support-free limit.' },
  { key:'swellMargin', label:'Swelling margin', unit:'mm', min:0.5, max:8, step:0.1, def:2.2, group:'bump',
    help:'Solid material carried around each bump base before the shell edge is allowed to end.' },
  { key:'baseFillet', label:'Bump base fillet', unit:'mm', min:0.2, max:5, step:0.1, def:1.6, group:'bump',
    help:'Blend where a bump meets the wall.' },
  { key:'edgeBlend', label:'Swelling blend', unit:'mm', min:0.3, max:8, step:0.1, def:2.5, group:'bump',
    help:'How softly a swelling or ear melts into the shell outline.' },
  { key:'tipDish', label:'Pusher tip dish', unit:'mm', min:0, max:2, step:0.05, def:0.6, group:'bump',
    help:'Shallow cup in the pusher tip so it sits on the button instead of sliding off it.' },

  // ---- thumb pad --------------------------------------------------------
  { key:'padSize', label:'Pad width', unit:'mm', min:8, max:34, step:0.5, def:18, group:'thumb',
    help:'Across the dished area on the outside, behind the pusher.' },
  { key:'padDish', label:'Pad dish depth', unit:'mm', min:0, max:2.5, step:0.05, def:0.7, group:'thumb', help:'' },
  { key:'padBulge', label:'Pad bulge', unit:'mm', min:0, max:2, step:0.05, def:0.45, group:'thumb',
    help:'Local swell of the outer wall under the pad, so dishing it does not thin the wall where the load is.' },

  // ---- test piece -------------------------------------------------------
  { key:'testPiece', label:'Test piece', unit:'', min:0, max:1, step:1, def:0, group:'test', bool:true,
    help:'Short slice of the same shell carrying both bumps. Overrides wrap and shell height.' },
  { key:'testWrap', label:'Test piece wrap', unit:'°', min:40, max:200, step:5, def:110, group:'test', help:'' },
  { key:'testMargin', label:'Test piece margin', unit:'mm', min:0.5, max:10, step:0.5, def:2.5, group:'test',
    help:'Material kept beyond the bump swellings at each end of the slice.' },
];

export const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p.key, p.def]));

export function sanitise(p) {
  // The pegs used to be sized off the features: the pusher as the button less a
  // clearance, and the locator hole had no number of its own at all: the tube
  // was drawn with the hole the same size as the peg. Old settings keep their
  // peg diameters and gain a hole to match.
  if (p && Number.isFinite(Number(p.tipClear)) && !Number.isFinite(Number(p.pusherDia))) {
    const b = Number(p.buttonDia);
    p = { ...p, pusherDia: (Number.isFinite(b) ? b : DEFAULTS.buttonDia) - 2 * Number(p.tipClear) };
  }
  if (p && Number.isFinite(Number(p.locatorDia)) && !Number.isFinite(Number(p.holeDia)))
    p = { ...p, holeDia: Number(p.locatorDia) + 1.5 };
  // buttonZ was the height of the pusher above the bottom edge; the shell is
  // now placed relative to the pegs instead. Old settings still load.
  if (p && Number.isFinite(Number(p.buttonZ))) {
    const h = Number(p.shellHeight);
    p = { ...p, shellOffset: Number(p.buttonZ) - (Number.isFinite(h) ? h : DEFAULTS.shellHeight) / 2 };
  }
  // The lip's arch used to be dialled as a rise over a span, which made the curl
  // the ratio between them and stopped it at a quarter turn. It is a radius and
  // a turn now. An old pair lands on exactly the same arc: an arch tangent at
  // one end and `flare` high after `span` of surface turns 2·atan(rise/run).
  if (p && Number.isFinite(Number(p.flareSpan)) && !Number.isFinite(Number(p.flareCurl))) {
    const A = Number.isFinite(Number(p.flare)) ? Number(p.flare) : 1.8;   // the old default
    const R = (Number.isFinite(Number(p.tubeDia)) ? Number(p.tubeDia) : DEFAULTS.tubeDia) / 2;
    const L = ((Number(p.flareSpan) * Math.PI) / 180) * R;
    p = A > 1e-6 && L > 1e-6
      ? { ...p, flareCurl: (2 * Math.atan2(A, L) * 180) / Math.PI,
                flareRadius: (L * L + A * A) / (2 * A) }
      : { ...p, flareCurl: 0, flareRadius: DEFAULTS.flareRadius };
  }
  // bumpTilt swung the locator round the pusher on a fixed centre distance, so
  // sliding it sideways pulled it down the tube as well. It is a plain offset
  // round the tube now, with the gap staying vertical. Split an old tilt into
  // the two, which leaves the locator exactly where it was.
  if (p && Number.isFinite(Number(p.bumpTilt)) && !Number.isFinite(Number(p.bumpAround))) {
    const num = (k) => (Number.isFinite(Number(p[k])) ? Number(p[k]) : DEFAULTS[k]);
    const ends = num('buttonDia') / 2 + num('holeDia') / 2;
    const d = ends + num('bumpGap'), t = (Number(p.bumpTilt) * Math.PI) / 180;
    p = { ...p, bumpAround: (num('locatorAbove') ? 1 : -1) * d * Math.sin(t),
          bumpGap: d * Math.cos(t) - ends };
  }
  const out = { ...DEFAULTS };
  for (const d of PARAMS) {
    const v = Number(p?.[d.key]);
    if (Number.isFinite(v)) out[d.key] = d.bool ? (v ? 1 : 0) : Math.min(d.max, Math.max(d.min, v));
  }
  return out;
}
