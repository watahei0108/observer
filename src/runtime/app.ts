import { clamp01, nowMs, randInt, resizeCanvasToDisplaySize } from './util';
import { AudioEngine } from './audio';
import { Noise } from './noise';

type Screen = 'MAIN' | 'SITE';

type AppOptions = { canvas: HTMLCanvasElement; ui: HTMLDivElement };

const SITES = [
  {
    id: 'A',
    views: ['views/A/001.png', 'views/A/002.png', 'views/A/003.png', 'views/A/004.png'],
  },
  {
    id: 'B',
    views: ['views/B/001.png', 'views/B/002.png', 'views/B/003.png', 'views/B/004.png'],
  },
  {
    id: 'C',
    views: ['views/C/001.png', 'views/C/002.png', 'views/C/003.png', 'views/C/004.png'],
  },
] as const;

type SiteId = (typeof SITES)[number]['id'];

// If you want 3 views for faster iteration, just comment-out the last 2 lines above.

const LOCK_MS = 2200; // initial lock after each view loads
const TRANSITION_MS = 500; // noise transition duration

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ui: HTMLDivElement;

  private screen: Screen = 'MAIN';
  private images: HTMLImageElement[] = [];
  private loaded = false;

  private viewIndex = 0;
  private siteIndex = 0;
  private lockUntil = 0;
  private isTransitioning = false;

  private raf = 0;

  private noise = new Noise();
  private audio = new AudioEngine();

  private linkEl: HTMLAnchorElement | null = null;
  private linkPhase = Math.random() * Math.PI * 2;

  private charPhases: number[] = [];

  private linkJitterByView = new Map<number, { dx: number; dy: number }>();


  constructor(opts: AppOptions) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.ui = opts.ui;

    window.addEventListener('resize', () => this.render());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  start() {
    this.preload(this.siteIndex).then(() => {
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

  private async preload(siteIndex: number) {
    const site = SITES[siteIndex];
    const imgs = await Promise.all(site.views.map((u) => loadImage(u)));
    this.images = imgs;
  }

  private loop = () => {
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private gotoMain() {
    this.screen = 'MAIN';
    this.isTransitioning = false;
    this.lockUntil = 0;
    this.audio.stopAmbience();

    const gib = makeGibberishLinks(5, 2);
    this.ui.innerHTML = `
      <div class="links">
        ${gib.map((t, i) => `<a href="#" data-go="site" data-i="${i}">${t}</a>`).join('')}
      </div>
      <div class="hint">tap / click</div>
    `;

    this.viewIndex = 0;

    this.ui.querySelectorAll('a[data-go="site"]').forEach((a) => {
      a.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const i = Number((ev.currentTarget as HTMLElement).getAttribute('data-i') ?? '0');
        await this.gotoSite(i);
      });
    });
  }

  private async gotoSite(siteI = 0) {
    this.ensureAudio();

    this.screen = 'SITE';
    this.siteIndex = clampIndex(siteI, SITES.length);

    // ★ここで旧表示を無効化
    this.viewIndex = 0;
    this.images = [];          // ←これが効く
    this.isTransitioning = true; // 任意：黒/ノイズ側に寄せるなら
    this.lockUntil = nowMs() + LOCK_MS;

    this.buildSiteUI();        // 任意：先にUIだけ作る場合

    await this.preload(this.siteIndex);

    this.isTransitioning = false;

    this.audio.startAmbience();
    this.audio.connectNoise(1.0);
    this.audio.tuningChime();
    this.noise.flash(1000);
  }


  private buildSiteUI() {
    this.linkEl = null;
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
      return;
    }
    // ★追加：この viewIndex で既に表示済みなら何もしない
    if (overlay.dataset.shownFor === String(this.viewIndex)) return;
    overlay.dataset.shownFor = String(this.viewIndex);

    const atEnd = (this.viewIndex === this.images.length - 1);
    const text = makeGibberish(18);
    const spans = text
      .split('')
      .map(ch => `<span class="g">${ch}</span>`)
      .join('');

    overlay.innerHTML = `
      <a href="#" id="next" style="
        pointer-events:auto;
        color: rgba(255,255,255,0.75);
        text-decoration:none;
        padding: 6px 10px;
        border-radius: 6px;
      ">${spans}</a>
    `;

    let j = this.linkJitterByView.get(this.viewIndex);
    if (!j) {
      const dx = Math.round((Math.random() * 2 - 1) * 14); // -14..14
      const dy = Math.round((Math.random() * 2 - 1) * 10); // -10..10
      j = { dx, dy };
      this.linkJitterByView.set(this.viewIndex, j);
    }

    overlay.style.alignItems = 'flex-end';
    overlay.style.justifyContent = 'center';
    overlay.style.paddingBottom = `${50 + j.dy}px`;
    overlay.style.transform = `translateX(${j.dx}px)`;

    const next = document.getElementById('next') as HTMLAnchorElement | null;
    if (!next) return;
    this.linkEl = next;

    const chars = this.linkEl.querySelectorAll('.g');
    this.charPhases = Array.from(chars).map(
      () => Math.random() * Math.PI * 2
    );

    next.addEventListener('click', (ev) => {
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
      this.buildSiteUI();
    }, Math.floor(TRANSITION_MS * 0.55));
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

    const img = this.images[this.viewIndex];
    if (!img) {
      // 黒塗り（or ノイズだけ）
      this.ctx.fillRect(0, 0, w, h);
      return;
    }

    drawCover(this.ctx, img, w, h, 1.0);

    // A subtle vignette to feel "looking through"
    drawVignette(this.ctx, w, h);

    // Noise overlay (time-limited flashes)
    const n = this.noise.currentAlpha();
    if (n > 0) {
      // ① ブラックアウト（暗転）
      this.ctx.save();
      // n=1 のとき 0.92 くらいまで暗くする（好みで調整）
      this.ctx.globalAlpha = 0.30 * n;
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();

      // ② ノイズ（今のやつ）
      this.noise.draw(this.ctx, w, h, n);
    }

    if (this.linkEl) {
      const chars = this.linkEl.querySelectorAll<HTMLElement>('.g');

      chars.forEach((el, i) => {
        this.charPhases[i] += 0.015; // ゆっくり

        const dx = Math.sin(this.charPhases[i]) * 5;
        const dy = Math.cos(this.charPhases[i] * 5) * 0.6;

        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      this.linkPhase += 0.05;
      const alpha = 0.78 + Math.sin(this.linkPhase) * 0.07; // 基本 0.78, 揺れ ±0.07
      this.linkEl.style.opacity = String(alpha);
      const glow = 6 + (Math.sin(this.linkPhase) * 3); // 3〜9px
      this.linkEl.style.textShadow = `0 0 ${glow}px rgba(0,0,0,0.0), 0 0 ${glow}px rgba(255,255,255,0.18)`;
    }

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


// リンク生成
function makeGibberishLinks(n: number, kind: number): string[] {
  const out: string[] = [];

  if (kind === 1) {
    for (let i = 0; i < n; i++) out.push(makeGibberish(randInt(10, 22)));
  } else {
    for (let i = 0; i < n; i++) out.push(makeId(5));
  }
  return out;
}

// リンクラベル生成（文字化け）
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

// リンクラベル生成（観測地点ID）
function makeId(len: number): string {
  const chars = '1234567890';
  const pool = (Math.random() < 0.6) ? chars : (chars);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += pool[Math.floor(Math.random() * pool.length)];
  }
  const res = '[' + s + ']';
  return res;
}


