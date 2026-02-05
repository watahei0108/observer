import { clamp01, nowMs, randChoice, randInt, resizeCanvasToDisplaySize } from './util';
import { AudioEngine } from './audio';
import { Noise } from './noise';

type Screen = 'MAIN' | 'SITE';

type AppOptions = { canvas: HTMLCanvasElement; ui: HTMLDivElement };

const VIEW_URLS = [
  '/views/000.jpg',
  '/views/001.jpg',
  '/views/002.jpg',
  '/views/003.jpg',
  '/views/004.jpg',
] as const;

// If you want 3 views for faster iteration, just comment-out the last 2 lines above.

const LOCK_MS = 2200; // initial lock after each view loads
const TRANSITION_MS = 320; // noise transition duration
const UNSTABLE_VIEWS = new Set<number>([2, 4]); // where the "slight abnormality" chime/noise happens

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ui: HTMLDivElement;

  private screen: Screen = 'MAIN';
  private images: HTMLImageElement[] = [];
  private loaded = false;

  private viewIndex = 0;
  private lockUntil = 0;
  private isTransitioning = false;

  private raf = 0;

  private noise = new Noise();
  private audio = new AudioEngine();

  private linkJitterByView = new Map<number, { dx: number; dy: number }>();

  constructor(opts: AppOptions) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.ui = opts.ui;

    window.addEventListener('resize', () => this.render());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', (e) => this.onPointer(e));
  }

  start() {
    this.preload().then(() => {
      this.loaded = true;
      this.gotoMain();
      this.loop();
    }).catch((err) => {
      this.ui.innerHTML = `<div class="overlay">LOAD ERROR</div>`;
      console.error(err);
    });
  }

  ensureAudio() {
    this.audio.ensure();
  }

  private async preload() {
    // preload images
    const imgs = await Promise.all(VIEW_URLS.map((u) => loadImage(u)));
    this.images = imgs;
  }

  private loop = () => {
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private gotoMain() {
    this.screen = 'MAIN';
    this.viewIndex = 0;
    this.isTransitioning = false;
    this.lockUntil = 0;

    const gib = makeGibberishLinks(5);
    this.ui.innerHTML = `
      <div class="links">
        ${gib.map((t, i) => `<a href="#" data-go="site" data-i="${i}">${t}</a>`).join('')}
      </div>
      <div class="hint">tap / click</div>
    `;
    this.ui.querySelectorAll('a[data-go="site"]').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const i = Number((ev.currentTarget as HTMLElement).getAttribute('data-i') ?? '0');
        this.gotoSite(i);
      });
    });
  }

  private gotoSite(startIndex = 0) {
    this.ensureAudio();
    this.audio.startAmbience(); // muffled ambience on entering observer channel
    this.screen = 'SITE';
    this.viewIndex = clampIndex(startIndex, this.images.length);
    this.lockUntil = nowMs() + LOCK_MS;
    this.isTransitioning = false;

    // Entrance "tuning" (a minimal chime)
    this.audio.tuningChime();

    // Optional: a tiny visual glitch on entry
    this.noise.flash(140);

    this.buildSiteUI();
  }

  private buildSiteUI() {
    // UI is hidden until lock ends. After that, show the single gibberish link.
    this.ui.innerHTML = `<div class="overlay" id="overlay"></div>`;
  }

  private showLinkIfUnlocked() {
    if (this.screen !== 'SITE') return;

    const overlay = document.getElementById('overlay') as HTMLDivElement | null;
    if (!overlay) return;

    const locked = nowMs() < this.lockUntil;
    if (locked) {
      overlay.textContent = '';
      overlay.dataset.shownFor = ''; // 解除状態をリセット
      return;
    }

    // ★追加：この viewIndex で既に表示済みなら何もしない
    if (overlay.dataset.shownFor === String(this.viewIndex)) return;
    overlay.dataset.shownFor = String(this.viewIndex);

    const atEnd = (this.viewIndex === this.images.length - 1);
    const text = makeGibberish(18);

    overlay.innerHTML = `<a href="#" id="next" style="
    pointer-events:auto;
    color: rgba(255,255,255,0.66);
    text-decoration:none;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(255,255,255,0.03);
    outline: 1px solid rgba(255,255,255,0.06);
  ">${text}</a>`;

    let j = this.linkJitterByView.get(this.viewIndex);
    if (!j) {
      const dx = Math.round((Math.random() * 2 - 1) * 14); // -14..14
      const dy = Math.round((Math.random() * 2 - 1) * 10); // -10..10
      j = { dx, dy };
      this.linkJitterByView.set(this.viewIndex, j);
    }

    overlay.style.alignItems = 'flex-end';
    overlay.style.justifyContent = 'center';
    overlay.style.paddingBottom = `${18 + j.dy}px`;
    overlay.style.transform = `translateX(${j.dx}px)`;

    const next = document.getElementById('next');
    if (!next) return;

    console.log('log_1'); // ← これ、もう連打されないはず

    next.addEventListener('click', (ev) => {
      console.log('log_2');
      ev.preventDefault();
      if (this.screen !== 'SITE') return;
      if (nowMs() < this.lockUntil) return;

      if (atEnd) {
        this.audio.stopAmbience();
        this.gotoMain();
        return;
      }
      this.nextView();
    });
  }

  private nextView() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const from = this.viewIndex;
    const to = clampIndex(from + 1, this.images.length);

    // Transition: noise -> swap -> noise fade
    this.noise.flash(TRANSITION_MS);
    this.audio.tuningChime();

    window.setTimeout(() => {
      this.viewIndex = to;
      this.lockUntil = nowMs() + LOCK_MS;
      this.isTransitioning = false;

      // "abnormality" only on selected views (one-shot, quiet)
      if (UNSTABLE_VIEWS.has(this.viewIndex)) {
        this.audio.unstableHint();
        this.noise.flash(160);
      }

      this.buildSiteUI();
    }, Math.floor(TRANSITION_MS * 0.55));
  }

  private onPointer(_e: PointerEvent) {
    if (this.screen === 'MAIN') return; // links handle
    if (this.screen !== 'SITE') return;

    // Minimal: tap anywhere after unlock triggers "next"
    if (nowMs() < this.lockUntil) return;
    if (this.viewIndex >= this.images.length - 1) return;
    this.nextView();
  }

  private onKey(e: KeyboardEvent) {
    if (this.screen === 'MAIN') return;

    if (e.key === 'Escape') {
      // Exit to boundary (no going back to previous views)
      this.audio.stopAmbience();
      this.gotoMain();
      return;
    }

    if (this.screen !== 'SITE') return;
    if (nowMs() < this.lockUntil) return;

    // if (e.key === ' ' || e.key === 'Enter') {
    //   if (this.viewIndex >= this.images.length - 1) return;
    //   this.nextView();
    // }
  }

  private render() {
    resizeCanvasToDisplaySize(this.canvas);
    const { width: w, height: h } = this.canvas;

    // Background
    this.ctx.fillStyle = '#050506';
    this.ctx.fillRect(0, 0, w, h);

    if (!this.loaded) {
      this.ctx.fillStyle = 'rgba(255,255,255,0.45)';
      this.ctx.font = '14px ui-monospace, monospace';
      this.ctx.fillText('…', 14, 22);
      return;
    }

    if (this.screen === 'MAIN') {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, w, h);
      return;
    }

    // SITE screen
    const img = this.images[this.viewIndex];
    drawCover(this.ctx, img, w, h, 1.0);

    // A subtle vignette to feel "looking through"
    drawVignette(this.ctx, w, h);

    // Noise overlay (time-limited flashes)
    const n = this.noise.currentAlpha();
    if (n > 0) this.noise.draw(this.ctx, w, h, n);

    this.showLinkIfUnlocked();
  }
}

function clampIndex(i: number, len: number) {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, i));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, alpha = 1) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;

  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.52, Math.min(w, h) * 0.25, w * 0.5, h * 0.52, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function makeGibberishLinks(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(makeGibberish(randInt(10, 22)));
  return out;
}

function makeGibberish(len: number): string {
  const chars = '░▒▓█▚▞▙▟▛▜┼┿╂╋╳╱╲╳⌁⌂⌇⌗⌥⌘⌬⍜⍝⍟⍠⍢⍣⍥⍦⍧⍨⍩';
  const more = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const pool = (Math.random() < 0.6) ? chars : (chars + more);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += pool[Math.floor(Math.random() * pool.length)];
  }
  return s;
}
