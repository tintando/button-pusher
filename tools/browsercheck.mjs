// Drives the real page in headless Chrome over the DevTools protocol:
// waits for the first mesh, pokes a few parameters, and reports anything the
// console complains about. Screenshots land in out/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.env.URL || 'http://localhost:8173/';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-chrome-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-sandbox',
  '--no-first-run', '--disable-extensions', '--mute-audio',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  '--window-size=1500,940', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 60; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
    catch { await sleep(250); }
  }
  throw new Error('chrome did not come up');
}
const page = (await targets()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let msgId = 0;
const waiting = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  else if (m.method) events.push(m);
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId;
  waiting.set(id, (m) => res(m.result ?? m.error));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL_ });
await sleep(1200);

async function waitFor(expr, label, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(expr)) return Date.now() - t0;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

fs.mkdirSync('out', { recursive: true });
const shoot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`out/${name}.png`, Buffer.from(s.data, 'base64'));
};

const ok = [];
ok.push(`first mesh in ${await waitFor("/triangles/.test(document.getElementById('status').textContent)", 'first mesh')} ms`);
ok.push('status: ' + await evaluate("document.getElementById('status').textContent"));
ok.push('triangles in scene: ' + await evaluate(
  "(()=>{let n=0;for(const o of window.__scene?.children||[]){}return document.querySelector('#status').textContent})()"));

// poke a parameter the way a user would and confirm it rebuilds
async function setParam(key, value) {
  await evaluate(`(()=>{const r=document.querySelector('#n_${key}');r.value=${value};r.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
  await sleep(150);
  await waitFor("!/building/.test(document.getElementById('status').textContent)", `rebuild after ${key}`);
  return await evaluate("document.getElementById('status').textContent");
}
for (const [k, v] of [['shellOffset', 14], ['shellOffset', -8], ['shellOffset', -18], ['pegChamfer', 2],
                      ['chamferAngle', 28], ['bumpGap', 22], ['bumpAround', 14], ['bumpAround', 0],
                      ['wrap', 300], ['wall', 2.0], ['shellHeight', 14]])
  ok.push(`${k}=${v} -> ${await setParam(k, v)}`);
ok.push('messages: ' + await evaluate("[...document.querySelectorAll('.msg')].map(e=>e.className+': '+e.textContent).join(' | ')"));
ok.push('readout: ' + await evaluate("[...document.querySelectorAll('#readout>*')].map(e=>e.textContent).join(' / ')"));
await evaluate("document.querySelector('#readoutBox summary').click()");
await sleep(200);
ok.push('readout collapse: ' + await evaluate(
  "JSON.stringify({open:document.getElementById('readoutBox').open,"
  + "vis:document.getElementById('readout').offsetParent!==null,"
  + "h:document.getElementById('readout').getBoundingClientRect().height,"
  + "msgsVisible:[...document.querySelectorAll('.msg')].filter(e=>e.offsetParent!==null).length,"
  + "badge:document.getElementById('msgCount').textContent,"
  + "stored:localStorage.getItem('button-pusher/readout-open'),"
  + "closedGroupLeaks:[...document.querySelectorAll('#controls details:not([open]) .p')]"
  + ".filter(e=>e.offsetParent!==null).length})"));
await shoot('page-readout-closed');
await evaluate("document.querySelector('#readoutBox summary').click()");

const setSel = (id, v) => evaluate(
  `(()=>{const s=document.getElementById('${id}');s.value='${v}';`
  + `s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()`);

// the tube controls are preview only: they must not re-mesh anything
{
  const before = await evaluate("document.getElementById('status').textContent");
  for (const [k, v] of [['tubeShown', 280], ['tubeWall', 3.5], ['tubeAlpha', 85]]) await setParam(k, v);
  const after = await evaluate("document.getElementById('status').textContent");
  ok.push(`tube view params: ${before === after ? 'no re-mesh' : 'RE-MESHED ' + before + ' -> ' + after}`);
  await shoot('page-tube');
  const modes = [];
  for (const v of ['solid', 'see', 'off', 'see']) modes.push(await setSel('tubeMode', v));
  for (let i = 0; i < 2; i++) {
    await evaluate("document.getElementById('showGear').click()");
    modes.push(await evaluate("document.getElementById('showGear').checked"));
  }
  ok.push('display modes: ' + modes.join(','));
  // the gear features are holes in the tube now: nothing should be at their
  // centres, and the nearest tube vertex should sit on the rim
  ok.push('holes in the tube: ' + await evaluate(`(()=>{
    const p = __preview.tube.geometry.getAttribute('position');
    const sp = __preview.span();
    return sp.holes.map((h) => {
      const t = h.u / sp.R, cx = sp.R * Math.cos(t), cy = sp.R * Math.sin(t);
      let near = 1e9;
      for (let i = 0; i < p.count; i++)
        near = Math.min(near, Math.hypot(p.getX(i) - cx, p.getY(i) - cy, p.getZ(i) - h.v));
      return near.toFixed(2) + '/' + h.r.toFixed(2);
    }).join(' ');
  })()`));
  await setSel('tubeMode', 'solid');
  await shoot('page-tube-solid');
  // the clip covers the features, so take a look at the tube on its own
  await evaluate("__preview.clipMesh.visible = false");
  await sleep(300);
  await shoot('page-tube-holes');
  await evaluate("__preview.clipMesh.visible = true");
  await setSel('tubeMode', 'see');
  await evaluate("document.getElementById('section').click()");
  await sleep(400);
  await shoot('page-tube-cut');
  await evaluate("document.getElementById('section').click()");
  await setParam('tubeAlpha', 42);
}

// swinging the opening off the peg axis: the arms go lopsided and the tube's
// missing wedge follows the mouth round
{
  for (const [k, v] of [['shellHeight', 25], ['shellOffset', 0.5], ['wrap', 300]])
    await setParam(k, v);
  const before = await evaluate("(()=>{const p=__preview.tube.geometry.getAttribute('position');"
    + "let lo=9,hi=-9;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getY(i),p.getX(i));"
    + "if(a<lo)lo=a;if(a>hi)hi=a;}return Math.round((lo+hi)/2*180/Math.PI)})()");
  ok.push(`opening offset -> ${await setParam('openingOffset', 25)}`);
  const after = await evaluate("(()=>{const p=__preview.tube.geometry.getAttribute('position');"
    + "let lo=9,hi=-9;for(let i=0;i<p.count;i++){const a=Math.atan2(p.getY(i),p.getX(i));"
    + "if(a<lo)lo=a;if(a>hi)hi=a;}return Math.round((lo+hi)/2*180/Math.PI)})()");
  ok.push(`tube arc centre: ${before}deg -> ${after}deg (want 0 -> 25)`);
  ok.push('offset readout: ' + await evaluate(
    "[...document.querySelectorAll('#readout>*')].map(e=>e.textContent).join(' / ')"
    + ".replace(/^.*Arms from/,'Arms from').replace(/Volume.*$/,'')"));
  await shoot('page-offset');
  for (const [k, v] of [['openingOffset', 0], ['wrap', 250]]) await setParam(k, v);
}

// the lip's curl, all the way over, and the wall that goes round it
{
  const curlRow = () => evaluate(
    "[...document.querySelectorAll('#readout>*')].map(e=>e.textContent).join(' / ')"
    + ".replace(/^.*Lip curl/,'Lip curl').replace(/Ends grown.*$/,'')");
  ok.push('curl as it comes: ' + await curlRow());
  for (const [k, v] of [['flareRadius', 5], ['flareCurl', 90]])
    ok.push(`${k}=${v} -> ${await setParam(k, v)}`);
  ok.push('quarter turn: ' + await curlRow());
  ok.push(`flareCurl=180 -> ${await setParam('flareCurl', 180)}`);
  ok.push('hooked right over: ' + await curlRow());
  await shoot('page-curl');
  await setParam('flareRadius', 1);
  ok.push('radius the wall cannot make: ' + await curlRow());
  ok.push('curl messages: ' + await evaluate(
    "[...document.querySelectorAll('.msg')].map(e=>e.textContent).filter(t=>/Flare radius|curled/.test(t)).join(' | ')"));
  for (const [k, v] of [['flareCurl', 22], ['flareRadius', 24.5]]) await setParam(k, v);
}

// a peg hanging below the shell: the bed drops with the grown ends
for (const [k, v] of [['shellHeight', 25], ['wrap', 250], ['wall', 2.8], ['shellOffset', -18]])
  await setParam(k, v);
await sleep(400);
await shoot('page-hanging');
ok.push('hanging: ' + await evaluate(
  "[...document.querySelectorAll('#readout>*')].map(e=>e.textContent).join(' / ').replace(/^.*Ends grown/,'Ends grown')"));

await evaluate("document.getElementById('reset').click()");
await waitFor("!/building/.test(document.getElementById('status').textContent)", 'rebuild after reset');
if (process.env.SECTION) { await evaluate("document.getElementById('section').click()"); }
await sleep(500);

await shoot('page');
await setSel('tubeMode', 'off');
await evaluate("document.getElementById('showBed').click()");
await sleep(400);
await shoot('page-plain');
await evaluate("document.getElementById('section').click()");
await sleep(400);
await shoot('page-section');

const bad = events.filter((e) =>
  (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
  e.method === 'Runtime.exceptionThrown');
console.log(ok.join('\n'));
console.log('\nconsole errors: ' + (bad.length ? '\n' + bad.map((b) => JSON.stringify(b.params).slice(0, 400)).join('\n') : 'none'));
ws.close(); chrome.kill();
await sleep(400);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(bad.length ? 1 : 0);
