import { App } from './runtime/app';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

const app = new App({ canvas, ui });
app.start();

// Helpful on mobile: resume audio on any tap
window.addEventListener('pointerdown', () => app.ensureAudio(), { passive: true });
