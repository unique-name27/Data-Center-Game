# Data Center Tycoon — Connectivity Edition

A browser game that teaches how data moves inside a data center — and why **connectivity chips** (retimers, active cables, optics) exist.

**Play it: https://unique-name27.github.io/Data-Center-Game/** — or just open `index.html` in any browser. No build step, no dependencies, no server required.

The original **Data Center Builder** (baseboards, CPU/GPU/memory wiring, economy mode) is still playable at [classic.html](https://unique-name27.github.io/Data-Center-Game/classic.html).

## What it teaches

Three detailed levels, one per scale — the same signal physics applies at every one:

| Level | Scale | What you build and learn |
|---|---|---|
| 1 — Build a server | Inside the server | CPU, DIMMs (memory channels), 4 GPUs on PCIe traces; signal integrity and **retimer chips** rescue a far riser GPU |
| 2 — Fill the rack | The rack | 6 servers up to the ToR switch under a power cap: DAC for short hops, loose retimers mid-rack, an AEC (retimers built into the cable) for the bottom U |
| 3 — Connect the row | The row | Place leaf switches, uplink 5 racks, reach the spine at 2:1 oversubscription; DAC vs AEC vs optical under a 30 W power budget |
| Sandbox | The data center | The whole floor: rows, spine pods, DCI gateway, multimode vs single-mode fiber, dual-homing experiments |

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
