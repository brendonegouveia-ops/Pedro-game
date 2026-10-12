// Synthesized WebAudio SFX. Nothing is loaded from disk.
// iOS: the AudioContext must be created/resumed inside a user gesture, so unlock() is called
// from the Start button's tap handler.
type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = true;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') void ctx.resume();
    // A silent one-sample buffer fully unlocks output on older iOS.
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
    applyGain();
  } catch {
    /* audio is optional */
  }
}

export function setMuted(m: boolean) {
  muted = m;
  applyGain();
}
export function isMuted() {
  return muted;
}
export function suspendAudio() {
  if (ctx && ctx.state === 'running') void ctx.suspend();
}
export function resumeAudio() {
  if (ctx && ctx.state !== 'running') void ctx.resume();
}

function applyGain() {
  if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.55, ctx.currentTime);
}

function env(g: GainNode, t: number, a: number, peak: number, hold: number, rel: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}

function osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode = master!) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, 0.008, peak, dur * 0.4, dur * 0.6);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 1) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.005, peak, dur * 0.3, dur * 0.7);
  s.connect(f).connect(g).connect(master!);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
  return { s, f, g };
}

function formant(freq: number, q: number) {
  const f = ctx!.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(master!);
  return f;
}

export function play(name: string) {
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'tap':
      osc('sine', 900, 700, t, 0.05, 0.25);
      break;
    case 'pop':
      osc('sine', 520, 980, t, 0.08, 0.3);
      break;
    case 'good':
      osc('triangle', 660, 660, t, 0.09, 0.3);
      osc('triangle', 990, 990, t + 0.08, 0.14, 0.3);
      break;
    case 'bad':
      osc('square', 190, 120, t, 0.18, 0.12);
      break;
    case 'ding':
      osc('sine', 1320, 1320, t, 0.12, 0.25);
      osc('sine', 1760, 1760, t + 0.1, 0.2, 0.2);
      break;
    case 'ring':
      for (let i = 0; i < 4; i++) {
        osc('sine', 440, 440, t + i * 0.09, 0.07, 0.15);
        osc('sine', 480, 480, t + i * 0.09, 0.07, 0.15);
      }
      break;
    case 'whoosh': {
      const n = noiseBurst(t, 0.4, 0.4, 'bandpass', 400, 2);
      n.f.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
      break;
    }
    case 'groan': {
      // Three voices sliding down through an "uhh" formant.
      const f = formant(650, 1.4);
      const f2 = formant(1100, 2);
      for (const [a, b, d] of [
        [230, 150, 0],
        [175, 115, 0.05],
        [300, 210, 0.1],
      ]) {
        const o = osc('sawtooth', a, b, t + d, 1.1, 0.22, f);
        o.connect(f2);
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 5 + Math.random() * 2;
        lg.gain.value = 6;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + 1.3);
      }
      break;
    }
    case 'alarm':
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 3; i++) {
          const s = t + r * 0.9 + i * 0.25;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.value = 3100;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.linearRampToValueAtTime(0.12, s + 0.005);
          g.gain.setValueAtTime(0.12, s + 0.16);
          g.gain.linearRampToValueAtTime(0.0001, s + 0.17);
          o.connect(g).connect(master);
          o.start(s);
          o.stop(s + 0.2);
        }
      break;
    case 'cry': {
      // "Waah": rising then falling with a wobble.
      const f = formant(1200, 1.2);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(480, t);
      o.frequency.linearRampToValueAtTime(720, t + 0.25);
      o.frequency.linearRampToValueAtTime(430, t + 0.9);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = 25;
      lfo.connect(lg).connect(o.frequency);
      env(g, t, 0.05, 0.5, 0.5, 0.35);
      o.connect(g).connect(f);
      o.start(t);
      lfo.start(t);
      o.stop(t + 1);
      lfo.stop(t + 1);
      break;
    }
    case 'sizzle':
      for (let i = 0; i < 6; i++) noiseBurst(t + i * 0.08 + Math.random() * 0.05, 0.12, 0.12, 'highpass', 4000 + Math.random() * 2000);
      noiseBurst(t, 0.8, 0.08, 'highpass', 5000);
      break;
    case 'bark':
      for (const d of [0, 0.2]) {
        noiseBurst(t + d, 0.1, 0.35, 'bandpass', 900, 1.5);
        const f = formant(1000, 1);
        osc('sawtooth', 420, 170, t + d, 0.12, 0.5, f);
      }
      break;
  }
}
