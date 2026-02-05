import { nowMs } from './util';

export class Noise {
  private flashUntil = 0;
  private lastDraw = 0;

  flash(durationMs: number) {
    this.flashUntil = Math.max(this.flashUntil, nowMs() + durationMs);
  }

  currentAlpha() {
    const t = nowMs();
    if (t >= this.flashUntil) return 0;
    const remaining = this.flashUntil - t;
    // stronger at start, fades out
    const a = Math.min(1, remaining / 180);
    return 0.45 * a;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number) {
    // Simple film-grain style noise.
    // Keep light to avoid "effect" feeling.
    const t = nowMs();
    const step = (t - this.lastDraw) < 30 ? 2 : 1;
    this.lastDraw = t;

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Add subtle monochrome noise
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const n = (Math.random() * 2 - 1) * 28 * alpha; // intensity
        d[i] = clamp255(d[i] + n);
        d[i + 1] = clamp255(d[i + 1] + n);
        d[i + 2] = clamp255(d[i + 2] + n);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // faint scanline feel
    ctx.save();
    ctx.globalAlpha = 0.10 * alpha;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, v));
}
