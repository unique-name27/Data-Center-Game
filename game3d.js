import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
    real: 'PCIe fabric switches (like Astera Labs’ Scorpio or Broadcom’s PEX) are how one CPU hosts a dozen GPUs.'
  },
  memctl: {
    role: 'core', name: 'CXL memory controller', ports: 8,
    tag: 'More memory than you have ports',
    desc: 'A memory controller fans one link out to a whole bank of DIMMs. Memory behind it still counts — GPUs reach it through the CPU or a switch.',
    real: 'CXL memory controllers (like Astera Labs’ Leo) attach terabytes of extra memory over PCIe-style links.'
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
  }
};
const CAB = {
  trace: {
    name: 'PCIe trace', watts: 0.5, loss: 25, color: 0xd9a326, retime: true,
    tag: 'Copper etched right into the board',
    desc: 'A copper trace is nearly free — but at PCIe Gen6 speeds the signal smears out fast (25% health per tile). Long runs need retimer chips placed along the route.',
    real: 'Past ~30 cm of board copper at Gen5/Gen6, designers reach for a retimer.'
  },
  aecb: {
    name: 'AEC (retimed copper cable)', watts: 5, loss: 6, color: 0x2fc4b2, retime: false,
    tag: 'Copper with retimers in the plugs',
    desc: 'An Active Electrical Cable is copper with a retimer chip inside each connector shell — 6% loss per tile instead of 25%.',
    real: 'Inside GPU servers, AECs carry PCIe between boards and shelves — built on the same retimer silicon you place by hand.'
  },
  aocb: {
    name: 'AOC (active optical cable)', watts: 9, loss: 1.0, color: 0x4a9df0, retime: false,
    tag: 'Light inside the box',
    desc: 'An Active Optical Cable converts the signal to light: 1% loss per tile, reach basically unlimited at this scale. You pay in watts — lasers are never free.',
    real: 'AOC vs AEC is a live engineering debate: optics reach farther; copper sips power and fails less.'
  }
};
const RET = {
  name: 'Retimer chip', watts: 4,
  tag: 'The connectivity chip itself',
  desc: 'A retimer recovers the clock and data from a degraded electrical signal and retransmits it perfectly clean — signal health resets to 100% at the chip. Place it on a copper route BEFORE health falls under 30%.',
  real: 'Retimers live on motherboards, riser cards, backplanes and inside AECs. This is the chip category companies like Astera Labs built their business on.'
};
const ALLOWED_BOARD = {
  gpu: ['cpu', 'pswitch'],
  mem: ['cpu', 'pswitch', 'memctl'],
  memctl: ['cpu', 'pswitch'],
  nic: ['cpu', 'pswitch', 'nic', 'uplink'],
  uplink: ['nic'],
  cpu: ['gpu', 'mem', 'memctl', 'nic', 'pswitch'],
  pswitch: ['gpu', 'mem', 'memctl', 'cpu', 'nic']
};

/* ---------------- levels ---------------- */
const LEVELS = [
  {
    title: 'Lesson 1 — Inside the server',
    tools: ['gpu', 'cpu', 'mem', 'trace', 'retimer'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'gpu', i: 14, j: 4 }],
    goals: [
      { text: 'Attach a DIMM to the CPU', check: s => s.stats.memsReach >= 1 },
      { text: 'Bring a GPU online (it needs CPU + memory)', check: s => s.stats.online >= 1 },
      {
        text: 'Rescue the far riser GPU with retimer chips',
        check: s => { const g = s.ents.find(e => e.locked && e.type === 'gpu'); return !!(g && g.online); }
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
    title: 'Lesson 2 — Build the full server',
    tools: ['gpu', 'cpu', 'mem', 'pswitch', 'memctl', 'nic', 'trace', 'aecb', 'aocb', 'retimer'],
    pre: [{ t: 'cpu', i: 7, j: 4 }, { t: 'uplink', i: 15, j: 0 }],
    goals: [
      { text: 'Bring 6 GPUs online', check: s => s.stats.online >= 6 },
      { text: 'Fan out through a PCIe switch', check: s => s.stats.switchUsed },
      { text: 'Feed the board memory through a CXL controller', check: s => s.stats.memctlUsed },
      { text: 'Wire a NIC out to the rack uplink (AEC or AOC)', check: s => s.stats.nicUp }
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
    title: 'Sandbox — Free build', sandbox: true,
    tools: ['gpu', 'cpu', 'mem', 'pswitch', 'memctl', 'nic', 'uplink', 'trace', 'aecb', 'aocb', 'retimer'],
    pre: [],
    goals: [{ text: 'Build any server you like', check: () => false }],
    lesson: `<h2>Sandbox — Free build</h2>
      <p>The island is yours. Drop <b>CPUs</b>, hang GPUs and memory off <b>PCIe switches</b> and <b>CXL controllers</b>, run <b>AEC</b> and <b>AOC</b> cables across the board, and watch the data orbs flow.</p>
      <p>New here? Hit <b>▶ Start lessons</b> for the two-step guided build.</p>
      <p class="tip">A GPU sparkles green when it can reach a CPU and memory. Right-drag to orbit, scroll to zoom.</p>`
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
  return s;
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
function tryPlaceEnt(type, i, j) {
  if (entAt(i, j) || retAt(i, j)) return say('That spot is occupied.');
  S.ents.push({ id: idSeq++, type, i, j });
  recompute();
}
function tryPlaceRet(i, j) {
  if (entAt(i, j)) return say('Retimers go on the cable run, not on a device.');
  if (retAt(i, j)) return say('There is already a retimer here.');
  if (!S.cables.some(c => CAB[c.type].retime && c.path.some(p => p.i === i && p.j === j)))
    return say('Place retimers on a bare copper route. (AECs and AOCs have their own built in.)');
  S.retimers.push({ i, j });
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
  if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) return;
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
    if (th.ent.locked) return say('That one came with the board — it stays.');
    S.cables = S.cables.filter(c => c.a !== th.ent.id && c.b !== th.ent.id);
    S.ents = S.ents.filter(e => e !== th.ent);
  } else if (th.kind === 'cable') {
    S.cables = S.cables.filter(c => c !== th.cable);
  } else if (th.kind === 'ret') {
    S.retimers = S.retimers.filter(r => r !== th.ret);
  }
  S.selected = null;
  recompute();
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
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.15;
controls.minAzimuthAngle = -0.9;
controls.maxAzimuthAngle = 0.9;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.enableDamping = true;
controls.dampingFactor = 0.08;

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
(function buildIsland() {
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 1024; grassCanvas.height = 576;
  const g = grassCanvas.getContext('2d');
  g.fillStyle = '#7ecb54'; g.fillRect(0, 0, 1024, 576);
  g.strokeStyle = 'rgba(70,140,50,.5)'; g.lineWidth = 2;
  for (let i = 0; i <= GRID_W; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 576); g.stroke(); }
  for (let j = 0; j <= GRID_H; j++) { g.beginPath(); g.moveTo(0, j * 64); g.lineTo(1024, j * 64); g.stroke(); }
  for (let k = 0; k < 700; k++) {
    g.fillStyle = k % 2 ? 'rgba(255,255,255,.10)' : 'rgba(60,130,45,.18)';
    g.fillRect(Math.random() * 1024, Math.random() * 576, 3, 3);
  }
  const grassTex = new THREE.CanvasTexture(grassCanvas);
  grassTex.colorSpace = THREE.SRGBColorSpace;

  const top = new THREE.Mesh(
    new RoundedBoxGeometry(GRID_W + 1.4, 0.7, GRID_H + 1.4, 4, 0.32),
    [toon(0xffffff, { map: grassTex })]
  );
  top.material = toon(0xffffff, { map: grassTex });
  top.position.y = -0.35;
  top.receiveShadow = true;
  scene.add(top);

  const dirt = new THREE.Mesh(
    new RoundedBoxGeometry(GRID_W + 1.7, 1.3, GRID_H + 1.7, 4, 0.4),
    toon(0x9a6a3f)
  );
  dirt.position.y = -1.05;
  scene.add(dirt);

  const ocean = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, 0.4, 48),
    new THREE.MeshBasicMaterial({ color: 0x8fd9ec })
  );
  ocean.position.y = -1.75;
  scene.add(ocean);
  const shore = new THREE.Mesh(
    new THREE.CylinderGeometry(11.5, 11.8, 0.3, 48),
    new THREE.MeshBasicMaterial({ color: 0xbdeaf6 })
  );
  shore.position.y = -1.62;
  scene.add(shore);
})();

/* ---- decorations: trees, flowers, rocks, clouds ---- */
function tree(x, z, s) {
  const gTree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.7 * s, 8), toon(0x8a5a33));
  trunk.position.y = 0.35 * s; trunk.castShadow = true;
  const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 12, 10), toon(0x3f9e46));
  f1.position.y = 0.95 * s; f1.scale.y = 0.85; f1.castShadow = true;
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.38 * s, 12, 10), toon(0x54b859));
  f2.position.set(0.15 * s, 1.3 * s, 0.05 * s); f2.castShadow = true;
  gTree.add(trunk, f1, f2);
  gTree.position.set(x, 0, z);
  scene.add(gTree);
}
function flowerPatch(x, z) {
  const colors = [0xf06ab8, 0xf5c542, 0xffffff, 0xf08a3c];
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), toon(0x3f9e46));
    stem.position.y = 0.09;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), toon(colors[k % 4]));
    head.position.y = 0.2;
    f.add(stem, head);
    f.position.set(x + (Math.random() - 0.5) * 0.7, 0, z + (Math.random() - 0.5) * 0.7);
    scene.add(f);
  }
}
function rock(x, z, s) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 * s, 0), toon(0xb8bfc8));
  r.position.set(x, 0.12 * s, z);
  r.scale.y = 0.7; r.castShadow = true;
  scene.add(r);
}
tree(-GRID_W / 2 - 0.1, -GRID_H / 2 - 0.15, 1.1);
tree(GRID_W / 2 + 0.05, GRID_H / 2 + 0.1, 0.9);
tree(-GRID_W / 2 - 0.2, GRID_H / 2 + 0.2, 0.8);
flowerPatch(GRID_W / 2 - 0.2, -GRID_H / 2 - 0.3);
flowerPatch(-GRID_W / 2 + 1.2, GRID_H / 2 + 0.35);
rock(GRID_W / 2 + 0.4, -GRID_H / 2 + 1.4, 1);
rock(-GRID_W / 2 + 0.3, -GRID_H / 2 - 0.4, 0.7);

const clouds = [];
for (let k = 0; k < 4; k++) {
  const cl = new THREE.Group();
  for (let m = 0; m < 3; m++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9 - m * 0.2, 10, 8),
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradTex, transparent: true, opacity: 0.92 }));
    puff.position.set(m * 0.9 - 0.9, (m % 2) * 0.2, (m % 2) * 0.3);
    puff.scale.y = 0.6;
    cl.add(puff);
  }
  cl.position.set(-14 + k * 9, 7 + (k % 2) * 1.5, -6 + (k % 3) * 4);
  cl.userData.speed = 0.15 + k * 0.05;
  scene.add(cl);
  clouds.push(cl);
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
    if (!m) {
      m = buildPiece(e.type);
      m.userData.ent = e;
      m.traverse(o => { o.userData.entId = e.id; });
      scene.add(m);
      m.position.set(tX(e.i), 0, tZ(e.j));
      entMeshes.set(e.id, m);
    }
    m.userData.target = new THREE.Vector3(tX(e.i), 0, tZ(e.j));
  });
  /* retimers */
  const rKey = r => r.i + ',' + r.j;
  const liveR = new Set(S.retimers.map(rKey));
  [...retMeshes.keys()].forEach(k => {
    if (!liveR.has(k)) { scene.remove(retMeshes.get(k)); retMeshes.delete(k); }
  });
  S.retimers.forEach(r => {
    if (!retMeshes.has(rKey(r))) {
      const m = buildRetimerMesh();
      m.position.set(tX(r.i), 0.02, tZ(r.j));
      m.userData.ret = r;
      m.traverse(o => { o.userData.retKey = rKey(r); });
      scene.add(m);
      retMeshes.set(rKey(r), m);
    }
  });
  rebuildCables();
}
function cableCurveFor(c) {
  const lane = (() => {
    const twins = S.cables.filter(x => (x.a === c.a && x.b === c.b) || (x.a === c.b && x.b === c.a));
    const k = twins.indexOf(c);
    return twins.length > 1 ? (k - (twins.length - 1) / 2) * 0.16 : 0;
  })();
  const pts = c.path.map((p, k) => {
    const prev = c.path[k - 1], next = c.path[k + 1];
    const horiz = (prev && prev.j === p.j) || (next && next.j === p.j);
    return new THREE.Vector3(
      tX(p.i) + (horiz ? 0 : lane),
      0.09 + (k > 0 && k < c.path.length - 1 ? 0.03 : 0),
      tZ(p.j) + (horiz ? lane : 0)
    );
  });
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);
}
function rebuildCables() {
  scene.remove(cableGroup);
  cableGroup = new THREE.Group();
  cableCurves.clear();
  S.cables.forEach(c => {
    if (drag && drag.lift && (c.a === drag.ent.id || c.b === drag.ent.id)) return;
    const curve = cableCurveFor(c);
    cableCurves.set(c.id, curve);
    const n = c.path.length - 1;
    const segs = Math.max(8, n * 6);
    if (c.ok) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.055, 8, false), toon(CAB[c.type].color));
      tube.castShadow = true;
      tube.userData.cableId = c.id;
      cableGroup.add(tube);
    } else {
      const fSplit = Math.max(0.02, Math.min(0.98, c.failAt / n));
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
  });
  scene.add(cableGroup);
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
      h -= spec.loss;
      if (h < FAIL) { h = 0; break; }
      if (spec.retime && retAt(path[k].i, path[k].j)) h = 100;
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
      if (o.userData.retKey !== undefined) {
        const [i, j] = o.userData.retKey.split(',').map(Number);
        const r = retAt(i, j);
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
  if (drag) {
    if (!drag.lift && t) {
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 6) { drag.lift = true; drag.moved = true; rebuildCables(); }
    }
    dom.style.cursor = 'grabbing';
    return;
  }
  const th = t && entAt(t.i, t.j);
  const grabbable = th && !th.locked && !CAB[S.tool] && S.tool !== 'delete';
  dom.style.cursor = grabbable ? 'grab' : (S.tool === 'select' ? 'default' : 'crosshair');
});
dom.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  const tile = tileFromPointer(ev);
  const grabbed = tile && entAt(tile.i, tile.j);
  if (grabbed && !grabbed.locked && !CAB[S.tool] && S.tool !== 'delete') {
    drag = { ent: grabbed, moved: false, lift: false, sx: ev.clientX, sy: ev.clientY };
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
    const th = thingFromPointer(ev);
    if (th) removeThing(th);
    return;
  }
  const th = thingFromPointer(ev);
  S.selected = th;
  showInspector(th);
});
dom.addEventListener('pointerup', ev => {
  if (ev.button !== 0 || !drag) return;
  const d = drag; drag = null;
  const tile = tileFromPointer(ev);
  if (d.moved && tile) moveEnt(d.ent, tile.i, tile.j);
  else rebuildCables();
  elasticGroup.clear();
});
window.addEventListener('pointerup', ev => {
  if (ev.button === 0 && drag) { drag = null; rebuildCables(); elasticGroup.clear(); }
});

const NUDGE = {
  arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
};
window.addEventListener('keydown', ev => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (ev.key === 'Escape') { drag = null; S.pendA = null; setTool('select'); rebuildCables(); elasticGroup.clear(); }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.selected) removeThing(S.selected);
  const nudge = NUDGE[ev.key.toLowerCase()];
  if (nudge) {
    let target = (S.selected && S.selected.kind === 'ent') ? S.selected.ent
      : (hoverTile && entAt(hoverTile.i, hoverTile.j));
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
  uplink: ['assets/props4.png', [1530, 1416, 59, 136]], retimer: ['assets/retimer.png']
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
      status = th.ent.online
        ? `<p class="ok">Status: online — pushing ${spec.tput} Tb/s.</p>`
        : `<p class="bad">Status: offline — needs a healthy path to a CPU <i>and</i> to memory (direct or through a PCIe switch).</p>`;
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
function updateHUD() {
  $('mTput').textContent = S.stats.tput.toFixed(1) + ' Tb/s';
  $('mPower').textContent = S.stats.watts + ' W';
  $('levelName').textContent = S.level.title;
  const mode = $('btnMode');
  mode.textContent = S.level.sandbox ? '▶ Start lessons' : 'Sandbox';
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
function showLesson() {
  $('modalBody').innerHTML = S.level.lesson;
  $('modal').classList.add('open');
}
function showBanner() {
  const b = $('banner');
  const yay = ['Sweet!', 'Signal locked!', 'Niiice.', 'Link up!', 'Island online!'];
  b.innerHTML = `<h2>${yay[Math.floor(Math.random() * yay.length)]} ${(S.level.title.split('—')[1] || 'Lesson').trim()} complete!</h2><p>${S.idx + 1 < LEVELS.length ? 'Next lesson in a moment…' : 'You built the whole server!'}</p>`;
  b.classList.add('show');
  $('btnNext').hidden = S.idx + 1 >= LEVELS.length;
  setTimeout(() => b.classList.remove('show'), 3800);
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
    o.disabled = false;
    sel.appendChild(o);
  });
  if (S) sel.value = S.idx;
}
function startLevel(idx) {
  clearTimeout(advanceTimer);
  FX.forEach(p => scene.remove(p.m));
  FX = [];
  entMeshes.forEach(m => scene.remove(m));
  entMeshes.clear();
  retMeshes.forEach(m => scene.remove(m));
  retMeshes.clear();
  drag = null;
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
  controls.update();

  /* smooth entity motion + drag follow */
  S.ents.forEach(e => {
    const m = entMeshes.get(e.id);
    if (!m) return;
    if (drag && drag.lift && e === drag.ent && hoverTile) {
      const target = new THREE.Vector3(hoverTile.x, 0.8, hoverTile.z);
      m.position.lerp(target, Math.min(1, dt * 14));
    } else {
      const target = m.userData.target || new THREE.Vector3(tX(e.i), 0, tZ(e.j));
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

  /* retimer ring pulse */
  retMeshes.forEach(m => {
    const ring = m.userData.ring;
    if (ring) {
      const s = 1 + Math.sin(t * 5) * 0.12;
      ring.scale.setScalar(s);
      ring.material.opacity = 0.45 + Math.sin(t * 5) * 0.25;
    }
  });

  /* dead cable flicker */
  cableGroup.children.forEach(m => {
    if (m.userData.dead) m.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 6)) * 0.6;
  });

  /* hover + ghost */
  if (hoverTile && !drag) {
    hoverRing.visible = true;
    hoverRing.position.set(tX(hoverTile.i), 0.02, tZ(hoverTile.j));
  } else hoverRing.visible = false;
  if (ghost && ghostType && hoverTile && !drag) {
    ghost.visible = true;
    ghost.position.set(tX(hoverTile.i), 0.02, tZ(hoverTile.j));
    const bad = entAt(hoverTile.i, hoverTile.j) || retAt(hoverTile.i, hoverTile.j) ||
      (ghostType === 'retimer' && !S.cables.some(c => CAB[c.type].retime && c.path.some(p => p.i === hoverTile.i && p.j === hoverTile.j)));
    ghost.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(bad ? 0x881111 : 0x0a3a14); });
  } else if (ghost) ghost.visible = false;

  /* selection ring */
  if (S.selected && S.selected.kind === 'ent') {
    const m = entMeshes.get(S.selected.ent.id);
    if (m) {
      selRing.visible = true;
      selRing.position.set(m.position.x, 0.05, m.position.z);
    } else selRing.visible = false;
  } else selRing.visible = false;

  /* pendA highlight via hover ring color */
  hoverRing.material.color.setHex(S.pendA ? 0x57e389 : 0xffffff);

  clouds.forEach(cl => {
    cl.position.x += cl.userData.speed * dt;
    if (cl.position.x > 18) cl.position.x = -18;
  });

  updatePulses(dt, ts);
  updateElastics();
  updateFx(dt);
  renderer.render(scene, camera);
}

/* ---------------- boot ---------------- */
startLevel(0);
resize();
requestAnimationFrame(animate);

/* testing hooks */
window.G3D = {
  get S() { return S; },
  startLevel, tryPlaceEnt, tryPlaceRet, tryCable, moveEnt, removeThing, entAt, retAt,
  LEVELS, CAT, CAB, entMeshes, scene, camera, renderer
};
