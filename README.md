# Data Center Tycoon — Connectivity Edition

A browser game that teaches how data moves inside a data center — and why **connectivity chips** (retimers, active cables, optics) exist.

**Play it: https://unique-name27.github.io/Data-Center-Game/** — or just open `index.html` in any browser. No build step, no dependencies, no server required.

The original **Data Center Builder** (baseboards, CPU/GPU/memory wiring, economy mode) is still playable at [classic.html](https://unique-name27.github.io/Data-Center-Game/classic.html).

## What it teaches

The campaign starts where connectivity starts — **PCIe inside the server** — then zooms out. A GPU is online only when it can reach a CPU *and* memory through healthy links (the CPU has just 4 ports, so switches matter):

| Level | Scale | What you build and learn |
|---|---|---|
| 1 — First light | Inside the server | GPU + CPU + DIMM over PCIe traces; the reach-CPU-and-memory rule |
| 2 — The long trace | Inside the server | Signal integrity: a far riser GPU dies on bare copper; **retimer chips** rescue it |
| 3 — Fan out | Inside the server | The CPU runs out of ports; a **PCIe switch** turns one port into eight |
| 4 — The memory wall | Inside the server | No ports left for DIMMs; a **CXL memory controller** fans out a memory bank |
| 5 — AEC or AOC? | Inside the server | Cabled PCIe: **AEC** (retimed copper) vs **AOC** (optical) under a power cap, plus a NIC to the outside |
| 6 — Fill the rack | The rack | 6 servers to the ToR under 11 W: DAC, loose retimers, AEC — with AOC as the tempting trap |
| 7 — Connect the row | The row | Leaf switches, 2:1 oversubscribed spine uplinks, DAC/AEC/optical under 30 W |
| Sandbox | The data center | The whole floor: rows, spine pods, DCI gateway, multimode vs single-mode fiber |

The core teaching visual: data pulses travel along every cable and **visibly fade** as copper attenuates them. Below 30% health the link dies — unless a retimer chip on the route regenerates the signal back to 100%. Click anything for a plain-English explanation with a real-world note.

## Controls

- Pick a tool in the left palette (or press `1`–`9`), then click the floor
- Cables: click a device, then click a second device
- Move: with the Move / inspect tool, drag any device to a new spot — its cables re-route automatically
- `Esc` cancels · `Del` removes the selection · Remove tool refunds 50%
- Move / inspect tool: click any device or cable to see its status and explanation

## Tech

- Single `index.html` + `style.css` + `game.js` — vanilla JavaScript, canvas 2D
- Pixel-art rendering: every sprite is drawn procedurally in code; there are no image assets
- Level progress is saved in `localStorage`

## History

The original game, **Data Center Builder** (Phaser, part-wiring with baseboards and an economy mode), lives on at `classic.html`. Earlier prototypes are preserved in this repo's git history.
