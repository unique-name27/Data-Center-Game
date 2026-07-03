'use strict';
/* Data Center Tycoon — Connectivity Edition (paper cutout style)
   A teaching game about the chips that move data, told at four scales:
   inside the server -> the rack -> the row -> the whole data center.
   Construction-paper cartoon look: every device is a little character.
   All graphics are drawn procedurally on canvas — no image assets. */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 9;
const T = 64;
const CW = 1280, CH = 760;
const OX = (CW - GRID_W * T) / 2, OY = 92;
const FAIL = 30;               // signal health below this = dead link
const LS_KEY = 'dct_progress_v2';

const PAL = {
  sky: '#7ec8e3', shadow: 'rgba(40,30,20,.28)',
  ink: '#212121', white: '#fff8e7',
  green: '#43d15f', amber: '#fdd835', red: '#e53935',
  orange: '#fb8c00', blue: '#1e88e5', purple: '#8e24aa', purpleD: '#6a1b9a',
  teal: '#26a69a', brown: '#795548', gray: '#90a4ae', grayD: '#546e7a',
  paperGreen: '#4caf50', paperGreenD: '#2e7d32', beige: '#e8d9b5', gold: '#d9a326'
};
const BODY = {
  gpu: PAL.orange, cpu: PAL.blue, mem: PAL.amber, server: PAL.teal,
  tor: PAL.purple, leaf: PAL.purple, spine: PAL.purpleD, rk: PAL.brown,
  rw: '#e53935', spine2: PAL.purpleD, dci: '#263238'
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
    scale: 'board', name: 'PCIe trace', cost: 5, watts: 0.5, loss: 25, color: '#e0a030', retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (25% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer. That’s why they sit on motherboards and riser cards.'
  },
  dac1: {
    scale: 'rack', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 20, color: '#e07030', retime: true,
    tag: 'Cheap, cool… and short',
    desc: 'Direct-attach copper: a passive twinax cable. Nearly free and burns almost no power, but health drops 20% per tile. Fine for short in-rack hops; long runs need retimers or an AEC.',
    real: 'At 100+ Gb/s per lane, passive copper reaches only ~2–3 meters.'
  },
  aec1: {
    scale: 'rack', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#00bfa5', retime: false,
    tag: 'Copper with retimers built in',
    desc: 'An AEC is a copper cable with a retimer chip inside each connector shell, constantly cleaning the signal — only 6% loss per tile. Compare its price to placing loose retimers along a DAC.',
    real: 'AECs are one of the fastest-growing connectivity products — built around retimer silicon from companies like Astera Labs, Marvell and Broadcom.'
  },
  dac2: {
    scale: 'row', name: 'Copper DAC', cost: 150, watts: 0.2, loss: 25, color: '#e07030', retime: true,
    tag: 'Short hops only at row scale',
    desc: 'The same passive copper, but row distances are brutal: 25% health per tile. Use it rack-to-leaf when they’re adjacent, retime it, or move up to AEC/optics.',
    real: 'Operators use copper everywhere they can — it’s the cheapest watt in the building.'
  },
  aec2: {
    scale: 'row', name: 'Active electrical cable (AEC)', cost: 900, watts: 6, loss: 6, color: '#00bfa5', retime: false,
    tag: 'The mid-range workhorse',
    desc: 'Retimed copper: 6% loss per tile at a fraction of optics’ power and cost. The sweet spot for most in-row runs.',
    real: 'Inside each connector shell is the same retimer chip you placed by hand at board scale.'
  },
  opt: {
    scale: 'row', name: 'Optical link', cost: 2500, watts: 14, loss: 1.5, color: '#42a5f5', retime: false,
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
    scale: 'dc', name: 'Single-mode optics', cost: 4500, watts: 16, loss: 0.6, color: '#fdd835', retime: false,
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
      <p>Place two <b>GPUs</b> near the CPU and wire each one up with a <b>PCIe trace</b> (click the GPU, then the CPU). The pulses are your data moving over bare copper.</p>
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
  if (S.cables.some(c => (c.a === A.id && c.b === B.id) || (c.a === B.id && c.b === A.id)))
    return say('Those two are already connected.');
  if (portCount(A) >= CAT[A.type].ports) return say(`${CAT[A.type].name} is out of ports.`);
  if (portCount(B) >= CAT[B.type].ports) return say(`${CAT[B.type].name} is out of ports.`);
  const spec = CAB[type];
  if (S.money < spec.cost) return say('Not enough budget. Money doesn’t grow on trees!');
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

/* ---------------- canvas + paper helpers ---------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function jit(seed, k, amp) { return (hash(seed * 7.13 + k * 3.71) * 2 - 1) * amp; }
function paperPts(x, y, w, h, seed, amp) {
  const a = amp || 2.5;
  const P = [];
  const push = (px, py, k) => P.push([px + jit(seed, k, a), py + jit(seed, k + 57, a)]);
  push(x, y, 1); push(x + w / 2, y, 2); push(x + w, y, 3); push(x + w, y + h / 2, 4);
  push(x + w, y + h, 5); push(x + w / 2, y + h, 6); push(x, y + h, 7); push(x, y + h / 2, 8);
  return P;
}
function fillPoly(P, color, ox2, oy2) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(P[0][0] + (ox2 || 0), P[0][1] + (oy2 || 0));
  for (let k = 1; k < P.length; k++) ctx.lineTo(P[k][0] + (ox2 || 0), P[k][1] + (oy2 || 0));
  ctx.closePath(); ctx.fill();
}
function paperRect(x, y, w, h, color, seed, amp, noShadow) {
  const P = paperPts(x, y, w, h, seed, amp);
  if (!noShadow) fillPoly(P, PAL.shadow, 3, 4);
  fillPoly(P, color);
  return P;
}
function strokePaper(x, y, w, h, color, seed, width) {
  const P = paperPts(x, y, w, h, seed || 1, 2);
  ctx.strokeStyle = color; ctx.lineWidth = width || 3; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  for (let k = 1; k < P.length; k++) ctx.lineTo(P[k][0], P[k][1]);
  ctx.closePath(); ctx.stroke();
}
function paperCircle(x, y, r, color, seed, noShadow) {
  const n = 9, P = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r + jit(seed, k, r * 0.12);
    P.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  if (!noShadow) fillPoly(P, PAL.shadow, 2, 3);
  fillPoly(P, color);
}
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
/* mood: 'happy' | 'idle' | 'worry'  opts: {glasses, brows, lids, alien, s} */
function face(x, y, mood, seed, t, opts) {
  const o = opts || {}, s = o.s || 1;
  const ew = 8 * s, gap = 9 * s;
  const blink = ((t * 0.45 + hash(seed) * 4) % 4) < 0.09;
  if (o.alien) {
    ctx.fillStyle = PAL.ink;
    [[-gap, 0], [gap, 0]].forEach(([dx]) => {
      ctx.beginPath(); ctx.ellipse(x + dx, y, 5.5 * s, 8 * s, dx > 0 ? 0.5 : -0.5, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    circle(x - gap, y, ew, '#ffffff'); circle(x + gap, y, ew, '#ffffff');
    if (blink) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(x - gap - 5 * s, y); ctx.lineTo(x - gap + 5 * s, y);
      ctx.moveTo(x + gap - 5 * s, y); ctx.lineTo(x + gap + 5 * s, y); ctx.stroke();
    } else {
      const lx = Math.sin(t * 0.7 + seed) * 2 * s;
      circle(x - gap + lx, y + 1, 2.6 * s, PAL.ink); circle(x + gap + lx, y + 1, 2.6 * s, PAL.ink);
    }
    if (o.lids) {
      ctx.fillStyle = o.lidColor || PAL.amber;
      ctx.beginPath(); ctx.arc(x - gap, y - 2 * s, ew, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(x + gap, y - 2 * s, ew, Math.PI, 0); ctx.fill();
    }
    if (o.glasses) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.5 * s;
      ctx.strokeRect(x - gap - 7 * s, y - 6 * s, 14 * s, 12 * s);
      ctx.strokeRect(x + gap - 7 * s, y - 6 * s, 14 * s, 12 * s);
      ctx.beginPath(); ctx.moveTo(x - gap + 7 * s, y); ctx.lineTo(x + gap - 7 * s, y); ctx.stroke();
    }
    if (o.brows) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - gap - 6 * s, y - 11 * s); ctx.lineTo(x - gap + 5 * s, y - 7 * s);
      ctx.moveTo(x + gap + 6 * s, y - 11 * s); ctx.lineTo(x + gap - 5 * s, y - 7 * s);
      ctx.stroke();
    }
  }
  const my = y + 12 * s;
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
  if (mood === 'happy') {
    ctx.beginPath(); ctx.arc(x, my - 2 * s, 7 * s, 0.25, Math.PI - 0.25); ctx.stroke();
  } else if (mood === 'worry') {
    ctx.fillStyle = PAL.ink;
    ctx.beginPath(); ctx.ellipse(x, my + 1, 4.5 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
    const drop = (t * 40 + hash(seed) * 20) % 26;
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.ellipse(x + 17 * s, y - 6 * s + drop, 3 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(x - 5 * s, my); ctx.lineTo(x + 5 * s, my); ctx.stroke();
  }
}
function mood(e) {
  if (e.online) return 'happy';
  if (S.cables.some(c => c.a === e.id || c.b === e.id)) return 'worry';
  return 'idle';
}
function bounce(e, t) { return e.online ? Math.sin(t * 4 + e.id) * 2.5 : 0; }
function healthColor(h) { return h >= 65 ? PAL.green : h >= FAIL ? PAL.amber : PAL.red; }

/* ---------------- backgrounds ---------------- */
function tape(x, y, rot, seed) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.globalAlpha = 0.75;
  paperRect(-24, -9, 48, 18, PAL.beige, seed, 2, true);
  ctx.globalAlpha = 1; ctx.restore();
}
function crayonLine(x1, y1, x2, y2, color, width, seed) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1 + jit(seed, 1, 2), y1 + jit(seed, 2, 2));
  const mx = (x1 + x2) / 2 + jit(seed, 3, 3), my = (y1 + y2) / 2 + jit(seed, 4, 3);
  ctx.quadraticCurveTo(mx, my, x2 + jit(seed, 5, 2), y2 + jit(seed, 6, 2));
  ctx.stroke();
}
function sheet(color, seed) {
  R(0, 0, CW, CH, PAL.sky);
  paperRect(OX - 28, OY - 28, GRID_W * T + 56, GRID_H * T + 56, color, seed, 6);
  tape(OX - 10, OY - 20, -0.5, seed + 1); tape(OX + GRID_W * T + 10, OY - 20, 0.45, seed + 2);
  tape(OX - 10, OY + GRID_H * T + 20, 0.55, seed + 3); tape(OX + GRID_W * T + 10, OY + GRID_H * T + 20, -0.4, seed + 4);
}
function gridLines(color) {
  ctx.globalAlpha = 0.28;
  for (let i = 1; i < GRID_W; i++) crayonLine(gx(i), OY, gx(i), OY + GRID_H * T, color, 2, i * 3.3);
  for (let j = 1; j < GRID_H; j++) crayonLine(OX, gy(j), OX + GRID_W * T, gy(j), color, 2, j * 5.7 + 100);
  ctx.globalAlpha = 1;
}
function drawBoardBg() {
  sheet(PAL.paperGreen, 11);
  gridLines('#1b5e20');
  for (let k = 0; k < 4; k++)
    paperCircle(OX + 30 + k * ((GRID_W * T - 60) / 3), OY - 14, 6, '#1b5e20', 40 + k, true);
}
function drawRackBg() {
  sheet('#b0bec5', 22);
  paperRect(OX - 20, OY - 16, 18, GRID_H * T + 32, PAL.grayD, 23, 3);
  paperRect(OX + GRID_W * T + 2, OY - 16, 18, GRID_H * T + 32, PAL.grayD, 24, 3);
  for (let j = 0; j <= GRID_H; j++) {
    circle(OX - 11, OY + j * T, 3.5, PAL.ink);
    circle(OX + GRID_W * T + 11, OY + j * T, 3.5, PAL.ink);
  }
  ctx.globalAlpha = 0.3;
  for (let j = 1; j < GRID_H; j++) crayonLine(OX, gy(j), OX + GRID_W * T, gy(j), '#37474f', 2.5, j * 4.1);
  ctx.globalAlpha = 1;
}
function drawRowBg() {
  sheet('#cfd8dc', 33);
  gridLines('#78909c');
  crayonLine(OX, OY - 8, OX + GRID_W * T, OY - 8, PAL.amber, 6, 71);
  crayonLine(OX, OY + GRID_H * T + 8, OX + GRID_W * T, OY + GRID_H * T + 8, PAL.amber, 6, 72);
}
function drawDcBg() {
  sheet('#d7ccc8', 44);
  strokePaper(OX - 14, OY - 14, GRID_W * T + 28, GRID_H * T + 28, PAL.grayD, 45, 8);
  paperRect(gx(14), gy(0), 2 * T, 2 * T, '#90caf9', 46, 3, true);
  gridLines('#a1887f');
}
const BG = { board: drawBoardBg, rack: drawRackBg, row: drawRowBg, dc: drawDcBg };

/* ---------------- sprites ---------------- */
function drawGPU(e, t) {
  const x = gx(e.i), y = gy(e.j) + bounce(e, t);
  paperRect(x + 9, y + 8, 46, 48, BODY.gpu, e.id);
  paperCircle(x + 45, y + 17, 7, '#ffe0b2', e.id + 1, true);
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 40, y + 12); ctx.lineTo(x + 50, y + 22);
  ctx.moveTo(x + 50, y + 12); ctx.lineTo(x + 40, y + 22); ctx.stroke();
  for (let k = 0; k < 5; k++) R(x + 13 + k * 8, y + 52, 5, 5, PAL.gold);
  face(x + 28, y + 30, mood(e), e.id, t, {});
}
function drawCPU(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 5, y + 6, 54, 52, BODY.cpu, e.id);
  for (let k = 0; k < 6; k++) R(x + 9 + k * 8.5, y + 56, 5, 6, PAL.gold);
  face(x + 32, y + 28, S.ents.some(n => n.online) ? 'happy' : 'idle', e.id, t, { glasses: true });
}
function drawMem(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 19, y + 5, 26, 54, BODY.mem, e.id);
  R(x + 23, y + 40, 18, 6, PAL.ink); R(x + 23, y + 49, 18, 6, PAL.ink);
  face(x + 32, y + 20, 'idle', e.id, t, { s: 0.7, lids: true, lidColor: BODY.mem });
}
function drawServer(e, t) {
  const x = gx(e.i), y = gy(e.j) + bounce(e, t);
  paperRect(x + 4, y + 14, 56, 38, BODY.server, e.id);
  circle(x + 48, y + 24, 3.5, mood(e) === 'happy' ? PAL.green : mood(e) === 'worry' ? PAL.red : '#455a64');
  circle(x + 48, y + 34, 3.5, '#455a64'); circle(x + 48, y + 44, 3.5, '#455a64');
  face(x + 24, y + 30, mood(e), e.id, t, { s: 0.9 });
}
function drawTorLeaf(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 4, y + 18, 56, 34, BODY.tor, e.id);
  paperRect(x + 18, y + 8, 28, 12, '#4a148c', e.id + 1, 2, true);
  for (let p = 0; p < 5; p++) circle(x + 13 + p * 9.5, y + 46, 2.8, PAL.ink);
  face(x + 32, y + 32, S.stats.online > 0 ? 'happy' : 'idle', e.id, t, { s: 0.85 });
}
function drawSpine(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 6, y + 6, 52, 52, BODY.spine, e.id);
  for (let p = 0; p < 5; p++) circle(x + 14 + p * 9, y + 50, 2.8, PAL.ink);
  face(x + 32, y + 26, 'idle', e.id, t, { brows: true });
}
function drawRack(e, t) {
  const x = gx(e.i), y = gy(e.j) + bounce(e, t);
  paperRect(x + 9, y + 3, 46, 58, BODY.rk, e.id);
  for (let k = 0; k < 3; k++)
    circle(x + 47, y + 14 + k * 10, 3, e.online ? PAL.green : '#4e342e');
  face(x + 27, y + 24, mood(e), e.id, t, { s: 0.85 });
  R(x + 14, y + 46, 36, 4, '#4e342e'); R(x + 14, y + 53, 36, 4, '#4e342e');
}
function drawRowBlock(e, t) {
  const x = gx(e.i), y = gy(e.j) + bounce(e, t);
  paperRect(x + 2, y + 14, 60, 38, BODY.rw, e.id);
  const m = mood(e);
  for (let k = 0; k < 3; k++) {
    const fx = x + 13 + k * 19;
    circle(fx - 4, y + 28, 2.2, PAL.ink); circle(fx + 4, y + 28, 2.2, PAL.ink);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    if (m === 'happy') ctx.arc(fx, y + 34, 4, 0.3, Math.PI - 0.3);
    else if (m === 'worry') { ctx.moveTo(fx - 3, y + 38); ctx.arc(fx, y + 38, 3, Math.PI, 0); }
    else { ctx.moveTo(fx - 3, y + 36); ctx.lineTo(fx + 3, y + 36); }
    ctx.stroke();
  }
  R(x + 6, y + 44, 52, 4, '#8e1f1c');
}
function drawSpinePod(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 6, y + 10, 52, 50, BODY.spine2, e.id);
  ctx.fillStyle = PAL.amber;
  ctx.beginPath();
  ctx.moveTo(x + 16, y + 12); ctx.lineTo(x + 20, y + 2); ctx.lineTo(x + 27, y + 10);
  ctx.lineTo(x + 32, y + 0); ctx.lineTo(x + 37, y + 10); ctx.lineTo(x + 44, y + 2);
  ctx.lineTo(x + 48, y + 12); ctx.closePath(); ctx.fill();
  for (let p = 0; p < 5; p++) circle(x + 14 + p * 9, y + 52, 2.8, PAL.ink);
  face(x + 32, y + 30, 'idle', e.id, t, { brows: true });
}
function drawDci(e, t) {
  const x = gx(e.i), y = gy(e.j);
  paperRect(x + 7, y + 8, 50, 52, BODY.dci, e.id);
  ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x + 32, y + 32, 20 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2); ctx.stroke();
  face(x + 32, y + 30, 'idle', e.id, t, { alien: true });
  ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 26, y + 44); ctx.quadraticCurveTo(x + 32, y + 47, x + 38, y + 44); ctx.stroke();
}
function drawRetimer(r, t) {
  const x = cx(r.i), y = cy(r.j) + Math.sin(t * 4 + r.i) * 1.5;
  ctx.fillStyle = PAL.red;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 6); ctx.lineTo(x - 22, y + 12); ctx.lineTo(x - 4, y + 8);
  ctx.closePath(); ctx.fill();
  paperRect(x - 14, y - 11, 28, 22, PAL.ink, r.i * 31 + r.j);
  for (let p = 0; p < 4; p++) {
    R(x - 10 + p * 6.5, y - 15, 3, 4, PAL.gold);
    R(x - 10 + p * 6.5, y + 11, 3, 4, PAL.gold);
  }
  R(x - 13, y - 5, 26, 6, PAL.red);
  circle(x - 5, y - 2, 2, '#ffffff'); circle(x + 5, y - 2, 2, '#ffffff');
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + 4, 4, 0.3, Math.PI - 0.3); ctx.stroke();
}
const DRAW = { gpu: drawGPU, cpu: drawCPU, mem: drawMem, server: drawServer, tor: drawTorLeaf, leaf: drawTorLeaf, spine: drawSpine, rk: drawRack, rw: drawRowBlock, spine2: drawSpinePod, dci: drawDci };

/* ---------------- cables & pulses ---------------- */
function wigglePts(c) {
  const pts = c.path.map(p => [cx(p.i), cy(p.j)]);
  const out = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const horiz = y1 === y2;
    const steps = Math.max(2, Math.round(len / 14));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const bx = x1 + (x2 - x1) * f, by = y1 + (y2 - y1) * f;
      const w = Math.sin((bx + by) * 0.12 + c.id) * 2.5;
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
function drawCable(c) {
  const pts = wigglePts(c);
  const n = c.path.length - 1;
  const spec = CAB[c.type];
  ctx.save(); ctx.translate(2, 3);
  strokeRun(pts, 0, n, PAL.shadow, 8);
  ctx.restore();
  if (c.ok) strokeRun(pts, 0, n, spec.color, 6);
  else {
    strokeRun(pts, 0, c.failAt, spec.color, 6);
    strokeRun(pts, c.failAt, n, PAL.red, 5, [10, 8]);
  }
  const first = pts[0], last = pts[pts.length - 1];
  circle(first[0], first[1], 5, PAL.ink); circle(last[0], last[1], 5, PAL.ink);
  if (S.selected && S.selected.kind === 'cable' && S.selected.cable === c)
    strokeRun(pts, 0, n, 'rgba(255,255,255,.45)', 11);
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
    ctx.globalAlpha = Math.max(0.25, h / 100);
    circle(x, y, dying ? 6 : 5, dying ? PAL.red : healthColor(h));
    circle(x - 1.5, y - 1.5, 1.7, 'rgba(255,255,255,.85)');
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
  const colors = [PAL.green, PAL.amber, '#26c6da', '#f06ab8', PAL.orange, '#b48ae8'];
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
      circle(p.x, p.y, 3.5, '#fff3c4');
      ctx.globalAlpha = 0.4; circle(p.x, p.y + 10, 2.5, PAL.amber); ctx.globalAlpha = 1;
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * p.spin);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      R(-3.5, -3.5, 7, 7, p.color);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
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
    strokePaper(gx(i) + 3, gy(j) + 3, T - 6, T - 6, bad ? PAL.red : PAL.green, i * 9 + j, 3);
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
    strokePaper(gx(i) + 3, gy(j) + 3, T - 6, T - 6, 'rgba(255,255,255,.7)', i * 7 + j, 3);
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
  if (S.pendA) strokePaper(gx(S.pendA.i) + 2, gy(S.pendA.j) + 2, T - 4, T - 4, PAL.green, S.pendA.id, 3);
  if (S.selected && S.selected.kind === 'ent')
    strokePaper(gx(S.selected.ent.i), gy(S.selected.ent.j), T, T, '#ffffff', S.selected.ent.id, 3);
  updateFx(dt);
  drawFx();
  drawGhost(t);
  if (performance.now() < toast.until) {
    ctx.font = '16px "Comic Sans MS", "Segoe Print", cursive';
    ctx.textAlign = 'center';
    const w = ctx.measureText(toast.msg).width + 44;
    paperRect((CW - w) / 2, CH - 70, w, 40, PAL.white, 99, 3);
    ctx.fillStyle = PAL.ink;
    ctx.fillText(toast.msg, CW / 2, CH - 44);
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
  const body = (color, x, y, w, h) => {
    g.fillStyle = 'rgba(40,30,20,.28)'; g.fillRect(x + 2, y + 3, w, h);
    g.fillStyle = color; g.fillRect(x, y, w, h);
  };
  const eyes = (x, y, s2) => {
    const s = s2 || 1;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 5 * s, y, 4 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 5 * s, y, 4 * s, 0, 7); g.fill();
    g.fillStyle = '#212121'; g.beginPath(); g.arc(x - 5 * s, y + 1, 1.6 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(x + 5 * s, y + 1, 1.6 * s, 0, 7); g.fill();
    g.strokeStyle = '#212121'; g.lineWidth = 1.6; g.beginPath();
    g.arc(x, y + 7 * s, 3.5 * s, 0.4, Math.PI - 0.4); g.stroke();
  };
  if (CAT[key]) {
    const dims = { gpu: [8, 8, 30, 32], cpu: [6, 8, 34, 32], mem: [15, 5, 16, 36], server: [5, 12, 36, 26], tor: [5, 12, 36, 26], leaf: [5, 12, 36, 26], spine: [7, 6, 32, 34], rk: [10, 5, 26, 36], rw: [4, 12, 38, 24], spine2: [7, 8, 32, 32], dci: [8, 8, 30, 32] };
    const d = dims[key] || [8, 8, 30, 30];
    body(BODY[key] || '#888', d[0], d[1], d[2], d[3]);
    eyes(d[0] + d[2] / 2, d[1] + d[3] * 0.42, 0.9);
    if (key === 'spine2') { g.fillStyle = '#fdd835'; g.beginPath(); g.moveTo(13, 9); g.lineTo(17, 2); g.lineTo(22, 8); g.lineTo(27, 2); g.lineTo(31, 9); g.closePath(); g.fill(); }
    if (key === 'dci') { g.strokeStyle = '#76ff03'; g.lineWidth = 2; g.beginPath(); g.arc(23, 22, 13, 0, 7); g.stroke(); }
  } else if (CAB[key]) {
    g.strokeStyle = 'rgba(40,30,20,.28)'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(7, 34); g.quadraticCurveTo(18, 10, 39, 15); g.stroke();
    g.strokeStyle = CAB[key].color; g.lineWidth = 5;
    g.beginPath(); g.moveTo(5, 32); g.quadraticCurveTo(16, 8, 37, 13); g.stroke();
  } else if (key === 'retimer') {
    g.fillStyle = '#e53935'; g.beginPath(); g.moveTo(14, 18); g.lineTo(4, 34); g.lineTo(18, 30); g.closePath(); g.fill();
    body('#212121', 11, 14, 24, 18);
    g.fillStyle = '#e53935'; g.fillRect(12, 18, 22, 5);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(18, 20.5, 1.8, 0, 7); g.fill(); g.beginPath(); g.arc(28, 20.5, 1.8, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(23, 26, 3, 0.4, Math.PI - 0.4); g.stroke();
    g.fillStyle = '#d9a326';
    for (let p = 0; p < 4; p++) { g.fillRect(13 + p * 6, 10, 3, 4); g.fillRect(13 + p * 6, 32, 3, 4); }
  } else if (key === 'select') {
    g.fillStyle = '#fff8e7';
    g.strokeStyle = '#212121'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 8); g.lineTo(32, 24); g.lineTo(23, 25); g.lineTo(28, 36); g.lineTo(24, 38); g.lineTo(19, 27); g.lineTo(13, 33); g.closePath(); g.fill(); g.stroke();
  } else if (key === 'delete') {
    g.strokeStyle = '#e53935'; g.lineWidth = 6; g.lineCap = 'round';
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
function showBanner() {
  const b = $('banner');
  const yay = ['Sweet!', 'Oh my gosh, it works!', 'Niiice.', 'Respect my bandwidth!', 'That’s pretty cool.'];
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
  startLevel(0);
  requestAnimationFrame(frame);
})();
