# Data Center Tycoon — Connectivity Edition

A browser game that teaches how data actually moves inside a data center — and why **connectivity chips** (retimers, active cables, optics) exist. Built for teaching: every part explains itself in plain English with a real-world note.

## ▶ Play now

| Edition | Link |
|---|---|
| **✨ 3D island edition** (recommended) | **https://unique-name27.github.io/Data-Center-Game/3d.html** |
| 2D edition | **https://unique-name27.github.io/Data-Center-Game/** |
| Classic prototype (Data Center Builder) | https://unique-name27.github.io/Data-Center-Game/classic.html |

No install, no accounts, no build step — it runs in any modern browser. The 3D edition loads [Three.js](https://threejs.org/) from a CDN, so it needs an internet connection; the 2D edition is fully offline.

## What it teaches

One rule runs the whole game: **a chip only works when it can reach what it needs through healthy links.** A GPU needs a CPU *and* memory; a server needs the network. The catch is physics — signals fade over distance, ports run out, and the moment you leave a circuit board every link is a real, fallible cable. That's the entire reason the connectivity-chip industry exists, and you feel it firsthand:

- **Signal integrity** — data pulses travel each cable and **visibly fade** as copper attenuates them. Below 30% the link dies.
- **Retimer chips** — drop one on a copper run and it regenerates the signal back to 100%. (This is the chip category the game is really about.)
- **AEC vs AOC** — active *electrical* cables (retimed copper: cheap, cool, short) vs active *optical* cables (light: long reach, more power, more cost, and they fail more often).
- **Ports are a budget** — a CPU has only 4 ports, so you need a **PCIe switch** to fan out and a **CXL memory controller** to attach more memory than you have slots.
- **You can't etch a trace across water** — the link out of a server to the rack must be a real cable (AEC/AOC), never a board trace.
- **Capacity & congestion** — a busy server outgrows a single cable; overloaded links glow red until you bundle more or move to a fatter optic.
- **Redundancy** — dual-home a server to two paths and a single failure can't take it down.

## The 3D island edition — modes

Each little island is a piece of the system; zoom out and connect them across a cozy toon-shaded sea. Pick any level from the dropdown.

| Mode | What you do |
|---|---|
| **Lesson 1 — Inside the server** | Wire GPUs + memory to the CPU with PCIe traces; rescue a stranded riser GPU with **retimer chips**. |
| **Lesson 2 — Build the full server** | Beat the CPU's 4-port limit with a **PCIe switch** + **CXL controller**, then cable a **NIC** out to the rack (AEC/AOC only). |
| **Lesson 3 — Connect the islands** | Every island is a whole server — string AEC/AOC cables to the core switch, discovering that copper can't reach the far islands and only optics can. |
| **Sandbox — Inside a server** | Free build at chip scale: drop CPUs, GPUs, switches, controllers and cables. |
| **Sandbox — Data hall** | Drop your own **server islands** and **core switches**, wire them, and watch **congestion coloring** (green → amber → red) reveal overloaded links. |
| **Survival — Keep it alive** | A pre-built rack whose links fail over time (optics fail more than copper). **Click a broken link to dispatch an engineer boat** to repair it. Score is live **uptime %** — build redundancy to survive. |

Two operator upgrades you can toggle on:

- **📊 Unified software suite** — fleet telemetry watches the fabric: signals hold up over **longer runs** (more reach), links **fail less often**, and engineers **repair faster**.
- **🔬 Interop lab** — everything interoperates better: **more reach**, **more capacity per cable** (less congestion), and **steadier links** still. Stacks with the suite.

Extras: a **🌙 Space / ☀ Day** button swaps the sky for a starfield with shooting stars, and a **♪ Lofi** button plays procedurally-generated lofi hip-hop (both off until you click; the music is synthesized in code, no files).

## How to play

- **Place a part** — pick a tool in the left palette (or press `1`–`9`), then click the board / island.
- **Run a cable** — click one device, then click a second device.
- **Move a part** — drag it, or hover/select it and use the **arrow keys / WASD**. Cables re-route automatically.
- **Inspect** — click any device or cable to read what it is and its live status.
- **Remove** — the Remove tool, or `Del` on a selection. `Esc` cancels.
- **3D camera** — right-drag to orbit, scroll to zoom. Switching between the server scale and the data-hall scale animates a smooth zoom; in the sandboxes you can **keep scrolling past the zoom limit** to glide out to the data hall (or back down into a server).
- **Survival** — click a red (downed) link to send an engineer to fix it.

## Tech

- Vanilla JavaScript, no framework. The 2D edition is one `index.html` + `style.css` + `game.js` on a 2D canvas; the 3D edition is `3d.html` + `game3d.js` using Three.js (via CDN import map) + shared `music.js`.
- **Everything is generated in code** — pixel-art sprites, 3D toon meshes, the lofi soundtrack. The only image assets are the original hand-made component sprites in `assets/`.
- Level progress and preferences are saved in `localStorage`.

## Run locally

Clone the repo and open `index.html` (2D) or `3d.html` (3D) in a browser. For the 3D edition, serve over `http://` (e.g. `python -m http.server`) so the module + CDN imports load cleanly, and stay online for the Three.js CDN.

## History

The original **Data Center Builder** (Phaser, part-wiring with baseboards and an economy mode) lives on at `classic.html`. Earlier prototypes are preserved in this repo's git history and the archived `*.zip` files.
