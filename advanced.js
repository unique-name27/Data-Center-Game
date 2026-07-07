import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/* Data Center Tycoon 3D — Connectivity Edition
   Cozy toon-shaded diorama: build a GPU server on a little green island.
   Same simulation and lessons as the 2D game. */

/* ---------------- constants ---------------- */
const GRID_W = 16, GRID_H = 9;
const FAIL = 30;
const LS_KEY = 'dct3d_progress_v1';

/* ---------------- component catalog ---------------- */
const CAT = {
  gpu: {
    role: 'node', name: 'GPU', ports: 1, tput: 1.0,
    tag: 'The hungriest chip on the board',
    desc: 'A GPU crunches numbers, but it can’t do anything alone — every byte it works on arrives over a PCIe link. Connect it to the CPU with a copper trace to bring it online (the CPU also needs memory attached).',
    real: 'A modern PCIe Gen6 x16 link moves ~128 GB/s — about 1 Tb/s — over bare copper traces.'
  },
  cpu: {
    role: 'hub', name: 'CPU', ports: 4,
    tag: 'The root complex — every lane starts here',
    desc: 'On a server board, the CPU is the hub: PCIe lanes fan out from it to GPUs, NICs and drives, and memory channels fan out to DIMMs. A GPU is online only when it can reach a CPU and memory.',
    real: 'Server CPUs expose 128+ PCIe lanes and a dozen memory channels — all signal-integrity battlegrounds.'
  },
  mem: {
    role: 'core', name: 'Memory (DIMM)', ports: 1,
    tag: 'No memory, no math',
    desc: 'GPUs pull their working data through the CPU from system memory. Wire DIMMs to the CPU, a switch, or a CXL memory controller.',
    real: 'Memory bandwidth is so precious that a whole chip category (CXL memory controllers) exists just to attach more of it.'
  },
  pswitch: {
    role: 'hub', name: 'PCIe switch', ports: 8,
    tag: 'Fan-out for your lanes',
    desc: 'The CPU has only 4 ports here — a PCIe switch turns one of them into eight. GPUs, memory controllers and NICs behind the switch all reach the CPU through it.',
    real: 'PCIe fabric switches are how one CPU can host a dozen GPUs at once.'
  },
  memctl: {
    role: 'core', name: 'CXL memory controller', ports: 8,
    tag: 'More memory than you have ports',
    desc: 'A memory controller fans one link out to a whole bank of DIMMs. Memory behind it still counts — GPUs reach it through the CPU or a switch.',
    real: 'CXL memory controllers attach terabytes of extra memory over PCIe-style links.'
  },
  nic: {
    role: 'util', name: 'NIC (network card)', ports: 2,
    tag: 'The server’s door to the network',
    desc: 'Everything you build in this box talks to other servers through the NIC. Wire it inward to the CPU or a switch, then run an external link out to the rack uplink.',
    real: 'Modern AI servers carry multiple 400–800G NICs — some designs give every GPU its own.'
  },
  uplink: {
    role: 'external', name: 'Rack uplink (ToR)', ports: 4,
    tag: 'The cable out of the server',
    desc: 'This is the top-of-rack switch, one shelf up, seen from inside the server. Run an external link from your NIC to here and the server is on the network.',
    real: 'Every server’s NIC cables out to the ToR switch: that link is the boundary between “inside the box” and “the data center”.'
  },
  srv: {
    role: 'inode', name: 'Server island', ports: 4, tput: 6.4,
    tag: 'A whole server you built, on its own island',
    desc: 'Each island is one of the GPU servers you assembled — CPU, GPUs, memory and NIC, boxed up. It pushes 6.4 Tb/s and comes online when it has a healthy cable to a core. One AEC (4 Tb/s) isn’t enough — bundle a few, or use a fatter AOC.',
    real: 'Between servers there is no PCB to etch a trace onto — every link is a real pluggable cable (AEC for short hops, AOC for long ones).'
  },
  core: {
    role: 'ihub', name: 'Core switch island', ports: 24,
    tag: 'Where every server’s cable lands',
    desc: 'The rack’s switch, on its own island in the middle. Run a cable from each server island to here to wire the whole rack together — the far islands are too far for copper AEC and need optical AOC.',
    real: 'This is the top-of-rack / leaf switch every server uplinks to. Distance decides copper vs optics.'
  }
};
const CAB = {
  trace: {
    name: 'PCIe trace', watts: 0.5, loss: 20, cap: 2, color: 0xd9a326, retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (20% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer.'
  },
  aecb: {
    name: 'AEC (retimed copper cable)', watts: 5, loss: 6, cap: 4, color: 0x2fc4b2, retime: true,
    tag: 'Copper with retimers in the plugs',
    desc: 'An Active Electrical Cable is copper with a retimer chip inside each connector shell — 6% loss per tile instead of 25%. Carries up to 4 Tb/s per cable, so a busy server needs a few in parallel.',
    real: 'Inside GPU servers, AECs carry PCIe between boards and shelves — built on the same retimer silicon you place by hand.'
  },
  aocb: {
    name: 'AOC (active optical cable)', watts: 9, loss: 1.0, cap: 10, color: 0x4a9df0, retime: true,
    tag: 'Light inside the box',
    desc: 'An Active Optical Cable converts the signal to light: 1% loss per tile, reach basically unlimited, and up to 10 Tb/s down one cable — a single AOC can carry a whole server. You pay in watts.',
    real: 'AOC vs AEC is a live engineering debate: optics reach farther and carry more; copper sips power and fails less.'
  }
};
const RET = {
  name: 'Retimer chip', watts: 4,
  tag: 'The connectivity chip itself',
  desc: 'A retimer recovers the clock and data from a degraded electrical signal and retransmits it perfectly clean — signal health resets to 100% at the chip. Place it on a copper route BEFORE health falls under 30%.',
  real: 'Retimers live on motherboards, riser cards, backplanes and inside AECs — a chip category that has grown into a multi-billion-dollar business alongside AI.'
};
/* ---- operator upgrades: a unified software suite (fleet telemetry) and an
   interop lab. Telemetry watches the fabric so signals hold up over longer runs,
   outages are caught earlier, and repairs go faster; the interop lab makes every
   part play together better — more reach, more capacity, fewer failures still. ---- */
let suite = false, interop = false, upgBtns = [];
/* the suite + interop lab are Survival-mode ops upgrades — they only take effect there */
function upgActive()  { return !!(S && S.level && S.level.survival); }
function lossMul()    { return upgActive() ? (suite ? 0.70 : 1) * (interop ? 0.85 : 1) : 1; }  // lower loss = more reach
function capMul()     { return upgActive() && interop ? 1.30 : 1; }                             // more Tb/s per link = less congestion
function failGapMul() { return (suite ? 1.60 : 1) * (interop ? 1.25 : 1); }   // longer between outages (survival-only path)
function repairMul()  { return (suite ? 0.55 : 1) * (interop ? 0.80 : 1); }   // shorter repair time (survival-only path)
function boatBoost()  { return (suite ? 0.8 : 0) + (interop ? 0.5 : 0); }     // engineers travel faster (survival-only path)
function setSuite(on)   { suite = !!on;   recompute(); if (S.level.islands) refreshIslands(); updateHUD(); }
function setInterop(on) { interop = !!on; recompute(); if (S.level.islands) refreshIslands(); updateHUD(); }
const ALLOWED_BOARD = {
  gpu: ['cpu', 'pswitch'],
  mem: ['cpu', 'pswitch', 'memctl'],
  memctl: ['cpu', 'pswitch'],
  nic: ['cpu', 'pswitch', 'nic', 'uplink'],
  uplink: ['nic'],
  cpu: ['gpu', 'mem', 'memctl', 'nic', 'pswitch'],
  pswitch: ['gpu', 'mem', 'memctl', 'cpu', 'nic'],
  srv: ['core'],
  core: ['srv']
};

/* ---------------- levels ---------------- */
const LEVELS = [
  {
    title: 'Campaign — one continuous hall', islands: true, campaign: true,
    tools: ['srv', 'core', 'aecb', 'aocb'],
    pre: [{ t: 'core', i: 8, j: 4 }, { t: 'srv', i: 2, j: 2 }],
    goals: [
      { text: 'Scroll into your server and bring a GPU online', check: s => s.ents.some(e => e.type === 'srv' && serverWorks(e.inner)),
        hint: 'Scroll the mouse wheel <b>in</b> on the server island in the corner to dive inside. Place a <b>CPU</b>, a <b>GPU</b> and a <b>DIMM</b>, trace them together, then scroll back <b>out</b>.' },
      { text: 'Cable your server to the core switch', check: s => s.stats.online >= 1,
        hint: 'Back in the hall, pick the <b>AEC</b> tool, click your working server island, then click the <b>core</b> in the middle.' },
      { text: 'Add a second server and bring it online', check: s => s.stats.online >= 2,
        hint: 'Pick the <b>Server</b> tool, drop a new island, scroll in to build its server, then cable it to the core.' },
      { text: 'Grow the hall — 4 servers online', check: s => s.stats.online >= 4,
        hint: 'Keep adding servers, building each one, and cabling to the core — <b>AEC</b> for near islands, <b>AOC</b> for the far ones.' },
      { text: 'Add redundancy — dual-home a server (two links to the core)',
        check: s => s.ents.some(e => e.type === 'srv' && s.cables.filter(c => (c.a === e.id || c.b === e.id) && c.ok && !c.down).length >= 2),
        hint: 'Run a <b>second</b> cable from one working server to the core. Two paths means a single failure can’t take it down.' },
      { text: 'A bigger hall — 6 servers online', check: s => s.stats.online >= 6,
        hint: 'More islands, more servers — keep building and cabling. Space islands a few tiles apart.' },
      { text: 'A humming data hall — 8 servers online', check: s => s.stats.online >= 8,
        hint: 'Fill out the hall. Reach the far islands with <b>AOC</b>, and remember retimers keep long copper alive.' }
    ],
    lesson: `<h2>Advanced — one continuous hall</h2>
      <p>You're standing on your <b>first server's board</b>. Build it: place a <b>CPU</b>, a <b>GPU</b> and a <b>DIMM</b>, wire them with <b>PCIe traces</b> (add <b>retimers</b> on long runs), and bring a GPU online.</p>
      <p>Then <b>scroll your mouse wheel out</b> (or hit the <b>↖ Back to the data hall</b> button) to pull back to the whole hall, where you wire your servers to the core switch with <b>AEC</b> / <b>AOC</b> cables. <b>Scroll in</b> on any island to dive back into it. Everything you build stays put.</p>
      <p class="tip">One world, two scales — zoom in to build a server, zoom out to connect the hall.</p>`
  },
  {
    title: 'Lesson 1 — Inside the server', hidden: true,
    tools: ['gpu', 'cpu', 'mem', 'trace', 'retimer'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'gpu', i: 14, j: 4 }],
    goals: [
      { text: 'Attach a DIMM to the CPU', check: s => s.stats.memsReach >= 1,
        hint: 'Pick the <b>Memory</b> tool and click a tile next to the CPU. Then pick <b>Trace</b>, click the CPU, then the DIMM to wire them together.' },
      { text: 'Bring a GPU online (it needs CPU + memory)', check: s => s.stats.online >= 1,
        hint: 'Place a <b>GPU</b> near the CPU and run a <b>Trace</b> from the CPU to it. A GPU only lights up when it can reach a CPU <i>and</i> memory.' },
      {
        text: 'Rescue the far riser GPU with retimer chips',
        check: s => { const g = s.ents.find(e => e.locked && e.type === 'gpu'); return !!(g && g.online); },
        hint: 'Trace from the CPU toward the stranded GPU on the right — the signal fades and dies. Pick the <b>Retimer</b> tool and drop chips along that wire every couple of tiles.'
      }
    ],
    lesson: `<h2>Lesson 1 — Inside the server</h2>
      <p>Welcome to the island! This little green field is a <b>server board</b>. One rule runs everything:</p>
      <p><b>A GPU only works when it can reach a CPU <i>and</i> memory.</b></p>
      <p>Place a <b>DIMM</b> and a <b>GPU</b> near the CPU and wire them with <b>PCIe traces</b> — click one device, then the other. The glowing orbs are your data.</p>
      <p>Then look right: a GPU is stranded at the far edge. Traces lose <b>25% signal health per tile</b> — run one and watch the orb fade and die. Place <b>retimer chips</b> along the route (every 2 tiles): each one relaunches the signal at full strength.</p>
      <p class="tip">A retimer can’t resurrect a dead signal — place it before health falls under 30%. Drag with the mouse, or nudge with arrow keys / WASD. Right-drag to orbit the camera.</p>`
  },
  {
    title: 'Lesson 2 — Build the full server', hidden: true,
    tools: ['gpu', 'cpu', 'mem', 'pswitch', 'memctl', 'nic', 'trace', 'aecb', 'aocb', 'retimer'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'uplink', i: 15, j: 0 }],
    goals: [
      { text: 'Bring 6 GPUs online', check: s => s.stats.online >= 6,
        hint: 'The CPU has only 4 ports, so you can’t wire six GPUs straight to it. Place a <b>PCIe switch</b>, trace the CPU to it, then hang GPUs off the switch.' },
      { text: 'Fan out through a PCIe switch', check: s => s.stats.switchUsed,
        hint: 'Place the <b>PCIe switch</b>, run a <b>Trace</b> from the CPU to it, then trace your GPUs to the switch instead of the CPU.' },
      { text: 'Feed the board memory through a CXL controller', check: s => s.stats.memctlUsed,
        hint: 'Place a <b>CXL controller</b>, wire it to the CPU or switch, then trace <b>DIMMs</b> to the controller to add memory beyond the CPU’s slots.' },
      { text: 'Wire a NIC out to the rack uplink (AEC or AOC)', check: s => s.stats.nicUp,
        hint: 'Trace a <b>NIC</b> to the CPU or switch, then run an <b>AEC or AOC</b> cable (not a trace) from the NIC out to the <b>rack uplink</b> by the sign.' }
    ],
    lesson: `<h2>Lesson 2 — Build the full server</h2>
      <p>Now build a real GPU server. Six GPUs need to come online — but the <b>CPU has only 4 ports</b>, so you can’t just wire everything to it:</p>
      <p><b>PCIe switch</b> — turns one CPU port into eight. Put your GPUs behind it.<br>
      <b>CXL memory controller</b> — fans one port out to a whole bank of DIMMs.<br>
      <b>NIC</b> — wire it inward to the CPU or switch, then run an <b>external link</b> out to the <b>rack uplink</b> by the sign. Links to other racks are real cables — an <b>AEC or AOC</b>, never a board trace.</p>
      <p><b>Cables</b> — for GPUs on far shelves, reach for an <b>AEC</b> (retimed copper) or an <b>AOC</b> (optical, longest reach). Bare traces still need <b>retimers</b> on long runs.</p>
      <p class="tip">A GPU is online only when it can reach a CPU <i>and</i> memory — through the switch counts. Need another CPU? Drop one.</p>`
  },
  {
    title: 'Lesson 3 — Connect the islands', islands: true, hidden: true,
    tools: ['aecb', 'aocb'],
    pre: [
      { t: 'core', i: 10, j: 4 },
      { t: 'srv', i: 14, j: 1 }, { t: 'srv', i: 14, j: 7 },
      { t: 'srv', i: 0, j: 1 }, { t: 'srv', i: 0, j: 7 }
    ],
    goals: [
      { text: 'Build + connect the 2 near servers to the core (AEC works)', check: s => s.stats.online >= 2,
        hint: 'Each island needs a working server first — <b>scroll in</b> on an island to build one (CPU + GPU + DIMM, traced together), scroll back out, then <b>AEC</b>-cable it to the core.' },
      { text: 'Reach the far islands with AOC — all 4 online', check: s => s.stats.online >= 4,
        hint: 'Build every island (scroll in), then reach the far two with the <b>AOC</b> tool — AEC fades out over the long water gap.' }
    ],
    lesson: `<h2>Lesson 3 — Connect the islands</h2>
      <p>Look around — <b>each little island is a whole server</b>, and the big island in the middle is the rack’s <b>core switch</b>. Now wire them into one rack.</p>
      <p><b>Scroll your mouse wheel in</b> on an island to dive inside and build its server (the one you built earlier is already carried in). An island only comes online once its server works <i>and</i> it’s cabled to the core. Scroll back out to return to the hall.</p>
      <p>Between islands there’s only open water — <b>no board to etch a trace onto</b>. Every link is a real cable:</p>
      <p><b>AEC</b> — retimed copper. Cheap and cool, but it fades over distance (6% per tile).<br>
      <b>AOC</b> — optical. Barely fades at all (1% per tile) — the only thing that reaches the far islands.</p>
      <p>Click a server island, then the core, to lay a cable across the sea. Try AEC on the near ones… then watch it die on the far ones and reach for AOC.</p>
      <p class="tip">This is the real reason AECs and AOCs exist: the moment you leave the board, copper physics decides how far you can go.</p>`
  },
  {
    title: 'Sandbox — Inside a server', sandbox: true, hidden: true,
    tools: ['gpu', 'cpu', 'mem', 'pswitch', 'memctl', 'nic', 'uplink', 'trace', 'aecb', 'aocb', 'retimer'],
    pre: [],
    goals: [{ text: 'Build any server you like', check: () => false }],
    lesson: `<h2>Sandbox — Inside a server</h2>
      <p>The island is yours. Drop <b>CPUs</b>, hang GPUs and memory off <b>PCIe switches</b> and <b>CXL controllers</b>, run <b>AEC</b> and <b>AOC</b> cables across the board, and watch the data orbs flow.</p>
      <p>Want the bigger picture? Try <b>Sandbox — Data hall</b> in the level menu to build a whole rack of server islands.</p>
      <p class="tip">A GPU sparkles green when it can reach a CPU and memory. Right-drag to orbit, scroll to zoom.</p>`
  },
  {
    title: 'Free build — one hall', sandbox: true, islands: true,
    tools: ['srv', 'core', 'aecb', 'aocb'],
    pre: [{ t: 'core', i: 8, j: 4 }],
    goals: [{ text: 'Grow a data hall your way', check: () => false }],
    lesson: `<h2>Free build — one hall</h2>
      <p>No objectives — just build. Drop <b>server islands</b> and <b>core switch islands</b> anywhere on the sea, <b>scroll in</b> on an island to build its server, and wire everything together with <b>AEC</b> and <b>AOC</b> cables.</p>
      <p>New: <b>cables have capacity</b>. A server island pushes <b>6.4 Tb/s</b>, but one AEC only carries <b>4</b>. When a link is overloaded it glows <b style="color:#e05555">red</b>; add parallel cables or switch to a fatter <b>AOC (10 Tb/s)</b> until it cools to <b style="color:#43d15f">green</b>.</p>
      <p class="tip">Islands need a little elbow room — drop them a couple of tiles apart. Drag to rearrange, Del to remove.</p>`
  },
  {
    title: 'Survival — Keep it alive', sandbox: true, islands: true, survival: true,
    tools: ['aecb', 'aocb'],
    pre: [
      { t: 'core', i: 8, j: 4 },
      { t: 'srv', i: 2, j: 1 }, { t: 'srv', i: 14, j: 1 },
      { t: 'srv', i: 2, j: 7 }, { t: 'srv', i: 14, j: 7 }
    ],
    preCables: [
      { a: 1, b: 0, type: 'aecb' }, { a: 2, b: 0, type: 'aocb' },
      { a: 3, b: 0, type: 'aocb' }, { a: 4, b: 0, type: 'aecb' }
    ],
    goals: [{ text: 'Keep the servers online — score is your uptime', check: () => false }],
    lesson: `<h2>Survival — Keep it alive</h2>
      <p>The rack is built and humming. Now <b>keep it alive.</b> Links fail over time — <b>optics (AOC) fail more often than copper (AEC)</b>, and it only gets worse as your shift wears on.</p>
      <p>When a link drops it turns <b style="color:#e05555">red</b> and its server may go dark. <b>Click the broken link</b> to send an <b>engineer boat</b> out to repair it. You’ve got a small crew — when several fail at once, triage: save the link feeding the most servers first.</p>
      <p>Your score is <b>uptime %</b>. The winning move is <b>redundancy</b>: run a <i>second</i> cable from a server to the core (dual-home it) and a single failure won’t take it down at all — build spare links in the quiet moments.</p>
      <p class="tip">AEC where you can, AOC only where you must — copper fails less. Right-drag to orbit.</p>`
  }
];

/* ---------------- game state ---------------- */
let S = null;
let hoverTile = null;
let drag = null;
let toastTimer = 0;
let idSeq = 1;
let advanceTimer = 0;

function newLevelState(idx) {
  const L = LEVELS[idx];
  const s = {
    idx, level: L,
    ents: [], cables: [], retimers: [],
    tool: 'select', pendA: null, selected: null, done: false,
    stats: { online: 0, tput: 0, watts: 0, memsReach: 0, switchUsed: false, nicUp: false, memctlUsed: false }
  };
  L.pre.forEach(p => s.ents.push({ id: idSeq++, type: p.t, i: p.i, j: p.j, locked: true }));
  (L.preCables || []).forEach(pc => {
    const A = s.ents[pc.a], B = s.ents[pc.b];
    s.cables.push({ id: idSeq++, type: pc.type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0, down: false });
  });
  /* carry your last server build forward: it becomes the first island's server */
  if (L.islands && !L.survival && carriedServer) {
    const firstSrv = s.ents.find(e => e.type === 'srv');
    if (firstSrv) firstSrv.inner = cloneBuild(carriedServer);
  }
  /* survival islands come pre-built with a simple working server you can drill in and edit */
  if (L.survival) {
    s.ents.filter(e => e.type === 'srv').forEach(srv => { srv.inner = defaultServerBuild(); });
    s.survival = { time: 0, upNum: 0, upDen: 0, sinceFail: 6, ended: false };
  }
  return s;
}
/* footprints: GPUs are a wide 2x1 card, switches a chunky 2x2; the CPU stays
   1x1 so short traces and retimers have room around it */
const SIZE = { gpu: [2, 1], pswitch: [2, 2] };
function esize(t) { return SIZE[t] || [1, 1]; }
function entCenter(e, y) { const s = esize(e.type); return new THREE.Vector3(tX(e.i) + (s[0] - 1) / 2, y || 0, tZ(e.j) + (s[1] - 1) / 2); }
/* per-axis scale so a 2x1 stretches wide, a 2x2 grows square (never distorts height oddly) */
function pieceScale(type) { const s = esize(type); return [s[0] > 1 ? 1.85 : 1, (s[0] > 1 && s[1] > 1) ? 1.85 : 1, s[1] > 1 ? 1.85 : 1]; }
function entAt(i, j) { return S.ents.find(e => e.i === i && e.j === j); }
function entCovering(i, j) {
  return S.ents.find(e => { const s = esize(e.type); return i >= e.i && i < e.i + s[0] && j >= e.j && j < e.j + s[1]; });
}
function fits(type, i, j, ignore) {
  const s = esize(type);
  if (i < 0 || j < 0 || i + s[0] > GRID_W || j + s[1] > GRID_H) return false;
  for (let a = 0; a < s[0]; a++) for (let b = 0; b < s[1]; b++) {
    const e = entCovering(i + a, j + b);
    if (e && e !== ignore) return false;
  }
  return true;
}
function lPath(a, b) {
  const p = [{ i: a.i, j: a.j }];
  let i = a.i, j = a.j;
  while (i !== b.i) { i += Math.sign(b.i - i); p.push({ i, j }); }
  while (j !== b.j) { j += Math.sign(b.j - j); p.push({ i, j }); }
  return p;
}

/* ---------------- simulation ---------------- */
function recompute() {
  /* drop retimers whose wire is gone, then walk each cable applying its own retimers */
  S.retimers = S.retimers.filter(r => S.cables.some(c => c.id === r.cableId));
  S.cables.forEach(c => {
    const loss = CAB[c.type].loss * lossMul();
    const stops = CAB[c.type].retime
      ? S.retimers.filter(r => r.cableId === c.id).map(r => Math.max(1, Math.round(r.t * (c.path.length - 1))))
      : [];
    let h = 100, dead = false;
    c.health = [100]; c.failAt = -1;
    for (let k = 1; k < c.path.length; k++) {
      h -= loss;
      if (!dead && h < FAIL) { dead = true; c.failAt = k; }
      if (!dead && stops.includes(k)) h = 100;
      c.health.push(Math.max(0, h));
    }
    c.ok = !dead;
  });

  const healthy = S.cables.filter(c => c.ok && !c.down);
  const other = (c, e) => S.ents.find(x => x.id === (c.a === e.id ? c.b : c.a));
  const adj = new Map();
  S.ents.forEach(e => adj.set(e.id, []));
  healthy.forEach(c => {
    if (adj.has(c.a) && adj.has(c.b)) { adj.get(c.a).push(c.b); adj.get(c.b).push(c.a); }
  });
  const reachTypes = start => {
    const seen = new Set([start.id]), q = [start.id], types = new Set();
    while (q.length) {
      const id = q.pop();
      const e = S.ents.find(x => x.id === id);
      if (e && e.id !== start.id) types.add(e.type);
      (adj.get(id) || []).forEach(n2 => { if (!seen.has(n2)) { seen.add(n2); q.push(n2); } });
    }
    return { types, seen };
  };
  let online = 0, tput = 0;
  if (S.level.islands) {
    /* island scale: a server island is online when it has a healthy cable to a core.
       congestion: split the server's 6.4 Tb/s across its healthy core-links by capacity;
       util = load / totalCapacity, shown as the link colour. */
    S.cables.forEach(c => { c.util = undefined; });
    const cores = S.ents.filter(e => e.type === 'core');
    let hot = 0;
    S.ents.forEach(e => {
      if (e.type !== 'srv') { e.online = false; return; }
      const links = healthy.filter(c => (c.a === e.id || c.b === e.id) && cores.some(k => k.id === (c.a === e.id ? c.b : c.a)));
      /* an island only comes online if it's cabled to a core AND its own server works
         (built or edited by scrolling in) — survival islands come pre-built so they work too */
      e.working = serverWorks(e.inner);
      e.online = links.length > 0 && e.working;
      if (!e.online) { e.congested = false; return; }
      online++; tput += CAT.srv.tput;
      if (S.level.survival) { e.congested = false; return; }   /* survival uses green/red = up/down, not congestion */
      const totalCap = links.reduce((s, c) => s + (CAB[c.type].cap || 4) * capMul(), 0);
      const util = CAT.srv.tput / totalCap;
      e.congested = util > 1.0001;
      links.forEach(c => { c.util = util; });
      if (e.congested) hot++;
    });
    const watts = S.cables.reduce((w, c) => w + CAB[c.type].watts, 0);
    S.stats = { online, tput: Math.round(tput * 10) / 10, watts: Math.round(watts * 10) / 10, hot, memsReach: 0, switchUsed: false, nicUp: false, memctlUsed: false };
    syncScene();
    if (!S.done && !S.level.sandbox && S.level.goals.every(g => g.check(S))) {
      S.done = true; unlockLevel(S.idx + 1); levelComplete();
    }
    updateHUD(); updateGoals();
    return;
  }
  S.ents.forEach(e => {
    if (e.type === 'gpu') {
      const r = reachTypes(e);
      e.online = r.types.has('cpu') && r.types.has('mem');
      if (e.online) { online++; tput += CAT.gpu.tput; }
    } else e.online = false;
  });
  const cpuReach = new Set();
  S.ents.filter(e => e.type === 'cpu').forEach(cpu => reachTypes(cpu).seen.forEach(id => cpuReach.add(id)));
  const memsReach = S.ents.filter(e => e.type === 'mem' && cpuReach.has(e.id)).length;
  const nicUp = S.ents.some(e => e.type === 'nic' && (() => {
    const r = reachTypes(e); return r.types.has('cpu') && r.types.has('uplink');
  })());
  const switchUsed = S.ents.some(p => p.type === 'pswitch' &&
    reachTypes(p).types.has('cpu') &&
    healthy.some(c => (c.a === p.id || c.b === p.id) && other(c, p) && other(c, p).type === 'gpu'));
  const memctlUsed = S.ents.some(mc => mc.type === 'memctl' &&
    reachTypes(mc).types.has('cpu') &&
    healthy.some(c => (c.a === mc.id || c.b === mc.id) && other(c, mc) && other(c, mc).type === 'mem'));

  const watts = S.cables.reduce((w, c) => w + CAB[c.type].watts, 0) + S.retimers.length * RET.watts;
  S.stats = {
    online, tput: Math.round(tput * 10) / 10, watts: Math.round(watts * 10) / 10,
    memsReach, switchUsed, nicUp, memctlUsed
  };

  syncScene();
  /* inside an island: the moment its server works, tell the player to scroll out */
  if (islandEdit && online >= 1 && !S._proceed) {
    S._proceed = true;
    say('✓ Server working! Scroll out — or hit ↖ Back to the data hall — to wire it to the core.');
    backBtn(true, true);
  }
  if (!S.done && !S.level.sandbox && S.level.goals.every(g => g.check(S))) {
    S.done = true;
    unlockLevel(S.idx + 1);
    levelComplete();
  }
  updateHUD(); updateGoals();
}

/* ---------------- actions ---------------- */
function say(msg) {
  const el = $('toast3d');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function isIsland(type) { return type === 'srv' || type === 'core'; }
function islandSpaced(i, j, ignore) {
  return !S.ents.some(e => isIsland(e.type) && e !== ignore &&
    Math.max(Math.abs(e.i - i), Math.abs(e.j - j)) < 3);
}
function refreshIslands() { if (S.level.islands) buildWorld(S.level); }
function tryPlaceEnt(type, i, j) {
  const s = esize(type);
  if (!fits(type, i, j)) return say((s[0] > 1 || s[1] > 1) ? 'This part is 2×2 — needs a clear square with room on the board.' : 'That spot is occupied.');
  if (isIsland(type) && !islandSpaced(i, j)) return say('Islands need elbow room — drop it a few tiles from the others.');
  S.ents.push({ id: idSeq++, type, i, j });
  recompute();
  if (isIsland(type)) refreshIslands();
}
function tryPlaceRet(cableId, t) {
  const c = S.cables.find(x => x.id === cableId);
  if (!c) return say('Hover over a wire, then click to add a retimer.');
  if (!CAB[c.type].retime) return say(`${CAB[c.type].name} already has retimers built into its plugs.`);
  S.retimers.push({ id: idSeq++, cableId, t });
  recompute();
}
function portCount(e) { return S.cables.filter(c => c.a === e.id || c.b === e.id).length; }
function tryCable(type, A, B) {
  if (A.id === B.id) return say('Connect two different devices.');
  if (!(ALLOWED_BOARD[A.type] || []).includes(B.type))
    return say(`${CAT[A.type].name} plugs into: ${(ALLOWED_BOARD[A.type] || []).map(k => CAT[k].name).join(', ')}.`);
  if ((A.type === 'uplink' || B.type === 'uplink') && type !== 'aecb' && type !== 'aocb')
    return say('Links to other racks are real cables — use an AEC or AOC, not a board trace.');
  if (portCount(A) >= CAT[A.type].ports) return say(`${CAT[A.type].name} is out of ports.`);
  if (portCount(B) >= CAT[B.type].ports) return say(`${CAT[B.type].name} is out of ports.`);
  S.cables.push({ id: idSeq++, type, a: A.id, b: B.id, path: lPath(A, B), pulses: [], nextPulse: 0 });
  recompute();
}
function moveEnt(ent, i, j) {
  if (ent.locked) return say('That one is fixed — it can’t be moved.');
  if (i === ent.i && j === ent.j) return;
  if (!fits(ent.type, i, j, ent)) return say('That spot is occupied or off the island.');
  if (isIsland(ent.type) && !islandSpaced(i, j, ent)) return say('Islands need elbow room — keep them a few tiles apart.');
  ent.i = i; ent.j = j;
  S.cables.forEach(c => {
    if (c.a === ent.id || c.b === ent.id) {
      const A = S.ents.find(e => e.id === c.a), B = S.ents.find(e => e.id === c.b);
      c.path = lPath(A, B);
      c.pulses = [];
    }
  });
  recompute();
  if (isIsland(ent.type)) refreshIslands();
}
function removeThing(th) {
  let wasIsland = false;
  if (th.kind === 'ent') {
    if (th.ent.locked) return say('That one came with the board — it stays.');
    wasIsland = isIsland(th.ent.type);
    S.cables = S.cables.filter(c => c.a !== th.ent.id && c.b !== th.ent.id);
    S.ents = S.ents.filter(e => e !== th.ent);
  } else if (th.kind === 'cable') {
    S.cables = S.cables.filter(c => c !== th.cable);
    S.retimers = S.retimers.filter(r => r.cableId !== th.cable.id);   // its retimers go with it
  } else if (th.kind === 'ret') {
    S.retimers = S.retimers.filter(r => r !== th.ret);
  }
  S.selected = null;
  recompute();
  if (wasIsland) refreshIslands();
}

/* ================= THREE.JS WORLD ================= */
const stage = document.getElementById('stage3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe4f5);
scene.fog = new THREE.Fog(0xcfeaf7, 30, 70);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 14.5, 12.5);
camera.lookAt(0, 0, 0.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0.6);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 26;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.35;
controls.minAzimuthAngle = -Infinity;   // full 360° orbit around the map
controls.maxAzimuthAngle = Infinity;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.enableDamping = true;
controls.dampingFactor = 0.08;

/* ---- first-person mode: walk the floor with WASD + mouse look ---- */
const fpControls = new PointerLockControls(camera, renderer.domElement);
let fpMode = false, fpBob = 0; const fpKeys = {};
let fpCrossEl = null;
function fpCrosshair(show) {
  if (!fpCrossEl) {
    fpCrossEl = document.createElement('div'); fpCrossEl.id = 'fpCross';
    (document.getElementById('stage3d') || document.body).appendChild(fpCrossEl);
  }
  fpCrossEl.style.display = show ? '' : 'none';
}
function enterFP() {
  if (fpMode) return;
  fpMode = true; fpBob = 0; controls.enabled = false; camTween = null;
  camera.fov = 70; camera.updateProjectionMatrix();
  camera.position.set(0, 1.6, 6); camera.lookAt(0, 1.6, 0);
  placeWorkers(); fpCrosshair(true);
  fpControls.lock();
  const b = document.getElementById('btnFP'); if (b) { b.textContent = '⤺ Exit'; b.classList.add('on'); }
  say('First person — WASD to walk, Shift to sprint, mouse to look, Esc to exit');
}
function exitFP() {
  if (!fpMode) return;
  fpMode = false; controls.enabled = true;
  if (fpControls.isLocked) fpControls.unlock();
  camera.fov = 38; camera.updateProjectionMatrix();
  camera.position.copy(CAM_HOME); camera.lookAt(CAM_TARGET);
  controls.target.copy(CAM_TARGET); controls.update();
  placeWorkers(); fpCrosshair(false);
  const b = document.getElementById('btnFP'); if (b) { b.textContent = '🧍 Walk'; b.classList.remove('on'); }
}
fpControls.addEventListener('unlock', () => { if (fpMode) exitFP(); });
addEventListener('keydown', e => { fpKeys[e.code] = true; if (fpMode && e.code === 'Escape') exitFP(); });
addEventListener('keyup', e => { fpKeys[e.code] = false; });

/* ---- smooth scale transitions (zoom between server and data hall) ---- */
const CAM_HOME = new THREE.Vector3(0, 14.5, 12.5);
const CAM_TARGET = new THREE.Vector3(0, 0, 0.6);
let camTween = null;
function beginScaleZoom(zoomOut) {
  const start = zoomOut ? new THREE.Vector3(0, 8, 6.6) : new THREE.Vector3(0, 27, 23);
  camera.position.copy(start);
  camTween = { t: 0, dur: 1.1, from: start.clone(), to: CAM_HOME.clone() };
  controls.enabled = false;
}
/* over-scroll at the zoom limit: drill into / out of islands, or hop sandboxes */
let overscroll = 0, lastWheel = 0;
let islandEdit = null;      // { outerS, ent } while zoomed inside one island's server
let carriedServer = null;   // your last server build, carried forward into the island lessons
function campaignIdx() { return LEVELS.findIndex(L => L.campaign); }
function freeBuildIdx() { return LEVELS.findIndex(L => L.sandbox && L.islands && !L.survival); }
const SERVER_TOOLS = ['gpu', 'cpu', 'mem', 'pswitch', 'memctl', 'trace', 'retimer'];

/* a simple pre-built working server (CPU + GPU + DIMM, traced) for seeding islands */
function defaultServerBuild() {
  const cpu = { id: idSeq++, type: 'cpu', i: 6, j: 4 };
  const gpu = { id: idSeq++, type: 'gpu', i: 8, j: 4 };
  const mem = { id: idSeq++, type: 'mem', i: 6, j: 6 };
  const mk = (a, b) => ({ id: idSeq++, type: 'trace', a: a.id, b: b.id, path: lPath(a, b), pulses: [], nextPulse: 0 });
  return { ents: [cpu, gpu, mem], cables: [mk(cpu, gpu), mk(cpu, mem)], retimers: [] };
}
/* deep-copy a {ents,cables,retimers} build with fresh ids */
function cloneBuild(b) {
  if (!b) return { ents: [], cables: [], retimers: [] };
  const map = new Map(), cmap = new Map();
  const ents = b.ents.map(e => { const ne = { id: idSeq++, type: e.type, i: e.i, j: e.j }; map.set(e.id, ne.id); return ne; });
  const cables = b.cables.map(c => { const nid = idSeq++; cmap.set(c.id, nid); return { id: nid, type: c.type, a: map.get(c.a), b: map.get(c.b), path: c.path.map(p => ({ i: p.i, j: p.j })), pulses: [], nextPulse: 0 }; });
  const retimers = (b.retimers || []).map(r => ({ id: idSeq++, cableId: cmap.get(r.cableId), t: r.t })).filter(r => r.cableId != null);
  return { ents, cables, retimers };
}
/* how many GPUs come online inside a stand-alone server build (pure, no side effects) */
function serverOnlineCount(build) {
  if (!build || !build.ents.length) return 0;
  const rets = build.retimers || [];
  const ok = c => {
    const loss = CAB[c.type].loss; let h = 100;
    const stops = CAB[c.type].retime ? rets.filter(r => r.cableId === c.id).map(r => Math.max(1, Math.round(r.t * (c.path.length - 1)))) : [];
    for (let k = 1; k < c.path.length; k++) { h -= loss; if (h < FAIL) return false; if (stops.includes(k)) h = 100; }
    return true;
  };
  const adj = new Map(); build.ents.forEach(e => adj.set(e.id, []));
  build.cables.filter(ok).forEach(c => { if (adj.has(c.a) && adj.has(c.b)) { adj.get(c.a).push(c.b); adj.get(c.b).push(c.a); } });
  const reach = start => { const seen = new Set([start.id]), q = [start.id], types = new Set(); while (q.length) { const id = q.pop(); const e = build.ents.find(x => x.id === id); if (e && e.id !== start.id) types.add(e.type); (adj.get(id) || []).forEach(n => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); } return types; };
  let n = 0;
  build.ents.forEach(e => { if (e.type === 'gpu') { const t = reach(e); if (t.has('cpu') && t.has('mem')) n++; } });
  return n;
}
function serverWorks(build) { return serverOnlineCount(build) >= 1; }
function nearestServerIsland() {
  let best = null, bd = 1e9;
  S.ents.forEach(e => { if (e.type !== 'srv') return; const dx = tX(e.i) - controls.target.x, dz = tZ(e.j) - controls.target.z; const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = e; } });
  return best;
}
let backBtnEl = null;
function backBtn(show, pulse) {
  if (!backBtnEl) {
    backBtnEl = document.createElement('button');
    backBtnEl.id = 'backHall';
    backBtnEl.textContent = '↖ Back to the data hall';
    (document.getElementById('stage3d') || document.body).appendChild(backBtnEl);
    backBtnEl.onclick = () => exitIsland();
  }
  backBtnEl.style.display = show ? '' : 'none';
  if (show && pulse) backBtnEl.classList.add('pulse');
  if (!show) backBtnEl.classList.remove('pulse');
}
function enterIsland(ent) {
  if (islandEdit || !ent || ent.type !== 'srv') return;
  const inner = ent.inner || (ent.inner = { ents: [], cables: [], retimers: [] });
  islandEdit = { outerS: S, ent };
  const L = { title: 'Inside a server — build it, then scroll out', tools: SERVER_TOOLS, islands: false, sandbox: true, inner: true, pre: [],
    goals: [
      { text: 'Place a CPU on the board', check: s => s.ents.some(e => e.type === 'cpu'),
        hint: 'Pick the <b>CPU</b> tool from the palette and click an empty tile. The CPU is the hub every part connects back to.' },
      { text: 'Add memory — wire a DIMM to the CPU', check: s => s.stats.memsReach >= 1,
        hint: 'Place a <b>Memory</b> (DIMM) next to the CPU, then pick <b>Trace</b>, click the CPU, then the DIMM (or just drag from one to the other).' },
      { text: 'Bring a GPU online (it needs a CPU and memory)', check: s => s.stats.online >= 1,
        hint: 'Place a <b>GPU</b> and trace it to the CPU. A GPU only lights up when it can reach a CPU <i>and</i> memory. On long copper runs, click the wire to drop a <b>retimer</b>.' }
    ] };
  S = { idx: islandEdit.outerS.idx, level: L, ents: inner.ents, cables: inner.cables, retimers: inner.retimers,
    tool: 'select', pendA: null, selected: null, done: false,
    stats: { online: 0, tput: 0, watts: 0, memsReach: 0, switchUsed: false, nicUp: false, memctlUsed: false } };
  entMeshes.forEach(m => scene.remove(m)); entMeshes.clear();
  retMeshes.forEach(m => scene.remove(m)); retMeshes.clear();
  engineers.forEach(e => e.mesh.visible = false);   // hide survival boats while on a server board
  buildWorld(L); buildToolbar(); showInspector(null); recompute();
  beginScaleZoom(false); backBtn(true); placeWorkers();
}
function exitIsland() {
  if (!islandEdit) return;
  const { outerS, ent } = islandEdit;
  ent.inner = { ents: S.ents, cables: S.cables, retimers: S.retimers };
  islandEdit = null; S = outerS;
  entMeshes.forEach(m => scene.remove(m)); entMeshes.clear();
  retMeshes.forEach(m => scene.remove(m)); retMeshes.clear();
  engineers.forEach(e => e.mesh.visible = true);   // survival boats back on the water
  buildWorld(S.level); buildToolbar(); showInspector(null); recompute();
  beginScaleZoom(true); backBtn(false); placeWorkers();
  const msg = S.level.survival ? '✓ Changes saved to this server.'
    : (serverWorks(ent.inner) ? '✓ Server built — now cable this island to the core.' : 'This island’s server isn’t working yet — scroll back in to finish it.');
  say(msg);
}
renderer.domElement.addEventListener('wheel', ev => {
  if (!S || camTween) return;
  const now = performance.now();
  if (now - lastWheel > 450) overscroll = 0;
  lastWheel = now;
  const dist = camera.position.distanceTo(controls.target);
  const nearIn = dist <= controls.minDistance + 0.8;
  const nearOut = dist >= controls.maxDistance - 0.8;
  /* inside a server island → scroll OUT to return to the data hall */
  if (islandEdit) {
    if (ev.deltaY > 0 && nearOut) {
      overscroll += ev.deltaY;
      if (overscroll > 60) say('Keep scrolling out to return to the data hall…');
      if (overscroll > 240) { overscroll = 0; exitIsland(); }
    } else overscroll = 0;
    return;
  }
  /* on any island level (including survival) → scroll IN over an island to edit its server */
  if (S.level.islands && ev.deltaY < 0 && nearIn) {
    const ent = nearestServerIsland();
    if (ent) {
      overscroll += -ev.deltaY;
      if (overscroll > 60) say('Keep scrolling in to open this server…');
      if (overscroll > 240) { overscroll = 0; enterIsland(ent); }
      return;
    }
  }
  overscroll = 0;
}, { passive: true });

const hemi = new THREE.HemisphereLight(0xffffff, 0xa8d8a0, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(8, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0004;
scene.add(sun);

/* toon gradient */
const gradTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 1;
  const g = c.getContext('2d');
  ['#666666', '#999999', '#cccccc', '#ffffff'].forEach((col, k) => { g.fillStyle = col; g.fillRect(k, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
})();
function toon(color, opts) {
  return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradTex }, opts || {}));
}

/* world coords: tile (i,j) -> x,z */
const tX = i => i - GRID_W / 2 + 0.5;
const tZ = j => j - GRID_H / 2 + 0.5;

/* ---- island ---- */
/* permanent ocean */
const ocean = new THREE.Mesh(
  new THREE.CylinderGeometry(46, 46, 0.4, 48),
  new THREE.MeshBasicMaterial({ color: 0x8fd9ec })
);
ocean.position.y = -1.75;
scene.add(ocean);

/* grid is inset by fx/fz (0..0.5 fraction) so the drawn cells line up
   exactly with the tile centres where components are placed */
function grassTexture(cols, rows, fx, fz) {
  fx = fx || 0; fz = fz || 0;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#7ecb54'; g.fillRect(0, 0, 1024, 576);
  g.strokeStyle = 'rgba(70,140,50,.5)'; g.lineWidth = 2;
  const x0 = fx * 1024, x1 = (1 - fx) * 1024, cw = (x1 - x0) / cols;
  const z0 = fz * 576, z1 = (1 - fz) * 576, ch = (z1 - z0) / rows;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(x0 + i * cw, z0); g.lineTo(x0 + i * cw, z1); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(x0, z0 + j * ch); g.lineTo(x1, z0 + j * ch); g.stroke(); }
  for (let k = 0; k < 700; k++) {
    g.fillStyle = k % 2 ? 'rgba(255,255,255,.10)' : 'rgba(60,130,45,.18)';
    g.fillRect(Math.random() * 1024, Math.random() * 576, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---- decorations ---- */
function tree(parent, x, z, s) {
  const gTree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.7 * s, 8), toon(0x8a5a33));
  trunk.position.y = 0.35 * s; trunk.castShadow = true;
  const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 12, 10), toon(0x3f9e46));
  f1.position.y = 0.95 * s; f1.scale.y = 0.85; f1.castShadow = true;
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.38 * s, 12, 10), toon(0x54b859));
  f2.position.set(0.15 * s, 1.3 * s, 0.05 * s); f2.castShadow = true;
  gTree.add(trunk, f1, f2);
  gTree.position.set(x, 0, z);
  parent.add(gTree);
}
function flowerPatch(parent, x, z) {
  const colors = [0xf06ab8, 0xf5c542, 0xffffff, 0xf08a3c];
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), toon(0x3f9e46));
    stem.position.y = 0.09;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), toon(colors[k % 4]));
    head.position.y = 0.2;
    f.add(stem, head);
    f.position.set(x + (Math.random() - 0.5) * 0.7, 0, z + (Math.random() - 0.5) * 0.7);
    parent.add(f);
  }
}
function rock(parent, x, z, s) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 * s, 0), toon(0xb8bfc8));
  r.position.set(x, 0.12 * s, z);
  r.scale.y = 0.7; r.castShadow = true;
  parent.add(r);
}

/* ---- world rebuild per level ---- */
let worldGroup = new THREE.Group();
scene.add(worldGroup);
function makeIsland(parent, cx, cz, w, d, cols, rows, border) {
  border = border || 0;
  const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.7, d, 4, 0.3),
    toon(0xffffff, { map: grassTexture(cols, rows, border / w, border / d) }));
  top.position.set(cx, -0.35, cz); top.receiveShadow = true;
  const dirt = new THREE.Mesh(new RoundedBoxGeometry(w + 0.3, 1.3, d + 0.3, 4, 0.4), toon(0x9a6a3f));
  dirt.position.set(cx, -1.05, cz);
  const shore = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(w, d) * 0.62, Math.max(w, d) * 0.66, 0.3, 40),
    new THREE.MeshBasicMaterial({ color: 0xbdeaf6 }));
  shore.position.set(cx, -1.62, cz); shore.scale.set(1, 1, d / w);
  parent.add(shore, dirt, top);
}
function buildWorld(level) {
  scene.remove(worldGroup);
  worldGroup = new THREE.Group();
  if (level.islands) {
    /* one small island under each server/core entity — the islands ARE the servers.
       driven by live entities so the sandbox can grow its own archipelago. */
    const src = (S && S.ents.length) ? S.ents.filter(e => e.type === 'srv' || e.type === 'core')
      : level.pre.filter(p => p.t === 'srv' || p.t === 'core').map(p => ({ type: p.t, i: p.i, j: p.j }));
    src.forEach(p => {
      const cx = tX(p.i), cz = tZ(p.j);
      const big = p.type === 'core';
      const w = big ? 3.6 : 2.8, d = big ? 3.6 : 2.8;
      makeIsland(worldGroup, cx, cz, w, d, 3, 3, 0.6);
      tree(worldGroup, cx + w * 0.32, cz - d * 0.32, big ? 0.8 : 0.6);
      flowerPatch(worldGroup, cx - w * 0.3, cz + d * 0.28);
      if (!big) rock(worldGroup, cx - w * 0.32, cz - d * 0.3, 0.6);
    });
  } else {
    makeIsland(worldGroup, 0, 0, GRID_W + 1.4, GRID_H + 1.4, GRID_W, GRID_H, 0.7);
    tree(worldGroup, -GRID_W / 2 - 0.1, -GRID_H / 2 - 0.15, 1.1);
    tree(worldGroup, GRID_W / 2 + 0.05, GRID_H / 2 + 0.1, 0.9);
    tree(worldGroup, -GRID_W / 2 - 0.2, GRID_H / 2 + 0.2, 0.8);
    flowerPatch(worldGroup, GRID_W / 2 - 0.2, -GRID_H / 2 - 0.3);
    flowerPatch(worldGroup, -GRID_W / 2 + 1.2, GRID_H / 2 + 0.35);
    rock(worldGroup, GRID_W / 2 + 0.4, -GRID_H / 2 + 1.4, 1);
    rock(worldGroup, -GRID_W / 2 + 0.3, -GRID_H / 2 - 0.4, 0.7);
  }
  scene.add(worldGroup);
}

const clouds = [];
for (let k = 0; k < 9; k++) {
  const cl = new THREE.Group();
  const puffs = 3 + (k % 3);
  const scl = 0.8 + (k % 4) * 0.22;
  for (let m = 0; m < puffs; m++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry((0.9 - m * 0.14) * scl, 10, 8),
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, transparent: true, opacity: 0.92 }));
    puff.position.set((m * 0.82 - puffs * 0.4) * scl, (m % 2) * 0.2 * scl, ((m % 3) - 1) * 0.34 * scl);
    puff.scale.y = 0.6;
    cl.add(puff);
  }
  cl.position.set(-22 + k * 5.4, 6.5 + (k % 3) * 1.7, -10 + (k % 4) * 4.6);
  cl.userData.speed = 0.12 + (k % 5) * 0.05;
  scene.add(cl);
  clouds.push(cl);
}

/* extra day-time life: sailboats circling the open sea and a few birds aloft —
   hidden in space mode alongside the clouds */
const dayProps = [];
function makeSailboat(angle, hue) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.0), toon(0x8a5a33)); hull.position.y = 0.09;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), toon(0x6b4a2a)); mast.position.y = 0.55;
  const sail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.85, 4, 1, true), toon(hue));
  sail.position.set(0, 0.55, 0); sail.rotation.y = Math.PI / 4;
  g.add(hull, mast, sail);
  g.userData = { boat: true, angle, R: 15 + Math.random() * 5, spd: 0.05 + Math.random() * 0.05, dir: Math.random() < 0.5 ? 1 : -1, bob: Math.random() * Math.PI * 2 };
  scene.add(g); dayProps.push(g); return g;
}
makeSailboat(0.4, 0xf2f2f2); makeSailboat(2.6, 0xf5c542); makeSailboat(4.5, 0xf06ab8);
function makeBird() {
  const g = new THREE.Group();
  const wm = toon(0x2c2f3a);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.14), wm); l.position.x = -0.28;
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.14), wm); r.position.x = 0.28;
  g.add(l, r);
  g.userData = { bird: true, wingL: l, wingR: r, phase: Math.random() * Math.PI * 2, spd: 1.4 + Math.random() };
  g.position.set(-20 + Math.random() * 8, 9 + Math.random() * 3, -8 + Math.random() * 16);
  scene.add(g); dayProps.push(g); return g;
}
for (let k = 0; k < 6; k++) makeBird();

/* ---- little critters: a menagerie of toon animals that wander every scale ---- */
const ANIMAL_KINDS = [
  { name: 'cat',    body: 0x8a8f98, ear: 'point', tail: 'thin' },
  { name: 'dog',    body: 0xc8934a, ear: 'flop',  tail: 'thin' },
  { name: 'fox',    body: 0xe0662e, ear: 'point', tail: 'bushy' },
  { name: 'pig',    body: 0xf2a3b3, ear: 'point', tail: 'curl', snout: true },
  { name: 'rabbit', body: 0xd8d2c8, ear: 'long',  tail: 'puff' },
  { name: 'duck',   body: 0xf5d642, ear: 'none',  tail: 'thin', beak: true, biped: true }
];
function buildAnimal(i) {
  const k = ANIMAL_KINDS[i % ANIMAL_KINDS.length];
  const g = new THREE.Group();
  const col = k.body, mat = toon(col);
  const body = rbox(0.32, 0.18, 0.2, col, 0.08); body.position.set(0, 0.17, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat); head.position.set(0, 0.27, 0.17);
  g.add(body, head);
  if (k.ear === 'point') [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 6), mat); e.position.set(s * 0.06, 0.38, 0.16); g.add(e); });
  else if (k.ear === 'long') [-1, 1].forEach(s => { const e = rbox(0.05, 0.19, 0.04, col, 0.02); e.position.set(s * 0.05, 0.44, 0.15); g.add(e); });
  else if (k.ear === 'flop') [-1, 1].forEach(s => { const e = rbox(0.06, 0.13, 0.04, 0x6b4a2a, 0.02); e.position.set(s * 0.11, 0.3, 0.17); e.rotation.z = s * 0.5; g.add(e); });
  if (k.snout) { const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), toon(0xe58aa0)); sn.rotation.x = Math.PI / 2; sn.position.set(0, 0.25, 0.29); g.add(sn); }
  if (k.beak) { const bk = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 7), toon(0xe8912e)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.25, 0.31); g.add(bk); }
  [-1, 1].forEach(s => { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), toon(0x141414)); ey.position.set(s * 0.05, 0.3, 0.27); g.add(ey); });
  if (k.tail === 'bushy' || k.tail === 'puff') { const tl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), toon(k.tail === 'puff' ? 0xffffff : col)); tl.position.set(0, 0.22, -0.2); g.add(tl); }
  else if (k.tail === 'thin') { const tl = rbox(0.04, 0.04, 0.16, col, 0.02); tl.position.set(0, 0.26, -0.2); tl.rotation.x = -0.5; g.add(tl); }
  else if (k.tail === 'curl') { const tl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 6, 10), mat); tl.position.set(0, 0.22, -0.21); g.add(tl); }
  const mkLeg = (x, z) => { const l = rbox(0.05, 0.12, 0.05, col, 0.02); l.position.set(x, 0.06, z); g.add(l); return l; };
  let legL, legR;
  if (k.biped) { legL = mkLeg(-0.06, 0.04); legR = mkLeg(0.06, 0.04); }
  else { legL = mkLeg(-0.1, 0.11); legR = mkLeg(0.1, 0.11); mkLeg(-0.1, -0.1); mkLeg(0.1, -0.1); }
  const wrench = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 12),
    new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1.0 }));
  wrench.position.set(0.14, 0.34, 0.15); wrench.visible = false; g.add(wrench);
  g.userData = { legL, legR, wrench };
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
let workers = [], workerGen = null, workersOn = true;
for (let k = 0; k < 7; k++) {
  const mesh = buildAnimal(k);
  mesh.visible = false; scene.add(mesh);
  workers.push({ mesh, x: 0, z: 0, y: 0, tx: 0, tz: 0, spd: 0.45 + Math.random() * 0.5, phase: Math.random() * 6.28, pause: 0 });
}
/* pick a random ground point + scale for the current view: on a chip board they
   wander the grid; in the hall they mill about on the islands */
function workerSpot() {
  if (islandEdit || !S.level.islands) {
    const parts = S.ents;
    if (parts.length && Math.random() < 0.72) {   // head over to tend a placed component
      const e = parts[(Math.random() * parts.length) | 0], sz = esize(e.type);
      return { x: tX(e.i) + (sz[0] - 1) / 2 + (Math.random() - 0.5) * 0.55, z: tZ(e.j) + (sz[1] - 1) / 2 + (Math.random() - 0.5) * 0.55, y: 0.01, s: 0.5, fix: true };
    }
    const w = GRID_W / 2 - 0.6, h = GRID_H / 2 - 0.6;
    return { x: (Math.random() * 2 - 1) * w, z: (Math.random() * 2 - 1) * h, y: 0.01, s: 0.5, fix: false };
  }
  const isl = S.ents.filter(e => e.type === 'srv' || e.type === 'core');
  const e = isl.length ? isl[Math.floor(Math.random() * isl.length)] : { i: 8, j: 4 };
  const rad = e.type === 'core' ? 1.2 : 0.8;
  return { x: tX(e.i) + (Math.random() * 2 - 1) * rad, z: tZ(e.j) + (Math.random() * 2 - 1) * rad, y: 0.02, s: 0.9 };
}
function placeWorkers() {
  workerGen = workerSpot;
  const chip = islandEdit || !S.level.islands;
  const islandCount = S.ents.filter(e => e.type === 'srv' || e.type === 'core').length;
  const showN = chip ? 6 : Math.max(2, Math.min(7, islandCount * 2));
  workers.forEach((wk, i) => {
    const show = workersOn && !fpMode && i < showN;
    wk.mesh.visible = show;
    if (!show) return;
    const p = workerSpot(); wk.x = p.x; wk.z = p.z; wk.y = p.y;
    const t = workerSpot(); wk.tx = t.x; wk.tz = t.z; wk.pause = Math.random() * 1.5; wk.targetFix = t.fix; wk.fixing = false;
    wk.mesh.position.set(wk.x, wk.y, wk.z);
    wk.mesh.scale.setScalar(p.s);
  });
}
function updateWorkers(dt, t) {
  workers.forEach(wk => {
    if (!wk.mesh.visible) return;
    const wr = wk.mesh.userData.wrench;
    if (wk.pause > 0) {
      wk.pause -= dt;
      if (wk.fixing) {   // busy on a component: whip out the wrench, tap-tap
        if (wr) { wr.visible = true; wr.rotation.z += dt * 11; }
        wk.mesh.position.y = wk.y + Math.abs(Math.sin(t * 8 + wk.phase)) * 0.02;
      } else {
        if (wr) wr.visible = false;
        wk.mesh.position.y = wk.y + Math.abs(Math.sin(t * 3 + wk.phase)) * 0.008;
      }
      return;
    }
    if (wr) wr.visible = false;
    const dx = wk.tx - wk.x, dz = wk.tz - wk.z, d = Math.hypot(dx, dz);
    if (d < 0.12) {
      wk.fixing = !!wk.targetFix;   // arrived at a component → get to work
      wk.pause = wk.fixing ? (1.6 + Math.random() * 2.4) : (0.5 + Math.random() * 1.4);
      const nt = workerSpot(); wk.tx = nt.x; wk.tz = nt.z; wk.targetFix = nt.fix;
      return;
    }
    const step = Math.min(d, wk.spd * dt);
    wk.x += dx / d * step; wk.z += dz / d * step;
    wk.mesh.position.set(wk.x, wk.y + Math.abs(Math.sin(t * 9 + wk.phase)) * 0.01, wk.z);
    wk.mesh.rotation.y = Math.atan2(dx, dz);
    const sw = Math.sin(t * 9 + wk.phase) * 0.5;
    wk.mesh.userData.legL.rotation.x = sw; wk.mesh.userData.legR.rotation.x = -sw;
  });
}

/* ---- space mode: starfield, bright stars, galaxies + shooting stars ---- */
const starGeo = new THREE.BufferGeometry();
const starPos = [], starCol = [];
const STAR_TINTS = [[1, 1, 1], [0.78, 0.85, 1], [1, 0.9, 0.78], [0.85, 0.9, 1], [1, 0.96, 0.88]];
for (let i = 0; i < 2600; i++) {
  const r = 55 + Math.random() * 42;
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);  // full sphere (below too)
  starPos.push(Math.cos(th) * s * r, u * r, Math.sin(th) * s * r);
  const tint = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0]; starCol.push(tint[0], tint[1], tint[2]);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
const starMat = new THREE.PointsMaterial({ size: 0.4, sizeAttenuation: true, transparent: true, opacity: 0.85, vertexColors: true });
const starfield = new THREE.Points(starGeo, starMat);
starfield.visible = false; scene.add(starfield);

/* a sparser layer of bright, additive "close" stars that twinkle */
const brightGeo = new THREE.BufferGeometry(); const bp = [];
for (let i = 0; i < 170; i++) { const r = 50 + Math.random() * 40, u = Math.random() * 2 - 1, th = Math.random() * 6.28, s = Math.sqrt(1 - u * u); bp.push(Math.cos(th) * s * r, u * r, Math.sin(th) * s * r); }
brightGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
const brightMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const brightStars = new THREE.Points(brightGeo, brightMat);
brightStars.visible = false; scene.add(brightStars);

/* galaxies / nebulae — soft glowing coloured sprites drifting far out in the sky */
const galaxyTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 3, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.34)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.11)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 280; k++) { const a = Math.random() * 6.28, rr = Math.pow(Math.random(), 0.6) * 118; g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.6) + ')'; g.fillRect(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr, 1.4, 1.4); }
  return new THREE.CanvasTexture(c);
})();
const GAL_COLORS = [0x9a6bff, 0x4f86ff, 0xff6bbf, 0x36d6cf, 0xffb05a, 0x7d8bff];
const galaxies = [];
for (let k = 0; k < 6; k++) {
  const mat = new THREE.SpriteMaterial({ map: galaxyTex, color: GAL_COLORS[k % GAL_COLORS.length], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat);
  const th = (k / 6) * 6.28 + Math.random(), R = 60 + Math.random() * 20, y = -34 + Math.random() * 78;   // above and below
  s.position.set(Math.cos(th) * R, y, Math.sin(th) * R);
  const sc = 20 + Math.random() * 24; s.scale.set(sc, sc, 1);
  s.material.rotation = Math.random() * 6.28;
  s.userData = { spin: (Math.random() - 0.5) * 0.05, tw: Math.random() * 6.28 };
  s.visible = false; scene.add(s); galaxies.push(s);
}

const shooters = [];
for (let i = 0; i < 10; i++) {
  const geo = new THREE.CylinderGeometry(0.07, 0.0, 4.4, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xeaf1ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false; scene.add(m);
  shooters.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
}
let spaceMode = false, shootTimer = 0.6;
function setSpaceMode(on) {
  spaceMode = on;
  scene.background = new THREE.Color(on ? 0x070912 : 0xbfe4f5);
  scene.fog.color.set(on ? 0x0a0d1c : 0xcfeaf7);
  scene.fog.near = on ? 34 : 30; scene.fog.far = on ? 90 : 70;
  starfield.visible = on;
  brightStars.visible = on;
  galaxies.forEach(g => g.visible = on);
  sun.intensity = on ? 0.55 : 1.6;
  sun.color.set(on ? 0xaFC0FF : 0xfff2d8);
  hemi.intensity = on ? 0.5 : 1.0;
  hemi.color.set(on ? 0x8595c8 : 0xffffff);
  hemi.groundColor.set(on ? 0x1b2340 : 0xa8d8a0);
  if (typeof ocean !== 'undefined') { ocean.visible = !on; ocean.material.color.set(0x8fd9ec); }  // no blue sea in space
  clouds.forEach(c => c.visible = !on);
  if (typeof dayProps !== 'undefined') dayProps.forEach(p => p.visible = !on);
}
function updateSpace(dt, t) {
  if (!spaceMode) { shooters.forEach(s => { if (s.mesh.visible) s.mesh.visible = false; }); return; }
  starMat.opacity = 0.7 + Math.sin(t * 1.6) * 0.15;
  brightMat.opacity = 0.65 + Math.abs(Math.sin(t * 2.3)) * 0.3;   // twinkle
  galaxies.forEach(g => { g.material.rotation += g.userData.spin * dt; g.material.opacity = 0.4 + Math.sin(t * 0.5 + g.userData.tw) * 0.13; });
  shootTimer -= dt;
  if (shootTimer <= 0) {
    const s = shooters.find(x => !x.mesh.visible);
    if (s) {
      s.mesh.position.set(-28 + Math.random() * 12, 20 + Math.random() * 10, -22 + Math.random() * 34);
      s.vel.set(22 + Math.random() * 12, -(6 + Math.random() * 5), (Math.random() - 0.5) * 8);
      s.life = 1.0; s.mesh.visible = true;
      s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.vel.clone().normalize());
    }
    shootTimer = 0.5 + Math.random() * 1.6;
  }
  shooters.forEach(s => {
    if (!s.mesh.visible) return;
    s.mesh.position.addScaledVector(s.vel, dt);
    s.life -= dt * 0.7;
    s.mesh.material.opacity = Math.max(0, Math.min(1, s.life)) * 0.95;
    if (s.life <= 0) s.mesh.visible = false;
  });
}

/* ---- survival: engineer boats that repair downed links ---- */
let engineers = [];
function buildBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 1.05, 1, 1, 1), toon(0x8a5a33)); hull.position.y = 0.1; hull.castShadow = true;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.66), toon(0xb5895a)); deck.position.y = 0.25;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.26, 0.3, 2, 0.05), toon(0xeae2d2)); cabin.position.set(0, 0.4, -0.16);
  /* an animal crew member mans the boat */
  const critter = buildAnimal((Math.random() * ANIMAL_KINDS.length) | 0);
  critter.scale.setScalar(0.62); critter.position.set(0, 0.28, 0.16);
  const wrench = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 14),
    new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1.2 }));
  wrench.position.set(0, 0.78, 0.16); wrench.visible = false;
  g.add(hull, deck, cabin, critter, wrench);
  g.userData.wrench = wrench;
  return g;
}
const BOAT_Y = -1.32;
function cableMid(c) {
  const A = S.ents.find(e => e.id === c.a), B = S.ents.find(e => e.id === c.b);
  const p = entCenter(A).lerp(entCenter(B), 0.5); p.y = BOAT_Y; return p;
}
function faceBoat(m, target) {
  const dx = target.x - m.position.x, dz = target.z - m.position.z;
  if (dx * dx + dz * dz > 0.01) m.rotation.y = Math.atan2(dx, dz);
}
const MAX_ENGINEERS = 6;
function coreCenter() { const c = S.ents.find(e => e.type === 'core'); return c ? entCenter(c) : new THREE.Vector3(0, 0, 0); }
function engineerHome(k, n, c) {
  const spread = Math.min(1.9, 0.5 * n);
  const ang = n > 1 ? -spread / 2 + (spread * k) / (n - 1) : 0;
  return new THREE.Vector3(c.x + Math.sin(ang) * 2.9, BOAT_Y, c.z + 2.7 + Math.cos(ang) * 0.35);
}
function repositionDocks() {
  const c = coreCenter();
  engineers.forEach((en, k) => { en.home = engineerHome(k, engineers.length, c); });
}
function addEngineer() {
  if (engineers.length >= MAX_ENGINEERS) return say('That’s a full crew (' + MAX_ENGINEERS + ').');
  const m = buildBoat(); scene.add(m);
  const en = { mesh: m, state: 'idle', cable: null, timer: 0, home: new THREE.Vector3() };
  engineers.push(en);
  repositionDocks();
  m.position.copy(en.home);
  updateHUD();
}
function removeEngineer() {
  if (engineers.length <= 1) return say('You need at least one engineer.');
  let idx = engineers.findIndex(e => e.state === 'idle');
  if (idx < 0) idx = engineers.length - 1;
  const en = engineers.splice(idx, 1)[0];
  scene.remove(en.mesh);
  repositionDocks();
  updateHUD();
}
function setupSurvival() {
  engineers.forEach(en => scene.remove(en.mesh));
  engineers = [];
  if (!S.level.survival) return;
  for (let k = 0; k < 3; k++) addEngineer();
}
function dispatchEngineer(cable) {   /* manual override: jump an idle engineer to a specific link */
  if (!S.level.survival || !cable.down) return;
  if (engineers.some(en => en.cable === cable)) return;
  const en = engineers.find(e => e.state === 'idle');
  if (en) { en.cable = cable; en.state = 'going'; say('Engineer sent ⛴'); }
}
function autoAssign() {
  const unassigned = S.cables.filter(c => c.down && !engineers.some(e => e.cable === c));
  if (!unassigned.length) return;
  const impact = c => S.ents.filter(e => e.type === 'srv' && !e.online && (c.a === e.id || c.b === e.id)).length;
  unassigned.sort((a, b) => impact(b) - impact(a));
  for (const c of unassigned) {
    const en = engineers.find(e => e.state === 'idle');
    if (!en) break;
    en.cable = c; en.state = 'going';
  }
}
function idleEngineers() { return engineers.filter(e => e.state === 'idle').length; }
function updateSurvival(dt, t) {
  const sv = S.survival; if (!sv) return;
  sv.time += dt;
  const total = S.ents.filter(e => e.type === 'srv').length || 1;
  sv.upNum += (S.stats.online / total) * dt; sv.upDen += dt;
  /* failures — optics fail more than copper; cadence tightens over time */
  sv.sinceFail -= dt;
  if (sv.sinceFail <= 0) {
    const ups = S.cables.filter(c => !c.down && c.ok);
    if (ups.length) {
      const w = c => (c.type === 'aocb' ? 1.7 : c.type === 'aecb' ? 1.0 : 0.6);
      let tot = ups.reduce((a, c) => a + w(c), 0), r = Math.random() * tot, pick = ups[ups.length - 1];
      for (const c of ups) { r -= w(c); if (r <= 0) { pick = c; break; } }
      pick.down = true; recompute();
      say('⚠ A link just went down!');
    }
    sv.sinceFail = Math.max(2.4, 7.5 - sv.time * 0.09) * failGapMul();
  }
  autoAssign();   /* idle engineers automatically head to downed links, worst first */
  engineers.forEach(en => {
    const m = en.mesh, wr = m.userData.wrench;
    m.position.y = BOAT_Y + Math.sin(t * 2 + m.id) * 0.03;
    if (en.cable && !S.cables.includes(en.cable)) { en.cable = null; en.state = 'returning'; }
    if (en.state === 'idle') { wr.visible = false; m.rotation.y += dt * 0.15; }
    else if (en.state === 'going') {
      const tp = cableMid(en.cable); faceBoat(m, tp);
      m.position.lerp(tp, Math.min(1, dt * (1.7 + boatBoost())));
      if (m.position.distanceTo(tp) < 0.45) { en.state = 'fixing'; en.timer = 3 * repairMul(); }
    } else if (en.state === 'fixing') {
      wr.visible = true; wr.rotation.z += dt * 9;
      en.timer -= dt;
      if (en.timer <= 0) { en.cable.down = false; recompute(); say('✓ Link repaired!'); en.state = 'returning'; en.cable = null; }
    } else if (en.state === 'returning') {
      wr.visible = false; faceBoat(m, en.home);
      m.position.lerp(en.home, Math.min(1, dt * 2));
      if (m.position.distanceTo(en.home) < 0.3) en.state = 'idle';
    }
  });
  updateHUD();
}

/* ---- piece factories ---- */
function rbox(w, h, d, color, r) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r || Math.min(w, h, d) * 0.25), toon(color));
  m.castShadow = true;
  return m;
}
function buildPiece(type) {
  const g = new THREE.Group();
  if (type === 'cpu') {
    const base = rbox(0.82, 0.2, 0.82, 0x3b6ccf); base.position.y = 0.1;
    const skirt = rbox(0.88, 0.07, 0.88, 0xd9a326, 0.03); skirt.position.y = 0.035;
    const lid = rbox(0.5, 0.12, 0.5, 0xd7dde8); lid.position.y = 0.25;
    g.add(skirt, base, lid);
  } else if (type === 'gpu') {
    const body = rbox(0.9, 0.34, 0.5, 0xf2efe6); body.position.y = 0.22;
    const plate = rbox(0.92, 0.1, 0.52, 0xf08a3c, 0.04); plate.position.y = 0.05;
    const conn = rbox(0.6, 0.05, 0.2, 0xd9a326, 0.02); conn.position.set(0, 0.01, 0);
    g.add(plate, body, conn);
    for (let f = 0; f < 2; f++) {
      const fan = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), toon(0x30343c));
      const blades = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.06), toon(0x9aa2ae));
        bl.rotation.y = b * Math.PI / 3;
        blades.add(bl);
      }
      blades.position.y = 0.035;
      fan.add(ring, blades);
      fan.position.set(f === 0 ? -0.2 : 0.2, 0.41, 0);
      fan.userData.blades = blades;
      g.add(fan);
      (g.userData.fans = g.userData.fans || []).push(blades);
    }
  } else if (type === 'mem') {
    const stick = rbox(0.14, 0.62, 0.72, 0x3fa34d, 0.04); stick.position.y = 0.31;
    const edge = rbox(0.16, 0.06, 0.74, 0xd9a326, 0.02); edge.position.y = 0.03;
    g.add(edge, stick);
    for (let k = 0; k < 3; k++) {
      const chip = rbox(0.16, 0.14, 0.15, 0x22262e, 0.03);
      chip.position.set(0, 0.32, -0.22 + k * 0.22);
      g.add(chip);
    }
  } else if (type === 'pswitch') {
    const body = rbox(0.88, 0.3, 0.62, 0x2fa08a); body.position.y = 0.15;
    g.add(body);
    for (let p = 0; p < 4; p++) {
      const port = rbox(0.12, 0.1, 0.06, 0x14322c, 0.02);
      port.position.set(-0.3 + p * 0.2, 0.12, 0.33);
      g.add(port);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1 }));
    led.position.set(0.34, 0.33, 0.2);
    g.add(led);
  } else if (type === 'memctl') {
    const body = rbox(0.82, 0.3, 0.58, 0x9a6cf0); body.position.y = 0.15;
    g.add(body);
    for (let k = 0; k < 3; k++) {
      const slot = rbox(0.1, 0.16, 0.44, 0x2a2440, 0.02);
      slot.position.set(-0.22 + k * 0.22, 0.36, 0);
      g.add(slot);
    }
  } else if (type === 'nic') {
    const body = rbox(0.62, 0.22, 0.42, 0xf08a3c); body.position.y = 0.13;
    const port = rbox(0.2, 0.12, 0.08, 0x22262e, 0.02); port.position.set(0, 0.14, 0.24);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshToonMaterial({ color: 0xfff2b8, gradientMap: gradTex, emissive: 0xd9a326, emissiveIntensity: 1 }));
    light.position.set(0.2, 0.27, 0.16);
    g.add(body, port, light);
  } else if (type === 'uplink') {
    const cab = rbox(0.7, 1.15, 0.6, 0x5a6478); cab.position.y = 0.575;
    g.add(cab);
    for (let k = 0; k < 4; k++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.04),
        new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 0.8 }));
      slot.position.set(0, 0.3 + k * 0.22, 0.31);
      g.add(slot);
    }
    /* AC-style wooden sign */
    const sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 8), toon(0x8a5a33));
    post.position.y = 0.35;
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 96;
    const bg = bc.getContext('2d');
    bg.fillStyle = '#c78d4f'; bg.fillRect(0, 0, 256, 96);
    bg.strokeStyle = '#8a5a33'; bg.lineWidth = 10; bg.strokeRect(5, 5, 246, 86);
    bg.fillStyle = '#5a3a1c'; bg.font = 'bold 40px system-ui'; bg.textAlign = 'center';
    bg.fillText('TO RACK →', 128, 62);
    const boardTex = new THREE.CanvasTexture(bc);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.36, 0.08, 3, 0.04),
      [toon(0xc78d4f), toon(0xc78d4f), toon(0xc78d4f), toon(0xc78d4f), toon(0xffffff, { map: boardTex }), toon(0xc78d4f)]);
    board.position.y = 0.72;
    board.castShadow = true;
    sign.add(post, board);
    sign.position.set(-0.75, 0, 0.35);
    sign.rotation.y = 0.35;
    g.add(sign);
  } else if (type === 'srv') {
    /* a boxed-up server: little rack tower with slots + a status beacon */
    const tower = rbox(0.6, 1.0, 0.75, 0x3a4152); tower.position.y = 0.5;
    g.add(tower);
    for (let k = 0; k < 5; k++) {
      const shelf = rbox(0.5, 0.1, 0.6, 0x222833, 0.02);
      shelf.position.set(0, 0.22 + k * 0.17, 0.09);
      g.add(shelf);
      const chip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6),
        new THREE.MeshToonMaterial({ color: 0x9fd0ff, gradientMap: gradTex, emissive: 0x3a70b0, emissiveIntensity: 0.8 }));
      chip.position.set(0.18, 0.22 + k * 0.17, 0.4);
      g.add(chip);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1.4 }));
    beacon.position.y = 1.12;
    g.userData.beacon = beacon;
    g.add(beacon);
  } else if (type === 'core') {
    /* the rack switch island: wide switch with many ports + antenna */
    const body = rbox(1.3, 0.5, 0.95, 0x2f6f8f); body.position.y = 0.28;
    g.add(body);
    const lid = rbox(1.0, 0.12, 0.7, 0x3f92b8, 0.04); lid.position.y = 0.58;
    g.add(lid);
    for (let k = 0; k < 8; k++) {
      const port = rbox(0.11, 0.1, 0.06, 0x14303c, 0.02);
      port.position.set(-0.5 + k * 0.14, 0.24, 0.5);
      g.add(port);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 6), toon(0xcfd8e0));
    mast.position.y = 0.95; g.add(mast);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshToonMaterial({ color: 0xffe08a, gradientMap: gradTex, emissive: 0xd9a326, emissiveIntensity: 1.2 }));
    ball.position.y = 1.35; g.userData.beacon = ball;
    g.add(ball);
  }
  return g;
}
function buildRetimerMesh() {
  const g = new THREE.Group();
  const body = rbox(0.42, 0.12, 0.3, 0x1c1f26, 0.04); body.position.y = 0.06;
  const e1 = rbox(0.06, 0.1, 0.3, 0xd9a326, 0.02); e1.position.set(-0.21, 0.06, 0);
  const e2 = rbox(0.06, 0.1, 0.3, 0xd9a326, 0.02); e2.position.set(0.21, 0.06, 0);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1.4 }));
  dot.position.y = 0.15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 24),
    new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x2fbf6a, emissiveIntensity: 1, transparent: true, opacity: 0.7 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  g.userData.ring = ring;
  g.add(body, e1, e2, dot, ring);
  return g;
}

/* ---- scene sync ---- */
const entMeshes = new Map();
const retMeshes = new Map();
let cableGroup = new THREE.Group();
scene.add(cableGroup);
const cableCurves = new Map();

function syncScene() {
  /* entities */
  const liveIds = new Set(S.ents.map(e => e.id));
  [...entMeshes.keys()].forEach(id => {
    if (!liveIds.has(id)) { scene.remove(entMeshes.get(id)); entMeshes.delete(id); }
  });
  S.ents.forEach(e => {
    let m = entMeshes.get(e.id);
    const sz = esize(e.type);
    const big = sz[0] > 1 || sz[1] > 1;
    if (!m) {
      m = buildPiece(e.type);
      m.userData.ent = e;
      m.traverse(o => { o.userData.entId = e.id; });
      if (big) m.scale.set(...pieceScale(e.type));
      scene.add(m);
      m.position.copy(entCenter(e));
      entMeshes.set(e.id, m);
    }
    m.userData.target = entCenter(e);
  });
  /* retimers — keyed by id, positioned on their cable's arc by positionRetimers */
  const liveR = new Set(S.retimers.map(r => r.id));
  [...retMeshes.keys()].forEach(k => {
    if (!liveR.has(k)) { scene.remove(retMeshes.get(k)); retMeshes.delete(k); }
  });
  S.retimers.forEach(r => {
    if (!retMeshes.has(r.id)) {
      const m = buildRetimerMesh();
      m.userData.ret = r;
      m.traverse(o => { o.userData.retId = r.id; });
      scene.add(m);
      retMeshes.set(r.id, m);
    }
  });
  rebuildCables();
}
/* ---- wiring: each cable is a clean raised arc between its two devices — easy to
   see and to click. Retimers ride the arc at a parameter t (0..1) along it. ---- */
const wireStyle = 'routed';   // flat, grid-routed in non-overlapping lanes
try { localStorage.removeItem('dct3d_wire'); } catch (e) {}
/* --- flat grid router: wires run in the gutters between tiles, each in its own
   lane so they never overlap; L-shaped, raised just enough to read clearly --- */
const ROUTE_Y = 0.13;
let cableRoutes = new Map();
function nodeX(gi) { return gi - GRID_W / 2; }
function nodeZ(gj) { return gj - GRID_H / 2; }
function laneShift(k) { return k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.28; }
function attachPt(cx, cz, tx, tz, idx, n) {
  if (n <= 1) return [cx, cz];
  let dx = tx - cx, dz = tz - cz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const off = (idx - (n - 1) / 2) * Math.min(0.28, 1.0 / n);
  return [cx + (-dz) * off, cz + dx * off];
}
function devCorners(e) { const s = esize(e.type); return [[e.i, e.j], [e.i + s[0], e.j], [e.i, e.j + s[1]], [e.i + s[0], e.j + s[1]]]; }
function pickNode(dev, other) {
  const oc = entCenter(other); let best = [dev.i, dev.j], bd = 1e9;
  devCorners(dev).forEach(([gi, gj]) => { const dx = nodeX(gi) - oc.x, dz = nodeZ(gj) - oc.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [gi, gj]; } });
  return { gi: best[0], gj: best[1] };
}
function routeCables() {
  cableRoutes = new Map();
  const horiz = {}, vert = {}, meta = {};
  S.cables.forEach(c => {
    const A = S.ents.find(e => e.id === c.a), B = S.ents.find(e => e.id === c.b);
    if (!A || !B) return;
    const na = pickNode(A, B), nb = pickNode(B, A);
    meta[c.id] = { A, B, na, nb };
    (horiz[na.gj] = horiz[na.gj] || []).push({ id: c.id, a: Math.min(na.gi, nb.gi), b: Math.max(na.gi, nb.gi) });
    (vert[nb.gi] = vert[nb.gi] || []).push({ id: c.id, a: Math.min(na.gj, nb.gj), b: Math.max(na.gj, nb.gj) });
  });
  const laneH = {}, laneV = {};
  const alloc = (groups, out) => {
    Object.keys(groups).forEach(key => {
      const lanes = [];
      groups[key].forEach(it => {
        let k = 0;
        for (; ; k++) { const occ = lanes[k] || (lanes[k] = []); if (!occ.some(r => it.a <= r[1] && it.b >= r[0])) { occ.push([it.a, it.b]); break; } }
        out[it.id] = k;
      });
    });
  };
  alloc(horiz, laneH); alloc(vert, laneV);
  const devCables = {};
  S.cables.forEach(c => { const m = meta[c.id]; if (!m) return;
    (devCables[m.A.id] = devCables[m.A.id] || []).push(c.id);
    (devCables[m.B.id] = devCables[m.B.id] || []).push(c.id); });
  S.cables.forEach(c => {
    const m = meta[c.id]; if (!m) return;
    const offH = laneShift(laneH[c.id] || 0), offV = laneShift(laneV[c.id] || 0);
    const zLine = nodeZ(m.na.gj) + offH, xLine = nodeX(m.nb.gi) + offV;
    const A = entCenter(m.A), B = entCenter(m.B);
    const aL = devCables[m.A.id], bL = devCables[m.B.id];
    const pa = attachPt(A.x, A.z, nodeX(m.na.gi), nodeZ(m.na.gj), aL.indexOf(c.id), aL.length);
    const pb = attachPt(B.x, B.z, nodeX(m.nb.gi), nodeZ(m.nb.gj), bL.indexOf(c.id), bL.length);
    const raw = [
      new THREE.Vector3(pa[0], ROUTE_Y, pa[1]),
      new THREE.Vector3(nodeX(m.na.gi), ROUTE_Y, zLine),
      new THREE.Vector3(xLine, ROUTE_Y, zLine),
      new THREE.Vector3(xLine, ROUTE_Y, nodeZ(m.nb.gj)),
      new THREE.Vector3(pb[0], ROUTE_Y, pb[1])
    ];
    const pts = raw.filter((p, k) => k === 0 || p.distanceToSquared(raw[k - 1]) > 0.0004);
    if (pts.length < 2) pts.push(new THREE.Vector3(B.x + 0.01, ROUTE_Y, B.z));
    cableRoutes.set(c.id, pts);
  });
}
function cableCurveFor(c) {
  const pts = cableRoutes.get(c.id);
  if (!pts) return new THREE.CatmullRomCurve3([new THREE.Vector3(0, ROUTE_Y, 0), new THREE.Vector3(0.1, ROUTE_Y, 0)]);
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
}
/* raycast the wires under the cursor → the cable + the point/param nearest the hit */
function pickWire(ev) {
  raycaster.setFromCamera(pointerNdc(ev), camera);
  const hits = raycaster.intersectObjects(cableGroup.children, true);
  for (const h of hits) {
    const cid = h.object.userData.cableId;
    if (cid === undefined) continue;
    const c = S.cables.find(x => x.id === cid); if (!c) continue;
    const curve = cableCurves.get(cid); if (!curve) continue;
    let bt = 0, bd = 1e9;
    for (let k = 1; k < 60; k++) { const t = k / 60; const p = curve.getPointAt(t); const d = p.distanceToSquared(h.point); if (d < bd) { bd = d; bt = t; } }
    const p = curve.getPointAt(bt), tan = curve.getTangentAt(bt);
    return { cable: c, t: bt, point: p, rot: Math.atan2(tan.x, tan.z), retimeable: !!CAB[c.type].retime };
  }
  return null;
}
function positionRetimers() {
  S.retimers.forEach(r => {
    const mesh = retMeshes.get(r.id); if (!mesh) return;
    const curve = cableCurves.get(r.cableId);
    if (!curve) { mesh.visible = false; return; }
    mesh.visible = true;
    const p = curve.getPointAt(r.t), tan = curve.getTangentAt(r.t);
    mesh.position.set(p.x, p.y + (wireStyle === 'routed' ? 0.06 : 0), p.z);   // pop up a touch on flat wires
    mesh.rotation.y = Math.atan2(tan.x, tan.z);
  });
}
function rebuildCables() {
  scene.remove(cableGroup);
  cableGroup = new THREE.Group();
  cableCurves.clear();
  if (wireStyle === 'routed') routeCables();
  S.cables.forEach(c => {
    if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) return;
    const curve = cableCurveFor(c);
    cableCurves.set(c.id, curve);
    const n = c.path.length - 1;
    const segs = Math.max(14, n * 8);
    if (c.ok && !c.down) {
      /* in the data hall, colour by utilisation (congestion) instead of cable type */
      let mat, radius = wireStyle === 'routed' ? 0.075 : 0.085;
      if (c.util !== undefined) {
        const hex = c.util > 1.0 ? 0xe05555 : c.util > 0.7 ? 0xf5c542 : 0x43d15f;
        mat = new THREE.MeshToonMaterial({ color: hex, gradientMap: gradTex, emissive: hex, emissiveIntensity: c.util > 1.0 ? 0.55 : 0.12 });
        radius = 0.06 + Math.min(0.05, c.util * 0.035);
        mat.userData = { hot: c.util > 1.0 };
      } else {
        const col = CAB[c.type].color;
        mat = new THREE.MeshToonMaterial({ color: col, gradientMap: gradTex, emissive: col, emissiveIntensity: 0.35 });
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 8, false), mat);
      tube.castShadow = true;
      tube.userData.cableId = c.id;
      tube.userData.hot = c.util !== undefined && c.util > 1.0;
      cableGroup.add(tube);
    } else {
      const fSplit = c.down ? 0.001 : Math.max(0.02, Math.min(0.98, c.failAt / n));
      const livePts = [], deadPts = [];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        (t <= fSplit ? livePts : deadPts).push(curve.getPointAt(t));
      }
      deadPts.unshift(curve.getPointAt(fSplit));
      if (livePts.length > 1) {
        const t1 = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(livePts), 24, 0.055, 8, false),
          toon(CAB[c.type].color));
        t1.userData.cableId = c.id;
        cableGroup.add(t1);
      }
      const deadMat = new THREE.MeshToonMaterial({ color: 0xe05555, gradientMap: gradTex, emissive: 0xa02020, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });
      const t2 = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(deadPts), 24, 0.05, 8, false), deadMat);
      t2.userData.cableId = c.id;
      t2.userData.dead = true;
      cableGroup.add(t2);
    }
    /* fat invisible hit-tube so thin wires are easy to click and to drop retimers near */
    const pick = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.16, 6, false),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.userData.cableId = c.id;
    pick.userData.pick = true;
    cableGroup.add(pick);
  });
  scene.add(cableGroup);
  positionRetimers();
}

/* pulses */
const pulsePool = [];
function getPulseMesh() {
  const m = pulsePool.find(p => !p.visible);
  if (m) return m;
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshToonMaterial({ color: 0x8dffb8, gradientMap: gradTex, emissive: 0x3fd66a, emissiveIntensity: 1.6 }));
  scene.add(s);
  pulsePool.push(s);
  return s;
}
function healthColor3(h) {
  const c = new THREE.Color();
  if (h >= 65) c.setHex(0x57e389);
  else if (h >= FAIL) c.setHex(0xf5c542);
  else c.setHex(0xe05555);
  return c;
}
function healthAtFrac(c, f) {
  const n = c.path.length - 1;
  const k = Math.min(n, f * n);
  const k0 = Math.floor(k), k1 = Math.min(n, k0 + 1);
  return c.health[k0] + (c.health[k1] - c.health[k0]) * (k - k0);
}
function updatePulses(dt, now) {
  pulsePool.forEach(p => p.visible = false);
  S.cables.forEach(c => {
    if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) { c.pulses = []; return; }
    const n = c.path.length - 1;
    if (n < 1) return;
    if (now > c.nextPulse) {
      c.pulses.push({ t: 0 });
      c.nextPulse = now + 700 + Math.random() * 500;
    }
    const speed = 2.6 / n;
    const failFrac = c.ok ? 2 : c.failAt / n;
    c.pulses.forEach(p => { p.t += dt * speed; });
    c.pulses = c.pulses.filter(p => p.t >= 0 && p.t <= Math.min(1, failFrac + 0.02));
    const curve = cableCurves.get(c.id);
    if (!curve) return;
    c.pulses.forEach(p => {
      const m = getPulseMesh();
      m.visible = true;
      const pos = curve.getPointAt(Math.min(1, p.t));
      m.position.copy(pos);
      m.position.y += 0.05;
      const h = healthAtFrac(c, p.t);
      const col = healthColor3(h);
      m.material.color.copy(col);
      m.material.emissive.copy(col).multiplyScalar(0.7);
      const sc = 0.7 + (h / 100) * 0.5;
      m.scale.setScalar(sc);
    });
  });
}

/* selection / hover rings, ghost */
const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 32),
  new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, emissive: 0xafc8ff, emissiveIntensity: 0.8 }));
selRing.rotation.x = Math.PI / 2;
selRing.position.y = 0.05;
selRing.visible = false;
scene.add(selRing);
const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
hoverRing.rotation.x = -Math.PI / 2;
hoverRing.position.y = 0.02;
hoverRing.visible = false;
scene.add(hoverRing);

let ghost = null, ghostType = null;
function setGhost(type) {
  if (ghost) { scene.remove(ghost); ghost = null; }
  ghostType = type;
  if (!type) return;
  ghost = type === 'retimer' ? buildRetimerMesh() : buildPiece(type);
  ghost.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone ? o.material.clone() : o.material;
      if (o.material) { o.material.transparent = true; o.material.opacity = 0.55; }
      o.castShadow = false;
    }
  });
  ghost.visible = false;
  scene.add(ghost);
}

/* elastic drag lines */
const elasticGroup = new THREE.Group();
scene.add(elasticGroup);
/* drag-to-connect: a live rubber-band wire from the grabbed device to the cursor,
   coloured by the signal it would have, with a marker where it would die */
let cableDrag = null, retimerHover = null;
const cableDragGroup = new THREE.Group();
scene.add(cableDragGroup);
function updateCablePreview(ev) {
  cableDragGroup.clear();
  if (!cableDrag || !CAB[S.tool]) return;
  const fm = entMeshes.get(cableDrag.from.id); if (!fm) return;
  const tile = tileFromPointer(ev);
  const target = tile && entCovering(tile.i, tile.j);
  const endTile = target ? { i: target.i, j: target.j } : (tile || { i: cableDrag.from.i, j: cableDrag.from.j });
  const spec = CAB[S.tool];
  let h = 100, deadAt = -1;
  const path = lPath(cableDrag.from, endTile);
  for (let k = 1; k < path.length; k++) {
    h -= spec.loss * lossMul();
    if (h < FAIL) { deadAt = k; break; }
  }
  const reaches = deadAt < 0;
  const col = !reaches ? 0xe05555 : (h >= 65 ? 0x57e389 : 0xf5c542);
  const a = fm.position.clone().setY(0.4);
  const b = target ? entMeshes.get(target.id).position.clone().setY(0.4)
    : new THREE.Vector3(tX(endTile.i), 0.25, tZ(endTile.j));
  const mid = a.clone().lerp(b, 0.5); mid.y += 0.55 + a.distanceTo(b) * 0.05;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  cableDragGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.055, 8, false),
    new THREE.MeshToonMaterial({ color: col, gradientMap: gradTex, emissive: col, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 })));
  if (!reaches) {   // red marker where the signal dies
    const p = curve.getPointAt(Math.max(0.05, Math.min(0.92, deadAt / Math.max(1, path.length - 1))));
    const x = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshBasicMaterial({ color: 0xe05555 }));
    x.position.copy(p); cableDragGroup.add(x);
  }
  const endM = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 20),
    new THREE.MeshBasicMaterial({ color: target && target.id !== cableDrag.from.id ? 0x57e389 : 0xffffff, transparent: true, opacity: 0.8 }));
  endM.rotation.x = Math.PI / 2; endM.position.set(b.x, 0.03, b.z); cableDragGroup.add(endM);
}
function updateElastics() {
  elasticGroup.clear();
  if (!(drag && drag.lift)) return;
  const dm = entMeshes.get(drag.ent.id);
  if (!dm) return;
  S.cables.forEach(c => {
    if (c.a !== drag.ent.id && c.b !== drag.ent.id) return;
    const otherEnt = S.ents.find(e => e.id === (c.a === drag.ent.id ? c.b : c.a));
    if (!otherEnt) return;
    const om = entMeshes.get(otherEnt.id);
    if (!om) return;
    const tile = hoverTile || { i: otherEnt.i, j: otherEnt.j };
    let h = 100;
    const spec = CAB[c.type];
    const path = lPath(otherEnt, tile);
    for (let k = 1; k < path.length; k++) {
      h -= spec.loss * lossMul();
      if (h < FAIL) { h = 0; break; }
    }
    const col = h <= 0 ? 0xe05555 : (h >= 65 ? 0x57e389 : 0xf5c542);
    const a = om.position.clone().setY(0.3);
    const b = dm.position.clone().setY(Math.max(0.3, dm.position.y * 0.6));
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + 0.5;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.04, 6, false),
      new THREE.MeshToonMaterial({ color: col, gradientMap: gradTex, transparent: true, opacity: 0.8 }));
    elasticGroup.add(line);
  });
}

/* fireworks */
let FX = [];
function spawnFireworks() {
  const colors = [0x57e389, 0xf5c542, 0x4ad2e0, 0xf06ab8, 0xf08a3c, 0xb48ae8];
  for (let r = 0; r < 5; r++) {
    const ox = (Math.random() - 0.5) * 10, oz = (Math.random() - 0.5) * 5;
    const col = colors[r % colors.length];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, elev = Math.random() * Math.PI / 2;
      const spd = 3 + Math.random() * 3;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshToonMaterial({ color: col, gradientMap: gradTex, emissive: col, emissiveIntensity: 1.2, transparent: true }));
      m.position.set(ox, 2.5 + Math.random() * 2, oz);
      scene.add(m);
      FX.push({
        m, life: 1.2 + Math.random() * 0.6, max: 1.8, delay: r * 0.35,
        v: new THREE.Vector3(Math.cos(a) * Math.cos(elev) * spd, Math.sin(elev) * spd, Math.sin(a) * Math.cos(elev) * spd)
      });
    }
  }
}
function updateFx(dt) {
  FX.forEach(p => {
    if (p.delay > 0) { p.delay -= dt; p.m.visible = false; return; }
    p.m.visible = true;
    p.v.y -= 6 * dt;
    p.m.position.addScaledVector(p.v, dt);
    p.life -= dt;
    p.m.material.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) { scene.remove(p.m); p.dead = true; }
  });
  FX = FX.filter(p => !p.dead);
}

/* ---------------- picking & input ---------------- */
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
function pointerNdc(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  return ndc;
}
function tileFromPointer(ev) {
  raycaster.setFromCamera(pointerNdc(ev), camera);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, pt)) return null;
  const i = Math.floor(pt.x + GRID_W / 2), j = Math.floor(pt.z + GRID_H / 2);
  if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) return null;
  return { i, j, x: pt.x, z: pt.z };
}
function thingFromPointer(ev) {
  raycaster.setFromCamera(pointerNdc(ev), camera);
  const meshes = [];
  entMeshes.forEach(m => meshes.push(m));
  retMeshes.forEach(m => meshes.push(m));
  const hits = raycaster.intersectObjects([...meshes, cableGroup], true);
  for (const h of hits) {
    let o = h.object;
    while (o) {
      if (o.userData.entId !== undefined) {
        const e = S.ents.find(x => x.id === o.userData.entId);
        if (e) return { kind: 'ent', ent: e };
      }
      if (o.userData.retId !== undefined) {
        const r = S.retimers.find(x => x.id === o.userData.retId);
        if (r) return { kind: 'ret', ret: r };
      }
      if (o.userData.cableId !== undefined) {
        const c = S.cables.find(x => x.id === o.userData.cableId);
        if (c) return { kind: 'cable', cable: c };
      }
      o = o.parent;
    }
  }
  return null;
}

const dom = renderer.domElement;
dom.addEventListener('pointermove', ev => {
  const t = tileFromPointer(ev);
  hoverTile = t;
  if (cableDrag) {
    if (!cableDrag.moved && Math.hypot(ev.clientX - cableDrag.sx, ev.clientY - cableDrag.sy) > 5) cableDrag.moved = true;
    updateCablePreview(ev);
    dom.style.cursor = 'crosshair';
    return;
  }
  if (drag) {
    if (!drag.lift && t) {
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 6) { drag.lift = true; drag.moved = true; rebuildCables(); }
    }
    dom.style.cursor = 'grabbing';
    return;
  }
  retimerHover = (S.tool === 'retimer') ? pickWire(ev) : null;
  const th = t && entCovering(t.i, t.j);
  const grabbable = th && !th.locked && !CAB[S.tool] && S.tool !== 'delete';
  const overWire = (S.tool === 'retimer' && retimerHover && retimerHover.retimeable) || (S.tool === 'delete' && retimerHover);
  dom.style.cursor = overWire ? 'pointer' : (grabbable ? 'grab' : (S.tool === 'select' ? 'default' : 'crosshair'));
});
dom.addEventListener('pointerdown', ev => {
  if (ev.button !== 0 || fpMode) return;
  const tile = tileFromPointer(ev);
  const grabbed = tile && entCovering(tile.i, tile.j);
  if (grabbed && !grabbed.locked && !CAB[S.tool] && S.tool !== 'delete') {
    drag = { ent: grabbed, moved: false, lift: false, sx: ev.clientX, sy: ev.clientY };
    if (S.tool === 'select') { S.selected = { kind: 'ent', ent: grabbed }; showInspector(S.selected); }
    return;
  }
  if (CAT[S.tool]) { if (tile) tryPlaceEnt(S.tool, tile.i, tile.j); return; }
  if (S.tool === 'retimer') { const w = pickWire(ev); if (w && w.retimeable) tryPlaceRet(w.cable.id, w.t); else say('Hover over a copper wire, then click to add a retimer.'); return; }
  if (CAB[S.tool]) {
    const e = tile && entCovering(tile.i, tile.j);
    if (!e) { say(S.pendA ? 'Click a device to finish the cable — Esc to cancel.' : 'Click a device, or drag from one to another, to lay a cable.'); return; }
    /* start a drag-to-connect; a tap (no drag) falls back to click-click on pointerup */
    cableDrag = { from: e, sx: ev.clientX, sy: ev.clientY, moved: false };
    return;
  }
  if (S.tool === 'delete') {
    const th = thingFromPointer(ev);
    if (th) removeThing(th);
    return;
  }
  const th = thingFromPointer(ev);
  if (S.level.survival && th && th.kind === 'cable' && th.cable.down) { dispatchEngineer(th.cable); return; }
  S.selected = th;
  showInspector(th);
});
dom.addEventListener('pointerup', ev => {
  if (ev.button !== 0) return;
  if (cableDrag) {
    const cd = cableDrag; cableDrag = null; cableDragGroup.clear();
    const tile = tileFromPointer(ev);
    const target = tile && entCovering(tile.i, tile.j);
    if (cd.moved) {                                   // drag-to-connect
      if (target && target.id !== cd.from.id) tryCable(S.tool, cd.from, target);
      S.pendA = null;
    } else if (!S.pendA) {                            // tap = start a click-click cable
      S.pendA = cd.from; say('Now click — or drag to — another device to finish the cable.');
    } else {                                          // tap = finish a click-click cable
      tryCable(S.tool, S.pendA, cd.from); S.pendA = null;
    }
    return;
  }
  if (!drag) return;
  const d = drag; drag = null;
  const tile = tileFromPointer(ev);
  if (d.moved && tile) moveEnt(d.ent, tile.i, tile.j);
  else rebuildCables();
  elasticGroup.clear();
});
window.addEventListener('pointerup', ev => {
  if (ev.button !== 0) return;
  if (cableDrag) { cableDrag = null; cableDragGroup.clear(); }   // released off-canvas → cancel
  if (drag) { drag = null; rebuildCables(); elasticGroup.clear(); }
});

const NUDGE = {   // arrow keys nudge a selected part; WASD pans the camera instead
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0]
};
window.addEventListener('keydown', ev => {
  if (fpMode) return;   // WASD/arrows drive the first-person camera, not components
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (ev.key === 'Escape') { drag = null; cableDrag = null; cableDragGroup.clear(); S.pendA = null; setTool('select'); rebuildCables(); elasticGroup.clear(); }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.selected) removeThing(S.selected);
  const nudge = NUDGE[ev.key.toLowerCase()];
  if (nudge) {
    let target = (S.selected && S.selected.kind === 'ent') ? S.selected.ent
      : (hoverTile && entCovering(hoverTile.i, hoverTile.j));
    if (target) {
      ev.preventDefault();
      if (target.locked) { say('That one is fixed — it can’t be moved.'); return; }
      moveEnt(target, target.i + nudge[0], target.j + nudge[1]);
      S.selected = { kind: 'ent', ent: target };
      showInspector(S.selected);
      return;
    }
  }
  const order = ['select', ...S.level.tools, 'delete'];
  const n = parseInt(ev.key, 10);
  if (n >= 1 && n <= order.length) setTool(order[n - 1]);
});

/* ---------------- UI (same DOM as 2D) ---------------- */
const $ = id => document.getElementById(id);
const SPR_ICON = {
  gpu: ['assets/gpu.png'], cpu: ['assets/cpu.png'], mem: ['assets/memory.png'],
  pswitch: ['assets/switch.png'], memctl: ['assets/memoryExpander.png'], nic: ['assets/networking.png'],
  uplink: ['assets/props4.png', [1530, 1416, 59, 136]], retimer: ['assets/retimer.png'],
  srv: ['assets/props4.png', [1530, 1416, 59, 136]], core: ['assets/switch.png']
};
const ICON_IMGS = {};
Object.values(SPR_ICON).forEach(([src]) => {
  if (!ICON_IMGS[src]) { const im = new Image(); im.src = src; im.onload = () => { if (S) buildToolbar(); }; ICON_IMGS[src] = im; }
});
function toolIcon(key) {
  const c = document.createElement('canvas');
  c.width = 46; c.height = 46;
  const g = c.getContext('2d');
  const spec = SPR_ICON[key];
  if (spec) {
    const img = ICON_IMGS[spec[0]];
    if (img && img.complete && img.naturalWidth) {
      const [sx, sy, sw, sh] = spec[1] || [0, 0, img.naturalWidth, img.naturalHeight];
      const sc = Math.min(40 / sw, 40 / sh);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, sx, sy, sw, sh, 23 - sw * sc / 2, 23 - sh * sc / 2, sw * sc, sh * sc);
    } else { g.fillStyle = '#5a6acf'; g.fillRect(8, 8, 30, 30); }
  } else if (CAB[key]) {
    g.strokeStyle = '#0f1120'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
    g.strokeStyle = '#' + CAB[key].color.toString(16).padStart(6, '0'); g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(6, 33); g.quadraticCurveTo(17, 9, 38, 14); g.stroke();
  } else if (key === 'select') {
    g.fillStyle = '#c9cfe8'; g.strokeStyle = '#0f1120'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 8); g.lineTo(32, 24); g.lineTo(23, 25); g.lineTo(28, 36); g.lineTo(24, 38); g.lineTo(19, 27); g.lineTo(13, 33); g.closePath(); g.fill(); g.stroke();
  } else if (key === 'delete') {
    g.strokeStyle = '#e05555'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, 12); g.lineTo(34, 34); g.moveTo(34, 12); g.lineTo(12, 34); g.stroke();
  }
  return c;
}
function toolMeta(key) {
  if (CAT[key]) return { label: CAT[key].name, sub: `${CAT[key].ports} port${CAT[key].ports > 1 ? 's' : ''}` };
  if (CAB[key]) return { label: CAB[key].name, sub: `loses ${CAB[key].loss}%/tile · ${CAB[key].watts} W` };
  if (key === 'retimer') return { label: RET.name, sub: 'resets signal to 100%' };
  if (key === 'select') return { label: 'Move / inspect', sub: 'click or drag' };
  return { label: 'Remove', sub: 'click to delete' };
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
  setGhost(CAT[key] ? key : (key === 'retimer' ? 'retimer' : null));
  const spec = CAT[key] || CAB[key] || (key === 'retimer' ? RET : null);
  if (spec) showCatalog(spec);
  setFactTopic(spec ? key : null);
}
function showCatalog(spec) {
  $('infoBody').innerHTML =
    `<h3>${spec.name}</h3><p class="tagline">${spec.tag}</p><p>${spec.desc}</p>
     <p class="real"><b>Real world:</b> ${spec.real}</p>`;
}
function showInspector(th) {
  if (!th) { $('infoBody').innerHTML = 'Select a tool, or click any device or cable to learn what it does.'; setFactTopic(null); return; }
  setFactTopic(th.kind === 'ent' ? th.ent.type : th.kind === 'cable' ? th.cable.type : 'retimer');
  if (th.kind === 'ent') {
    const spec = CAT[th.ent.type];
    let status = '';
    if (spec.role === 'node') {
      status = th.ent.online
        ? `<p class="ok">Status: online — pushing ${spec.tput} Tb/s.</p>`
        : `<p class="bad">Status: offline — needs a healthy path to a CPU <i>and</i> to memory (direct or through a PCIe switch).</p>`;
    } else if (spec.role === 'inode') {
      status = th.ent.online
        ? `<p class="ok">Status: online — this server is on the rack, pushing ${spec.tput} Tb/s.</p>`
        : `<p class="bad">Status: offline — run a healthy AEC or AOC cable from here to the core switch island. If AEC dies over the water, it’s too far — use AOC.</p>`;
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
function label(id, txt) { const el = $(id); if (el && el.previousElementSibling) el.previousElementSibling.textContent = txt; }
function updateHUD() {
  const pw = $('mPower');
  if (S.level.survival && S.survival) {
    const total = S.ents.filter(e => e.type === 'srv').length || 1;
    const up = S.survival.upDen > 0 ? (S.survival.upNum / S.survival.upDen * 100) : 100;
    label('mTput', 'Uptime'); $('mTput').textContent = up.toFixed(1) + '%';
    label('mPower', 'Servers'); pw.textContent = S.stats.online + ' / ' + total + ' up';
    pw.classList.toggle('bad', S.stats.online < total);
    const ec = $('engCount'); if (ec) ec.textContent = '⛴ ' + engineers.length + ' engineer' + (engineers.length > 1 ? 's' : '');
  } else {
    label('mTput', 'Throughput'); $('mTput').textContent = S.stats.tput.toFixed(1) + ' Tb/s';
    const hot = S.stats.hot || 0;
    if (S.level.islands) { label('mPower', 'Link power'); pw.textContent = hot ? hot + ' link' + (hot > 1 ? 's' : '') + ' overloaded' : S.stats.watts + ' W'; pw.classList.toggle('bad', hot > 0); }
    else { label('mPower', 'Link power'); pw.textContent = S.stats.watts + ' W'; pw.classList.remove('bad'); }
  }
  $('levelName').textContent = S.level.title;
  const mode = $('btnMode');
  mode.textContent = S.level.campaign ? '⚒ Free build' : '▶ Campaign';
  mode.classList.toggle('big', !S.level.campaign);
  mode.style.display = islandEdit ? 'none' : '';   // inside a server, the Back button is the control
  /* the suite + interop lab are Survival-only tools — only surface them there */
  upgBtns.forEach(b => { b.style.display = S.level.survival ? '' : 'none'; });
}
function updateGoals() {
  const ul = $('goalList'); ul.innerHTML = '';
  if (S.level.survival && S.survival) {
    const total = S.ents.filter(e => e.type === 'srv').length || 1;
    const down = S.cables.filter(c => c.down).length;
    const rows = [
      ['⏱ Shift time', Math.floor(S.survival.time) + 's'],
      ['🖥 Servers online', S.stats.online + ' / ' + total],
      ['🔴 Links down', String(down)],
      ['⛴ Engineers free', idleEngineers() + ' / ' + engineers.length]
    ];
    rows.forEach(([k, v]) => {
      const li = document.createElement('li');
      li.className = (k[0] === '🔴' && down > 0) || (k[0] === '🖥' && S.stats.online < total) ? '' : 'done';
      li.textContent = k + ': ' + v;
      ul.appendChild(li);
    });
    return;
  }
  let markedCurrent = false;   // the first unfinished goal is "the one to do next"
  S.level.goals.forEach(g => {
    const li = document.createElement('li');
    const ok = g.check(S);
    if (ok) { li.className = 'done'; li.textContent = '✓ ' + g.text; }
    else if (!markedCurrent) { li.className = 'current'; li.textContent = '▸ ' + g.text; markedCurrent = true; }
    else { li.textContent = '○ ' + g.text; }
    ul.appendChild(li);
  });
}
/* ---- stuck coach: after ~1 min with no progress, pop a hint for the next goal ---- */
let idleT = 0, coachEl = null, coachOn = false, lastSig = null;
const STUCK_SECS = 60;
function progressSig() {
  const goals = S.level.goals || [];
  const done = goals.reduce((n, g) => n + (g.check(S) ? 1 : 0), 0);
  return S.idx + '|' + S.ents.length + '|' + S.cables.length + '|' + S.retimers.length + '|' + done;
}
function nextHint() {
  const g = (S.level.goals || []).find(x => !x.check(S));
  return g ? (g.hint || g.text) : null;
}
function ensureCoach() {
  if (coachEl) return;
  coachEl = document.createElement('div');
  coachEl.id = 'coach';
  coachEl.innerHTML =
    '<button class="coachClose" title="Dismiss" aria-label="Dismiss">×</button>' +
    '<div class="coachHead">💡 Stuck? Try this</div>' +
    '<div class="coachText"></div>' +
    '<button class="coachLesson">Show the lesson again</button>';
  (document.getElementById('stage3d') || document.body).appendChild(coachEl);
  coachEl.querySelector('.coachClose').onclick = () => { hideCoach(); idleT = 0; };
  coachEl.querySelector('.coachLesson').onclick = () => { hideCoach(); idleT = 0; showLesson(); };
}
function hideCoach() { if (coachEl) coachEl.classList.remove('show'); coachOn = false; }
function showCoach() {
  const hint = nextHint(); if (!hint) return;
  ensureCoach();
  coachEl.querySelector('.coachText').innerHTML = hint;
  coachEl.classList.add('show'); coachOn = true;
}
function updateCoach(dt) {
  const modalOpen = $('modal').classList.contains('open');
  /* campaign + the inside-a-server building step get coached; free-build/survival don't */
  const guided = S.level && (S.level.campaign || S.level.inner);
  const eligible = guided && !S.level.survival && !S.done && !modalOpen;
  if (!eligible) { hideCoach(); idleT = 0; lastSig = null; return; }
  const sig = progressSig();
  if (sig !== lastSig) { lastSig = sig; idleT = 0; hideCoach(); return; }  // made progress → re-arm
  if (coachOn) return;                                                     // already nudging; wait for progress
  idleT += dt;
  if (idleT >= STUCK_SECS) showCoach();
}
function buildSurvivalControls() {
  const old = $('survCtl'); if (old) old.remove();
  if (!S.level.survival) return;
  const sec = $('goalList').parentElement;
  const div = document.createElement('div');
  div.id = 'survCtl';
  div.style.cssText = 'margin-top:10px';
  div.innerHTML = '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--dim,#8a93b8);margin-bottom:6px">Crew</div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<button id="engMinus" style="width:34px;height:34px;font-size:20px;line-height:1;border-radius:8px;border:1px solid var(--line,#232b4a);background:var(--panel2,#171d36);color:inherit;cursor:pointer">−</button>' +
    '<span id="engCount" style="font-weight:600;min-width:96px;text-align:center">⛴ 3 engineers</span>' +
    '<button id="engPlus" style="width:34px;height:34px;font-size:20px;line-height:1;border-radius:8px;border:1px solid var(--line,#232b4a);background:var(--panel2,#171d36);color:inherit;cursor:pointer">+</button>' +
    '</div>' +
    '<div style="font-size:12px;color:var(--dim,#8a93b8);margin-top:6px">They auto-dispatch to fix downed links — worst outage first.</div>';
  sec.appendChild(div);
  $('engPlus').onclick = addEngineer;
  $('engMinus').onclick = removeEngineer;
}
function showLesson() {
  $('modalBody').innerHTML = S.level.lesson;
  $('modal').classList.add('open');
}
function showBanner() {
  const b = $('banner');
  if (S.level.campaign) {
    b.innerHTML = `<h2>🎉 Your data hall is online!</h2><p>Keep growing it — more servers, switches and links — or try the sandboxes.</p>`;
    b.classList.add('show'); $('btnNext').hidden = true;
    setTimeout(() => b.classList.remove('show'), 4200);
    return;
  }
  const yay = ['Sweet!', 'Signal locked!', 'Niiice.', 'Link up!', 'Island online!'];
  b.innerHTML = `<h2>${yay[Math.floor(Math.random() * yay.length)]} ${(S.level.title.split('—')[1] || 'Lesson').trim()} complete!</h2><p>${S.idx + 1 < LEVELS.length ? 'Next lesson in a moment…' : 'You built the whole server!'}</p>`;
  b.classList.add('show');
  $('btnNext').hidden = S.idx + 1 >= LEVELS.length;
  setTimeout(() => b.classList.remove('show'), 3800);
}
function levelComplete() {
  showBanner();
  spawnFireworks();
  if (S.level.campaign) return;   // the campaign is your persistent world — celebrate, don't reset
  clearTimeout(advanceTimer);
  const cur = S;
  advanceTimer = setTimeout(() => {
    if (S === cur && S.done) startLevel(Math.min(S.idx + 1, LEVELS.length - 1));
  }, 4200);
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
    if (L.hidden) return;   // lessons + chip sandbox are folded into the one-map campaign
    const o = document.createElement('option');
    o.value = n; o.textContent = L.title;
    o.disabled = false;
    sel.appendChild(o);
  });
  if (S) sel.value = S.idx;
}
function startLevel(idx) {
  clearTimeout(advanceTimer);
  /* leaving a server-scale build with a GPU? remember the server components (not
     board fixtures like the rack uplink) to carry into the islands */
  if (S && !S.level.islands && !S.level.inner && S.ents.some(e => e.type === 'gpu')) {
    const keep = new Set(['cpu', 'gpu', 'mem', 'pswitch', 'memctl', 'nic']);
    const ents = S.ents.filter(e => keep.has(e.type));
    const ids = new Set(ents.map(e => e.id));
    const cables = S.cables.filter(c => ids.has(c.a) && ids.has(c.b));
    carriedServer = cloneBuild({ ents, cables, retimers: S.retimers });
  }
  islandEdit = null; backBtn(false);
  const wasIsland = S ? !!S.level.islands : null;
  const crossScale = S && (!!LEVELS[idx].islands !== wasIsland);
  FX.forEach(p => scene.remove(p.m));
  FX = [];
  entMeshes.forEach(m => scene.remove(m));
  entMeshes.clear();
  retMeshes.forEach(m => scene.remove(m));
  retMeshes.clear();
  drag = null;
  S = newLevelState(idx);
  buildWorld(S.level);
  buildToolbar(); buildLevelSelect();
  $('lvlSel').value = idx;
  $('btnNext').hidden = true;
  showInspector(null);
  recompute();
  setupSurvival();
  buildSurvivalControls();
  if (crossScale) beginScaleZoom(!!S.level.islands && !wasIsland);
  showLesson();
  placeWorkers();
  /* the campaign drops you straight onto your first server's board — so there's
     always something to build the instant you arrive; scroll out to reach the hall */
  if (S.level.campaign) {
    const first = S.ents.find(e => e.type === 'srv');
    if (first) enterIsland(first);
  }
}

$('btnMode').onclick = () => startLevel(S.level.campaign ? freeBuildIdx() : campaignIdx());
$('modalClose').onclick = () => $('modal').classList.remove('open');
$('btnLesson').onclick = showLesson;
$('btnRestart').onclick = () => startLevel(S.idx);
$('btnNext').onclick = () => startLevel(Math.min(S.idx + 1, LEVELS.length - 1));
$('lvlSel').onchange = ev => startLevel(parseInt(ev.target.value, 10));

/* ---------------- resize + animate ---------------- */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let lastT = 0;
function animate(ts) {
  requestAnimationFrame(animate);
  const t = ts / 1000;
  const dt = Math.max(0.001, Math.min(0.05, t - lastT || 0.016));
  lastT = t;
  if (fpMode) {
    let moving = false, sprint = false;
    if (fpControls.isLocked) {
      sprint = !!(fpKeys['ShiftLeft'] || fpKeys['ShiftRight']);
      const spd = (sprint ? 8.5 : 4.6) * dt;
      if (fpKeys['KeyW'] || fpKeys['ArrowUp']) { fpControls.moveForward(spd); moving = true; }
      if (fpKeys['KeyS'] || fpKeys['ArrowDown']) { fpControls.moveForward(-spd); moving = true; }
      if (fpKeys['KeyA'] || fpKeys['ArrowLeft']) { fpControls.moveRight(-spd); moving = true; }
      if (fpKeys['KeyD'] || fpKeys['ArrowRight']) { fpControls.moveRight(spd); moving = true; }
    }
    const targetFov = (sprint && moving) ? 76 : 70;   // little FOV kick when sprinting
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix();
    if (moving) fpBob += dt * (sprint ? 15 : 10.5);    // footstep head-bob
    const bob = moving ? Math.sin(fpBob) * 0.05 : 0;
    camera.position.y = 1.6 + bob;
    camera.position.x = Math.max(-26, Math.min(26, camera.position.x));
    camera.position.z = Math.max(-26, Math.min(26, camera.position.z));
  } else if (camTween) {
    camTween.t += dt / camTween.dur;
    const x = Math.min(1, camTween.t);
    const k = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;  // easeInOutQuad
    camera.position.lerpVectors(camTween.from, camTween.to, k);
    camera.lookAt(CAM_TARGET);
    if (camTween.t >= 1) { camTween = null; controls.target.copy(CAM_TARGET); controls.enabled = true; controls.update(); }
  } else {
    /* WASD pans the camera across the map (arrow keys still nudge a selected part) */
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      const pf = (fpKeys['KeyW'] ? 1 : 0) - (fpKeys['KeyS'] ? 1 : 0);
      const pr = (fpKeys['KeyD'] ? 1 : 0) - (fpKeys['KeyA'] ? 1 : 0);
      if (pf || pr) {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0;
        if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const move = new THREE.Vector3().addScaledVector(fwd, pf).addScaledVector(right, pr).normalize();
        const spd = camera.position.distanceTo(controls.target) * 0.9 * dt;
        const ox = controls.target.x, oz = controls.target.z;
        controls.target.x = Math.max(-16, Math.min(16, controls.target.x + move.x * spd));
        controls.target.z = Math.max(-12, Math.min(12, controls.target.z + move.z * spd));
        camera.position.x += controls.target.x - ox;   // move the camera by the same (clamped) amount
        camera.position.z += controls.target.z - oz;
      }
    }
    controls.update();
  }
  updateWorkers(dt, t);

  /* smooth entity motion + drag follow */
  S.ents.forEach(e => {
    const m = entMeshes.get(e.id);
    if (!m) return;
    if (drag && drag.lift && e === drag.ent && hoverTile) {
      const s = esize(e.type);
      const target = new THREE.Vector3(tX(hoverTile.i) + (s[0] - 1) / 2, 0.8, tZ(hoverTile.j) + (s[1] - 1) / 2);
      m.position.lerp(target, Math.min(1, dt * 14));
    } else {
      const target = m.userData.target || entCenter(e);
      m.position.lerp(target, Math.min(1, dt * 10));
    }
    /* idle bob + fan spin for online GPUs */
    if (e.type === 'gpu' && e.online) {
      m.position.y = Math.max(m.position.y, 0) + Math.sin(t * 4 + e.id) * 0.02;
      (m.userData.fans || []).forEach(b => b.rotation.y += dt * 9);
    }
  });

  /* status glow: mark offline-but-connected GPUs with red blink on plate */
  S.ents.forEach(e => {
    const m = entMeshes.get(e.id);
    if (!m || e.type !== 'gpu') return;
    const connected = S.cables.some(c => c.a === e.id || c.b === e.id);
    const plate = m.children[0];
    if (plate && plate.material) {
      if (e.online) plate.material.color.setHex(0x6fcf6a);
      else if (connected) plate.material.color.setHex(Math.sin(t * 8) > 0 ? 0xe05555 : 0xa03535);
      else plate.material.color.setHex(0xf08a3c);
    }
  });

  /* server-island beacon: green pulse when online, red blink when down */
  S.ents.forEach(e => {
    const m = entMeshes.get(e.id);
    if (!m || e.type !== 'srv') return;
    const beacon = m.userData.beacon;
    if (!beacon) return;
    const connected = S.cables.some(c => c.a === e.id || c.b === e.id);
    if (e.online) {
      beacon.material.color.setHex(0x8dffb8); beacon.material.emissive.setHex(0x2fbf6a);
      beacon.material.emissiveIntensity = 1.1 + Math.sin(t * 4 + e.id) * 0.5;
      m.position.y = Math.sin(t * 2 + e.id) * 0.03;
    } else if (connected) {
      const on = Math.sin(t * 8) > 0;
      beacon.material.color.setHex(0xe05555); beacon.material.emissive.setHex(on ? 0xa02020 : 0x401010);
      beacon.material.emissiveIntensity = on ? 1.2 : 0.3;
    } else {
      beacon.material.color.setHex(0x9aa4b0); beacon.material.emissive.setHex(0x2a3038);
      beacon.material.emissiveIntensity = 0.4;
    }
  });

  /* retimer ring pulse */
  retMeshes.forEach(m => {
    const ring = m.userData.ring;
    if (ring) {
      const s = 1 + Math.sin(t * 5) * 0.12;
      ring.scale.setScalar(s);
      ring.material.opacity = 0.45 + Math.sin(t * 5) * 0.25;
    }
  });

  /* dead cable flicker + overloaded (hot) cable pulse */
  cableGroup.children.forEach(m => {
    if (m.userData.dead) m.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 6)) * 0.6;
    else if (m.userData.hot) m.material.emissiveIntensity = 0.35 + Math.abs(Math.sin(t * 7)) * 0.7;
  });

  /* hover + ghost (footprint-aware) */
  const toolSize = CAT[S.tool] ? esize(S.tool) : [1, 1];
  if (hoverTile && !drag) {
    hoverRing.visible = true;
    hoverRing.position.set(tX(hoverTile.i) + (toolSize[0] - 1) / 2, 0.02, tZ(hoverTile.j) + (toolSize[1] - 1) / 2);
    hoverRing.scale.setScalar(Math.max(toolSize[0], toolSize[1]));
  } else hoverRing.visible = false;
  if (ghost && ghostType === 'retimer' && !drag && !cableDrag) {
    /* the retimer ghost rides the wire under the cursor, so you see exactly where
       it will clamp on before you click */
    if (retimerHover && retimerHover.retimeable) {
      ghost.visible = true; ghost.scale.set(1.15, 1.15, 1.15);
      ghost.position.copy(retimerHover.point); ghost.rotation.y = retimerHover.rot;
      ghost.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(0x0a3a14); });
    } else ghost.visible = false;
  } else if (ghost && ghostType && hoverTile && !drag) {
    ghost.visible = true;
    const s = esize(ghostType);
    ghost.position.set(tX(hoverTile.i) + (s[0] - 1) / 2, 0.02, tZ(hoverTile.j) + (s[1] - 1) / 2);
    ghost.scale.set(...pieceScale(ghostType));
    const bad = !fits(ghostType, hoverTile.i, hoverTile.j);
    ghost.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(bad ? 0x881111 : 0x0a3a14); });
  } else if (ghost) ghost.visible = false;

  /* selection ring */
  if (S.selected && S.selected.kind === 'ent') {
    const m = entMeshes.get(S.selected.ent.id);
    if (m) {
      const s = esize(S.selected.ent.type);
      selRing.visible = true;
      selRing.position.set(m.position.x, 0.05, m.position.z);
      selRing.scale.setScalar(Math.max(s[0], s[1]));
    } else selRing.visible = false;
  } else selRing.visible = false;

  /* pendA highlight via hover ring color */
  hoverRing.material.color.setHex(S.pendA ? 0x57e389 : 0xffffff);

  clouds.forEach(cl => {
    cl.position.x += cl.userData.speed * dt;
    if (cl.position.x > 24) cl.position.x = -24;
  });
  dayProps.forEach(p => {
    if (!p.visible) return;
    const u = p.userData;
    if (u.bird) {
      const f = Math.sin(t * 8 + u.phase) * 0.6;
      u.wingL.rotation.z = f; u.wingR.rotation.z = -f;
      p.position.x += u.spd * dt;
      if (p.position.x > 20) { p.position.x = -20; p.position.z = -8 + Math.random() * 16; }
    } else if (u.boat) {
      u.angle += u.spd * u.dir * dt;
      p.position.set(Math.cos(u.angle) * u.R, -1.55 + Math.sin(t * 1.4 + u.bob) * 0.05, Math.sin(u.angle) * u.R);
      p.rotation.y = -u.angle + (u.dir > 0 ? 0 : Math.PI);
      p.rotation.z = Math.sin(t * 1.2 + u.bob) * 0.05;
    }
  });

  updateSpace(dt, t);
  if (S.level.survival) updateSurvival(dt, t);
  updatePulses(dt, ts);
  updateElastics();
  updateFx(dt);
  updateCoach(dt);
  renderer.render(scene, camera);
}

/* ---------------- fun facts ---------------- */
const FACTS = [
  'A PCIe Gen6 <b>x16</b> slot bundles 16 lanes — each lane is one pair of wires. Together they move about 128 GB/s.',
  'The <b>x</b> in “PCIe x16” means sixteen lanes <i>wide</i>. A GPU wants a full x16; an SSD is happy with x4.',
  'A top-end AI <b>GPU</b> reads its onboard memory at over 3 TB/s — like scanning 600 DVDs every second.',
  '<b>TPUs</b> (Tensor Processing Units) are custom AI accelerator chips; a single pod can link thousands of them with optical switches.',
  'A modern network switch chip moves <b>51.2 terabits per second</b> — through a single piece of silicon.',
  '<b>Retimers</b> exist because past about a meter at PCIe Gen6 speeds, a copper signal smears too much to read. The retimer rebuilds it.',
  '<b>AECs</b> — copper cables with retimer chips in the plugs — are the fastest-growing cable type in AI data centers.',
  'An <b>AOC</b> turns your data into laser light. Light barely fades, so one optical cable can run 100+ meters.',
  '<b>CXL</b> lets a CPU borrow extra memory over PCIe-style links — for when a server needs more RAM than it has slots.',
  'Dedicated <b>GPU-to-GPU links</b> form a private highway between chips — up to 1.8 TB/s each, far faster than PCIe.',
  'Optical transceivers can burn more power than the switch chip itself — which is why engineers use copper wherever they can.',
  'A rack of eight top-end <b>GPUs</b> can draw over 10 kilowatts — as much as several homes at once.',
  'A <b>leaf-spine</b> network lets any server reach any other in just 3 hops, no matter how big the building.',
  '<b>HBM</b> (High Bandwidth Memory) stacks DRAM chips vertically right beside the GPU for enormous bandwidth.',
  'PCIe roughly <b>doubles</b> its speed every 3 years: Gen3 → Gen4 → Gen5 → Gen6, each twice the last.',
  'Signal-integrity engineers read <b>“eye diagrams”</b> — the more open the “eye”, the healthier the link.',
  '<b>800G</b> is today’s top networking speed per port: 800 gigabits every second down a single cable.',
  'The <b>retimer</b> market barely existed a decade ago — AI’s hunger for bandwidth turned it into a multi-billion-dollar business.',
  'A hyperscale data center can hold <b>hundreds of thousands</b> of GPUs, all needing to talk to each other.',
  'Every <b>port</b> is a budget: a CPU has only so many lanes to hand out — which is exactly why PCIe switches (fan-out) matter.',
  '<b>Tip:</b> wires look like a tangled mess? <b>Drag your components apart</b> — spacing parts out gives each wire its own clean lane instead of crossing others.'
];
/* facts relevant to the selected item — the box tailors itself to what you're holding/clicking */
const ITEM_FACTS = {
  gpu: [
    'A top-end AI <b>GPU</b> reads its own memory at over 3 TB/s — like scanning 600 DVDs a second.',
    'A rack of eight GPUs can draw 10+ kilowatts — as much as several homes.',
    'Idle GPUs waiting on data are the most expensive waste in AI; connectivity is what keeps them fed.'
  ],
  cpu: [
    'A server <b>CPU</b> exposes 128+ PCIe lanes — every one a signal-integrity battleground.',
    'The CPU is the “root complex”: all PCIe lanes and memory channels fan out from it.',
    'Every port is a budget — the CPU has only so many lanes, which is why switches exist.'
  ],
  mem: [
    '<b>Memory</b> bandwidth is so precious a whole chip category (CXL controllers) exists just to attach more of it.',
    '<b>HBM</b> stacks DRAM chips vertically right beside the processor for enormous bandwidth.'
  ],
  pswitch: [
    'A <b>PCIe switch</b> turns one CPU port into many — that’s how one CPU hosts a dozen GPUs.',
    'The “x” in PCIe x16 means sixteen lanes wide; a switch fans those lanes out to more devices.'
  ],
  memctl: [
    'A <b>CXL memory controller</b> lets a CPU borrow terabytes of extra RAM over PCIe-style links.',
    'When the DIMM slots run out but models keep growing, memory controllers keep the GPUs fed.'
  ],
  nic: [
    'A <b>NIC</b> is the server’s door to the network — modern AI servers pack several 400–800G NICs.',
    '<b>800G</b> is today’s top per-port speed: 800 gigabits every second down one cable.'
  ],
  uplink: [
    'The <b>top-of-rack switch</b> sits up high on purpose — short cables to the servers stay cheap and healthy.',
    'That NIC-to-rack cable is the boundary between “inside the box” and the whole data center.'
  ],
  srv: [
    'Between servers there’s no circuit board — every link is a real pluggable cable (AEC or AOC).',
    'AI clusters are planned rack by rack; every rack’s uplinks converge on the row’s switches.'
  ],
  core: [
    'One modern switch chip (the kind in a rack’s core) moves <b>51.2 terabits per second</b>.',
    'A <b>leaf-spine</b> fabric lets any server reach any other in just 3 hops, however big the hall.'
  ],
  trace: [
    'A copper <b>PCB trace</b> is nearly free, but past ~30 cm at PCIe Gen6 the signal smears too much to read.',
    'PCIe doubles its speed about every 3 years (Gen3→4→5→6) — making signal integrity ever harder.',
    'Signal engineers read <b>“eye diagrams”</b> — the more open the eye, the healthier the trace.'
  ],
  aecb: [
    'An <b>AEC</b> is copper with a retimer chip in each connector shell — the fastest-growing cable in AI.',
    'AECs sip power and fail less than optics: copper wherever you can, light only where you must.'
  ],
  aocb: [
    'An <b>AOC</b> turns your data into laser light; one optical cable can run 100+ meters.',
    'Optics can burn more power than the switch chip itself — the reason engineers prefer copper when they can.'
  ],
  aec1: null, aoc1: null, dac1: null, dac2: null, aec2: null, opt: null, mmf: null, smf: null,
  retimer: [
    'A <b>retimer</b> recovers a smeared copper signal and retransmits it perfectly clean — health back to 100%.',
    'The retimer market went from tiny to multi-billion-dollar as AI’s hunger for bandwidth exploded.',
    'Retimers live on motherboards, riser cards, backplanes — and inside every AEC.'
  ]
};
ITEM_FACTS.aec1 = ITEM_FACTS.aec2 = ITEM_FACTS.aecb;
ITEM_FACTS.aoc1 = ITEM_FACTS.opt = ITEM_FACTS.mmf = ITEM_FACTS.smf = ITEM_FACTS.aocb;
ITEM_FACTS.dac1 = ITEM_FACTS.dac2 = ITEM_FACTS.trace;
ITEM_FACTS.tor = ITEM_FACTS.leaf = ITEM_FACTS.spine = ITEM_FACTS.spine2 = ITEM_FACTS.dci = ITEM_FACTS.core;
ITEM_FACTS.server = ITEM_FACTS.rk = ITEM_FACTS.rw = ITEM_FACTS.srv;

let factIdx = 0, factTopic = null, topicIdx = 0;
for (let i = FACTS.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [FACTS[i], FACTS[j]] = [FACTS[j], FACTS[i]]; }
function renderFact(html) {
  const el = $('factBox'); if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.innerHTML = html; el.style.opacity = '1'; }, 250);
}
function setFactTopic(type) {
  const arr = type && ITEM_FACTS[type];
  if (arr && arr.length) { factTopic = type; topicIdx = 0; renderFact(arr[0]); }
  else if (factTopic) { factTopic = null; showFact(false); }
}
function showFact(immediate) {
  const el = $('factBox');
  if (!el) return;
  const set = () => { el.innerHTML = FACTS[factIdx]; el.style.opacity = '1'; factIdx = (factIdx + 1) % FACTS.length; };
  if (immediate) { set(); return; }
  el.style.opacity = '0';
  setTimeout(set, 350);
}
function factTick() {
  if (factTopic && ITEM_FACTS[factTopic]) {
    const arr = ITEM_FACTS[factTopic];
    topicIdx = (topicIdx + 1) % arr.length;
    renderFact(arr[topicIdx]);
  } else showFact(false);
}

/* ---------------- boot ---------------- */
startLevel(0);
resize();
showFact(true);
setInterval(factTick, 13000);
requestAnimationFrame(animate);

/* first-person "walk the floor" button */
(function () {
  const b = document.createElement('button');
  b.id = 'btnFP'; b.type = 'button'; b.title = 'Walk the floor (first person)';
  b.textContent = '🧍 Walk';
  b.onclick = () => { fpMode ? exitFP() : enterFP(); };
  const host = document.getElementById('hudBtns');
  if (host) host.insertBefore(b, host.firstChild);
})();

/* little-workers (crew) toggle */
(function () {
  const b = document.createElement('button');
  b.id = 'btnCrew'; b.type = 'button'; b.title = 'Show / hide the little critters';
  const upd = () => { b.textContent = workersOn ? '🐾 Critters' : '🐾 Critters off'; b.classList.toggle('on', workersOn); };
  b.onclick = () => { workersOn = !workersOn; try { localStorage.setItem('dct3d_crew', workersOn ? '1' : '0'); } catch (e) {} placeWorkers(); upd(); };
  const host = document.getElementById('hudBtns');
  if (host) host.insertBefore(b, host.firstChild);
  try { if (localStorage.getItem('dct3d_crew') === '0') workersOn = false; } catch (e) {}
  upd();
})();

/* space-mode toggle button */
(function () {
  const b = document.createElement('button');
  b.id = 'btnSpace'; b.type = 'button'; b.title = 'Space mode';
  const upd = () => { b.textContent = spaceMode ? '☀ Day' : '🌙 Space'; b.classList.toggle('on', spaceMode); };
  b.onclick = () => { setSpaceMode(!spaceMode); try { localStorage.setItem('dct3d_space', spaceMode ? '1' : '0'); } catch (e) {} upd(); };
  const host = document.getElementById('hudBtns');
  if (host) host.insertBefore(b, host.firstChild);
  let saved = false; try { saved = localStorage.getItem('dct3d_space') === '1'; } catch (e) {}
  if (saved) setSpaceMode(true);
  upd();
})();

/* operator-upgrade toggles: unified software suite (telemetry) + interop lab */
(function () {
  const host = document.getElementById('hudBtns');
  const mk = (id, onLabel, offLabel, title, get, set, lsKey, onMsg) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.title = title;
    const upd = () => { b.textContent = get() ? onLabel : offLabel; b.classList.toggle('on', get()); };
    b.onclick = () => { set(!get()); try { localStorage.setItem(lsKey, get() ? '1' : '0'); } catch (e) {} upd(); if (get()) say(onMsg); };
    if (host) host.insertBefore(b, host.firstChild);
    let saved = false; try { saved = localStorage.getItem(lsKey) === '1'; } catch (e) {}
    if (saved) set(true);
    upd();
    upgBtns.push(b);
  };
  mk('btnInterop', '🔬 Interop ✓', '🔬 Interop Lab',
     'Interop lab: everything interoperates better — more reach, more capacity, fewer failures',
     () => interop, setInterop, 'dct3d_interop', '🔬 Interop lab online — more reach, more capacity, steadier links.');
  mk('btnSuite', '📊 Suite ✓', '📊 Software Suite',
     'Unified software suite: fleet telemetry — longer reach, fewer outages, faster repairs',
     () => suite, setSuite, 'dct3d_suite', '📊 Telemetry suite online — longer reach, fewer outages, faster repairs.');
})();

/* testing hooks */
window.G3D = {
  get S() { return S; },
  startLevel, tryPlaceEnt, tryPlaceRet, tryCable, moveEnt, removeThing, entAt,
  setSpaceMode, get spaceMode() { return spaceMode; }, updateSpace,
  setSuite, setInterop, get suite() { return suite; }, get interop() { return interop; },
  recompute, dispatchEngineer, updateSurvival, updateCoach, get engineers() { return engineers; },
  enterIsland, exitIsland, nearestServerIsland, serverWorks, get islandEdit() { return islandEdit; }, get carriedServer() { return carriedServer; },
  enterFP, exitFP, get fpMode() { return fpMode; }, placeWorkers, get workers() { return workers; },
  get cableCurves() { return cableCurves; }, get retimers() { return S.retimers; },
  get cableRoutes() { return cableRoutes; },
  LEVELS, CAT, CAB, entMeshes, scene, camera, renderer
};
