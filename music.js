/* Procedural lofi hip-hop — Web Audio, no files, no dependencies.
   A jazzy ii–V–I–vi progression through a warm lowpass, boom-bap drums with
   swing, a soft bassline and vinyl crackle. Toggled by a HUD button. */
(function () {
  'use strict';
  const BPM = 74;
  const beat = 60 / BPM;
  const six = beat / 4;              // sixteenth note
  const barDur = beat * 4;
  const swing = six * 0.32;
  const STEPS = 64;                  // 4 bars × 16

  let ctx = null, master = null, warmth = null, noiseBuf = null;
  let playing = false, timer = null, step = 0, nextTime = 0, crackleSrc = null;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  /* ii V I vi in C, jazzy 7ths */
  const CHORDS = [
    [62, 65, 69, 72], // Dm7
    [55, 59, 62, 65], // G7
    [60, 64, 67, 71], // Cmaj7
    [57, 60, 64, 67]  // Am7
  ];
  const ROOTS = [38, 43, 36, 45];    // D2 G2 C2 A2

  function buildGraph() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    warmth = ctx.createBiquadFilter();      // muffled-speaker feel
    warmth.type = 'lowpass'; warmth.frequency.value = 3200; warmth.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
    master.connect(warmth); warmth.connect(comp); comp.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(135, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.33);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
  }
  function snare(t) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1850; bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    n.connect(bp); bp.connect(g); g.connect(master); n.start(t); n.stop(t + 0.19);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 180;
    og.gain.setValueAtTime(0.22, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.14);
  }
  function hat(t, open) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain(); const dur = open ? 0.17 : 0.045;
    g.gain.setValueAtTime(open ? 0.14 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp); hp.connect(g); g.connect(master); n.start(t); n.stop(t + dur + 0.02);
  }
  function bass(midi, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.03);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, 0.15);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function chord(notes, t, dur) {
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 1150; filt.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.35);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.62, 0.4);
    filt.connect(g); g.connect(master);
    notes.forEach(m => {
      const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = mtof(m); o1.detune.value = -6;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m); o2.detune.value = 7;
      o1.connect(filt); o2.connect(filt);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    });
  }
  function startCrackle() {
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = noiseBuf; crackleSrc.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.value = 0.02;
    crackleSrc.connect(hp); hp.connect(g); g.connect(master);
    crackleSrc.start();
  }

  function scheduleStep(st, time) {
    const s = st % 16;
    const bar = Math.floor(st / 16) % 4;
    const tSwing = (s % 2 === 1) ? time + swing : time;
    if (s === 0) { chord(CHORDS[bar], time, barDur); bass(ROOTS[bar], time, beat * 1.5); }
    if (s === 8) bass(ROOTS[bar] + 7, time, beat * 0.8);  // fifth
    if (s === 0 || s === 8) kick(time);
    if (s === 11) kick(time);                              // ghost
    if (s === 4 || s === 12) snare(time);
    if (s % 2 === 0) hat(tSwing, s === 14);
  }
  function scheduler() {
    while (nextTime < ctx.currentTime + 0.2) {
      scheduleStep(step, nextTime);
      nextTime += six;
      step = (step + 1) % STEPS;
    }
    timer = setTimeout(scheduler, 90);
  }

  function play() {
    if (!ctx) { buildGraph(); startCrackle(); }
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.4);
    nextTime = ctx.currentTime + 0.1;
    scheduler();
  }
  function pause() {
    playing = false;
    clearTimeout(timer); timer = null;
    if (master) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
  }

  function makeButton() {
    const btn = document.createElement('button');
    btn.id = 'btnMusic';
    btn.type = 'button';
    btn.title = 'Lofi music';
    btn.textContent = '♪ Lofi';
    btn.setAttribute('aria-label', 'Toggle lofi music');
    btn.onclick = () => {
      if (playing) { pause(); btn.textContent = '♪ Lofi'; btn.classList.remove('on'); }
      else { play(); btn.textContent = '♫ Playing'; btn.classList.add('on'); }
    };
    const host = document.getElementById('hudBtns');
    if (host) host.insertBefore(btn, host.firstChild);
    else document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeButton);
  else makeButton();
})();
