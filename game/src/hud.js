// Vector HUD for Caldera Meridian, drawn on a 2D canvas over the WebGL view.
//
// The layout is the 1280x480 design: score panel top-left, speed tape left,
// altitude tape right, heading compass top-centre, pitch ladder in the
// middle, ILS panel near the runway, minimap bottom-right, and a status bar
// along the bottom. All text is bold monospace with a dark outline; panels
// are dark translucent with a thin cyan border.

import { runwayState } from './runway.js';

const W = 1280;
const H = 480;

const INK = '#eef4fb';
const CYAN = '#2ee6ff';
const GREEN = '#37e08a';
const AMBER = '#ffc44d';
const RED = '#ff3b30';
const DIM = '#9fb2c8';
const PANEL_FILL = 'rgba(6, 12, 22, 0.62)';
const PANEL_EDGE = 'rgba(46, 230, 255, 0.45)';
const OUTLINE = 'rgba(2, 6, 12, 0.85)';
const SEA = '#12303f';
const SAND = '#c8a86a';

const DEG = Math.PI / 180;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapDeg(degrees) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function createHUD(canvas) {
  const ctx = canvas.getContext('2d');
  // One cached minimap base image per terrain object.
  const mapCache = new WeakMap();

  function text(str, x, y, size, color, align = 'left') {
    ctx.font = `bold ${size}px monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, Math.round(size / 7));
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PANEL_FILL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PANEL_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function diamond(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
  }

  function drawScore(world, time) {
    panel(12, 10, 212, 88);
    text(`SKOR ${String(world.score || 0).padStart(6, '0')}`, 24, 36, 19, INK);
    text(formatClock(time), 212, 36, 19, INK, 'right');
    const combo = world.combo || 0;
    text(`KOMBO x${combo}`, 24, 60, 16, combo > 1 ? AMBER : INK);
    const total = world.rings ? world.rings.length : 11;
    text(`RING ${world.ringsPassed || 0}/${total}`, 24, 84, 16, CYAN);
  }

  // A vertical tape: ticks every tickStep, numbers every labelStep, the
  // current value in a box in the middle. An optional marker draws a dashed
  // line at one value (the stall speed on the speed tape).
  function drawTape(x, value, opts) {
    const top = 118;
    const height = 216;
    const centerY = top + height / 2;
    const pxPerUnit = height / (opts.windowHalf * 2);
    panel(x, top, 66, height);
    text(opts.label, x + 33, top - 10, 11, DIM, 'center');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, 66, height);
    ctx.clip();
    const first = Math.ceil((value - opts.windowHalf) / opts.tickStep) * opts.tickStep;
    for (let v = first; v <= value + opts.windowHalf; v += opts.tickStep) {
      const y = centerY - (v - value) * pxPerUnit;
      if (y < top + 4 || y > top + height - 4) continue;
      const isLabel = Math.round(v) % opts.labelStep === 0;
      ctx.strokeStyle = isLabel ? INK : DIM;
      ctx.lineWidth = isLabel ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + (isLabel ? 20 : 14), y);
      ctx.stroke();
      if (isLabel) text(String(Math.round(v)), x + 26, y, 12, INK);
    }
    if (opts.marker !== undefined) {
      const my = centerY - (opts.marker - value) * pxPerUnit;
      if (my >= top && my <= top + height) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, my);
        ctx.lineTo(x + 66, my);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
    // Current value box, centred on the tape.
    ctx.fillStyle = 'rgba(4, 10, 18, 0.85)';
    ctx.fillRect(x - 4, centerY - 16, 74, 32);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 3.5, centerY - 15.5, 73, 31);
    text(String(Math.round(value)), x + 33, centerY + 1, 20, CYAN, 'center');
  }

  function drawCompass(heading) {
    const x0 = 425;
    const w = 430;
    const y = 12;
    const h = 34;
    const centerX = 640;
    const pxPerDeg = w / 80;
    panel(x0, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y, w, h);
    ctx.clip();
    const first = Math.floor((heading - 40) / 5) * 5;
    for (let hd = first; hd <= heading + 40; hd += 5) {
      const d = wrapDeg(hd - heading);
      if (Math.abs(d) > 40) continue;
      const x = centerX + d * pxPerDeg;
      const norm = ((hd % 360) + 360) % 360;
      const isCardinal = norm % 90 === 0;
      const isThirty = norm % 30 === 0;
      const len = isCardinal || isThirty ? 14 : norm % 15 === 0 ? 10 : 6;
      ctx.strokeStyle = isCardinal || isThirty ? INK : DIM;
      ctx.lineWidth = isCardinal || isThirty ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + h - 4);
      ctx.lineTo(x, y + h - 4 - len);
      ctx.stroke();
      if (isCardinal || isThirty) {
        const label =
          norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : pad2(norm / 10);
        text(label, x, y + 10, 12, isCardinal ? AMBER : INK, 'center');
      }
    }
    ctx.restore();
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(centerX - 8, y - 2);
    ctx.lineTo(centerX + 8, y - 2);
    ctx.lineTo(centerX, y + 9);
    ctx.closePath();
    ctx.fill();
    const hdg = Math.round(((heading % 360) + 360) % 360);
    text(`HDG ${pad3(hdg)}`, centerX, y + h + 12, 15, AMBER, 'center');
  }

  function drawLadder(pitch, roll) {
    const cx = 640;
    const cy = 240;
    const pxPerDeg = 2.4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-roll * DEG);
    const rungs = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
    for (const deg of rungs) {
      const y = (pitch - deg) * pxPerDeg;
      if (Math.abs(y) > 210) continue;
      const isHorizon = deg === 0;
      const width = isHorizon ? 170 : 85;
      ctx.strokeStyle = deg >= 0 ? INK : AMBER;
      ctx.lineWidth = isHorizon ? 2.5 : 2;
      ctx.setLineDash(deg < 0 ? [7, 6] : []);
      ctx.beginPath();
      ctx.moveTo(-width / 2, y);
      ctx.lineTo(width / 2, y);
      ctx.stroke();
      if (deg === 20 || deg === -20 || deg === 40 || deg === -40) {
        ctx.setLineDash([]);
        const labelColor = deg > 0 ? INK : AMBER;
        text(String(Math.abs(deg)), -width / 2 - 8, y, 12, labelColor, 'right');
        text(String(Math.abs(deg)), width / 2 + 8, y, 12, labelColor, 'left');
      }
    }
    ctx.restore();
    ctx.setLineDash([]);
    // Fixed aircraft symbol at the centre: two wings and a cyan dot.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(624, 240);
    ctx.lineTo(636, 240);
    ctx.moveTo(644, 240);
    ctx.lineTo(656, 240);
    ctx.stroke();
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(640, 240, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawILS(flight, world) {
    if (!world.runway) return;
    const ils = runwayState(flight, world.runway);
    if (!ils || ils.distToThreshold > 5200) return;
    const x = 12;
    const y = 342;
    const w = 176;
    const h = 98;
    panel(x, y, w, h);
    text('ILS 09', x + 12, y + 16, 15, INK);
    text(`${(ils.distToThreshold / 1000).toFixed(1)} KM`, x + w - 12, y + 16, 15, CYAN, 'right');
    const ccx = x + 58;
    const ccy = y + 56;
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ccx - 26, ccy);
    ctx.lineTo(ccx + 26, ccy);
    ctx.moveTo(ccx, ccy - 24);
    ctx.lineTo(ccx, ccy + 24);
    ctx.stroke();
    // Localizer diamond slides with the centre offset, glideslope diamond
    // with the glide deviation.
    const dx = clamp(ils.centerOffset / 15, -1, 1) * 22;
    const dy = clamp(ils.glideDeviation / 3, -1, 1) * 20;
    diamond(ccx + dx, ccy, 5, GREEN);
    diamond(ccx, ccy + dy, 5, GREEN);
    text('PAPI', x + 12, y + h - 16, 10, DIM);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = ils.papiLights[i] ? '#ffffff' : RED;
      ctx.beginPath();
      ctx.arc(x + w - 14 - (3 - i) * 13, y + h - 16, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMinimap(flight, world) {
    const x = 1098;
    const y = 298;
    const size = 170;
    const scale = size / 4000;
    const mapX = (wx) => x + (wx + 2000) * scale;
    const mapY = (wz) => y + (wz + 2000) * scale;
    const terrain = world.terrain;
    let base = terrain ? mapCache.get(terrain) : null;
    if (terrain && !base) {
      base = document.createElement('canvas');
      base.width = size;
      base.height = size;
      const bctx = base.getContext('2d');
      bctx.fillStyle = SEA;
      bctx.fillRect(0, 0, size, size);
      const cells = 40;
      const step = size / cells;
      bctx.fillStyle = SAND;
      for (let gz = 0; gz < cells; gz++) {
        for (let gx = 0; gx < cells; gx++) {
          const wx = -2000 + (gx + 0.5) * (4000 / cells);
          const wz = -2000 + (gz + 0.5) * (4000 / cells);
          if (terrain.heightAt(wx, wz) > 0.5) {
            bctx.fillRect(gx * step, gz * step, step + 0.5, step + 0.5);
          }
        }
      }
      mapCache.set(terrain, base);
    }
    if (base) {
      ctx.drawImage(base, x, y);
    } else {
      ctx.fillStyle = SEA;
      ctx.fillRect(x, y, size, size);
    }
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    // Runway strip with its 09 label.
    if (world.runway) {
      const rwy = world.runway;
      ctx.strokeStyle = '#f5f2e8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mapX(rwy.threshold.x), mapY(rwy.threshold.z));
      ctx.lineTo(mapX(rwy.end.x), mapY(rwy.end.z));
      ctx.stroke();
      text('09', mapX(rwy.threshold.x) - 4, mapY(rwy.threshold.z) - 9, 10, INK, 'right');
    }
    // Rings: cyan dots, the next one amber with a circle.
    const rings = world.rings || [];
    const next = world.ringsPassed || 0;
    for (let i = 0; i < rings.length; i++) {
      const px = mapX(rings[i].x);
      const py = mapY(rings[i].z);
      if (i === next) {
        ctx.fillStyle = AMBER;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Aircraft arrow, rotated by heading (0 faces north, up on the map).
    if (flight.pos) {
      ctx.save();
      ctx.translate(mapX(flight.pos.x), mapY(flight.pos.z));
      ctx.rotate((flight.heading || 0) * DEG);
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-5, 6);
      ctx.lineTo(5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawStatusBar(flight, camera) {
    const y = 464;
    const vs = flight.verticalSpeed || 0;
    text(`VS ${vs >= 0 ? '+' : ''}${vs.toFixed(1)}`, 12, y, 16, INK);
    text('THR', 118, y, 16, INK);
    const bx = 162;
    const bw = 92;
    const bh = 13;
    ctx.fillStyle = 'rgba(6, 12, 22, 0.62)';
    ctx.fillRect(bx, y - bh / 2, bw, bh);
    ctx.strokeStyle = PANEL_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, y - bh / 2 + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = CYAN;
    ctx.fillRect(bx + 1, y - bh / 2 + 1, (bw - 2) * clamp(flight.throttle || 0, 0, 1), bh - 2);
    text(`${pad3(Math.round((flight.throttle || 0) * 100))}%`, bx + bw + 10, y, 16, CYAN);
    text(flight.gear ? 'GEAR DOWN' : 'GEAR UP', 348, y, 16, flight.gear ? GREEN : INK);
    text(flight.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 478, y, 16, flight.flaps ? GREEN : INK);
    text(camera === 'cockpit' ? 'CAM COCKPIT' : 'CAM CHASE', 620, y, 16, INK);
  }

  function draw(state) {
    const s = Math.min(canvas.width / W, canvas.height / H);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!state || state.screen === 'title') return;
    const flight = state.flight || {};
    const world = state.world || {};
    const time = state.time ?? world.time ?? 0;

    drawScore(world, time);
    drawTape(12, flight.speed || 0, {
      label: 'SPD M/S',
      windowHalf: 30,
      tickStep: 10,
      labelStep: 10,
      marker: flight.flaps ? 22 : 28,
    });
    drawTape(1202, flight.pos ? flight.pos.y : 0, {
      label: 'ALT M',
      windowHalf: 150,
      tickStep: 50,
      labelStep: 100,
    });
    drawCompass(flight.heading || 0);
    drawLadder(flight.pitch || 0, flight.roll || 0);
    drawILS(flight, world);
    drawMinimap(flight, world);
    drawStatusBar(flight, state.camera || 'chase');

    const message = state.message || world.message;
    if (message) text(message, 640, 140, 26, AMBER, 'center');
    if (flight.stalled && Math.floor(time * 3) % 2 === 0) {
      text('STALL', 640, 205, 30, RED, 'center');
    }
  }

  return { draw };
}
