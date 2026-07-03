# Data Center Tycoon — Connectivity Edition

A browser game that teaches how data moves inside a data center — and why **connectivity chips** (retimers, active cables, optics) exist.

**Play it: https://unique-name27.github.io/Data-Center-Game/** — or just open `index.html` in any browser. No build step, no dependencies, no server required.

The original **Data Center Builder** (baseboards, CPU/GPU/memory wiring, economy mode) is still playable at [classic.html](https://unique-name27.github.io/Data-Center-Game/classic.html).

## What it teaches

The game zooms out through three scales — the same signal physics applies at every one:

| Level | Scale | Concept |
|---|---|---|
| 1 — First light | Inside the server | GPUs, the CPU root complex, memory, PCIe traces |
| 2 — The long trace | Inside the server | Signal integrity: copper degrades with distance; **retimer chips** regenerate the signal |
| 3 — Top of rack | The rack | Servers, ToR switches, and why the switch lives at the top |
| 4 — The bottom U | The rack | Loose retimers vs an AEC — a retimed cable is the same chip, productized |
| 5 — Down the row | The row | DAC vs AEC vs optical: cost, power, and reach |
| 6 — Scale out | The row | Leaf-spine fabrics, uplinks, and 2:1 oversubscription |
| Sandbox | The row | Free build with live throughput and power metrics |

The core teaching visual: data pulses travel along every cable and **visibly fade** as copper attenuates them. Below 30% health the link dies — unless a retimer chip on the route regenerates the signal back to 100%. Click anything for a plain-English explanation with a real-world note.

## Controls

- Pick a tool in the left palette (or press `1`–`9`), then click the floor
- Cables: click a device, then click a second device
- `Esc` cancels · `Del` removes the selection · Remove tool refunds 50%
- Inspect tool: click any device or cable to see its status and explanation

## Tech

- Single `index.html` + `style.css` + `game.js` — vanilla JavaScript, canvas 2D
- Pixel-art rendering: every sprite is drawn procedurally in code; there are no image assets
- Level progress is saved in `localStorage`

## History

The original game, **Data Center Builder** (Phaser, part-wiring with baseboards and an economy mode), lives on at `classic.html`. Earlier prototypes are preserved in this repo's git history.
