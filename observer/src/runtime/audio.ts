import { randFloat } from './util';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ambienceGain: GainNode | null = null;
  private ambienceOn = false;

  ensure() {
    if (this.ctx) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22; // global low volume
    this.master.connect(this.ctx.destination);
  }

  private get audio() {
    if (!this.ctx || !this.master) throw new Error('Audio not initialized');
    return { ctx: this.ctx, master: this.master };
  }

  startAmbience() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (this.ambienceOn) return;
    this.ambienceOn = true;

    const { ctx, master } = this.audio;

    // Procedural "muffled room" ambience:
    // - brown-ish noise (very low)
    // - subtle 60Hz-ish hum
    // - lowpass filter to feel "ears covered"
    const gain = ctx.createGain();
    gain.gain.value = 0.0; // fade in
    this.ambienceGain = gain;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900; // muffled
    lp.Q.value = 0.7;

    // Noise
    const noise = createBrownNoise(ctx);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;

    // Hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 58 + randFloat(-1.2, 1.2);
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;

    noise.connect(noiseGain).connect(lp);
    hum.connect(humGain).connect(lp);
    lp.connect(gain).connect(master);

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 1.1);

    hum.start();
    noise.start();

    // store for stop
    (gain as any).__hum = hum;
    (gain as any).__noise = noise;
    (gain as any).__lp = lp;
  }

  stopAmbience() {
    if (!this.ctx || !this.ambienceGain) {
      this.ambienceOn = false;
      return;
    }
    const { ctx } = this.audio;
    const g = this.ambienceGain;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0, t + 0.25);

    const hum: OscillatorNode | undefined = (g as any).__hum;
    const noise: AudioBufferSourceNode | undefined = (g as any).__noise;

    window.setTimeout(() => {
      try { hum?.stop(); } catch {}
      try { noise?.stop(); } catch {}
      try { g.disconnect(); } catch {}
    }, 320);

    this.ambienceGain = null;
    this.ambienceOn = false;
  }

  // Minimal "tuning" chime (pitch changes, volume stays tiny)
  tuningChime() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const { ctx, master } = this.audio;

    const o = ctx.createOscillator();
    o.type = 'sine';

    // Keep it non-musical: narrow random range, with jitter
    const base = randFloat(540, 740);
    o.frequency.value = base;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = base;
    bp.Q.value = 9;

    const g = ctx.createGain();
    g.gain.value = 0.0;

    o.connect(bp).connect(g).connect(master);

    const t = ctx.currentTime;
    // very quiet envelope
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.015);
    g.gain.linearRampToValueAtTime(0.0, t + 0.12);

    o.start(t);
    o.stop(t + 0.14);
  }

  // Even subtler "abnormality hint" (slightly detuned, shorter)
  unstableHint() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const { ctx, master } = this.audio;

    const o = ctx.createOscillator();
    o.type = 'triangle';

    const base = randFloat(860, 980);
    const detune = randFloat(-12, 12);
    o.frequency.value = base;
    o.detune.value = detune;

    const g = ctx.createGain();
    g.gain.value = 0;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;

    o.connect(lp).connect(g).connect(master);

    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.linearRampToValueAtTime(0.0, t + 0.07);

    o.start(t);
    o.stop(t + 0.09);
  }
}

function createBrownNoise(ctx: AudioContext) {
  // Brown noise by integrating white noise
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}
