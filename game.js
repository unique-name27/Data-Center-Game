'use strict';
/* Data Center Tycoon — Connectivity Edition (pixel art)
   A teaching game about the chips that move data, told at three scales:
   inside the server -> the rack -> the row.
   All graphics are drawn procedurally on canvas — no image assets. */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 9;
const T = 64;
const CW = 1280, CH = 760;
const OX = (CW - GRID_W * T) / 2, OY = 92;
const FAIL = 30;               // signal health below this = dead link
const LS_KEY = 'dct_progress_v2';

const PAL = {
  bg: '#0b0d14', ink: '#0f1120', dark: '#12141f', steel: '#333c57',
  lite: '#566c86', hi: '#94b0c2', green: '#38b764', greenHi: '#8dffb8',
  red: '#e05555', amber: '#f5c542', copper: '#b7653a', gold: '#d0a03f',
  teal: '#2f7a5c', tealHi: '#4aa87c', purp: '#5d3f8f', purpHi: '#8f6ac2',
  blue: '#3b5dc9', dim: '#3a3f55'
};

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
    desc: 'GPUs pull their working data through the CPU from system memory. Keep at least one DIMM wired to the CPU or nothing computes.',
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
    desc: 'Everything from level 5 — racks, leaves, cables — collapsed into one block pushing 25.6 Tb/s. At this scale a single link is a liability: rows dual-home to two different spine pods so one failure can’t take them dark.',
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
    scale: 'board', name: 'PCIe trace', cost: 5, watts: 0.5, loss: 25, color: PAL.gold, retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (25% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer. That’s why they sit on motherboards and riser cards.'
  },
  dac1: {
    scale: 'rack', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 20, color: PAL.copper, retime: true,
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
    scale: 'row', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 25, color: PAL.copper, retime: true,
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
    scale: 'board', title: 'Level 1 — First light', requireCore: true, oversub: 99,
    budget: 4000, tools: ['gpu', 'trace'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'mem', i: 5, j: 4 }],
    preCables: [{ a: 0, b: 1, type: 'trace' }],
    goals: [{ text: 'Bring 2 GPUs online', check: s => s.stats.online >= 2 }],
    lesson: `<h2>First light</h2>
      <p>Zoom all the way in. Before there are data centers, there is a <b>circuit board</b>: a CPU, its memory, and empty PCIe slots.</p>
      <p>Place two <b>GPUs</b> near the CPU and wire each one up with a <b>PCIe trace</b> (click the GPU, then the CPU). The gold pulses are your data moving over bare copper.</p>
      <p class="tip">A GPU is online when it has a healthy trace to the CPU — and the CPU has memory attached (already wired for you).</p>`
  },
  {
    scale: 'board', title: 'Level 2 — The long trace', requireCore: true, oversub: 99,
    budget: 250, tools: ['trace', 'retimer'],
    pre: [{ t: 'cpu', i: 2, j: 4 }, { t: 'mem', i: 1, j: 4 }, { t: 'gpu', i: 14, j: 4 }],
    preCables: [{ a: 0, b: 1, type: 'trace' }],
    goals: [{ text: 'Bring the far GPU online', check: s => s.stats.online >= 1 }],
    lesson: `<h2>The long trace</h2>
      <p>This GPU sits on a riser at the far edge of the board. Copper is cheap, but at these speeds the signal <b>smears out</b> — 25% health per tile, and below 30% the data is gone.</p>
      <p>Run the trace, watch the pulse fade and die, then place <b>retimer chips</b> along the route (every 2 tiles or so). Each one reads the blurry signal and retransmits it perfectly clean.</p>
      <p class="tip">A retimer can’t resurrect a dead signal — place it before health falls under 30%.</p>`
  },
  {
    scale: 'rack', title: 'Level 3 — Top of rack', requireCore: false,
    budget: 26000, tools: ['server', 'dac1'],
    pre: [{ t: 'tor', i: 8, j: 0 }],
    goals: [{ text: 'Bring 3 servers online', check: s => s.stats.online >= 3 }],
    lesson: `<h2>Top of rack</h2>
      <p>Zoom out. Your board is now inside a <b>server</b>, and servers slide into a <b>rack</b>. At the top sits the <b>ToR (top-of-rack) switch</b> — the first hop out of the box.</p>
      <p>Place three servers in the rack and connect each one to the ToR with a <b>copper DAC</b>. Notice why the switch lives at the top: short cables stay healthy and cheap.</p>
      <p class="tip">Same physics as the board — copper degrades with distance. Keep servers close to the ToR.</p>`
  },
  {
    scale: 'rack', title: 'Level 4 — The bottom U', requireCore: false,
    budget: 1000, tools: ['dac1', 'aec1', 'retimer'],
    pre: [{ t: 'tor', i: 8, j: 0 }, { t: 'server', i: 6, j: 8 }],
    goals: [{ text: 'Bring the bottom server online', check: s => s.stats.online >= 1 }],
    lesson: `<h2>The bottom U</h2>
      <p>A server got racked at the very bottom, far from the ToR. A bare DAC dies on the way. You have two fixes:</p>
      <p><b>Retimers</b> placed along a DAC — the board-scale trick, but each shelf costs $300 out here.<br>
      An <b>AEC</b> — a copper cable with retimer chips already built into each connector shell.</p>
      <p>Do the math against your $1,000 budget. Sometimes the smartest place for a retimer is inside the cable.</p>
      <p class="tip">An AEC <i>is</i> the retimer lesson from level 2, productized.</p>`
  },
  {
    scale: 'row', title: 'Level 5 — Down the row', requireCore: false, powerCapW: 30,
    budget: 6000, tools: ['dac2', 'aec2', 'opt', 'retimer'],
    pre: [
      { t: 'leaf', i: 2, j: 4 },
      { t: 'rk', i: 4, j: 4 }, { t: 'rk', i: 7, j: 4 },
      { t: 'rk', i: 11, j: 4 }, { t: 'rk', i: 13, j: 6 }
    ],
    goals: [
      { text: 'Bring all 4 racks online', check: s => s.stats.online >= 4 },
      { text: 'Keep link power at or under 30 W', check: s => s.stats.watts <= 30.001 }
    ],
    lesson: `<h2>Down the row</h2>
      <p>Zoom out again. Racks stand in a <b>row</b>, and their uplinks converge on a <b>leaf switch</b>. Four racks sit at different distances — and there are three ways to cross a row:</p>
      <p><b>Copper DAC</b> — nearly free, zero power, very short.<br>
      <b>AEC</b> — retimed copper. Medium cost, medium power, good reach.<br>
      <b>Optical</b> — goes anywhere, but 14 W and $2,500 per link.</p>
      <p>All-optical would blow your 30 W power cap. Match each distance to the right technology.</p>
      <p class="tip">Click a cable after placing it to see its signal health.</p>`
  },
  {
    scale: 'row', title: 'Level 6 — Scale out', requireCore: true, oversub: 2,
    budget: 12000, tools: ['leaf', 'dac2', 'aec2', 'opt', 'retimer'],
    pre: [
      { t: 'spine', i: 8, j: 0 },
      { t: 'rk', i: 4, j: 6 }, { t: 'rk', i: 6, j: 6 },
      { t: 'rk', i: 10, j: 6 }, { t: 'rk', i: 12, j: 6 }
    ],
    goals: [
      { text: 'Bring 4 racks online', check: s => s.stats.online >= 4 },
      { text: 'Use at least 2 leaf switches', check: s => s.stats.leavesUsed >= 2 }
    ],
    lesson: `<h2>Scale out</h2>
      <p>One switch can’t host every row. Data centers scale with a <b>leaf-spine</b> fabric: racks → leaves, leaves → spine, and any rack reaches any other in three hops.</p>
      <p>Uplinks are shared — each leaf needs at least <b>one healthy spine uplink per two racks</b> (2:1 oversubscription, a common real-world ratio).</p>
      <p class="tip">Every tier you add means more links — and more connectivity chips. That’s why this chip market is exploding alongside AI.</p>`
  },
  {
    scale: 'dc', title: 'Level 7 — The whole floor', requireCore: false, dualHome: true, powerCapW: 100,
    budget: 15000, tools: ['mmf', 'smf'],
    pre: [
      { t: 'spine2', i: 7, j: 4 }, { t: 'spine2', i: 9, j: 4 },
      { t: 'rw', i: 1, j: 1 }, { t: 'rw', i: 1, j: 7 },
      { t: 'rw', i: 14, j: 1 }, { t: 'rw', i: 14, j: 7 }
    ],
    goals: [
      { text: 'Bring all 4 rows online (dual-homed to both spine pods)', check: s => s.stats.online >= 4 },
      { text: 'Keep link power at or under 100 W', check: s => s.stats.watts <= 100.001 }
    ],
    lesson: `<h2>The whole floor</h2>
      <p>Final zoom-out. Your row is now one block among many, and the distances are 100 meters — <b>copper cannot play here at all</b>. Past the row, everything is fiber.</p>
      <p>New rule at this scale: <b>failure matters</b>. One cable or one spine pod dying must not take a row dark, so every row needs healthy links to <b>two different spine pods</b>. That’s called dual-homing.</p>
      <p class="tip">Multimode (aqua) is the affordable optic for inside the hall. Check what single-mode costs and ask yourself why.</p>`
  },
  {
    scale: 'dc', title: 'Level 8 — To the world', requireCore: true, oversub: 2,
    budget: 70000, tools: ['spine2', 'mmf', 'smf'],
    pre: [
      { t: 'dci', i: 15, j: 0 },
      { t: 'rw', i: 1, j: 7 }, { t: 'rw', i: 5, j: 7 },
      { t: 'rw', i: 9, j: 7 }, { t: 'rw', i: 13, j: 7 }
    ],
    goals: [
      { text: 'Bring 4 rows online', check: s => s.stats.online >= 4 },
      { text: 'Use at least 2 spine pods', check: s => s.stats.leavesUsed >= 2 }
    ],
    lesson: `<h2>To the world</h2>
      <p>A data center that can’t reach other data centers is an island. In the corner sits the <b>DCI room</b> — Data Center Interconnect, the door to the world.</p>
      <p>Place spine pods, uplink the rows with multimode, then get each pod to the DCI gateway. Watch the distance: multimode dies on the long diagonal. The far run needs <b>single-mode</b> — the yellow fiber that leaves buildings.</p>
      <p class="tip">Every hop you’ve built — trace, DAC, AEC, leaf, spine, DCI — is one unbroken chain from a GPU’s pins to the internet.</p>`
  },
  {
    scale: 'dc', title: 'Sandbox — The whole data center', sandbox: true, requireCore: false,
    budget: 2000000, tools: ['rw', 'spine2', 'dci', 'mmf', 'smf'],
    pre: [],
    goals: [{ text: 'Build the biggest, healthiest floor you can', check: () => false }],
    lesson: `<h2>Sandbox</h2>
      <p>The whole floor is yours and the budget is deep. Build rows, pods and DCI — the HUD tracks throughput and link power, so chase the best <b>terabits per watt per dollar</b> you can.</p>
      <p class="tip">Try dual-homing everything, then delete one spine pod and watch what survives. That’s why redundancy is worth the money.</p>`
  }
];

/* ---------------- state ---------------- */
let S = null;
let mouse = { x: 0, y: 0, inside: false };
let hoverTile = null;
let toast = { msg: '', until: 0 };
let lastT = 0, idSeq = 1;
let FX = [], advanceTimer = 0;

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
  if (S.cables.some(c => (c.a === A.id && c.b === B.id) || (c.a === B.id && c.b === A.id)))
    return say('Those two are already connected.');
  if (portCount(A) >= CAT[A.type].ports) return say(`${CAT[A.type].name} is out of ports.`);
  if (portCount(B) >= CAT[B.type].ports) return say(`${CAT[B.type].name} is out of ports.`);
  const spec = CAB[type];
  if (S.money < spec.cost) return say('Not enough budget.');
  S.money -= spec.cost;
  S.cables.push({ id: idSeq++, type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0 });
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

/* ---------------- backgrounds ---------------- */
function drawBoardBg() {
  R(0, 0, CW, CH, PAL.bg);
  R(OX - 24, OY - 24, GRID_W * T + 48, GRID_H * T + 48, '#0f2818');
  outline(OX - 24, OY - 24, GRID_W * T + 48, GRID_H * T + 48, '#1d4030', 3);
  for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++)
    R(gx(i) + 1, gy(j) + 1, T - 2, T - 2, (i + j) % 2 ? '#123020' : '#14351f');
  for (let i = 0; i <= GRID_W; i++) for (let j = 0; j <= GRID_H; j++)
    R(gx(i) - 2, gy(j) - 2, 4, 4, '#1d4030');
  [[OX - 16, OY - 16], [OX + GRID_W * T + 4, OY - 16], [OX - 16, OY + GRID_H * T + 4], [OX + GRID_W * T + 4, OY + GRID_H * T + 4]]
    .forEach(([x, y]) => { R(x, y, 12, 12, PAL.bg); outline(x, y, 12, 12, '#3a5a48', 2); });
}
function drawRackBg() {
  R(0, 0, CW, CH, PAL.bg);
  R(OX - 30, OY - 20, GRID_W * T + 60, GRID_H * T + 40, '#171b26');
  R(OX - 30, OY - 20, 16, GRID_H * T + 40, '#3a4358');
  R(OX + GRID_W * T + 14, OY - 20, 16, GRID_H * T + 40, '#3a4358');
  for (let j = 0; j <= GRID_H; j++) {
    R(OX - 26, OY + j * T - 2 + (j ? -T / 2 : T / 2) * 0, 8, 4, PAL.ink);
    R(OX + GRID_W * T + 18, OY + j * T - 2, 8, 4, PAL.ink);
    R(OX - 26, OY + j * T - 2, 8, 4, PAL.ink);
  }
  for (let j = 0; j < GRID_H; j++)
    R(OX - 14, OY + (j + 1) * T - 1, GRID_W * T + 28, 2, '#20263a');
  R(OX - 30, OY - 20, GRID_W * T + 60, 6, PAL.lite);
}
function drawRowBg() {
  R(0, 0, CW, CH, PAL.bg);
  for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++)
    R(gx(i), gy(j), T, T, (i + j) % 2 ? '#202430' : '#232838');
  R(OX, OY - 10, GRID_W * T, 6, PAL.amber);
  R(OX, OY + GRID_H * T + 4, GRID_W * T, 6, PAL.amber);
}
function drawDcBg() {
  R(0, 0, CW, CH, PAL.bg);
  outline(OX - 22, OY - 22, GRID_W * T + 44, GRID_H * T + 44, '#3a4358', 10);
  for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++)
    R(gx(i), gy(j), T, T, (Math.floor(i / 2) + Math.floor(j / 2)) % 2 ? '#242833' : '#272b38');
  R(gx(14), gy(0), 2 * T, 2 * T, '#1d3242');
  outline(gx(14), gy(0), 2 * T, 2 * T, '#2a5a7a', 2);
  R(OX + GRID_W * T / 2 - 48, OY + GRID_H * T + 12, 96, 10, PAL.bg);
}
const BG = { board: drawBoardBg, rack: drawRackBg, row: drawRowBg, dc: drawDcBg };

/* ---------------- sprites ---------------- */
function ledState(e, t) {
  const connected = S.cables.some(c => c.a === e.id || c.b === e.id);
  if (e.online) return (Math.sin(t * 6 + e.id) > 0) ? PAL.green : '#1d6a3a';
  if (connected) return PAL.red;
  return PAL.dim;
}
function drawGPU(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 8, y + 4, 48, 56, PAL.dark);
  R(x + 8, y + 4, 48, 4, PAL.steel);
  R(x + 12, y + 12, 40, 36, PAL.steel);
  outline(x + 18, y + 16, 28, 28, PAL.lite, 3);
  R(x + 29, y + 27, 6, 6, PAL.hi);
  R(x + 29, y + 19, 6, 6, PAL.lite); R(x + 29, y + 35, 6, 6, PAL.lite);
  R(x + 21, y + 27, 6, 6, PAL.lite); R(x + 37, y + 27, 6, 6, PAL.lite);
  R(x + 14, y + 52, 36, 5, PAL.gold);
  R(x + 48, y + 7, 5, 5, ledState(e, t));
}
function drawCPU(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 6, y + 6, 52, 52, '#2c6e46');
  outline(x + 6, y + 6, 52, 52, PAL.gold, 2);
  R(x + 14, y + 14, 36, 36, PAL.hi);
  R(x + 14, y + 14, 36, 4, '#c8cdd6'); R(x + 14, y + 14, 4, 36, '#c8cdd6');
  R(x + 44, y + 44, 6, 6, PAL.lite);
  R(x + 28, y + 28, 8, 8, '#7d95a8');
}
function drawMem(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 22, y + 4, 20, 56, PAL.dark);
  R(x + 25, y + 8, 14, 8, PAL.steel); R(x + 25, y + 19, 14, 8, PAL.steel);
  R(x + 25, y + 30, 14, 8, PAL.steel); R(x + 25, y + 41, 14, 8, PAL.steel);
  R(x + 24, y + 54, 16, 4, PAL.gold);
}
function drawServer(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 4, y + 12, 56, 40, PAL.steel);
  R(x + 4, y + 12, 56, 4, PAL.lite);
  R(x + 10, y + 20, 44, 26, PAL.ink);
  R(x + 13, y + 23, 18, 8, PAL.dark); R(x + 34, y + 23, 18, 8, PAL.dark);
  R(x + 13, y + 35, 18, 8, PAL.dark); R(x + 34, y + 35, 18, 8, PAL.dark);
  R(x + 6, y + 14, 3, 36, PAL.lite); R(x + 55, y + 14, 3, 36, PAL.lite);
  R(x + 47, y + 15, 4, 4, ledState(e, t));
  R(x + 41, y + 15, 4, 4, e.online ? PAL.amber : PAL.dim);
}
function drawTorLeaf(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 4, y + 16, 56, 32, PAL.teal);
  R(x + 4, y + 16, 56, 4, PAL.tealHi);
  for (let p = 0; p < 6; p++) R(x + 10 + p * 8, y + 30, 6, 6, PAL.ink);
  R(x + 52, y + 22, 4, 4, (Math.sin(t * 4 + e.id) > -0.3) ? PAL.greenHi : '#1d6a3a');
}
function drawSpine(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 4, y + 8, 56, 48, PAL.purp);
  R(x + 4, y + 8, 56, 4, PAL.purpHi);
  for (let row = 0; row < 2; row++)
    for (let p = 0; p < 6; p++) R(x + 10 + p * 8, y + 22 + row * 14, 6, 6, PAL.ink);
  R(x + 52, y + 14, 4, 4, (Math.floor(t * 3) % 2) ? '#e8dcff' : '#6a4ab0');
}
function drawRack(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 8, y + 2, 48, 60, PAL.steel);
  R(x + 8, y + 2, 48, 5, PAL.lite);
  R(x + 13, y + 10, 38, 48, PAL.ink);
  for (let s2 = 0; s2 < 5; s2++) {
    R(x + 15, y + 12 + s2 * 9, 34, 7, PAL.dark);
    R(x + 43, y + 14 + s2 * 9, 3, 3, ledState(e, t + s2));
  }
  R(x + 52, y + 30, 3, 8, PAL.lite);
}
function drawRetimer(r, t) {
  const x = cx(r.i), y = cy(r.j);
  const on = (Math.sin(t * 5 + r.i) > -0.5);
  R(x - 12, y - 9, 24, 18, PAL.ink);
  for (let p = 0; p < 4; p++) {
    R(x - 9 + p * 6, y - 13, 3, 4, PAL.gold);
    R(x - 9 + p * 6, y + 9, 3, 4, PAL.gold);
  }
  R(x - 2, y - 2, 4, 4, on ? PAL.greenHi : PAL.green);
  if (on) outline(x - 16, y - 13, 32, 26, 'rgba(87,227,137,.25)', 2);
}
function drawRowBlock(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 2, y + 16, 60, 34, PAL.ink);
  for (let k = 0; k < 4; k++) {
    R(x + 6 + k * 14, y + 19, 12, 28, PAL.steel);
    R(x + 6 + k * 14, y + 19, 12, 3, PAL.lite);
    R(x + 9 + k * 14, y + 25, 6, 18, PAL.dark);
    R(x + 10 + k * 14, y + 27, 3, 3, ledState(e, t + k));
  }
  R(x + 2, y + 12, 60, 4, PAL.amber);
}
function drawSpinePod(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 6, y + 4, 52, 56, PAL.purp);
  R(x + 6, y + 4, 52, 4, PAL.purpHi);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++)
    R(x + 12 + b * 12, y + 14 + a * 14, 8, 8, PAL.ink);
  R(x + 50, y + 8, 4, 4, (Math.floor(t * 3 + e.id) % 2) ? '#e8dcff' : '#6a4ab0');
}
function drawDci(e, t) {
  const x = gx(e.i), y = gy(e.j);
  R(x + 8, y + 14, 48, 46, '#1d2436');
  outline(x + 8, y + 14, 48, 46, '#2a5a7a', 2);
  outline(x + 22, y + 28, 20, 20, '#4ad2e0', 3);
  R(x + 30, y + 30, 4, 16, '#4ad2e0');
  R(x + 30, y + 4, 4, 10, PAL.lite);
  R(x + 28, y + 2, 8, 4, (Math.sin(t * 5) > 0) ? '#8fe4ff' : '#2a5a7a');
}
const DRAW = { gpu: drawGPU, cpu: drawCPU, mem: drawMem, server: drawServer, tor: drawTorLeaf, leaf: drawTorLeaf, spine: drawSpine, rk: drawRack, rw: drawRowBlock, spine2: drawSpinePod, dci: drawDci };

/* ---------------- cables & pulses ---------------- */
function segFill(x1, y1, x2, y2, w, color) {
  if (y1 === y2) R(Math.min(x1, x2) - w / 2, y1 - w / 2, Math.abs(x2 - x1) + w, w, color);
  else R(x1 - w / 2, Math.min(y1, y2) - w / 2, w, Math.abs(y2 - y1) + w, color);
}
function drawCable(c) {
  const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
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
  c.pulses = c.pulses.filter(p => p.t <= Math.min(1, failFrac + 0.04));
}
function drawPulses(c) {
  const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
  const n = c.path.length - 1;
  c.pulses.forEach(p => {
    const k = p.t * n, k0 = Math.min(n - 1, Math.floor(k)), fr = k - k0;
    const x = Math.round((pts[k0][0] + (pts[k0 + 1][0] - pts[k0][0]) * fr) / 2) * 2;
    const y = Math.round((pts[k0][1] + (pts[k0 + 1][1] - pts[k0][1]) * fr) / 2) * 2;
    const h = healthAtFrac(c, p.t);
    const dying = !c.ok && p.t > c.failAt / n - 0.05;
    ctx.globalAlpha = Math.max(0.2, h / 100);
    R(x - 3, y - 3, 6, 6, dying ? PAL.red : healthColor(h));
    ctx.globalAlpha = 1;
  });
}

/* ---------------- main render ---------------- */
function drawGhost(t) {
  if (!hoverTile || !mouse.inside) return;
  const { i, j } = hoverTile;
  if (CAT[S.tool]) {
    const bad = entAt(i, j) || retAt(i, j) || S.money < CAT[S.tool].cost;
    ctx.globalAlpha = 0.55;
    DRAW[S.tool]({ i, j, id: -1, online: false }, t);
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
    outline(gx(i) + 2, gy(j) + 2, T - 4, T - 4, 'rgba(255,255,255,.5)', 2);
}
function frame(ts) {
  requestAnimationFrame(frame);
  const t = ts / 1000, dt = Math.max(0.001, Math.min(0.05, t - lastT || 0.016));
  lastT = t;
  BG[S.scale]();
  S.cables.forEach(drawCable);
  S.cables.forEach(c => { updatePulses(c, dt, ts); drawPulses(c); });
  S.retimers.forEach(r => drawRetimer(r, t));
  S.ents.forEach(e => DRAW[e.type](e, t));
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
});
cvs.addEventListener('pointerleave', () => { mouse.inside = false; hoverTile = null; });
cvs.addEventListener('pointerdown', ev => {
  const p = canvasXY(ev);
  const tile = tileAt(p.x, p.y);
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
  $('levelName').textContent = SCALES[S.scale].label + ' · ' + S.level.title;
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
  const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (key === 'gpu') {
    r(8, 4, 30, 34, PAL.dark); r(8, 4, 30, 3, PAL.steel);
    r(13, 10, 20, 20, PAL.steel); r(17, 14, 12, 12, PAL.lite); r(21, 18, 4, 4, PAL.hi);
    r(12, 34, 22, 4, PAL.gold);
  } else if (key === 'cpu') {
    r(7, 7, 32, 32, '#2c6e46'); r(7, 7, 32, 2, PAL.gold); r(7, 37, 32, 2, PAL.gold);
    r(7, 7, 2, 32, PAL.gold); r(37, 7, 2, 32, PAL.gold);
    r(13, 13, 20, 20, PAL.hi); r(13, 13, 20, 3, '#c8cdd6');
  } else if (key === 'mem') {
    r(17, 5, 12, 34, PAL.dark); r(19, 9, 8, 5, PAL.steel); r(19, 17, 8, 5, PAL.steel);
    r(19, 25, 8, 5, PAL.steel); r(18, 35, 10, 3, PAL.gold);
  } else if (key === 'server') {
    r(6, 12, 34, 24, PAL.steel); r(6, 12, 34, 3, PAL.lite);
    r(10, 17, 26, 15, PAL.ink); r(12, 19, 10, 5, PAL.dark); r(24, 19, 10, 5, PAL.dark);
    r(33, 14, 3, 3, PAL.green);
  } else if (key === 'tor' || key === 'leaf') {
    r(6, 14, 34, 20, PAL.teal); r(6, 14, 34, 3, PAL.tealHi);
    for (let p = 0; p < 4; p++) r(10 + p * 7, 24, 5, 5, PAL.ink);
    r(34, 18, 3, 3, PAL.greenHi);
  } else if (key === 'spine') {
    r(6, 8, 34, 30, PAL.purp); r(6, 8, 34, 3, PAL.purpHi);
    for (let row = 0; row < 2; row++) for (let p = 0; p < 4; p++) r(10 + p * 7, 17 + row * 9, 5, 5, PAL.ink);
  } else if (key === 'rk') {
    r(10, 4, 26, 36, PAL.steel); r(10, 4, 26, 3, PAL.lite);
    r(13, 9, 20, 28, PAL.ink);
    for (let s2 = 0; s2 < 4; s2++) { r(14, 11 + s2 * 6, 18, 4, PAL.dark); r(28, 12 + s2 * 6, 2, 2, PAL.green); }
  } else if (key === 'rw') {
    r(5, 14, 36, 20, PAL.ink); r(5, 11, 36, 3, PAL.amber);
    for (let k = 0; k < 4; k++) { r(7 + k * 9, 16, 7, 16, PAL.steel); r(9 + k * 9, 20, 3, 3, PAL.green); }
  } else if (key === 'spine2') {
    r(7, 6, 32, 34, PAL.purp); r(7, 6, 32, 3, PAL.purpHi);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) r(11 + b * 9, 14 + a * 10, 6, 6, PAL.ink);
  } else if (key === 'dci') {
    r(9, 12, 28, 28, '#1d2436');
    g.strokeStyle = '#4ad2e0'; g.lineWidth = 3; g.strokeRect(16, 19, 14, 14);
    r(21, 4, 4, 8, PAL.lite); r(19, 2, 8, 3, '#8fe4ff');
  } else if (CAB[key]) {
    const col = CAB[key].color;
    r(4, 28, 16, 5, col); r(15, 14, 5, 19, col); r(15, 14, 26, 5, col);
    r(2, 26, 6, 9, PAL.ink); r(39, 12, 6, 9, PAL.ink);
  } else if (key === 'retimer') {
    r(11, 15, 24, 16, PAL.ink);
    for (let p = 0; p < 4; p++) { r(13 + p * 6, 11, 3, 4, PAL.gold); r(13 + p * 6, 31, 3, 4, PAL.gold); }
    r(21, 21, 4, 4, PAL.greenHi);
  } else if (key === 'select') {
    g.fillStyle = '#c9cfe8';
    g.beginPath(); g.moveTo(14, 8); g.lineTo(32, 24); g.lineTo(23, 25); g.lineTo(28, 36); g.lineTo(24, 38); g.lineTo(19, 27); g.lineTo(13, 33); g.closePath(); g.fill();
  } else if (key === 'delete') {
    g.strokeStyle = PAL.red; g.lineWidth = 5; g.lineCap = 'square';
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
  const colors = [PAL.greenHi, PAL.amber, '#4ad2e0', '#f06ab8', PAL.gold, '#b48ae8'];
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
function showBanner() {
  const b = $('banner');
  b.innerHTML = `<h2>${S.level.title.split('—')[1] || 'Level'} complete!</h2><p>${S.idx + 1 < LEVELS.length ? 'Next lesson in a moment…' : 'You built the whole chain!'}</p>`;
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
    o.disabled = n > maxUnlocked();
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
  ctx.imageSmoothingEnabled = false;
  startLevel(0);
  requestAnimationFrame(frame);
})();
