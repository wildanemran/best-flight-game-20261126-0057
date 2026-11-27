// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the world. ?shot=1|2|3|4 (with &seed=N) stages that scene instead of running
// the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createWorld, stepWorld } from './world.js';
import { createFlight, stepFlight } from './flight.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_FLAPS, ACTION_GEAR, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createHUD } from './hud.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const status = document.getElementById('status');

const random = createRandom(seed);
const terrain = createTerrain(random);
const world = createWorld(random, terrain);
const flight = createFlight();
const renderer = createRenderer(glCanvas, terrain);
const hud = createHUD(hudCanvas);
const audio = createAudio();

function fitCanvases() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * ratio);
  const height = Math.floor(window.innerHeight * ratio);
  for (const canvas of [glCanvas, hudCanvas]) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }
}

window.addEventListener('resize', fitCanvases);
fitCanvases();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

const TITLE_LINES = [
  'Fly through eleven glowing rings.',
  'Then land on Runway 09.',
  '',
  'W/S pitch   A/D roll   Q/E yaw',
  'Shift/Ctrl throttle   F flaps   G gear',
  'C camera   P pause   R restart',
];
const PAUSE_LINES = ['Paused.', '', 'Press P or Space to continue.'];

function drawScreen(lines, title, subtitle) {
  const ctx = hudCanvas.getContext('2d');
  const s = Math.min(hudCanvas.width / 1280, hudCanvas.height / 480);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, 1280, 480);
  ctx.fillStyle = 'rgba(4, 8, 16, 0.45)';
  ctx.fillRect(0, 0, 1280, 480);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f8ff';
  ctx.font = 'bold 54px monospace';
  ctx.fillText(title, 640, 150);
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(subtitle, 640, 185);
  ctx.fillStyle = '#f2f8ff';
  ctx.font = '16px monospace';
  lines.forEach((line, i) => {
    ctx.fillText(line, 640, 235 + i * 26);
  });
}

function runShot(name) {
  const staged = stageShot(name, world, flight);
  let painted = 0;
  function paint() {
    renderer.draw({ flight, world, camera: staged.camera, time: staged.time, screen: 'play' });
    hud.draw({ flight, world, camera: staged.camera, time: staged.time, screen: 'play', message: staged.message });
    painted += 1;
    if (painted === 2) window.__shotReady = true;
    // Keep the loop running so the compositor keeps presenting this frame.
    // The staged state and time are fixed, so every frame is identical.
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(glCanvas);
  let screen = 'title';
  let camera = 'chase';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let elapsed = 0;
  let message = '';
  let messageUntil = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(text) {
    status.textContent = text;
  }

  function showMessage(text, seconds) {
    message = text;
    messageUntil = elapsed + seconds;
  }

  function startGame() {
    world.reset();
    Object.assign(flight, createFlight());
    camera = 'chase';
    accumulator = 0;
    elapsed = 0;
    screen = 'play';
    audio.ensure();
    announce('Playing. Fly through eleven rings, then land on Runway 09.');
  }

  function endGame() {
    screen = 'over';
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART && screen !== 'title') startGame();
    else if (actions & ACTION_CONFIRM && (screen === 'title' || screen === 'over')) startGame();
    else if (actions & ACTION_PAUSE && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === 'paused') {
      screen = 'play';
      announce('Playing.');
    }
    if (actions & ACTION_CAMERA && screen === 'play') {
      camera = camera === 'chase' ? 'cockpit' : 'chase';
    }
    if (actions & ACTION_FLAPS && screen === 'play') {
      flight.flaps = flight.flaps ? 0 : 1;
      showMessage(flight.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 1.5);
    }
    if (actions & ACTION_GEAR && screen === 'play') {
      flight.gear = flight.gear ? 0 : 1;
      showMessage(flight.gear ? 'GEAR DOWN' : 'GEAR UP', 1.5);
    }
  }

  function step() {
    if (screen === 'title') {
      // Attract mode: the plane flies straight and level; reset when it leaves the world.
      const neutral = { pitch: () => 0, roll: () => 0, yaw: () => 0, throttle: () => 0.7 };
      stepFlight(flight, neutral, terrain, STEP);
      if (flight.pos.x > 1900 || flight.pos.y < 5) Object.assign(flight, createFlight());
      return;
    }
    if (screen !== 'play') return;
    elapsed += STEP;
    const before = world.ringsPassed;
    stepFlight(flight, input, terrain, STEP);
    stepWorld(world, flight, STEP);
    audio.setThrottle(flight.throttle);
    if (world.ringsPassed > before) {
      const gained = world.lastRingPoints || 0;
      audio.ring();
      showMessage(`RING ${world.ringsPassed}  +${gained}`, 2);
      announce(`Ring ${world.ringsPassed} of 11. Score ${world.score}.`);
    }
    if (world.status === 'landed' || world.status === 'crashed') {
      if (world.status === 'landed') audio.touchdown();
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'title' || screen === 'play') {
      while (accumulator >= STEP && (screen === 'title' || screen === 'play')) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const state = { flight, world, camera, time: elapsed, screen, message: elapsed < messageUntil ? message : '' };
    renderer.draw(state);
    hud.draw(state);
    if (screen === 'title') {
      drawScreen(TITLE_LINES, 'CALDERA MERIDIAN', 'Fly eleven rings. Land on Runway 09.');
    } else if (screen === 'paused') {
      drawScreen(PAUSE_LINES, 'PAUSED', 'Press P or Space to continue.');
    } else if (screen === 'over') {
      const lines = [
        `SCORE ${world.score}`,
        world.grade ? `LANDING GRADE ${world.grade}` : '',
        `BEST ${best}`,
        '',
        'Press Space to fly again.',
      ];
      drawScreen(lines, world.status === 'landed' ? 'LANDED' : 'CRASHED', 'Caldera Meridian');
    }
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      announce('Paused.');
    }
  });

  announce('Caldera Meridian. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
