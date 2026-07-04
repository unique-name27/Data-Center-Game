'use strict';
/* Data Center Tycoon — Connectivity Edition (brick-toy style)
   A teaching game about the chips that move data, told at four scales:
   inside the server -> the rack -> the row -> the whole data center.
   Everything is built from studded plastic bricks on baseplates.
   All graphics are drawn procedurally on canvas — no image assets. */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 9;
const T = 64;
const CW = 1280, CH = 760;
const OX = (CW - GRID_W * T) / 2, OY = 92;
const FAIL = 30;               // signal health below this = dead link
const LS_KEY = 'dct_progress_v3';

const PAL = {
  room: '#b8c4cc', ink: '#05131d', white: '#f4f4f4',
  green: '#43d15f', amber: '#f5c518', red: '#c4281c',
  gold: '#d9a326', shadow: 'rgba(5,19,29,.28)'
};
const BODY = {
  gpu: '#c4281c', cpu: '#0d69ab', mem: '#f5c518', server: '#36aebf',
  tor: '#237841', leaf: '#237841', spine: '#7b2c8f', rk: '#583927',
  rw: '#e8720c', spine2: '#7b2c8f', dci: '#05131d'
};
const PLATE = { board: '#3ca044', rack: '#a3a2a4', row: '#d8c48e', dc: '#9fb8c8' };

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
    scale: 'board', name: 'PCIe trace', cost: 5, watts: 0.5, loss: 25, color: '#d9a326', retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (25% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer. That’s why they sit on motherboards and riser cards.'
  },
  dac1: {
    scale: 'rack', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 20, color: '#e8720c', retime: true,
    tag: 'Cheap, cool… and short',
    desc: 'Direct-attach copper: a passive twinax cable. Nearly free and burns almost no power, but health drops 20% per tile. Fine for short in-rack hops; long runs need retimers or an AEC.',
    real: 'At 100+ Gb/s per lane, passive copper reaches only ~2–3 meters.'
  },
  aec1: {
    scale: 'rack', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#00a29c', retime: false,
    tag: 'Copper with retimers built in',
    desc: 'An AEC is a copper cable with a retimer chip inside each connector shell, constantly cleaning the signal — only 6% loss per tile. Compare its price to placing loose retimers along a DAC.',
    real: 'AECs are one of the fastest-growing connectivity products — built around retimer silicon from companies like Astera Labs, Marvell and Broadcom.'
  },
  dac2: {
    scale: 'row', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 25, color: '#e8720c', retime: true,
    tag: 'Short hops only at row scale',
    desc: 'The same passive copper, but row distances are brutal: 25% health per tile. Use it rack-to-leaf when they’re adjacent, retime it, or move up to AEC/optics.',
    real: 'Operators use copper everywhere they can — it’s the cheapest watt in the building.'
  },
  aec2: {
    scale: 'row', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#00a29c', retime: false,
    tag: 'The mid-range workhorse',
    desc: 'Retimed copper: 6% loss per tile at a fraction of optics’ power and cost. The sweet spot for most in-row runs.',
    real: 'Inside each connector shell is the same retimer chip you placed by hand at board scale.'
  },
  opt: {
    scale: 'row', name: 'Optical link', cost: 2500, watts: 14, loss: 1.5, color: '#0d69ab', retime: false,
    tag: 'Longest reach, biggest bill',
    desc: 'Optical transceivers convert electrons to light — only 1.5% loss per tile, but every link burns 14 W and costs real money. Lasers also fail more often than copper.',
    real: 'Optics can dominate the network power budget of a large AI cluster.'
  },
  mmf: {
    scale: 'dc', name: 'Multimode optics', cost: 1800, watts: 11, loss: 4.5, color: '#26c6da', retime: false,
    tag: 'Aqua fiber for inside the hall',
    desc: 'Multimode fiber uses cheap VCSEL lasers — the budget optic. But the light bounces around inside the wide core, so reach is limited: 4.5% loss per tile. Great inside the hall, hopeless for the long haul.',
    real: 'Multimode is the aqua-jacketed cable in every data center photo. At high speeds it reaches ~50–100 m.'
  },
  smf: {
    scale: 'dc', name: 'Single-mode optics', cost: 4500, watts: 16, loss: 0.6, color: '#f5c518', retime: false,
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
  if (S.money < spec.cost) return say('Not enough budget. Money doesn’t grow on trees!');
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
  if (S.money < rs.cost) return say('Not enough budget. Money doesn’t grow on trees!');
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
  if (S.money < spec.cost) return say('Not enough budget. Money doesn’t grow on trees!');
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

/* ---------------- canvas + brick helpers ---------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let DPR = 1;
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
/* a round baseplate stud, top-down */
function stud(g, x, y, r, color) {
  g.fillStyle = shade(color, 0.82);
  g.beginPath(); g.arc(x + 0.8, y + 1.2, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(color, 1.06);
  g.beginPath(); g.arc(x, y, r - 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, Math.PI * 2); g.fill();
}
/* front-view stud tabs sticking up from a brick's top edge */
function studTabs(x, y, w, n, color) {
  const gap = w / n;
  for (let k = 0; k < n; k++) {
    const sx = x + gap * (k + 0.5) - 6;
    ctx.fillStyle = shade(color, 0.92);
    rr(sx, y - 6, 12, 7, [2.5, 2.5, 0, 0]); ctx.fill();
    ctx.fillStyle = shade(color, 1.18);
    R(sx + 1.5, y - 5, 9, 2, shade(color, 1.18));
  }
}
/* front-view brick: shadow, body, shading, gloss, outline, stud tabs */
function brick(x, y, w, h, color, nStuds) {
  ctx.fillStyle = PAL.shadow;
  rr(x + 3, y + 4, w, h, 3); ctx.fill();
  if (nStuds) studTabs(x, y, w, nStuds, color);
  ctx.fillStyle = color;
  rr(x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.30)';
  R(x + 2, y + 1.5, w - 4, 3, 'rgba(255,255,255,.30)');
  R(x + 1.5, y + 2, 3, h - 4, 'rgba(255,255,255,.22)');
  ctx.fillStyle = 'rgba(5,19,29,.22)';
  R(x + 2, y + h - 3.5, w - 4, 2.5, 'rgba(5,19,29,.22)');
  ctx.strokeStyle = shade(color, 0.6); ctx.lineWidth = 1.5;
  rr(x, y, w, h, 3); ctx.stroke();
}
function strokeSel(x, y, w, h, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width || 3;
  rr(x, y, w, h, 6); ctx.stroke();
}
/* faces: printed-tile style */
function face(x, y, mood, seed, t, opts) {
  const o = opts || {}, s = o.s || 1;
  const ew = 6.5 * s, gap = 9 * s;
  const blink = ((t * 0.45 + hash(seed) * 4) % 4) < 0.09;
  if (o.alien) {
    ctx.fillStyle = '#76ff03';
    [[-gap, 0], [gap, 0]].forEach(([dx]) => {
      ctx.beginPath(); ctx.ellipse(x + dx, y, 4.5 * s, 7 * s, dx > 0 ? 0.5 : -0.5, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    circle(x - gap, y, ew, '#ffffff'); circle(x + gap, y, ew, '#ffffff');
    if (blink) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(x - gap - 4 * s, y); ctx.lineTo(x - gap + 4 * s, y);
      ctx.moveTo(x + gap - 4 * s, y); ctx.lineTo(x + gap + 4 * s, y); ctx.stroke();
    } else {
      const lx = Math.sin(t * 0.7 + seed) * 1.6 * s;
      circle(x - gap + lx, y + 1, 2.3 * s, PAL.ink); circle(x + gap + lx, y + 1, 2.3 * s, PAL.ink);
    }
    if (o.glasses) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2 * s;
      ctx.strokeRect(x - gap - 6 * s, y - 5 * s, 12 * s, 10 * s);
      ctx.strokeRect(x + gap - 6 * s, y - 5 * s, 12 * s, 10 * s);
      ctx.beginPath(); ctx.moveTo(x - gap + 6 * s, y); ctx.lineTo(x + gap - 6 * s, y); ctx.stroke();
    }
    if (o.brows) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - gap - 5 * s, y - 9 * s); ctx.lineTo(x - gap + 4 * s, y - 6 * s);
      ctx.moveTo(x + gap + 5 * s, y - 9 * s); ctx.lineTo(x + gap - 4 * s, y - 6 * s);
      ctx.stroke();
    }
  }
  const my = y + 10 * s;
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
  if (mood === 'happy') {
    ctx.beginPath(); ctx.arc(x, my - 2 * s, 6 * s, 0.25, Math.PI - 0.25); ctx.stroke();
  } else if (mood === 'worry') {
    ctx.fillStyle = PAL.ink;
    ctx.beginPath(); ctx.ellipse(x, my + 1, 3.6 * s, 4.8 * s, 0, 0, Math.PI * 2); ctx.fill();
    const drop = (t * 40 + hash(seed) * 20) % 24;
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.ellipse(x + 15 * s, y - 5 * s + drop, 2.6 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(x - 4 * s, my); ctx.lineTo(x + 4 * s, my); ctx.stroke();
  }
}
function ex(e) { return e.px !== undefined ? e.px : gx(e.i); }
function ey(e) { return e.py !== undefined ? e.py : gy(e.j); }
function mood(e) {
  if (e.online) return 'happy';
  if (S.cables.some(c => c.a === e.id || c.b === e.id)) return 'worry';
  return 'idle';
}
function bounce(e, t) { return e.online ? Math.sin(t * 4 + e.id) * 2.5 : 0; }
function healthColor(h) { return h >= 65 ? PAL.green : h >= FAIL ? PAL.amber : PAL.red; }

/* ---------------- backgrounds (cached baseplates) ---------------- */
const bgCache = {};
function buildPlate(scale) {
  const c = document.createElement('canvas');
  c.width = CW * DPR; c.height = CH * DPR;
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = PAL.room; g.fillRect(0, 0, CW, CH);
  const color = PLATE[scale];
  const px = OX - 26, py = OY - 26, pw = GRID_W * T + 52, ph = GRID_H * T + 52;
  g.fillStyle = 'rgba(5,19,29,.3)';
  g.beginPath(); g.roundRect(px + 5, py + 7, pw, ph, 10); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.roundRect(px, py, pw, ph, 10); g.fill();
  g.strokeStyle = shade(color, 0.7); g.lineWidth = 2;
  g.beginPath(); g.roundRect(px, py, pw, ph, 10); g.stroke();
  g.strokeStyle = shade(color, 0.9); g.lineWidth = 1;
  for (let i = 0; i <= GRID_W; i++) { g.beginPath(); g.moveTo(gx(i), OY); g.lineTo(gx(i), OY + GRID_H * T); g.stroke(); }
  for (let j = 0; j <= GRID_H; j++) { g.beginPath(); g.moveTo(OX, gy(j)); g.lineTo(OX + GRID_W * T, gy(j)); g.stroke(); }
  if (scale === 'dc') {
    g.fillStyle = '#5a8fc4';
    g.beginPath(); g.roundRect(gx(14), gy(0), 2 * T, 2 * T, 6); g.fill();
  }
  if (scale === 'row') {
    g.fillStyle = '#f5c518';
    g.fillRect(OX, OY - 16, GRID_W * T, 7);
    g.fillRect(OX, OY + GRID_H * T + 9, GRID_W * T, 7);
  }
  if (scale === 'rack') {
    g.fillStyle = '#7c7c7e';
    g.beginPath(); g.roundRect(OX - 22, OY - 20, 14, GRID_H * T + 40, 5); g.fill();
    g.beginPath(); g.roundRect(OX + GRID_W * T + 8, OY - 20, 14, GRID_H * T + 40, 5); g.fill();
    g.fillStyle = '#4a4a4c';
    for (let j = 0; j <= GRID_H; j++) {
      g.beginPath(); g.arc(OX - 15, OY + j * T, 4, 0, 7); g.fill();
      g.beginPath(); g.arc(OX + GRID_W * T + 15, OY + j * T, 4, 0, 7); g.fill();
    }
  }
  for (let i = 0; i < GRID_W * 2; i++)
    for (let j = 0; j < GRID_H * 2; j++) {
      const sx2 = OX + 16 + i * 32, sy2 = OY + 16 + j * 32;
      if (scale === 'dc' && sx2 > gx(14) && sy2 < gy(2)) { stud(g, sx2, sy2, 6, '#5a8fc4'); continue; }
      stud(g, sx2, sy2, 6, color);
    }
  bgCache[scale] = c;
  return c;
}
function drawPlate() {
  const c = bgCache[S.scale] || buildPlate(S.scale);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

/* ---------------- sprites ---------------- */
function drawGPU(e, t) {
  const x = ex(e) + 9, y = ey(e) + bounce(e, t) + 12;
  brick(x, y, 46, 46, BODY.gpu, 3);
  ctx.fillStyle = shade(BODY.gpu, 0.7);
  circle(x + 37, y + 10, 6.5, shade(BODY.gpu, 0.7));
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x + 33, y + 6); ctx.lineTo(x + 41, y + 14);
  ctx.moveTo(x + 41, y + 6); ctx.lineTo(x + 33, y + 14); ctx.stroke();
  R(x + 5, y + 41, 36, 4, PAL.gold);
  face(x + 20, y + 24, mood(e), e.id, t, { s: 0.9 });
}
function drawCPU(e, t) {
  const x = ex(e) + 5, y = ey(e) + 12;
  brick(x, y, 54, 46, BODY.cpu, 4);
  R(x + 7, y + 41, 40, 4, PAL.gold);
  face(x + 27, y + 22, S.ents.some(n => n.online) ? 'happy' : 'idle', e.id, t, { glasses: true, s: 0.95 });
}
function drawMem(e, t) {
  const x = ex(e) + 19, y = ey(e) + 10;
  brick(x, y, 26, 48, BODY.mem, 1);
  R(x + 5, y + 32, 16, 5, shade(BODY.mem, 0.55));
  R(x + 5, y + 40, 16, 5, shade(BODY.mem, 0.55));
  face(x + 13, y + 16, 'idle', e.id, t, { s: 0.6 });
}
function drawServer(e, t) {
  const x = ex(e) + 4, y = ey(e) + bounce(e, t) + 20;
  brick(x, y, 56, 34, BODY.server, 4);
  circle(x + 46, y + 10, 3.5, mood(e) === 'happy' ? PAL.green : mood(e) === 'worry' ? PAL.red : shade(BODY.server, 0.6));
  circle(x + 46, y + 20, 3.5, shade(BODY.server, 0.6));
  face(x + 22, y + 16, mood(e), e.id, t, { s: 0.8 });
}
function drawTorLeaf(e, t) {
  const x = ex(e) + 4, y = ey(e) + 24;
  brick(x, y, 56, 32, BODY.tor, 4);
  for (let p = 0; p < 4; p++) R(x + 9 + p * 12, y + 24, 7, 5, PAL.ink);
  face(x + 28, y + 12, S.stats.online > 0 ? 'happy' : 'idle', e.id, t, { s: 0.75 });
}
function drawSpine(e, t) {
  const x = ex(e) + 6, y = ey(e) + 10;
  brick(x, y, 52, 48, BODY.spine, 4);
  for (let p = 0; p < 4; p++) R(x + 8 + p * 11, y + 39, 7, 5, PAL.ink);
  face(x + 26, y + 20, 'idle', e.id, t, { brows: true, s: 0.9 });
}
function drawRack(e, t) {
  const x = ex(e) + 9, y = ey(e) + bounce(e, t) + 8;
  brick(x, y, 46, 54, BODY.rk, 3);
  for (let k = 0; k < 3; k++)
    circle(x + 39, y + 12 + k * 9, 2.8, e.online ? PAL.green : shade(BODY.rk, 0.6));
  face(x + 19, y + 18, mood(e), e.id, t, { s: 0.75 });
  R(x + 6, y + 40, 34, 4, shade(BODY.rk, 0.6));
  R(x + 6, y + 47, 34, 4, shade(BODY.rk, 0.6));
}
function drawRowBlock(e, t) {
  const x = ex(e) + 2, y = ey(e) + bounce(e, t) + 20;
  brick(x, y, 60, 36, BODY.rw, 5);
  const m = mood(e);
  for (let k = 0; k < 3; k++) {
    const fx = x + 13 + k * 18;
    circle(fx - 4, y + 12, 2, PAL.ink); circle(fx + 4, y + 12, 2, PAL.ink);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    if (m === 'happy') ctx.arc(fx, y + 17, 3.5, 0.3, Math.PI - 0.3);
    else if (m === 'worry') { ctx.arc(fx, y + 21, 2.6, Math.PI, 0); }
    else { ctx.moveTo(fx - 3, y + 19); ctx.lineTo(fx + 3, y + 19); }
    ctx.stroke();
  }
  R(x + 5, y + 28, 50, 4, shade(BODY.rw, 0.6));
}
function drawSpinePod(e, t) {
  const x = ex(e) + 6, y = ey(e) + 14;
  brick(x, y, 52, 46, BODY.spine2, 4);
  ctx.fillStyle = PAL.amber;
  ctx.beginPath();
  ctx.moveTo(x + 12, y - 8); ctx.lineTo(x + 16, y - 18); ctx.lineTo(x + 22, y - 10);
  ctx.lineTo(x + 26, y - 20); ctx.lineTo(x + 30, y - 10); ctx.lineTo(x + 36, y - 18);
  ctx.lineTo(x + 40, y - 8); ctx.closePath(); ctx.fill();
  for (let p = 0; p < 4; p++) R(x + 8 + p * 11, y + 37, 7, 5, PAL.ink);
  face(x + 26, y + 18, 'idle', e.id, t, { brows: true, s: 0.85 });
}
function drawDci(e, t) {
  const x = ex(e) + 7, y = ey(e) + 12;
  brick(x, y, 50, 48, BODY.dci, 3);
  ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x + 25, y + 24, 17 + Math.sin(t * 3) * 1.2, 0, Math.PI * 2); ctx.stroke();
  face(x + 25, y + 22, 'idle', e.id, t, { alien: true, s: 0.9 });
  ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x + 19, y + 33); ctx.quadraticCurveTo(x + 25, y + 36, x + 31, y + 33); ctx.stroke();
}
function drawRetimer(r, t) {
  const x = cx(r.i), y = cy(r.j) + Math.sin(t * 4 + r.i) * 1.5;
  ctx.fillStyle = PAL.red;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 4); ctx.lineTo(x - 21, y + 12); ctx.lineTo(x - 4, y + 8);
  ctx.closePath(); ctx.fill();
  brick(x - 14, y - 10, 28, 20, '#1a1a1c', 2);
  R(x - 12, y - 5, 24, 6, PAL.red);
  circle(x - 5, y - 2, 1.8, '#ffffff'); circle(x + 5, y - 2, 1.8, '#ffffff');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + 4, 3.5, 0.3, Math.PI - 0.3); ctx.stroke();
}
const DRAW = { gpu: drawGPU, cpu: drawCPU, mem: drawMem, server: drawServer, tor: drawTorLeaf, leaf: drawTorLeaf, spine: drawSpine, rk: drawRack, rw: drawRowBlock, spine2: drawSpinePod, dci: drawDci };

/* ---------------- cables & pulses ---------------- */
function wigglePts(c) {
  const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
  const twins = S.cables.filter(x => (x.a === c.a && x.b === c.b) || (x.a === c.b && x.b === c.a));
  const lane = twins.indexOf(c);
  const laneOff = twins.length > 1 ? (lane - (twins.length - 1) / 2) * 8 : 0;
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const horiz = y1 === y2;
    const steps = Math.max(2, Math.round(len / 16));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const bx = x1 + (x2 - x1) * f, by = y1 + (y2 - y1) * f;
      const w = Math.sin((bx + by) * 0.1 + c.id) * 1.5 + laneOff;
      out.push([bx + (horiz ? 0 : w), by + (horiz ? w : 0), k + f]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1], pts.length - 1]);
  return out;
}
function strokeRun(pts, from, to, color, width, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  let started = false;
  pts.forEach(p => {
    if (p[2] < from - 0.001 || p[2] > to + 0.001) return;
    if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
    else ctx.lineTo(p[0], p[1]);
  });
  ctx.stroke(); ctx.setLineDash([]);
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
  circle(x1, y1, 5, PAL.ink); circle(x2, y2, 5, PAL.ink);
}
function drawCable(c) {
  if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) { drawElastic(c); return; }
  const pts = wigglePts(c);
  const n = c.path.length - 1;
  const spec = CAB[c.type];
  strokeRun(pts, 0, n, PAL.ink, 9);
  if (c.ok) {
    strokeRun(pts, 0, n, spec.color, 6);
    strokeRun(pts, 0, n, 'rgba(255,255,255,.3)', 1.8);
  } else {
    strokeRun(pts, 0, c.failAt, spec.color, 6);
    strokeRun(pts, 0, c.failAt, 'rgba(255,255,255,.3)', 1.8);
    strokeRun(pts, c.failAt, n, PAL.red, 5, [10, 8]);
  }
  const first = pts[0], last = pts[pts.length - 1];
  [first, last].forEach(p => {
    ctx.fillStyle = '#7c7c7e';
    rr(p[0] - 6, p[1] - 6, 12, 12, 3); ctx.fill();
    ctx.strokeStyle = '#4a4a4c'; ctx.lineWidth = 1.5;
    rr(p[0] - 6, p[1] - 6, 12, 12, 3); ctx.stroke();
  });
  if (S.selected && S.selected.kind === 'cable' && S.selected.cable === c)
    strokeRun(pts, 0, n, 'rgba(255,255,255,.45)', 12);
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
  const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
  const n = c.path.length - 1;
  c.pulses.forEach(p => {
    const k = p.t * n, k0 = Math.min(n - 1, Math.max(0, Math.floor(k))), fr = k - k0;
    const x = pts[k0][0] + (pts[k0 + 1][0] - pts[k0][0]) * fr;
    const y = pts[k0][1] + (pts[k0 + 1][1] - pts[k0][1]) * fr;
    const h = healthAtFrac(c, p.t);
    const dying = !c.ok && p.t > c.failAt / n - 0.05;
    const col = dying ? PAL.red : healthColor(h);
    ctx.globalAlpha = Math.max(0.25, h / 100);
    circle(x + 0.8, y + 1, dying ? 6 : 5, shade(col, 0.75));
    circle(x, y, dying ? 5.4 : 4.4, col);
    circle(x - 1.6, y - 1.6, 1.5, 'rgba(255,255,255,.85)');
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
  const colors = [PAL.green, PAL.amber, '#26c6da', '#e8720c', '#c4281c', '#0d69ab'];
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
            spin: (Math.random() * 6 - 3),
            color: Math.random() < 0.25 ? '#f4f4f4' : p.color
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
      circle(p.x, p.y, 3.5, '#fff3c4');
      ctx.globalAlpha = 0.4; circle(p.x, p.y + 10, 2.5, PAL.amber); ctx.globalAlpha = 1;
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * p.spin);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      R(-3.5, -3.5, 7, 7, p.color);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill();
      ctx.restore();
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
      strokeSel(gx(i) + 3, gy(j) + 3, T - 6, T - 6, 'rgba(255,255,255,.7)', 3);
      return;
    }
    const bad = occ || retAt(i, j) || S.money < CAT[S.tool].cost;
    ctx.globalAlpha = 0.55;
    DRAW[S.tool]({ i, j, id: -1, online: false }, t);
    ctx.globalAlpha = 1;
    strokeSel(gx(i) + 3, gy(j) + 3, T - 6, T - 6, bad ? PAL.red : PAL.green, 3);
  } else if (S.tool === 'retimer') {
    ctx.globalAlpha = 0.6; drawRetimer({ i, j }, t); ctx.globalAlpha = 1;
  } else if (CAB[S.tool] && S.pendA) {
    const e = entAt(i, j);
    const target = e ? { i: e.i, j: e.j } : { i, j };
    const pts = lPath(S.pendA, target).map(p => [cx(p.i), cy(p.j)]);
    ctx.strokeStyle = CAB[S.tool].color; ctx.lineWidth = 4; ctx.setLineDash([8, 8]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.stroke(); ctx.setLineDash([]);
  }
  if ((CAB[S.tool] || S.tool === 'select') && entAt(i, j))
    strokeSel(gx(i) + 3, gy(j) + 3, T - 6, T - 6, 'rgba(255,255,255,.7)', 3);
}
function frame(ts) {
  requestAnimationFrame(frame);
  const t = ts / 1000, dt = Math.max(0.001, Math.min(0.05, t - lastT || 0.016));
  lastT = t;
  drawPlate();
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
    DRAW[e.type](e, t);
  });
  if (drag && drag.lift) {
    if (hoverTile) {
      const occ = entAt(hoverTile.i, hoverTile.j);
      const bad = (occ && occ !== drag.ent) || retAt(hoverTile.i, hoverTile.j);
      strokeSel(gx(hoverTile.i) + 3, gy(hoverTile.j) + 3, T - 6, T - 6, bad ? PAL.red : PAL.green, 3);
    }
    const e = drag.ent, cx0 = ex(e) + T / 2, cy0 = ey(e) + T / 2;
    ctx.save();
    ctx.translate(cx0, cy0 + 3); ctx.scale(1.12, 1.12); ctx.translate(-cx0, -cy0);
    DRAW[e.type](e, t);
    ctx.restore();
  }
  if (S.pendA) strokeSel(gx(S.pendA.i) + 2, gy(S.pendA.j) + 2, T - 4, T - 4, PAL.green, 3);
  if (S.selected && S.selected.kind === 'ent')
    strokeSel(gx(S.selected.ent.i), gy(S.selected.ent.j), T, T, '#ffffff', 3);
  updateFx(dt);
  drawFx();
  drawGhost(t);
  if (performance.now() < toast.until) {
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(toast.msg).width + 46;
    ctx.fillStyle = PAL.shadow;
    rr((CW - w) / 2 + 3, CH - 66 + 4, w, 38, 5); ctx.fill();
    ctx.fillStyle = PAL.white;
    rr((CW - w) / 2, CH - 66, w, 38, 5); ctx.fill();
    studTabs((CW - w) / 2 + 8, CH - 66, w - 16, Math.max(2, Math.floor(w / 40)), PAL.white);
    ctx.fillStyle = PAL.white;
    rr((CW - w) / 2, CH - 66, w, 38, 5); ctx.fill();
    ctx.strokeStyle = '#c9c9c9'; ctx.lineWidth = 1.5;
    rr((CW - w) / 2, CH - 66, w, 38, 5); ctx.stroke();
    ctx.fillStyle = PAL.ink;
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
  const miniBrick = (x, y, w, h, color, n) => {
    g.fillStyle = 'rgba(5,19,29,.28)'; g.beginPath(); g.roundRect(x + 2, y + 3, w, h, 2); g.fill();
    if (n) {
      const gap = w / n;
      for (let k = 0; k < n; k++) {
        g.fillStyle = shade(color, 0.92);
        g.beginPath(); g.roundRect(x + gap * (k + .5) - 4, y - 4, 8, 5, [2, 2, 0, 0]); g.fill();
      }
    }
    g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x + 1.5, y + 1, w - 3, 2);
    g.strokeStyle = shade(color, 0.6); g.lineWidth = 1; g.beginPath(); g.roundRect(x, y, w, h, 2); g.stroke();
  };
  const miniEyes = (x, y, s) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 5 * s, y, 3.5 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 5 * s, y, 3.5 * s, 0, 7); g.fill();
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(x - 5 * s, y + 1, 1.4 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 5 * s, y + 1, 1.4 * s, 0, 7); g.fill();
    g.strokeStyle = PAL.ink; g.lineWidth = 1.5; g.beginPath();
    g.arc(x, y + 6 * s, 3 * s, 0.4, Math.PI - 0.4); g.stroke();
  };
  if (CAT[key]) {
    const dims = { gpu: [9, 12, 28, 26, 2], cpu: [7, 12, 32, 26, 3], mem: [16, 8, 14, 32, 1], server: [6, 15, 34, 22, 3], tor: [6, 15, 34, 22, 3], leaf: [6, 15, 34, 22, 3], spine: [8, 10, 30, 30, 3], rk: [11, 8, 24, 32, 2], rw: [5, 15, 36, 22, 4], spine2: [8, 12, 30, 28, 3], dci: [9, 11, 28, 28, 2] };
    const d = dims[key] || [8, 12, 30, 26, 3];
    miniBrick(d[0], d[1], d[2], d[3], BODY[key] || '#888', d[4]);
    miniEyes(d[0] + d[2] / 2, d[1] + d[3] * 0.42, 0.9);
    if (key === 'spine2') { g.fillStyle = PAL.amber; g.beginPath(); g.moveTo(14, 10); g.lineTo(18, 3); g.lineTo(23, 9); g.lineTo(28, 3); g.lineTo(32, 10); g.closePath(); g.fill(); }
    if (key === 'dci') { g.strokeStyle = '#76ff03'; g.lineWidth = 2; g.beginPath(); g.arc(23, 25, 11, 0, 7); g.stroke(); }
  } else if (CAB[key]) {
    g.strokeStyle = PAL.ink; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
    g.strokeStyle = CAB[key].color; g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
  } else if (key === 'retimer') {
    g.fillStyle = PAL.red; g.beginPath(); g.moveTo(14, 18); g.lineTo(4, 34); g.lineTo(18, 30); g.closePath(); g.fill();
    miniBrick(11, 16, 24, 16, '#1a1a1c', 2);
    g.fillStyle = PAL.red; g.fillRect(12.5, 20, 21, 5);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(18, 22.5, 1.6, 0, 7); g.fill(); g.beginPath(); g.arc(28, 22.5, 1.6, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.beginPath(); g.arc(23, 27, 2.6, 0.4, Math.PI - 0.4); g.stroke();
  } else if (key === 'select') {
    g.fillStyle = '#f4f4f4';
    g.strokeStyle = PAL.ink; g.lineWidth = 2;
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
  setTool('select');
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
  const yay = ['Sweet!', 'It clicks!', 'Niiice.', 'Snapped together!', 'That’s pretty cool.'];
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
  DPR = window.devicePixelRatio || 1;
  cvs.width = CW * DPR; cvs.height = CH * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  startLevel(LEVELS.length - 1);
  requestAnimationFrame(frame);
})();
