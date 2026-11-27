// Every tuning number, colour and key binding in one place. The world is a fixed
// 4000 by 4000 metre archipelago; the renderer scales to the window, so no rule
// below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = {
  size: 4000,
  half: 2000,
  waterLevel: 0,
  grid: 128,
};

export const PLANE = {
  cruiseSpeed: 60,
  maxSpeed: 95,
  stallClean: 28,
  stallFlaps: 22,
  gravity: 9.8,
  thrustMax: 85,
  rollRate: 1.8,
  pitchRate: 1.2,
  yawRate: 0.6,
  groundHeight: 2.5,
};

export const RING = {
  count: 11,
  radius: 26,
  bullseye: 0.85,
  pointsBullseye: 500,
  pointsGood: 250,
  pointsEdge: 100,
};

export const RUNWAY = {
  heading: 90,
  thresholdX: 1200,
  thresholdZ: 0,
  length: 600,
  width: 30,
};

export const SCORE = {
  timeBonusSeconds: 240,
  timeBonusPoints: 1000,
};

export const PALETTE = {
  skyTop: '#2b3a5e',
  skyHorizon: '#ff9a3c',
  sun: '#ffd27a',
  seaDeep: '#1d4e5f',
  seaGlint: '#e8933c',
  sand: '#e8c88a',
  rock: '#6b4a3a',
  vegetation: '#4a6b3a',
  ring: '#29e6ff',
  asphalt: '#3a3f46',
  marking: '#f5f2e8',
  papiRed: '#ff2a2a',
  papiWhite: '#ffffff',
  hud: '#eef1f5',
  hudDim: '#9aa5b5',
  panel: '#141a24',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const KEYS = {
  pitchUp: ['KeyW', 'ArrowUp'],
  pitchDown: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight'],
  throttleDown: ['ControlLeft', 'ControlRight'],
  flaps: ['KeyF'],
  gear: ['KeyG'],
  camera: ['KeyC'],
  restart: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Space', 'Enter'],
};

export const BEST_KEY = 'caldera-meridian.best';
