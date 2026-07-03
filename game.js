'use strict';
/* Data Center Tycoon — Connectivity Edition
   A teaching game about the chips that move data: retimers, AECs, optics.
   All graphics are drawn procedurally on canvas — no image assets. */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 12;
const TILE_W = 64, TILE_H = 32;
const CW = 1280, CH = 760;
const OX = CW / 2, OY = 170;
const FAIL = 30;               // signal health below this = dead link
const LINK_GBPS = 800;
const LS_KEY = 'dct_progress_v1';

/* ---------------- component catalog ---------------- */
const ENT = {
  rack: {
    name: 'GPU rack', cost: 8000, ports: 1, color: '#5a6acf',
    tag: 'Compute that needs to talk',
    desc: 'A rack of GPU servers pushing 800 Gb/s onto the network. GPUs sitting idle waiting for data are the most expensive waste in AI — connectivity is what keeps them fed.',
    real: 'Real AI racks draw 30–130 kW, and each GPU inside has multiple 400–800 Gb/s network ports.'
  },
  leaf: {
    name: 'Leaf switch (ToR)', cost: 4000, ports: 8, color: '#3fbf8f',
    tag: 'First hop of the network',
    desc: 'The top-of-rack (leaf) switch aggregates traffic from every rack connected to it. A rack is only "online" when it has a healthy link to a leaf.',
    real: 'Modern switch ASICs move 51.2 Tb/s through a single chip.'
  },
  spine: {
    name: 'Spine switch', cost: 6000, ports: 16, color: '#9a6cf0',
    tag: 'Connects the leaves together',
    desc: 'Spine switches interconnect leaf switches so any rack can reach any other rack in at most three hops. When a level requires a spine, each leaf needs healthy uplinks — at least one uplink per two racks (2:1 oversubscription).',
    real: 'Leaf-spine (Clos) fabric is how virtually every large data center scales past a single switch.'
  }
};
const CABLE = {
  dac: {
    name: 'Copper DAC', cost: 150, watts: 0.2, loss: 25, color: '#c8823f',
    tag: 'Cheap, cool… and short',
    desc: 'Direct-attach copper: a passive twinax cable. Nearly free and burns almost no power, but at today’s speeds the signal smears out fast — health drops 25% per tile. Extend its reach by placing retimer chips along the run.',
    real: 'At 100+ Gb/s per lane, passive copper reaches only ~2–3 meters.'
  },
  aec: {
    name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#3fc8c8',
    tag: 'Copper with retimers built in',
    desc: 'An AEC is a copper cable with a retimer chip inside each connector shell, constantly cleaning the signal. Health drops only 6% per tile — far better reach than a DAC, at a fraction of the power and cost of optics.',
    real: 'AECs are one of the fastest-growing products in data center connectivity — built around retimer silicon from companies like Astera Labs, Marvell and Broadcom.'
  },
  opt: {
    name: 'Optical link', cost: 2500, watts: 14, loss: 1.5, color: '#5aa7ff',
    tag: 'Longest reach, biggest bill',
    desc: 'Optical transceivers convert electrons to light. Reach is effectively unlimited on this map (1.5% loss per tile), but every link burns 14 W and costs real money — and lasers fail far more often than copper.',
    real: 'Optics can dominate the network power budget of a large AI cluster, which is why operators use copper everywhere they can.'
  }
};
const RET = {
  name: 'Retimer chip', cost: 300, watts: 3,
  tag: 'The connectivity chip itself',
  desc: 'A retimer recovers the clock and data from a degraded electrical signal and retransmits it perfectly clean — signal health resets to 100% at the chip. Place it on a copper DAC route BEFORE health falls under 30%, or the data is already unrecoverable.',
  real: 'Retimers live on motherboards, riser cards, backplanes and inside AECs. This is the chip category companies like Astera Labs built their business on.'
};

/* ---------------- levels ---------------- */
const LEVELS = [
  {
    title: 'Level 1 — Light it up',
    budget: 20000, tools: ['rack', 'dac'],
    pre: [{ t: 'leaf', i: 8, j: 5 }],
    goals: [
      { text: 'Bring 2 GPU racks online', check: s => s.stats.online >= 2 }
    ],
    lesson: `<h2>Light it up</h2>
      <p>Every AI answer is thousands of chips talking to each other. A <b>GPU rack</b> does the math; the <b>leaf switch</b> is the first hop of the network that connects racks together.</p>
      <p>Place two racks near the leaf switch, then connect each one with a <b>copper DAC cable</b> (click the rack, then click the switch). The green pulses you’ll see are your data flowing.</p>
      <p class="tip">A rack is online when it has a healthy link to a switch.</p>`
  },
  {
    title: 'Level 2 — The reach problem',
    budget: 2500, tools: ['dac', 'retimer'],
    pre: [{ t: 'leaf', i: 2, j: 5 }, { t: 'rack', i: 13, j: 5 }],
    goals: [
      { text: 'Bring the far rack online', check: s => s.stats.online >= 1 }
    ],
    lesson: `<h2>The reach problem</h2>
      <p>Copper is cheap, but at 800 Gb/s the signal <b>smears out</b> as it travels — watch the pulse fade and die. Health drops 25% per tile, and below 30% the data is gone.</p>
      <p>This is where the <b>retimer chip</b> comes in: it reads the degraded signal and retransmits it perfectly clean. Run a DAC to the far rack, watch it fail, then place retimers along the route (every 2 tiles or so) to bring it back to life.</p>
      <p class="tip">A retimer can’t resurrect a dead signal — place it before health falls under 30%.</p>`
  },
  {
    title: 'Level 3 — Copper vs light',
    budget: 6000, powerCapW: 30, tools: ['dac', 'aec', 'opt', 'retimer'],
    pre: [
      { t: 'leaf', i: 2, j: 2 },
      { t: 'rack', i: 4, j: 2 }, { t: 'rack', i: 7, j: 2 },
      { t: 'rack', i: 11, j: 2 }, { t: 'rack', i: 12, j: 4 }
    ],
    goals: [
      { text: 'Bring all 4 racks online', check: s => s.stats.online >= 4 },
      { text: 'Keep link power at or under 30 W', check: s => s.stats.watts <= 30.001 }
    ],
    lesson: `<h2>Copper vs light</h2>
      <p>There are three ways to cross a data hall, and picking the right one is real engineering:</p>
      <p><b>Copper DAC</b> — nearly free, zero power, very short reach.<br>
      <b>AEC</b> — copper with retimer chips built into each end. Medium cost, medium power, good reach.<br>
      <b>Optical</b> — goes anywhere, but 14 W and $2,500 per link.</p>
      <p>Four racks sit at different distances. All-optical would blow your 30 W power cap — mix technologies to match each distance.</p>
      <p class="tip">Click a cable after placing it to see its signal health.</p>`
  },
  {
    title: 'Level 4 — Scale out',
    budget: 46000, requireSpine: true,
    tools: ['rack', 'leaf', 'dac', 'aec', 'opt', 'retimer'],
    pre: [{ t: 'spine', i: 8, j: 1 }],
    goals: [
      { text: 'Bring 4 racks online', check: s => s.stats.online >= 4 },
      { text: 'Use at least 2 leaf switches', check: s => s.stats.leavesUsed >= 2 }
    ],
    lesson: `<h2>Scale out</h2>
      <p>One switch can’t host everyone. Data centers scale with a <b>leaf-spine</b> fabric: racks connect to leaves, leaves connect to the spine, and any rack can reach any other in three hops.</p>
      <p>Uplinks are shared — in this game each leaf needs at least <b>one healthy uplink per two racks</b> (2:1 oversubscription, a common real-world ratio).</p>
      <p class="tip">Every extra network tier means more links — and more connectivity chips. That’s why this chip market is exploding alongside AI.</p>`
  },
  {
    title: 'Sandbox — Free build',
    budget: 250000, sandbox: true, requireSpine: false,
    tools: ['rack', 'leaf', 'spine', 'dac', 'aec', 'opt', 'retimer'],
    pre: [],
    goals: [
      { text: 'Build the biggest, healthiest fabric you can', check: () => false }
    ],
    lesson: `<h2>Sandbox</h2>
      <p>Everything is unlocked and the budget is deep. Build your dream cluster — the HUD tracks total throughput and link power, so chase the best <b>terabits per watt per dollar</b> you can.</p>
      <p class="tip">Try building the same fabric twice: once all-optical, once copper+retimers. Compare the power bill.</p>`
  }
];

/* ---------------- state ---------------- */
let S = null;
let mouse = { x: 0, y: 0, inside: false };
let hoverTile = null;
let toast = { msg: '', until: 0 };
let lastT = 0, idSeq = 1;

function newLevelState(idx) {
  const L = LEVELS[idx];
  const s = {
    idx, level: L, money: L.budget, ents: [], cables: [], retimers: [],
    tool: 'select', pendA: null, selected: null, done: false,
    stats: { online: 0, tput: 0, watts: 0, leavesUsed: 0 }
  };
  L.pre.forEach(p => s.ents.push({ id: idSeq++, type: p.t, i: p.i, j: p.j, locked: true }));
  return s;
}

/* ---------------- geometry ---------------- */
function isoX(i, j) { return (i - j) * (TILE_W / 2) + OX; }
function isoY(i, j) { return (i + j) * (TILE_H / 2) + OY; }
function tileAt(x, y) {
  const i = Math.round(((x - OX) / (TILE_W / 2) + (y - OY) / (TILE_H / 2)) / 2);
  const j = Math.round(((y - OY) / (TILE_H / 2) - (x - OX) / (TILE_W / 2)) / 2);
  if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) return null;
  return { i, j };
}
function entAt(i, j) { return S.ents.find(e => e.i === i && e.j === j); }
function retAt(i, j) { return S.retimers.find(r => r.i === i && r.j === j); }
function lPath(a, b) {
  const p = [{ i: a.i, j: a.j }];
  let i = a.i, j = a.j;
  while (i !== b.i) { i += Math.sign(b.i - i); p.push({ i, j }); }
  while (j !== b.j) { j += Math.sign(b.j - j); p.push({ i, j }); }
  return p;
}

/* ---------------- simulation ---------------- */
function recompute() {
  const deadCables = [];
  S.cables.forEach(c => {
    const loss = CABLE[c.type].loss;
    let h = 100, dead = false;
    c.health = [100]; c.failAt = -1;
    for (let k = 1; k < c.path.length; k++) {
      h -= loss;
      if (!dead && h < FAIL) { dead = true; c.failAt = k; }
      if (!dead && c.type === 'dac' && retAt(c.path[k].i, c.path[k].j)) h = 100;
      c.health.push(Math.max(0, h));
    }
    c.ok = !dead;
    if (!c.ok) deadCables.push(c);
  });

  const healthy = S.cables.filter(c => c.ok);
  const linksOf = e => healthy.filter(c => c.a === e.id || c.b === e.id);
  const other = (c, e) => S.ents.find(x => x.id === (c.a === e.id ? c.b : c.a));

  const leaves = S.ents.filter(e => e.type === 'leaf');
  const leafOk = {};
  leaves.forEach(lf => {
    const racks = linksOf(lf).filter(c => other(c, lf).type === 'rack').length;
    const ups = linksOf(lf).filter(c => other(c, lf).type === 'spine').length;
    leafOk[lf.id] = !S.level.requireSpine || racks === 0 || ups >= Math.ceil(racks / 2);
  });

  let online = 0; const usedLeaves = new Set();
  S.ents.filter(e => e.type === 'rack').forEach(r => {
    r.online = false;
    for (const c of linksOf(r)) {
      const o = other(c, r);
      if (o && o.type === 'leaf' && leafOk[o.id]) { r.online = true; usedLeaves.add(o.id); break; }
    }
    if (r.online) online++;
  });

  const watts = S.cables.reduce((w, c) => w + CABLE[c.type].watts, 0) + S.retimers.length * RET.watts;
  S.stats = { online, tput: online * LINK_GBPS / 1000, watts: Math.round(watts * 10) / 10, leavesUsed: usedLeaves.size };

  if (!S.done && !S.level.sandbox && S.level.goals.every(g => g.check(S))) {
    S.done = true;
    unlockLevel(S.idx + 1);
    showBanner();
  }
  updateHUD(); updateGoals();
}

/* ---------------- actions ---------------- */
function say(msg) { toast = { msg, until: performance.now() + 2600 }; }
function spend(n) { S.money -= n; }

function tryPlaceEnt(type, i, j) {
  const spec = ENT[type];
  if (entAt(i, j) || retAt(i, j)) return say('That tile is occupied.');
  if (S.money < spec.cost) return say('Not enough budget.');
  spend(spec.cost);
  S.ents.push({ id: idSeq++, type, i, j });
  recompute();
}
function tryPlaceRet(i, j) {
  if (entAt(i, j)) return say('Retimers go on the cable run, not on a device.');
  if (retAt(i, j)) return say('There is already a retimer here.');
  if (!S.cables.some(c => c.type === 'dac' && c.path.some(p => p.i === i && p.j === j)))
    return say('Place retimers on a copper DAC route. (AECs and optics have their own built in.)');
  if (S.money < RET.cost) return say('Not enough budget.');
  spend(RET.cost);
  S.retimers.push({ i, j });
  recompute();
}
function portCount(e) { return S.cables.filter(c => c.a === e.id || c.b === e.id).length; }
function tryCable(type, A, B) {
  if (A.id === B.id) return say('Connect two different devices.');
  const pair = [A.type, B.type].sort().join('-');
  if (pair === 'leaf-rack' || pair === 'leaf-spine') { /* allowed */ }
  else if (pair === 'rack-rack') return say('Racks talk through switches — connect each rack to a leaf.');
  else if (pair === 'rack-spine') return say('Racks connect to leaf switches; spines only connect leaves.');
  else return say('Leaves connect to leaves only through a spine.');
  if (S.cables.some(c => (c.a === A.id && c.b === B.id) || (c.a === B.id && c.b === A.id)))
    return say('Those two are already connected.');
  if (portCount(A) >= ENT[A.type].ports) return say(`${ENT[A.type].name} is out of ports.`);
  if (portCount(B) >= ENT[B.type].ports) return say(`${ENT[B.type].name} is out of ports.`);
  const spec = CABLE[type];
  if (S.money < spec.cost) return say('Not enough budget.');
  spend(spec.cost);
  S.cables.push({ id: idSeq++, type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0 });
  recompute();
}
function removeThing(th) {
  if (th.kind === 'ent') {
    if (th.ent.locked) return say('That one came with the site — it stays.');
    S.money += ENT[th.ent.type].cost * 0.5;
    S.cables.filter(c => c.a === th.ent.id || c.b === th.ent.id)
      .forEach(c => S.money += CABLE[c.type].cost * 0.5);
    S.cables = S.cables.filter(c => c.a !== th.ent.id && c.b !== th.ent.id);
    S.ents = S.ents.filter(e => e !== th.ent);
  } else if (th.kind === 'cable') {
    S.money += CABLE[th.cable.type].cost * 0.5;
    S.cables = S.cables.filter(c => c !== th.cable);
  } else if (th.kind === 'ret') {
    S.money += RET.cost * 0.5;
    S.retimers = S.retimers.filter(r => r !== th.ret);
  }
  S.selected = null;
  recompute();
}

/* ---------------- hit testing ---------------- */
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function thingAt(x, y) {
  const ents = [...S.ents].sort((a, b) => (b.i + b.j) - (a.i + a.j));
  for (const e of ents) {
    const ex = isoX(e.i, e.j), ey = isoY(e.i, e.j);
    const h = e.type === 'rack' ? 62 : e.type === 'spine' ? 46 : 30;
    if (Math.abs(x - ex) < 26 && y > ey - h - 18 && y < ey + 16) return { kind: 'ent', ent: e };
  }
  for (const r of S.retimers) {
    if (Math.abs(x - isoX(r.i, r.j)) < 14 && Math.abs(y - isoY(r.i, r.j)) < 12) return { kind: 'ret', ret: r };
  }
  for (const c of S.cables) {
    const pts = c.path.map(p => [isoX(p.i, p.j), isoY(p.i, p.j) + 4]);
    for (let k = 0; k < pts.length - 1; k++) {
      if (distToSeg(x, y, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) < 8)
        return { kind: 'cable', cable: c };
    }
  }
  return null;
}

/* ---------------- drawing helpers ---------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
function poly(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  ctx.closePath(); ctx.fill();
}
function diamond(x, y, f) {
  return [[x, y - TILE_H / 2 * f], [x + TILE_W / 2 * f, y], [x, y + TILE_H / 2 * f], [x - TILE_W / 2 * f, y]];
}
function isoBoxD(x, y, f, h, top, left, right) {
  const hw = TILE_W / 2 * f, hh = TILE_H / 2 * f;
  ctx.fillStyle = left; poly([[x - hw, y], [x, y + hh], [x, y + hh - h], [x - hw, y - h]]);
  ctx.fillStyle = right; poly([[x, y + hh], [x + hw, y], [x + hw, y - h], [x, y + hh - h]]);
  ctx.fillStyle = top; poly([[x, y - hh - h], [x + hw, y - h], [x, y + hh - h], [x - hw, y - h]]);
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f)),
    g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f)),
    b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function healthColor(h) {
  return h >= 65 ? '#57e389' : h >= FAIL ? '#f5c542' : '#f05555';
}

/* ---------------- sprites ---------------- */
function drawRack(e, t) {
  const x = isoX(e.i, e.j), y = isoY(e.i, e.j) + 6;
  isoBoxD(x, y, 0.72, 58, shade(ENT.rack.color, 1.15), shade(ENT.rack.color, 0.55), shade(ENT.rack.color, 0.8));
  const connected = S.cables.some(c => c.a === e.id || c.b === e.id);
  for (let r = 0; r < 5; r++) {
    for (let cIdx = 0; cIdx < 2; cIdx++) {
      const lx = x - 16 + cIdx * 9, ly = y - 8 - r * 9 + (16 - cIdx * 9) * (TILE_H / TILE_W) * 0.5;
      let col = '#3a3f55';
      if (e.online) col = (Math.sin(t * 6 + r * 1.7 + cIdx) > 0) ? '#57e389' : '#2a7a4a';
      else if (connected) col = '#f05555';
      ctx.fillStyle = col;
      ctx.fillRect(lx, ly, 4, 2.5);
    }
  }
}
function drawLeaf(e, t) {
  const x = isoX(e.i, e.j), y = isoY(e.i, e.j) + 4;
  isoBoxD(x, y, 0.8, 24, shade(ENT.leaf.color, 1.1), shade(ENT.leaf.color, 0.5), shade(ENT.leaf.color, 0.75));
  ctx.fillStyle = '#0d1220';
  for (let p = 0; p < 6; p++) ctx.fillRect(x - 15 + p * 5, y - 5 + (15 - p * 5) * 0.25, 3, 3);
  ctx.fillStyle = (Math.sin(t * 4) > -0.3) ? '#d7ffe9' : '#2a7a4a';
  ctx.fillRect(x + 14, y - 16, 3, 3);
}
function drawSpine(e, t) {
  const x = isoX(e.i, e.j), y = isoY(e.i, e.j) + 5;
  isoBoxD(x, y, 0.85, 42, shade(ENT.spine.color, 1.12), shade(ENT.spine.color, 0.5), shade(ENT.spine.color, 0.75));
  ctx.fillStyle = '#0d1220';
  for (let row = 0; row < 2; row++)
    for (let p = 0; p < 6; p++)
      ctx.fillRect(x - 16 + p * 5, y - 10 - row * 12 + (16 - p * 5) * 0.25, 3, 3);
  ctx.fillStyle = (Math.floor(t * 3) % 2) ? '#e8dcff' : '#6a4ab0';
  ctx.fillRect(x + 16, y - 34, 3, 3);
}
function drawRetimer(r, t) {
  const x = isoX(r.i, r.j), y = isoY(r.i, r.j) + 2;
  ctx.strokeStyle = `rgba(87,227,137,${0.25 + 0.2 * Math.sin(t * 5)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y, 16, 8, 0, 0, Math.PI * 2); ctx.stroke();
  isoBoxD(x, y, 0.3, 8, '#2b2f3d', '#14161f', '#1d2029');
  ctx.fillStyle = '#e8b64c';
  ctx.fillRect(x - 7, y - 10, 14, 2);
  ctx.fillStyle = '#57e389';
  ctx.fillRect(x - 2, y - 7, 4, 3);
}
const DRAW = { rack: drawRack, leaf: drawLeaf, spine: drawSpine };

/* ---------------- cables & pulses ---------------- */
function cablePts(c) { return c.path.map(p => [isoX(p.i, p.j), isoY(p.i, p.j) + 4]); }
function drawCable(c) {
  const pts = cablePts(c), spec = CABLE[c.type];
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const seg = (from, to, color, dash) => {
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = '#090c14'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(pts[from][0], pts[from][1]);
    for (let k = from + 1; k <= to; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(pts[from][0], pts[from][1]);
    for (let k = from + 1; k <= to; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (c.ok || c.failAt < 1) seg(0, pts.length - 1, c.ok ? spec.color : '#f05555', c.ok ? null : [6, 5]);
  else {
    seg(0, c.failAt, spec.color);
    seg(c.failAt, pts.length - 1, '#f05555', [6, 5]);
  }
  if (S.selected && S.selected.kind === 'cable' && S.selected.cable === c) {
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
}
function healthAtFrac(c, f) {
  const n = c.path.length - 1;
  const k = Math.min(n, f * n);
  const k0 = Math.floor(k), k1 = Math.min(n, k0 + 1);
  return c.health[k0] + (c.health[k1] - c.health[k0]) * (k - k0);
}
function updatePulses(c, dt, now) {
  const n = c.path.length - 1;
  if (n < 1) return;
  if (now > c.nextPulse) {
    c.pulses.push({ t: 0 });
    c.nextPulse = now + 700 + Math.random() * 500;
  }
  const speed = 3.2 / n;
  const failFrac = c.ok ? 2 : c.failAt / n;
  c.pulses.forEach(p => { p.t += dt * speed; });
  c.pulses = c.pulses.filter(p => p.t <= Math.min(1, failFrac + 0.04));
}
function drawPulses(c) {
  const pts = cablePts(c), n = c.path.length - 1;
  c.pulses.forEach(p => {
    const k = p.t * n, k0 = Math.min(n - 1, Math.floor(k)), fr = k - k0;
    const x = pts[k0][0] + (pts[k0 + 1][0] - pts[k0][0]) * fr;
    const y = pts[k0][1] + (pts[k0 + 1][1] - pts[k0][1]) * fr;
    const h = healthAtFrac(c, p.t);
    const dying = !c.ok && p.t > c.failAt / n - 0.05;
    ctx.fillStyle = dying ? '#f05555' : healthColor(h);
    ctx.globalAlpha = Math.max(0.15, h / 100);
    ctx.beginPath(); ctx.arc(x, y, dying ? 4.5 : 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* ---------------- main render ---------------- */
function drawFloor() {
  for (let i = 0; i < GRID_W; i++) {
    for (let j = 0; j < GRID_H; j++) {
      const x = isoX(i, j), y = isoY(i, j);
      ctx.fillStyle = (i + j) % 2 ? '#161b2c' : '#181e31';
      poly(diamond(x, y, 0.98));
      ctx.strokeStyle = '#1f2740'; ctx.lineWidth = 1;
      ctx.beginPath();
      const d = diamond(x, y, 0.98);
      ctx.moveTo(d[0][0], d[0][1]);
      d.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath(); ctx.stroke();
    }
  }
}
function drawGhost() {
  if (!hoverTile || !mouse.inside) return;
  const { i, j } = hoverTile;
  const x = isoX(i, j), y = isoY(i, j);
  if (ENT[S.tool]) {
    const bad = entAt(i, j) || retAt(i, j) || S.money < ENT[S.tool].cost;
    ctx.globalAlpha = 0.55;
    DRAW[S.tool]({ i, j, id: -1, online: false }, lastT);
    ctx.globalAlpha = 1;
    ctx.fillStyle = bad ? 'rgba(240,85,85,.3)' : 'rgba(87,227,137,.18)';
    poly(diamond(x, y, 0.98));
  } else if (S.tool === 'retimer') {
    ctx.globalAlpha = 0.6; drawRetimer({ i, j }, lastT); ctx.globalAlpha = 1;
  } else if (CABLE[S.tool] && S.pendA) {
    const e = entAt(i, j);
    const target = e ? { i: e.i, j: e.j } : { i, j };
    const pts = lPath(S.pendA, target).map(p => [isoX(p.i, p.j), isoY(p.i, p.j) + 4]);
    ctx.setLineDash([5, 5]); ctx.strokeStyle = CABLE[S.tool].color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (CABLE[S.tool] || S.tool === 'select') {
    const e = entAt(i, j);
    if (e) {
      ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 2;
      const d = diamond(isoX(e.i, e.j), isoY(e.i, e.j), 1);
      ctx.beginPath(); ctx.moveTo(d[0][0], d[0][1]);
      d.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath(); ctx.stroke();
    }
  }
}
function frame(ts) {
  const t = ts / 1000, dt = Math.min(0.05, t - lastT || 0.016);
  lastT = t;
  ctx.clearRect(0, 0, CW, CH);
  drawFloor();
  S.cables.forEach(drawCable);
  S.cables.forEach(c => { updatePulses(c, dt, ts); drawPulses(c); });
  if (S.pendA) {
    const d = diamond(isoX(S.pendA.i, S.pendA.j), isoY(S.pendA.i, S.pendA.j), 1.05);
    ctx.strokeStyle = '#57e389'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d[0][0], d[0][1]);
    d.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath(); ctx.stroke();
  }
  const drawables = [
    ...S.retimers.map(r => ({ d: r.i + r.j, fn: () => drawRetimer(r, t) })),
    ...S.ents.map(e => ({ d: e.i + e.j, fn: () => DRAW[e.type](e, t) }))
  ].sort((a, b) => a.d - b.d);
  drawables.forEach(x => x.fn());
  if (S.selected && S.selected.kind === 'ent') {
    const e = S.selected.ent;
    const d = diamond(isoX(e.i, e.j), isoY(e.i, e.j), 1.05);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(d[0][0], d[0][1]);
    d.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }
  drawGhost();
  if (performance.now() < toast.until) {
    ctx.font = '15px system-ui'; ctx.textAlign = 'center';
    const w = ctx.measureText(toast.msg).width + 34;
    ctx.fillStyle = 'rgba(13,18,32,.92)';
    ctx.beginPath(); ctx.roundRect((CW - w) / 2, CH - 66, w, 34, 9); ctx.fill();
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f5e6c0';
    ctx.fillText(toast.msg, CW / 2, CH - 44);
    ctx.textAlign = 'left';
  }
  requestAnimationFrame(frame);
}

/* ---------------- input ---------------- */
function canvasXY(ev) {
  const r = cvs.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * CW / r.width, y: (ev.clientY - r.top) * CH / r.height };
}
cvs.addEventListener('pointermove', ev => {
  const p = canvasXY(ev);
  mouse = { x: p.x, y: p.y, inside: true };
  hoverTile = tileAt(p.x, p.y);
});
cvs.addEventListener('pointerleave', () => { mouse.inside = false; hoverTile = null; });
cvs.addEventListener('pointerdown', ev => {
  const p = canvasXY(ev);
  const tile = tileAt(p.x, p.y);
  if (ENT[S.tool]) { if (tile) tryPlaceEnt(S.tool, tile.i, tile.j); return; }
  if (S.tool === 'retimer') { if (tile) tryPlaceRet(tile.i, tile.j); return; }
  if (CABLE[S.tool]) {
    const e = tile && entAt(tile.i, tile.j);
    if (!e) { if (S.pendA) say('Click a device to finish the cable — Esc to cancel.'); else say('Click a device to start a cable.'); return; }
    if (!S.pendA) { S.pendA = e; return; }
    tryCable(S.tool, S.pendA, e);
    S.pendA = null;
    return;
  }
  if (S.tool === 'delete') {
    const th = thingAt(p.x, p.y);
    if (th) removeThing(th);
    return;
  }
  const th = thingAt(p.x, p.y);
  S.selected = th;
  showInspector(th);
});
window.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { S.pendA = null; setTool('select'); }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.selected) removeThing(S.selected);
  const order = ['select', ...S.level.tools, 'delete'];
  const n = parseInt(ev.key, 10);
  if (n >= 1 && n <= order.length) setTool(order[n - 1]);
});

/* ---------------- UI ---------------- */
const $ = id => document.getElementById(id);
function fmtMoney(n) { return '$' + Math.round(n).toLocaleString(); }
function updateHUD() {
  $('mMoney').textContent = fmtMoney(S.money);
  $('mTput').textContent = S.stats.tput.toFixed(1) + ' Tb/s';
  const cap = S.level.powerCapW;
  $('mPower').textContent = S.stats.watts + ' W' + (cap ? ' / ' + cap + ' W' : '');
  $('mPower').classList.toggle('bad', !!cap && S.stats.watts > cap);
  $('levelName').textContent = S.level.title;
}
function updateGoals() {
  const ul = $('goalList'); ul.innerHTML = '';
  S.level.goals.forEach(g => {
    const li = document.createElement('li');
    const ok = g.check(S);
    li.className = ok ? 'done' : '';
    li.textContent = (ok ? '✓ ' : '○ ') + g.text;
    ul.appendChild(li);
  });
}
function toolIcon(key) {
  const c = document.createElement('canvas');
  c.width = 46; c.height = 46;
  const g = c.getContext('2d');
  g.translate(23, 30);
  const mini = (f, h, col) => {
    const hw = 18 * f, hh = 9 * f;
    g.fillStyle = shade(col, 0.55); g.beginPath(); g.moveTo(-hw, 0); g.lineTo(0, hh); g.lineTo(0, hh - h); g.lineTo(-hw, -h); g.closePath(); g.fill();
    g.fillStyle = shade(col, 0.8); g.beginPath(); g.moveTo(0, hh); g.lineTo(hw, 0); g.lineTo(hw, -h); g.lineTo(0, hh - h); g.closePath(); g.fill();
    g.fillStyle = shade(col, 1.15); g.beginPath(); g.moveTo(0, -hh - h); g.lineTo(hw, -h); g.lineTo(0, hh - h); g.lineTo(-hw, -h); g.closePath(); g.fill();
  };
  if (key === 'rack') mini(0.75, 24, ENT.rack.color);
  else if (key === 'leaf') mini(0.85, 12, ENT.leaf.color);
  else if (key === 'spine') mini(0.85, 19, ENT.spine.color);
  else if (CABLE[key]) {
    g.strokeStyle = CABLE[key].color; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-15, 4); g.bezierCurveTo(-4, -14, 4, 4, 15, -12); g.stroke();
  } else if (key === 'retimer') {
    g.fillStyle = '#2b2f3d'; g.fillRect(-9, -16, 18, 14);
    g.fillStyle = '#e8b64c';
    for (let k = -7; k <= 6; k += 4) { g.fillRect(k, -19, 2, 3); g.fillRect(k, -2, 2, 3); }
    g.fillStyle = '#57e389'; g.fillRect(-2, -11, 4, 4);
  } else if (key === 'select') {
    g.strokeStyle = '#c9cfe8'; g.lineWidth = 2; g.fillStyle = '#c9cfe8';
    g.beginPath(); g.moveTo(-6, -18); g.lineTo(6, -4); g.lineTo(-1, -4); g.lineTo(-6, 3); g.closePath(); g.fill();
  } else if (key === 'delete') {
    g.strokeStyle = '#f05555'; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-9, -16); g.lineTo(9, 2); g.moveTo(9, -16); g.lineTo(-9, 2); g.stroke();
  }
  return c;
}
function toolMeta(key) {
  if (ENT[key]) return { label: ENT[key].name, sub: fmtMoney(ENT[key].cost) };
  if (CABLE[key]) return { label: CABLE[key].name, sub: `${fmtMoney(CABLE[key].cost)} · ${CABLE[key].watts} W` };
  if (key === 'retimer') return { label: RET.name, sub: `${fmtMoney(RET.cost)} · ${RET.watts} W` };
  if (key === 'select') return { label: 'Inspect', sub: 'click anything' };
  return { label: 'Remove', sub: '50% refund' };
}
function buildToolbar() {
  const wrap = $('tools'); wrap.innerHTML = '';
  ['select', ...S.level.tools, 'delete'].forEach((key, n) => {
    const b = document.createElement('button');
    b.dataset.tool = key;
    const m = toolMeta(key);
    b.appendChild(toolIcon(key));
    const tx = document.createElement('div');
    tx.innerHTML = `<b>${n + 1}. ${m.label}</b><small>${m.sub}</small>`;
    b.appendChild(tx);
    b.onclick = () => setTool(key);
    wrap.appendChild(b);
  });
  setTool('select');
}
function setTool(key) {
  S.tool = key; S.pendA = null;
  document.querySelectorAll('#tools button').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === key));
  const spec = ENT[key] || CABLE[key] || (key === 'retimer' ? RET : null);
  if (spec) showCatalog(spec);
}
function showCatalog(spec) {
  $('infoBody').innerHTML =
    `<h3>${spec.name}</h3><p class="tagline">${spec.tag}</p><p>${spec.desc}</p>
     <p class="real"><b>Real world:</b> ${spec.real}</p>`;
}
function showInspector(th) {
  if (!th) { $('infoBody').innerHTML = 'Select a tool, or click any device or cable to learn what it does.'; return; }
  if (th.kind === 'ent') {
    const spec = ENT[th.ent.type];
    let status = '';
    if (th.ent.type === 'rack')
      status = th.ent.online
        ? '<p class="ok">Status: online — pushing 800 Gb/s.</p>'
        : '<p class="bad">Status: offline — needs a healthy link to a leaf switch' + (S.level.requireSpine ? ' with enough spine uplinks' : '') + '.</p>';
    $('infoBody').innerHTML = `<h3>${spec.name}</h3><p class="tagline">${spec.tag}</p>${status}<p>${spec.desc}</p><p class="real"><b>Real world:</b> ${spec.real}</p>`;
  } else if (th.kind === 'cable') {
    const c = th.cable, spec = CABLE[c.type];
    const end = c.health[c.health.length - 1];
    const stat = c.ok
      ? `<p class="ok">Signal health at far end: ${Math.round(end)}%.</p>`
      : `<p class="bad">Link DOWN — signal health fell under ${FAIL}% partway. ${c.type === 'dac' ? 'Add a retimer earlier on the route.' : 'This run is too long for this cable.'}</p>`;
    $('infoBody').innerHTML = `<h3>${spec.name}</h3><p class="tagline">${spec.tag}</p>${stat}<p>${spec.desc}</p><p class="real"><b>Real world:</b> ${spec.real}</p>`;
  } else {
    $('infoBody').innerHTML = `<h3>${RET.name}</h3><p class="tagline">${RET.tag}</p><p class="ok">Regenerating signal to 100% at this point.</p><p>${RET.desc}</p><p class="real"><b>Real world:</b> ${RET.real}</p>`;
  }
}
function showLesson() {
  $('modalBody').innerHTML = S.level.lesson;
  $('modal').classList.add('open');
}
function showBanner() {
  const b = $('banner');
  b.innerHTML = `<h2>${S.level.title.split('—')[1] || 'Level'} complete!</h2><p>Objectives met. ${S.idx + 1 < LEVELS.length ? 'Next concept unlocked.' : ''}</p>`;
  b.classList.add('show');
  $('btnNext').hidden = S.idx + 1 >= LEVELS.length;
  setTimeout(() => b.classList.remove('show'), 3200);
}
function unlockLevel(idx) {
  const cur = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  if (idx > cur) localStorage.setItem(LS_KEY, String(Math.min(idx, LEVELS.length - 1)));
  buildLevelSelect();
}
function maxUnlocked() { return Math.min(parseInt(localStorage.getItem(LS_KEY) || '0', 10), LEVELS.length - 1); }
function buildLevelSelect() {
  const sel = $('lvlSel'); sel.innerHTML = '';
  LEVELS.forEach((L, n) => {
    const o = document.createElement('option');
    o.value = n; o.textContent = L.title;
    o.disabled = n > maxUnlocked();
    sel.appendChild(o);
  });
  if (S) sel.value = S.idx;
}
function startLevel(idx) {
  S = newLevelState(idx);
  buildToolbar(); buildLevelSelect();
  $('lvlSel').value = idx;
  $('btnNext').hidden = true;
  showInspector(null);
  recompute();
  showLesson();
}

$('modalClose').onclick = () => $('modal').classList.remove('open');
$('btnLesson').onclick = showLesson;
$('btnRestart').onclick = () => startLevel(S.idx);
$('btnNext').onclick = () => startLevel(Math.min(S.idx + 1, LEVELS.length - 1));
$('lvlSel').onchange = ev => startLevel(parseInt(ev.target.value, 10));

/* ---------------- boot ---------------- */
(function boot() {
  const dpr = window.devicePixelRatio || 1;
  cvs.width = CW * dpr; cvs.height = CH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  startLevel(0);
  requestAnimationFrame(frame);
})();
