# Data-Center-Game

https://unique-name27.github.io/Data-Center-Game/

How to Play

Build working data-center systems by placing parts, wiring them together, and earning throughput (and optional money).

Goal

Create complete systems on a baseboard.
A system counts when at least one GPU on that baseboard can reach both a CPU and Memory through valid (green) wires. Each such GPU = 1 u/s throughput.

Controls

Move parts: drag with the mouse.

Buy parts: click an icon in the bottom shop row.

Connect wires: click [Connect], then click two things to wire them (part ↔ part, or part ↔ baseboard port). Click [Connect] again to exit.

Delete: click [Delete], then click near a wire (or click a retimer) to delete.

Reset: clears the board.

Resize: the play area auto-resizes with your window.

Parts & What They Do

Baseboard – The “motherboard” for a system. It has ports around the edges (CPU, GPU, Memory, Switch, Networking, Mem-Expander).

CPU – Connects to GPU/Memory/Networking/Switch/Mem-Expander. Max 4 total connections.

GPU – Produces throughput when it can reach CPU and Memory on the same baseboard.

Memory – Required for throughput.

Switch – Multi-port hub; useful for branching. (Max 8 GPU connections.)

Networking – Connects systems together (optional flavor for networks).

Memory Expander – Lets you fan out memory; up to 8 memory connections.

Retimer – Not a node you wire to. Drag it onto an existing wire to extend range and boost that wire’s allowed length.

Wiring Rules (and Colors)

What can connect?

GPU ↔ CPU/Switch

Memory ↔ CPU/Switch/Memory-Expander

Memory-Expander ↔ CPU/Switch

Networking ↔ CPU/Networking/Switch

CPU ↔ GPU/Memory/Mem-Expander/Networking/Switch

Baseboard ports: When wiring to a baseboard, you connect to its ports (they’re typed). The game auto-picks the nearest compatible port.

Distance: Wires have a maximum length. If a wire is too long, add a retimer onto that wire to extend its allowed length.

Colors:

Green — valid and working (both endpoints are in the same baseboard system).

Gray — valid but not working (e.g., spans different baseboards or doesn’t complete a path).

Red — invalid (type mismatch, exceeds length, or connection limits).

Connection limits: enforced per part (e.g., CPU 4 max; Switch GPU fan-out up to 8; Mem-Expander up to 8 memories).

Throughput (and Optional Money)

Throughput: Each GPU that can reach a CPU and Memory on the same baseboard contributes 1 u/s. The total shows at the top.

Economy (Challenge Mode): Toggle Economy: ON at the top.

Parts cost money (shown as “Money: $…”).

Money is earned automatically from throughput (plus a tiny idle trickle).

Shop icons dim if you can’t afford them.

Toggles & Themes

Economy: OFF by default (free build). Turn ON for a money challenge.

Backplane: When ON, ports on the same baseboard have a virtual internal link to help internal routing.

Theme: Space / Grid / Plain.

Shooting Stars: Cosmetic effect for the Space theme (can be turned ON/OFF).

Quick Start

Buy/Place a Baseboard, CPU, Memory, and GPU.

Click [Connect], wire GPU ↔ CPU, and CPU ↔ Memory (or use a Switch if you want to branch).

Keep wires green (short enough, compatible types, same baseboard).

Add a Retimer by dragging it onto a wire if a segment goes red from distance.

Watch Throughput climb. Turn Economy ON if you want to earn/spend money.

Tips

Place parts near the baseboard you intend to use; wires only “work” (green) when both endpoints belong to the same baseboard system.

If a wire turns red, either move parts closer or drop a retimer onto that wire.

Use Switches to fan out to many GPUs from a CPU without exceeding CPU’s connection cap.

Memory-Expanders are great for feeding lots of Memory while keeping rules valid.

Troubleshooting

“I can’t buy parts.” If Economy = ON, you might be out of money. Build a small working system to generate income.

“My wires won’t turn green.” Check type compatibility, keep within distance (use retimers), and make sure both endpoints are attached to the same baseboard (ports matter).

“Retimer doesn’t do anything.” Make sure you drop it on an existing wire (it snaps to the line and extends its allowable length).

“Stuff looks cut off at the bottom.” The shop auto-positions above the bottom border; if your window is very short, try making it taller—the game view resizes dynamically.

Happy building!
