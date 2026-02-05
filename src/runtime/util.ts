export function nowMs() { return performance.now(); }

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function randInt(min: number, maxInclusive: number) {
  const lo = Math.ceil(min);
  const hi = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function randChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const rect = canvas.getBoundingClientRect();
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
