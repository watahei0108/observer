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

  connectNoise(duration = 1.0) {
    this.ensure();
    if (!this.ctx || !this.master) return;

    const { ctx, master } = this.audio;

    const bufferSize = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.0;

    noise.connect(gain).connect(master);

    const t = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.12, t + 0.03);
    gain.gain.linearRampToValueAtTime(0.0, t + duration);

    noise.start(t);
    noise.stop(t + duration);
  }

  startAmbience() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    if (this.ambienceOn) return;
    this.ambienceOn = true;

    const { ctx, master } = this.audio;

    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    this.ambienceGain = gain;

    // ローパス（耳を塞がれた感じ）
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.7;

    // ブラウンノイズ（空気感）
    const noise = createBrownNoise(ctx);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;

    // 低いハム音
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 58;
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

    // 停止用に保持
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
      try { hum?.stop(); } catch { }
      try { noise?.stop(); } catch { }
      try { g.disconnect(); } catch { }
    }, 320);

    this.ambienceGain = null;
    this.ambienceOn = false;
  }

  // Minimal "tuning" chime (pitch changes, volume stays tiny)
  tuningChime() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const { ctx, master } = this.audio;

    // ノイズ生成（200msくらいにすると自然）
    const bufferSize = Math.floor(ctx.sampleRate * 0.2); // 200ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true; // ★これが本命

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.05; // 0.3だと結構強いかも（好みで）

    noise.connect(noiseGain).connect(master);

    const t = ctx.currentTime;
    noise.start(t);
    noise.stop(t + 0.1); // 0.1秒で止める
  }

  // Even subtler "abnormality hint" (slightly detuned, shorter)
  unstableHint() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const { ctx, master } = this.audio;

    // ノイズ生成
    const bufferSize = ctx.sampleRate * 0.05; // 50ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // ゲイン
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3; // かなり小さくてOK

    noise.connect(noiseGain).connect(master);

    noise.start();
    noise.stop(ctx.currentTime + 0.12);
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
