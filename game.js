'use strict';
/* Data Center Tycoon — Connectivity Edition
   A teaching game about the chips that move data, told at four scales:
   inside the server -> the rack -> the row -> the whole data center.
   Devices use the project's original pixel-art sprites (assets/). */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 9;
const T = 64;
const CW = 1280, CH = 760;
const OX = (CW - GRID_W * T) / 2, OY = 92;
const FAIL = 30;               // signal health below this = dead link
const LS_KEY = 'dct_progress_v3';

const PAL = {
  bg: '#0b0d14', ink: '#0f1120', steel: '#333c57', lite: '#566c86', hi: '#94b0c2',
  green: '#38b764', greenHi: '#8dffb8', red: '#e05555', amber: '#f5c542', dim: '#3a3f55'
};
const FALLBACK = {
  gpu: '#5a6acf', cpu: '#3b5dc9', mem: '#f5c542', server: '#36aebf',
  tor: '#2f7a5c', leaf: '#2f7a5c', spine: '#8f6ac2', rk: '#566c86',
  rw: '#c8823f', spine2: '#8f6ac2', dci: '#4ad2e0'
};

/* ---------------- sprites (original art) ---------------- */
const SPR = {
  gpu: { src: 'assets/gpu.png', size: 58 },
  cpu: { src: 'assets/cpu.png', size: 56 },
  mem: { src: 'assets/memory.png', size: 52 },
  server: { src: 'assets/baseboard.png', size: 58 },
  tor: { src: 'assets/switch.png', size: 58 },
  leaf: { src: 'assets/switch.png', size: 58 },
  spine: { src: 'assets/networking.png', size: 60 },
  rk: { src: 'assets/props4.png', rect: [1530, 1416, 59, 136], size: 62 },
  rw: { src: 'assets/props4.png', rect: [1462, 3003, 196, 101], size: 62 },
  spine2: { src: 'assets/networking.png', size: 62 },
  dci: { src: 'assets/props6.png', rect: [422, 1406, 195, 146], size: 62 },
  ret: { src: 'assets/retimer.png', size: 36 }
};
const IMGS = {};
function loadSprites(onReady) {
  const srcs = [...new Set(Object.values(SPR).map(s => s.src))];
  let left = srcs.length;
  srcs.forEach(src => {
    const im = new Image();
    im.onload = im.onerror = () => { if (--left === 0) onReady(); };
    im.src = src;
    IMGS[src] = im;
  });
}

/* ---------------- scales ---------------- */
const SCALES = {
  board: {
    label: 'Inside the server', hubName: 'CPU',
    msg: {
      nn: 'GPUs don’t talk directly here — route through the CPU.',
      nc: 'GPUs reach memory through the CPU (the root complex).',
      cc: 'DIMMs plug into the CPU’s memory channels.',
      hh: 'Only one CPU per board in this game.'
    }
  },
  rack: {
    label: 'The rack', hubName: 'ToR switch',
    msg: {
      nn: 'Servers connect to the ToR switch, not to each other.',
      nc: '', cc: '', hh: 'One ToR per rack here.'
    }
  },
  row: {
    label: 'The row', hubName: 'leaf switch',
    msg: {
      nn: 'Racks talk through leaf switches.',
      nc: 'Racks connect to leaves; only leaves reach the spine.',
      cc: 'Spines interconnect through leaves in this game.',
      hh: 'Leaves connect to each other only through a spine.'
    }
  },
  dc: {
    label: 'The data center', hubName: 'spine pod',
    msg: {
      nn: 'Rows interconnect through spine pods.',
      nc: 'Rows reach the DCI room through spine pods.',
      cc: 'One DCI room per building here.',
      hh: 'Spine pods interconnect through the DCI/core.'
    }
  }
};

/* ---------------- component catalog ---------------- */
const CAT = {
  gpu: {
    scale: 'board', role: 'node', name: 'GPU', cost: 1500, ports: 1, tput: 1.0,
    tag: 'The hungriest chip on the board',
    desc: 'A GPU crunches numbers, but it can’t do anything alone — every byte it works on arrives over a PCIe link. Connect it to the CPU with a copper trace to bring it online (the CPU also needs memory attached).',
    real: 'A modern PCIe Gen6 x16 link moves ~128 GB/s — about 1 Tb/s — over bare copper traces.'
  },
  cpu: {
    scale: 'board', role: 'hub', name: 'CPU', cost: 800, ports: 8,
    tag: 'The root complex — every lane starts here',
    desc: 'On a server board, the CPU is the hub: PCIe lanes fan out from it to GPUs, NICs and drives, and memory channels fan out to DIMMs. A GPU is online only when it has a healthy trace to the CPU and the CPU has memory.',
    real: 'Server CPUs expose 128+ PCIe lanes and a dozen memory channels — all signal-integrity battlegrounds.'
  },
  mem: {
    scale: 'board', role: 'core', name: 'Memory (DIMM)', cost: 120, ports: 1,
    tag: 'No memory, no math',
    desc: 'GPUs pull their working data through the CPU from system memory. The CPU needs 1 DIMM per 2 GPUs or nothing computes.',
    real: 'Memory bandwidth is so precious that a whole chip category (CXL memory controllers) exists just to attach more of it.'
  },
  server: {
    scale: 'rack', role: 'node', name: 'GPU server', cost: 8000, ports: 1, tput: 0.8,
    tag: 'Your board, boxed and racked',
    desc: 'This is the server you built at board scale, slid into a rack slot. Now its network port needs a healthy cable up to the ToR switch.',
    real: 'A dense AI rack holds 8–18 servers, each with multiple 400–800 Gb/s ports.'
  },
  tor: {
    scale: 'rack', role: 'hub', name: 'ToR switch', cost: 4000, ports: 8,
    tag: 'Top of rack — first hop out of the box',
    desc: 'The top-of-rack switch aggregates every server below it. A server is online when it has a healthy link to the ToR.',
    real: 'It sits at the top so cable runs stay short — most links can be cheap passive copper.'
  },
  rk: {
    scale: 'row', role: 'node', name: 'Rack', cost: 30000, ports: 1, tput: 6.4,
    tag: 'The rack you filled, seen from the row',
    desc: 'A whole rack of servers with its ToR switch inside. From row scale, it’s one node pushing 6.4 Tb/s that needs a healthy uplink to a leaf switch.',
    real: 'AI clusters are planned row by row: every rack’s uplinks converge on the row’s leaf switches.'
  },
  leaf: {
    scale: 'row', role: 'hub', name: 'Leaf switch', cost: 4000, ports: 8,
    tag: 'The row’s meeting point',
    desc: 'Leaf switches gather rack uplinks. When a level requires a spine, each leaf needs healthy uplinks too — at least one per two racks (2:1 oversubscription).',
    real: 'Modern switch ASICs move 51.2 Tb/s through a single chip.'
  },
  spine: {
    scale: 'row', role: 'core', name: 'Spine switch', cost: 6000, ports: 16,
    tag: 'Connects the leaves together',
    desc: 'Spine switches interconnect leaves so any rack can reach any other rack in three hops. Without spine uplinks, a leaf is an island.',
    real: 'Leaf-spine (Clos) fabric is how virtually every large data center scales past one switch.'
  },
  rw: {
    scale: 'dc', role: 'node', name: 'Row of racks', cost: 150000, ports: 2, tput: 25.6,
    tag: 'The row you built, seen from above',
    desc: 'Everything from level 3 — racks, leaves, cables — collapsed into one block pushing 25.6 Tb/s. At this scale a single link is a liability: rows dual-home to two different spine pods so one failure can’t take them dark.',
    real: 'Operators plan failure domains this way: lose a whole spine pod, keep the floor running.'
  },
  spine2: {
    scale: 'dc', role: 'hub', name: 'Spine pod', cost: 25000, ports: 16,
    tag: 'A cage full of spine switches',
    desc: 'Whole rows uplink here. When the level requires it, spine pods need their own uplinks to the DCI room to reach the world.',
    real: 'At this scale everything is fiber — copper physically cannot cross a data hall.'
  },
  dci: {
    scale: 'dc', role: 'core', name: 'DCI gateway', cost: 40000, ports: 8,
    tag: 'The door to the world',
    desc: 'Data Center Interconnect: long-haul single-mode optics linking this building to other data centers and the internet. Your whole data center is one node in a planet-scale network.',
    real: 'DCI links run 10 km to thousands of km — coherent optics push terabits down a single fiber pair.'
  }
};

const CAB = {
  trace: {
    scale: 'board', name: 'PCIe trace', cost: 5, watts: 0.5, loss: 25, color: '#d0a03f', retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (25% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer. That’s why they sit on motherboards and riser cards.'
  },
  dac1: {
    scale: 'rack', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 20, color: '#c8823f', retime: true,
    tag: 'Cheap, cool… and short',
    desc: 'Direct-attach copper: a passive twinax cable. Nearly free and burns almost no power, but health drops 20% per tile. Fine for short in-rack hops; long runs need retimers or an AEC.',
    real: 'At 100+ Gb/s per lane, passive copper reaches only ~2–3 meters.'
  },
  aec1: {
    scale: 'rack', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#3fc8c8', retime: false,
    tag: 'Copper with retimers built in',
    desc: 'An AEC is a copper cable with a retimer chip inside each connector shell, constantly cleaning the signal — only 6% loss per tile. Compare its price to placing loose retimers along a DAC.',
    real: 'AECs are one of the fastest-growing connectivity products — built around retimer silicon from companies like Astera Labs, Marvell and Broadcom.'
  },
  dac2: {
    scale: 'row', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 25, color: '#c8823f', retime: true,
    tag: 'Short hops only at row scale',
    desc: 'The same passive copper, but row distances are brutal: 25% health per tile. Use it rack-to-leaf when they’re adjacent, retime it, or move up to AEC/optics.',
    real: 'Operators use copper everywhere they can — it’s the cheapest watt in the building.'
  },
  aec2: {
    scale: 'row', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#3fc8c8', retime: false,
    tag: 'The mid-range workhorse',
    desc: 'Retimed copper: 6% loss per tile at a fraction of optics’ power and cost. The sweet spot for most in-row runs.',
    real: 'Inside each connector shell is the same retimer chip you placed by hand at board scale.'
  },
  opt: {
    scale: 'row', name: 'Optical link', cost: 2500, watts: 14, loss: 1.5, color: '#5aa7ff', retime: false,
    tag: 'Longest reach, biggest bill',
    desc: 'Optical transceivers convert electrons to light — only 1.5% loss per tile, but every link burns 14 W and costs real money. Lasers also fail more often than copper.',
    real: 'Optics can dominate the network power budget of a large AI cluster.'
  },
  mmf: {
    scale: 'dc', name: 'Multimode optics', cost: 1800, watts: 11, loss: 4.5, color: '#4ad2e0', retime: false,
    tag: 'Aqua fiber for inside the hall',
    desc: 'Multimode fiber uses cheap VCSEL lasers — the budget optic. But the light bounces around inside the wide core, so reach is limited: 4.5% loss per tile. Great inside the hall, hopeless for the long haul.',
    real: 'Multimode is the aqua-jacketed cable in every data center photo. At high speeds it reaches ~50–100 m.'
  },
  smf: {
    scale: 'dc', name: 'Single-mode optics', cost: 4500, watts: 16, loss: 0.6, color: '#f0e05a', retime: false,
    tag: 'Yellow fiber for the long haul',
    desc: 'Single-mode fiber carries one clean beam down a hair-thin core — only 0.6% loss per tile, at a premium for the precision lasers. This is what crosses buildings and leaves them.',
    real: 'Single-mode is the yellow-jacketed cable. It reaches 500 m to 10 km and beyond — all DCI runs on it.'
  }
};

const RET_STATS = { board: { cost: 30, watts: 4 }, rack: { cost: 300, watts: 3 }, row: { cost: 300, watts: 3 }, dc: { cost: 300, watts: 3 } };
const RET = {
  name: 'Retimer chip',
  tag: 'The connectivity chip itself',
  desc: 'A retimer recovers the clock and data from a degraded electrical signal and retransmits it perfectly clean — signal health resets to 100% at the chip. Place it on a copper route BEFORE health falls under 30%, or the data is already unrecoverable.',
  real: 'Retimers live on motherboards, riser cards, backplanes and inside AECs. This is the chip category companies like Astera Labs built their business on.'
};

/* ---------------- levels ---------------- */
const LEVELS = [
  {
    scale: 'board', title: 'Level 1 — Build a server', requireCore: true, oversub: 2,
    budget: 5200, tools: ['gpu', 'mem', 'trace', 'retimer'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'gpu', i: 14, j: 4 }],
    goals: [
      {
        text: 'Attach 2 DIMMs to the CPU (1 per 2 GPUs)',
        check: s => s.cables.filter(c => c.ok && [c.a, c.b].some(id => { const e = s.ents.find(x => x.id === id); return e && e.type === 'mem'; })).length >= 2
      },
      { text: 'Bring 4 GPUs online', check: s => s.stats.online >= 4 },
      {
        text: 'Rescue the riser GPU at the board edge (retimers!)',
        check: s => { const g = s.ents.find(e => e.locked && e.type === 'gpu'); return !!(g && g.online); }
      }
    ],
    lesson: `<h2>Level 1 — Build a server</h2>
      <p>Everything in AI starts on one green board. Meet the cast:</p>
      <p><b>CPU</b> — the boss in the middle. Every PCIe lane and every memory channel starts here.<br>
      <b>DIMMs</b> — memory sticks. The CPU needs at least <b>1 DIMM for every 2 GPUs</b>, or the math starves.<br>
      <b>GPUs</b> — the number crunchers. Each one needs its own <b>PCIe trace</b> to the CPU (click the GPU, then the CPU).</p>
      <p>One GPU is already stuck on a riser at the far edge of the board. Copper traces lose <b>25% signal health per tile</b> and the data dies below 30% — so that long run needs <b>retimer chips</b> every couple of tiles. A retimer reads the smeared-out signal and retransmits it perfectly clean: health pops back to 100% at the chip.</p>
      <p class="tip">Wire the near GPUs and DIMMs first, then rescue the riser. Watch a pulse fade as it travels — that fading is signal integrity, the whole reason retimers exist. And remember: a retimer can’t resurrect an already-dead signal, so place it before health drops under 30%.</p>`
  },
  {
    scale: 'rack', title: 'Level 2 — Fill the rack', requireCore: false, powerCapW: 11,
    budget: 34500, tools: ['server', 'dac1', 'aec1', 'retimer'],
    pre: [
      { t: 'tor', i: 8, j: 0 },
      { t: 'server', i: 11, j: 3 }, { t: 'server', i: 6, j: 8 }
    ],
    goals: [
      { text: 'Bring 6 servers online', check: s => s.stats.online >= 6 },
      {
        text: 'Connect both pre-racked servers (mid-rack and bottom)',
        check: s => s.ents.filter(e => e.locked && e.type === 'server').every(e => e.online)
      },
      { text: 'Keep link power at or under 11 W', check: s => s.stats.watts <= 11.001 }
    ],
    lesson: `<h2>Level 2 — Fill the rack</h2>
      <p>Zoom out: your board is now inside a <b>server</b>, and servers stack in a rack with the <b>ToR (top-of-rack) switch</b> at the top. It lives up there on purpose — most cables stay short and cheap.</p>
      <p>Six servers need to reach the ToR. Same physics as the board, new toolbox:</p>
      <p><b>Copper DAC</b> — passive cable, almost free, 20% loss per tile. Perfect near the top.<br>
      <b>Retimer</b> — $300 and 3 W buys a mid-run signal cleanup. Right for the middle of the rack.<br>
      <b>AEC</b> — copper with retimer chips factory-built into each connector shell. The only sane option for the bottom U — it <i>is</i> the retimer trick, productized.</p>
      <p>Your power cap is <b>11 W</b>. All-AEC won’t fit — match each distance to the cheapest technology that survives it.</p>
      <p class="tip">Two servers came pre-racked in awkward spots. That’s data center life. Place your four wherever you like — closer to the ToR is cheaper.</p>`
  },
  {
    scale: 'row', title: 'Level 3 — Connect the row', requireCore: true, oversub: 2, powerCapW: 30,
    budget: 13000, tools: ['leaf', 'dac2', 'aec2', 'opt', 'retimer'],
    pre: [
      { t: 'spine', i: 8, j: 0 },
      { t: 'rk', i: 2, j: 6 }, { t: 'rk', i: 4, j: 6 },
      { t: 'rk', i: 11, j: 6 }, { t: 'rk', i: 13, j: 6 },
      { t: 'rk', i: 15, j: 8 }
    ],
    goals: [
      { text: 'Bring all 5 racks online', check: s => s.stats.online >= 5 },
      { text: 'Use at least 2 leaf switches', check: s => s.stats.leavesUsed >= 2 },
      { text: 'Keep link power at or under 30 W', check: s => s.stats.watts <= 30.001 }
    ],
    lesson: `<h2>Level 3 — Connect the row</h2>
      <p>Final zoom: racks (each one a whole level 2) stand in a <b>row</b>, and the row needs a network. This is where data centers earn the name <b>fabric</b>:</p>
      <p><b>Leaf switches</b> — you place these among the racks; every rack uplinks to a leaf.<br>
      <b>Spine switch</b> — already installed at the top. Each leaf needs <b>1 healthy spine uplink per 2 racks</b> (2:1 oversubscription — a real-world ratio).<br>
      <b>Cables</b> — DAC for adjacent hops, AEC or retimed DAC for the middle distances, and <b>optical</b> for anything, at 14 W and $2,500 a link.</p>
      <p>Your power budget is <b>30 W</b> — going all-optical blows it instantly. Copper where you can, optics only where you must: that’s the actual job of a data center network engineer.</p>
      <p class="tip">The corner rack is far from everything. Retimed DAC, AEC, optical — or a third leaf? Do the math on dollars <i>and</i> watts. Drag things around until it clicks.</p>`
  },
  {
    scale: 'dc', title: 'Sandbox — The whole data center', sandbox: true, requireCore: false,
    budget: 2000000, tools: ['rw', 'spine2', 'dci', 'mmf', 'smf'],
    pre: [],
    goals: [{ text: 'Build the biggest, healthiest floor you can', check: () => false }],
    lesson: `<h2>Welcome — this is your data center</h2>
      <p>Free build, deep budget. Place <b>rows of racks</b>, <b>spine pods</b>, and the <b>DCI gateway</b> that links the building to the world, then wire them with aqua <b>multimode</b> fiber (inside the hall) and yellow <b>single-mode</b> (the long hauls). The HUD tracks throughput and link power.</p>
      <p>Want to know how all of it actually works, from a GPU’s pins on up? Hit the green <b>▶ Start campaign</b> button — three levels: build a server, fill a rack, connect the row.</p>
      <p class="tip">Pro move: connect every row to <i>two</i> spine pods (dual-homing), then delete one pod and watch what survives. That’s why redundancy is worth the money.</p>`
  }
];

/* ---------------- state ---------------- */
let S = null;
let mouse = { x: 0, y: 0, inside: false };
let hoverTile = null;
let toast = { msg: '', until: 0 };
let lastT = 0, idSeq = 1;
let FX = [], advanceTimer = 0;
let drag = null;
let starLayer = null, SHOOT = [], nextShoot = 2, DPRg = 1;

function newLevelState(idx) {
  const L = LEVELS[idx];
  const s = {
    idx, level: L, scale: L.scale, money: L.budget,
    ents: [], cables: [], retimers: [],
    tool: 'select', pendA: null, selected: null, done: false,
    stats: { online: 0, tput: 0, watts: 0, leavesUsed: 0 }
  };
  L.pre.forEach(p => s.ents.push({ id: idSeq++, type: p.t, i: p.i, j: p.j, locked: true }));
  (L.preCables || []).forEach(pc => {
    const A = s.ents[pc.a], B = s.ents[pc.b];
    s.cables.push({ id: idSeq++, type: pc.type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0, locked: true });
  });
  return s;
}

/* ---------------- geometry ---------------- */
function gx(i) { return OX + i * T; }
function gy(j) { return OY + j * T; }
function cx(i) { return gx(i) + T / 2; }
function cy(j) { return gy(j) + T / 2; }
function tileAt(x, y) {
  const i = Math.floor((x - OX) / T), j = Math.floor((y - OY) / T);
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
  S.cables.forEach(c => {
    const loss = CAB[c.type].loss;
    let h = 100, dead = false;
    c.health = [100]; c.failAt = -1;
    for (let k = 1; k < c.path.length; k++) {
      h -= loss;
      if (!dead && h < FAIL) { dead = true; c.failAt = k; }
      if (!dead && CAB[c.type].retime && retAt(c.path[k].i, c.path[k].j)) h = 100;
      c.health.push(Math.max(0, h));
    }
    c.ok = !dead;
  });

  const healthy = S.cables.filter(c => c.ok);
  const linksOf = e => healthy.filter(c => c.a === e.id || c.b === e.id);
  const other = (c, e) => S.ents.find(x => x.id === (c.a === e.id ? c.b : c.a));

  const hubs = S.ents.filter(e => CAT[e.type].role === 'hub');
  const hubOk = {};
  hubs.forEach(h => {
    const nodes = linksOf(h).filter(c => CAT[other(c, h).type].role === 'node').length;
    const cores = linksOf(h).filter(c => CAT[other(c, h).type].role === 'core').length;
    hubOk[h.id] = !S.level.requireCore || nodes === 0 ||
      cores >= Math.max(1, Math.ceil(nodes / (S.level.oversub || 2)));
  });

  let online = 0, tput = 0; const usedHubs = new Set();
  S.ents.filter(e => CAT[e.type].role === 'node').forEach(n => {
    const okHubs = new Set();
    for (const c of linksOf(n)) {
      const o = other(c, n);
      if (o && CAT[o.type].role === 'hub' && hubOk[o.id]) okHubs.add(o.id);
    }
    n.online = okHubs.size >= (S.level.dualHome ? 2 : 1);
    if (n.online) { online++; tput += CAT[n.type].tput; okHubs.forEach(h => usedHubs.add(h)); }
  });

  const rw = RET_STATS[S.scale].watts;
  const watts = S.cables.reduce((w, c) => w + CAB[c.type].watts, 0) + S.retimers.length * rw;
  S.stats = { online, tput: Math.round(tput * 10) / 10, watts: Math.round(watts * 10) / 10, leavesUsed: usedHubs.size };

  if (!S.done && !S.level.sandbox && S.level.goals.every(g => g.check(S))) {
    S.done = true;
    unlockLevel(S.idx + 1);
    levelComplete();
  }
  updateHUD(); updateGoals();
}

/* ---------------- actions ---------------- */
function say(msg) { toast = { msg, until: performance.now() + 2600 }; }

function tryPlaceEnt(type, i, j) {
  const spec = CAT[type];
  if (entAt(i, j) || retAt(i, j)) return say('That spot is occupied.');
  if (S.money < spec.cost) return say('Not enough budget.');
  S.money -= spec.cost;
  S.ents.push({ id: idSeq++, type, i, j });
  recompute();
}
function tryPlaceRet(i, j) {
  const rs = RET_STATS[S.scale];
  if (entAt(i, j)) return say('Retimers go on the cable run, not on a device.');
  if (retAt(i, j)) return say('There is already a retimer here.');
  if (!S.cables.some(c => CAB[c.type].retime && c.path.some(p => p.i === i && p.j === j)))
    return say('Place retimers on a bare copper route. (AECs and optics have their own built in.)');
  if (S.money < rs.cost) return say('Not enough budget.');
  S.money -= rs.cost;
  S.retimers.push({ i, j });
  recompute();
}
function portCount(e) { return S.cables.filter(c => c.a === e.id || c.b === e.id).length; }
function tryCable(type, A, B) {
  if (A.id === B.id) return say('Connect two different devices.');
  const m = SCALES[S.scale].msg;
  const pair = [CAT[A.type].role, CAT[B.type].role].sort().join('-');
  if (pair === 'hub-node' || pair === 'core-hub') { /* allowed */ }
  else if (pair === 'node-node') return say(m.nn);
  else if (pair === 'core-node') return say(m.nc || m.nn);
  else if (pair === 'core-core') return say(m.cc || 'Those two don’t connect.');
  else return say(m.hh || 'Those two don’t connect.');
  if (portCount(A) >= CAT[A.type].ports) return say(`${CAT[A.type].name} is out of ports.`);
  if (portCount(B) >= CAT[B.type].ports) return say(`${CAT[B.type].name} is out of ports.`);
  const spec = CAB[type];
  if (S.money < spec.cost) return say('Not enough budget.');
  S.money -= spec.cost;
  S.cables.push({ id: idSeq++, type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0 });
  recompute();
}
function moveEnt(ent, i, j) {
  if (ent.locked) return say('That one came with the site — it stays.');
  if (i === ent.i && j === ent.j) return;
  if (entAt(i, j) || retAt(i, j)) return say('That spot is occupied.');
  ent.i = i; ent.j = j;
  S.cables.forEach(c => {
    if (c.a === ent.id || c.b === ent.id) {
      const A = S.ents.find(e => e.id === c.a), B = S.ents.find(e => e.id === c.b);
      c.path = lPath(A, B);
      c.pulses = [];
    }
  });
  if (S.retimers.some(r => !S.cables.some(c => CAB[c.type].retime && c.path.some(p => p.i === r.i && p.j === r.j))))
    say('Heads up: a retimer is no longer on any copper route.');
  recompute();
}
function removeThing(th) {
  if (th.kind === 'ent') {
    if (th.ent.locked) return say('That one came with the site — it stays.');
    S.money += CAT[th.ent.type].cost * 0.5;
    S.cables.filter(c => c.a === th.ent.id || c.b === th.ent.id)
      .forEach(c => { if (!c.locked) S.money += CAB[c.type].cost * 0.5; });
    S.cables = S.cables.filter(c => c.a !== th.ent.id && c.b !== th.ent.id);
    S.ents = S.ents.filter(e => e !== th.ent);
  } else if (th.kind === 'cable') {
    if (th.cable.locked) return say('That link came with the site — it stays.');
    S.money += CAB[th.cable.type].cost * 0.5;
    S.cables = S.cables.filter(c => c !== th.cable);
  } else if (th.kind === 'ret') {
    S.money += RET_STATS[S.scale].cost * 0.5;
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
  const tile = tileAt(x, y);
  if (tile) {
    const e = entAt(tile.i, tile.j);
    if (e) return { kind: 'ent', ent: e };
    const r = retAt(tile.i, tile.j);
    if (r) return { kind: 'ret', ret: r };
  }
  for (const c of S.cables) {
    const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
    for (let k = 0; k < pts.length - 1; k++) {
      if (distToSeg(x, y, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]) < 9)
        return { kind: 'cable', cable: c };
    }
  }
  return null;
}

/* ---------------- canvas ---------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function outline(x, y, w, h, c, t2) {
  const t = t2 || 2;
  R(x, y, w, t, c); R(x, y + h - t, w, t, c); R(x, y, t, h, c); R(x + w - t, y, t, h, c);
}
function healthColor(h) { return h >= 65 ? PAL.green : h >= FAIL ? PAL.amber : PAL.red; }
function ex(e) { return e.px !== undefined ? e.px : gx(e.i); }
function ey(e) { return e.py !== undefined ? e.py : gy(e.j); }
function bounce(e, t) { return e.online ? Math.sin(t * 4 + e.id) * 2 : 0; }

/* ---------------- space background ---------------- */
const ACCENT = { board: '#38b764', rack: '#5aa7ff', row: '#f5c542', dc: '#b48ae8' };
function buildStars() {
  const c = document.createElement('canvas');
  c.width = CW * DPRg; c.height = CH * DPRg;
  const g = c.getContext('2d');
  g.setTransform(DPRg, 0, 0, DPRg, 0, 0);
  g.fillStyle = '#05060f'; g.fillRect(0, 0, CW, CH);
  for (let k = 0; k < 260; k++) {
    const x = hash(k * 3.17) * CW, y = hash(k * 7.71) * CH;
    const r = hash(k * 13.37);
    g.globalAlpha = 0.22 + r * 0.6;
    g.fillStyle = r > 0.93 ? '#ffd9a0' : r > 0.85 ? '#a8c8ff' : '#ffffff';
    const s = r > 0.78 ? 2 : 1.4;
    g.fillRect(x, y, s, s);
  }
  g.globalAlpha = 1;
  starLayer = c;
}
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function updateShoot(dt) {
  nextShoot -= dt;
  if (nextShoot <= 0) {
    SHOOT.push({
      x: Math.random() * CW * 0.8, y: -10 + Math.random() * 120,
      vx: 380 + Math.random() * 260, vy: 150 + Math.random() * 130, life: 1.1
    });
    nextShoot = 2.5 + Math.random() * 4.5;
  }
  SHOOT.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; });
  SHOOT = SHOOT.filter(s => s.life > 0 && s.x < CW + 60 && s.y < CH + 60);
}
function spaceBg(t) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(starLayer, 0, 0);
  ctx.restore();
  for (let k = 0; k < 16; k++) {
    const x = hash(k * 31.7) * CW, y = hash(k * 17.9) * CH;
    ctx.globalAlpha = 0.25 + 0.7 * Math.abs(Math.sin(t * 1.4 + k * 2.1));
    R(x, y, 2, 2, '#ffffff');
  }
  ctx.globalAlpha = 1;
  const ac = ACCENT[S.scale];
  const gr = ctx.createRadialGradient(CW * 0.78, CH * 0.18, 40, CW * 0.78, CH * 0.18, 500);
  gr.addColorStop(0, ac + '30'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, CW, CH);
  const gr2 = ctx.createRadialGradient(CW * 0.14, CH * 0.86, 40, CW * 0.14, CH * 0.86, 440);
  gr2.addColorStop(0, ac + '22'); gr2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr2; ctx.fillRect(0, 0, CW, CH);
  SHOOT.forEach(s => {
    const a = Math.max(0, Math.min(1, s.life));
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); ctx.stroke();
    R(s.x - 1.5, s.y - 1.5, 3, 3, '#ffffff');
  });
  ctx.fillStyle = 'rgba(10,14,24,.80)';
  ctx.fillRect(OX - 14, OY - 14, GRID_W * T + 28, GRID_H * T + 28);
  outline(OX - 18, OY - 18, GRID_W * T + 36, GRID_H * T + 36, ac + '2a', 6);
  outline(OX - 15, OY - 15, GRID_W * T + 30, GRID_H * T + 30, ac + '99', 2);
  ctx.globalAlpha = 0.14;
  for (let i = 0; i <= GRID_W; i++) R(gx(i), OY, 1, GRID_H * T, ac);
  for (let j = 0; j <= GRID_H; j++) R(OX, gy(j), GRID_W * T, 1, ac);
  ctx.globalAlpha = 1;
  if (S.scale === 'dc') {
    R(gx(14), gy(0), 2 * T, 2 * T, 'rgba(74,210,224,.12)');
    outline(gx(14), gy(0), 2 * T, 2 * T, '#4ad2e0', 2);
  }
}

/* ---------------- sprites ---------------- */
function spriteBox(type) {
  const sp = SPR[type];
  const img = IMGS[sp.src];
  if (!img || !img.complete || !img.naturalWidth) return null;
  const [sx, sy, sw, sh] = sp.rect || [0, 0, img.naturalWidth, img.naturalHeight];
  const maxD = sp.size || 58;
  const sc = Math.min(maxD / sw, maxD / sh);
  return { img, sx, sy, sw, sh, dw: sw * sc, dh: sh * sc };
}
function drawEnt(e, t) {
  const x = ex(e), y = ey(e) + bounce(e, t);
  const b = spriteBox(e.type);
  const baseY = y + T - 4;
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.ellipse(x + T / 2, baseY, (b ? b.dw : 48) / 2.3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (b) {
    ctx.drawImage(b.img, b.sx, b.sy, b.sw, b.sh, x + (T - b.dw) / 2, baseY - b.dh, b.dw, b.dh);
  } else {
    R(x + 10, y + 12, 44, 44, FALLBACK[e.type] || '#888');
  }
  if (CAT[e.type].role === 'node') {
    const connected = S.cables.some(c => c.a === e.id || c.b === e.id);
    let col = PAL.dim;
    if (e.online) col = (Math.sin(t * 6 + e.id) > 0) ? PAL.greenHi : PAL.green;
    else if (connected) col = (Math.sin(t * 8) > -0.4) ? PAL.red : '#7a2525';
    R(x + T - 14, y + 6, 7, 7, PAL.ink);
    R(x + T - 13, y + 7, 5, 5, col);
  } else {
    R(x + T - 13, y + 7, 5, 5, (Math.sin(t * 4 + e.id) > -0.3) ? PAL.greenHi : '#1d6a3a');
  }
}
function drawRetimer(r, t) {
  const x = cx(r.i), y = cy(r.j) + Math.sin(t * 4 + r.i) * 1.5;
  const on = Math.sin(t * 5 + r.i) > -0.5;
  if (on) outline(x - 21, y - 19, 42, 38, 'rgba(87,227,137,.35)', 2);
  const sp = SPR.ret, img = IMGS[sp.src];
  if (img && img.complete && img.naturalWidth) {
    const sc = sp.size / Math.max(img.naturalWidth, img.naturalHeight);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  } else {
    R(x - 12, y - 9, 24, 18, PAL.ink);
  }
  R(x - 2, y + 12, 4, 4, on ? PAL.greenHi : PAL.green);
}

/* ---------------- cables & pulses ---------------- */
function laneOffset(c) {
  const twins = S.cables.filter(x => (x.a === c.a && x.b === c.b) || (x.a === c.b && x.b === c.a));
  const lane = twins.indexOf(c);
  return twins.length > 1 ? (lane - (twins.length - 1) / 2) * 8 : 0;
}
function cablePts(c) {
  const off = laneOffset(c);
  const raw = c.path.map(p => [cx(p.i), cy(p.j)]);
  return raw.map((p, k) => {
    const prev = raw[k - 1], next = raw[k + 1];
    const horiz = (prev && prev[1] === p[1]) || (next && next[1] === p[1]);
    return horiz ? [p[0], p[1] + off] : [p[0] + off, p[1]];
  });
}
function segFill(x1, y1, x2, y2, w, color) {
  if (Math.abs(y2 - y1) < 0.01) R(Math.min(x1, x2) - w / 2, y1 - w / 2, Math.abs(x2 - x1) + w, w, color);
  else if (Math.abs(x2 - x1) < 0.01) R(x1 - w / 2, Math.min(y1, y2) - w / 2, w, Math.abs(y2 - y1) + w, color);
  else {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
}
function predictEnd(other, tile, type) {
  const spec = CAB[type];
  const path = lPath(other, tile);
  let h = 100;
  for (let k = 1; k < path.length; k++) {
    h -= spec.loss;
    if (h < FAIL) return 0;
    if (spec.retime && retAt(path[k].i, path[k].j)) h = 100;
  }
  return h;
}
function drawElastic(c) {
  const other = S.ents.find(e => e.id === (c.a === drag.ent.id ? c.b : c.a));
  if (!other) return;
  const x1 = ex(other) + T / 2, y1 = ey(other) + T / 2;
  const x2 = ex(drag.ent) + T / 2, y2 = ey(drag.ent) + T / 2;
  const tile = hoverTile || { i: other.i, j: other.j };
  const h = predictEnd(other, tile, c.type);
  const col = h < FAIL ? PAL.red : healthColor(h);
  ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 22, x2, y2);
  ctx.stroke(); ctx.setLineDash([]);
  R(x1 - 4, y1 - 4, 8, 8, PAL.ink); R(x2 - 4, y2 - 4, 8, 8, PAL.ink);
}
function drawCable(c) {
  if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) { drawElastic(c); return; }
  const pts = cablePts(c);
  const spec = CAB[c.type];
  for (let k = 0; k < pts.length - 1; k++)
    segFill(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 10, PAL.bg);
  for (let k = 0; k < pts.length - 1; k++) {
    const beyond = !c.ok && k >= c.failAt;
    segFill(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 6, beyond ? '#5a1f1f' : spec.color);
    if (beyond) {
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
      const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
      for (let d = 4; d < len; d += 16)
        R(x1 + sx * d - 3, y1 + sy * d - 3, 6, 6, PAL.red);
    }
  }
  R(pts[0][0] - 4, pts[0][1] - 4, 8, 8, PAL.ink);
  R(pts[pts.length - 1][0] - 4, pts[pts.length - 1][1] - 4, 8, 8, PAL.ink);
  if (S.selected && S.selected.kind === 'cable' && S.selected.cable === c)
    for (let k = 0; k < pts.length - 1; k++)
      segFill(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 14, 'rgba(255,255,255,.14)');
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
  c.pulses = c.pulses.filter(p => p.t >= 0 && p.t <= Math.min(1, failFrac + 0.04));
}
function drawPulses(c) {
  const pts = cablePts(c);
  const n = c.path.length - 1;
  c.pulses.forEach(p => {
    const k = p.t * n, k0 = Math.min(n - 1, Math.max(0, Math.floor(k))), fr = k - k0;
    const x = Math.round((pts[k0][0] + (pts[k0 + 1][0] - pts[k0][0]) * fr) / 2) * 2;
    const y = Math.round((pts[k0][1] + (pts[k0 + 1][1] - pts[k0][1]) * fr) / 2) * 2;
    const h = healthAtFrac(c, p.t);
    const dying = !c.ok && p.t > c.failAt / n - 0.05;
    ctx.globalAlpha = Math.max(0.2, h / 100);
    R(x - 3, y - 3, 6, 6, dying ? PAL.red : healthColor(h));
    ctx.globalAlpha = 1;
  });
}

/* ---------------- fireworks ---------------- */
function levelComplete() {
  showBanner();
  spawnFireworks();
  clearTimeout(advanceTimer);
  const cur = S;
  advanceTimer = setTimeout(() => {
    if (S === cur && S.done) startLevel(Math.min(S.idx + 1, LEVELS.length - 1));
  }, 4200);
}
function spawnFireworks() {
  const colors = [PAL.greenHi, PAL.amber, '#4ad2e0', '#f06ab8', '#d0a03f', '#b48ae8'];
  for (let k = 0; k < 6; k++) {
    FX.push({
      kind: 'rocket',
      x: OX + 90 + Math.random() * (GRID_W * T - 180),
      y: OY + GRID_H * T,
      vy: -(400 + Math.random() * 150),
      delay: k * 0.4 + Math.random() * 0.25,
      fuse: 0.65 + Math.random() * 0.45,
      color: colors[k % colors.length]
    });
  }
}
function updateFx(dt) {
  const burst = [];
  FX.forEach(p => {
    if (p.kind === 'rocket') {
      if (p.delay > 0) { p.delay -= dt; return; }
      p.y += p.vy * dt;
      p.fuse -= dt;
      if (p.fuse <= 0 || p.y < OY + 60) {
        p.dead = true;
        const n = 26 + (Math.random() * 10 | 0);
        for (let s = 0; s < n; s++) {
          const a = (s / n) * Math.PI * 2, spd = 90 + Math.random() * 130;
          burst.push({
            kind: 'spark', x: p.x, y: p.y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            life: 1.0 + Math.random() * 0.5, max: 1.5,
            color: Math.random() < 0.25 ? '#ffffff' : p.color
          });
        }
      }
    } else {
      p.vy += 240 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
  });
  FX.push(...burst);
  FX = FX.filter(p => !p.dead);
}
function drawFx() {
  FX.forEach(p => {
    if (p.kind === 'rocket') {
      if (p.delay > 0) return;
      R(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2, 4, 8, '#fff3c4');
      ctx.globalAlpha = 0.4;
      R(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2 + 10, 4, 6, PAL.amber);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      R(Math.round(p.x / 2) * 2 - 2, Math.round(p.y / 2) * 2 - 2, 4, 4, p.color);
      ctx.globalAlpha = 1;
    }
  });
}

/* ---------------- main render ---------------- */
function drawGhost(t) {
  if (drag) return;
  if (!hoverTile || !mouse.inside) return;
  const { i, j } = hoverTile;
  if (CAT[S.tool]) {
    const occ = entAt(i, j);
    if (occ && !occ.locked) {
      outline(gx(i) + 2, gy(j) + 2, T - 4, T - 4, 'rgba(255,255,255,.6)', 2);
      return;
    }
    const bad = occ || retAt(i, j) || S.money < CAT[S.tool].cost;
    ctx.globalAlpha = 0.55;
    drawEnt({ i, j, id: -1, type: S.tool, online: false }, t);
    ctx.globalAlpha = 1;
    outline(gx(i) + 2, gy(j) + 2, T - 4, T - 4, bad ? PAL.red : PAL.green, 2);
  } else if (S.tool === 'retimer') {
    ctx.globalAlpha = 0.6; drawRetimer({ i, j }, t); ctx.globalAlpha = 1;
  } else if (CAB[S.tool] && S.pendA) {
    const e = entAt(i, j);
    const target = e ? { i: e.i, j: e.j } : { i, j };
    const pts = lPath(S.pendA, target).map(p => [cx(p.i), cy(p.j)]);
    for (let k = 0; k < pts.length - 1; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
      const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
      for (let d = 0; d < len; d += 12)
        R(x1 + sx * d - 2, y1 + sy * d - 2, 4, 4, CAB[S.tool].color);
    }
  }
  if ((CAB[S.tool] || S.tool === 'select') && entAt(i, j))
    outline(gx(i) + 2, gy(j) + 2, T - 4, T - 4, 'rgba(255,255,255,.6)', 2);
}
function frame(ts) {
  requestAnimationFrame(frame);
  const t = ts / 1000, dt = Math.max(0.001, Math.min(0.05, t - lastT || 0.016));
  lastT = t;
  updateShoot(dt);
  spaceBg(t);
  S.ents.forEach(e => {
    const tx0 = gx(e.i), ty0 = gy(e.j);
    if (drag && drag.lift && e === drag.ent && mouse.inside) {
      const k = Math.min(1, dt * 26);
      if (e.px === undefined) { e.px = tx0; e.py = ty0; }
      e.px += (mouse.x - T / 2 - e.px) * k;
      e.py += (mouse.y - T / 2 - e.py) * k;
    } else {
      if (e.px === undefined) { e.px = tx0; e.py = ty0; }
      const k = Math.min(1, dt * 14);
      e.px += (tx0 - e.px) * k;
      e.py += (ty0 - e.py) * k;
      if (Math.abs(e.px - tx0) < 0.4 && Math.abs(e.py - ty0) < 0.4) { e.px = tx0; e.py = ty0; }
    }
  });
  S.cables.forEach(drawCable);
  S.cables.forEach(c => {
    if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) return;
    updatePulses(c, dt, ts); drawPulses(c);
  });
  S.retimers.forEach(r => drawRetimer(r, t));
  S.ents.forEach(e => {
    if (drag && drag.lift && e === drag.ent) return;
    drawEnt(e, t);
  });
  if (drag && drag.lift) {
    if (hoverTile) {
      const occ = entAt(hoverTile.i, hoverTile.j);
      const bad = (occ && occ !== drag.ent) || retAt(hoverTile.i, hoverTile.j);
      outline(gx(hoverTile.i) + 2, gy(hoverTile.j) + 2, T - 4, T - 4, bad ? PAL.red : PAL.green, 2);
    }
    const e = drag.ent, cx0 = ex(e) + T / 2, cy0 = ey(e) + T / 2;
    ctx.save();
    ctx.translate(cx0, cy0 + 3); ctx.scale(1.12, 1.12); ctx.translate(-cx0, -cy0);
    drawEnt(e, t);
    ctx.restore();
  }
  if (S.pendA) outline(gx(S.pendA.i) + 1, gy(S.pendA.j) + 1, T - 2, T - 2, PAL.green, 2);
  if (S.selected && S.selected.kind === 'ent')
    outline(gx(S.selected.ent.i), gy(S.selected.ent.j), T, T, '#ffffff', 2);
  updateFx(dt);
  drawFx();
  drawGhost(t);
  if (performance.now() < toast.until) {
    ctx.font = '15px monospace'; ctx.textAlign = 'center';
    const w = ctx.measureText(toast.msg).width + 36;
    R((CW - w) / 2, CH - 64, w, 34, PAL.ink);
    outline((CW - w) / 2, CH - 64, w, 34, PAL.amber, 2);
    ctx.fillStyle = '#f5e6c0';
    ctx.fillText(toast.msg, CW / 2, CH - 42);
    ctx.textAlign = 'left';
  }
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
  if (drag) {
    if (!drag.lift && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 7) { drag.lift = true; drag.moved = true; }
    cvs.style.cursor = 'grabbing';
  } else {
    const th = hoverTile && entAt(hoverTile.i, hoverTile.j);
    const grabbable = th && !th.locked && !CAB[S.tool] && S.tool !== 'delete';
    cvs.style.cursor = grabbable ? 'grab' : (S.tool === 'select' ? 'default' : 'crosshair');
  }
});
cvs.addEventListener('pointerleave', () => { mouse.inside = false; hoverTile = null; });
cvs.addEventListener('pointerup', ev => {
  if (!drag) return;
  const d = drag; drag = null;
  const p = canvasXY(ev);
  const tile = tileAt(p.x, p.y);
  if (d.moved && tile) moveEnt(d.ent, tile.i, tile.j);
});
window.addEventListener('pointerup', () => { if (drag && !mouse.inside) drag = null; });
cvs.addEventListener('pointerdown', ev => {
  const p = canvasXY(ev);
  const tile = tileAt(p.x, p.y);
  const grabbed = tile && entAt(tile.i, tile.j);
  if (grabbed && !grabbed.locked && !CAB[S.tool] && S.tool !== 'delete') {
    drag = { ent: grabbed, moved: false, sx: p.x, sy: p.y };
    if (S.tool === 'select') { S.selected = { kind: 'ent', ent: grabbed }; showInspector(S.selected); }
    return;
  }
  if (CAT[S.tool]) { if (tile) tryPlaceEnt(S.tool, tile.i, tile.j); return; }
  if (S.tool === 'retimer') { if (tile) tryPlaceRet(tile.i, tile.j); return; }
  if (CAB[S.tool]) {
    const e = tile && entAt(tile.i, tile.j);
    if (!e) { say(S.pendA ? 'Click a device to finish the cable — Esc to cancel.' : 'Click a device to start a cable.'); return; }
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
  if (ev.key === 'Escape') { drag = null; S.pendA = null; setTool('select'); }
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
  $('levelName').textContent = SCALES[S.scale].label + ' · ' + S.level.title;
  const mode = $('btnMode');
  mode.textContent = S.level.sandbox ? '▶ Start campaign' : 'Sandbox';
  mode.classList.toggle('big', !!S.level.sandbox);
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
  g.imageSmoothingEnabled = false;
  if (CAT[key]) {
    const sp = SPR[key], img = IMGS[sp.src];
    if (img && img.complete && img.naturalWidth) {
      const [sx, sy, sw, sh] = sp.rect || [0, 0, img.naturalWidth, img.naturalHeight];
      const sc = Math.min(40 / sw, 40 / sh);
      g.drawImage(img, sx, sy, sw, sh, 23 - sw * sc / 2, 23 - sh * sc / 2, sw * sc, sh * sc);
    } else {
      g.fillStyle = FALLBACK[key] || '#888'; g.fillRect(8, 8, 30, 30);
    }
  } else if (CAB[key]) {
    g.strokeStyle = '#0f1120'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
    g.strokeStyle = CAB[key].color; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
  } else if (key === 'retimer') {
    const sp = SPR.ret, img = IMGS[sp.src];
    if (img && img.complete && img.naturalWidth) {
      const sc = Math.min(38 / img.naturalWidth, 38 / img.naturalHeight);
      g.drawImage(img, 23 - img.naturalWidth * sc / 2, 23 - img.naturalHeight * sc / 2, img.naturalWidth * sc, img.naturalHeight * sc);
    } else { g.fillStyle = '#0f1120'; g.fillRect(11, 15, 24, 16); }
  } else if (key === 'select') {
    g.fillStyle = '#c9cfe8'; g.strokeStyle = '#0f1120'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 8); g.lineTo(32, 24); g.lineTo(23, 25); g.lineTo(28, 36); g.lineTo(24, 38); g.lineTo(19, 27); g.lineTo(13, 33); g.closePath(); g.fill(); g.stroke();
  } else if (key === 'delete') {
    g.strokeStyle = PAL.red; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, 12); g.lineTo(34, 34); g.moveTo(34, 12); g.lineTo(12, 34); g.stroke();
  }
  return c;
}
function toolMeta(key) {
  if (CAT[key]) return { label: CAT[key].name, sub: fmtMoney(CAT[key].cost) };
  if (CAB[key]) return { label: CAB[key].name, sub: `${fmtMoney(CAB[key].cost)} · ${CAB[key].watts} W` };
  if (key === 'retimer') {
    const rs = RET_STATS[S.scale];
    return { label: RET.name, sub: `${fmtMoney(rs.cost)} · ${rs.watts} W` };
  }
  if (key === 'select') return { label: 'Move / inspect', sub: 'click or drag' };
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
  const cur = S.tool && ['select', ...S.level.tools, 'delete'].includes(S.tool) ? S.tool : 'select';
  setTool(cur);
}
function setTool(key) {
  S.tool = key; S.pendA = null;
  document.querySelectorAll('#tools button').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === key));
  const spec = CAT[key] || CAB[key] || (key === 'retimer' ? RET : null);
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
    const spec = CAT[th.ent.type];
    let status = '';
    if (spec.role === 'node') {
      const hub = SCALES[S.scale].hubName;
      status = th.ent.online
        ? `<p class="ok">Status: online — pushing ${spec.tput} Tb/s.</p>`
        : `<p class="bad">Status: offline — needs ${S.level.dualHome ? `healthy links to two different ${hub}s` : `a healthy link to the ${hub}`}${S.level.requireCore ? ' (which needs its own upstream links)' : ''}.</p>`;
    }
    $('infoBody').innerHTML = `<h3>${spec.name}</h3><p class="tagline">${spec.tag}</p>${status}<p>${spec.desc}</p><p class="real"><b>Real world:</b> ${spec.real}</p>`;
  } else if (th.kind === 'cable') {
    const c = th.cable, spec = CAB[c.type];
    const end = c.health[c.health.length - 1];
    const stat = c.ok
      ? `<p class="ok">Signal health at far end: ${Math.round(end)}%.</p>`
      : `<p class="bad">Link DOWN — signal health fell under ${FAIL}% partway. ${spec.retime ? 'Add a retimer earlier on the route.' : 'This run is too long for this cable.'}</p>`;
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
  const yay = ['Sweet!', 'Signal locked!', 'Niiice.', 'Link up!', 'That’s pretty cool.'];
  b.innerHTML = `<h2>${yay[Math.floor(Math.random() * yay.length)]} ${(S.level.title.split('—')[1] || 'Level').trim()} complete!</h2><p>${S.idx + 1 < LEVELS.length ? 'Next lesson in a moment…' : 'You built the whole chain!'}</p>`;
  b.classList.add('show');
  $('btnNext').hidden = S.idx + 1 >= LEVELS.length;
  setTimeout(() => b.classList.remove('show'), 3800);
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
    o.disabled = n > maxUnlocked() && !L.sandbox;
    sel.appendChild(o);
  });
  if (S) sel.value = S.idx;
}
function startLevel(idx) {
  clearTimeout(advanceTimer);
  FX = [];
  S = newLevelState(idx);
  buildToolbar(); buildLevelSelect();
  $('lvlSel').value = idx;
  $('btnNext').hidden = true;
  showInspector(null);
  recompute();
  showLesson();
}

$('btnMode').onclick = () => startLevel(S.level.sandbox ? 0 : LEVELS.length - 1);
$('modalClose').onclick = () => $('modal').classList.remove('open');
$('btnLesson').onclick = showLesson;
$('btnRestart').onclick = () => startLevel(S.idx);
$('btnNext').onclick = () => startLevel(Math.min(S.idx + 1, LEVELS.length - 1));
$('lvlSel').onchange = ev => startLevel(parseInt(ev.target.value, 10));

/* ---------------- boot ---------------- */
(function boot() {
  const dpr = window.devicePixelRatio || 1;
  DPRg = dpr;
  cvs.width = CW * dpr; cvs.height = CH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  buildStars();
  loadSprites(() => { if (S) buildToolbar(); });
  startLevel(LEVELS.length - 1);
  requestAnimationFrame(frame);
})();
