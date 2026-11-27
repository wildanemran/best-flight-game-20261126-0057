// The vector HUD, drawn on a 2D canvas over the WebGL canvas: score and time, speed
// and altitude tapes, a compass, a pitch ladder, a simple ILS for Runway 09 with PAPI
// lights, a minimap, and a throttle/gear/flaps status bar. Angles here are the flight
// model's degrees: heading 0 is north, 90 is east, pitch positive is nose up.

import { runwayState } from './runway.js';

const HUD_W = 1280;
const HUD_H = 480;
const INK = '#f2f8ff';
const CYAN = '#29e6ff';
const GREEN = '#7dff9e';
const AMBER = '#ffd27a';
const RED = '#ff4136';
const PANEL = 'rgba(5,9,16,0.62)';
const SEA = 'rgba(29,78,95,0.6)';
const SAND = 'rgba(232,200,138,0.55)';

export function createHUD(canvas) {
  const ctx = canvas.getContext('2d');
  const cache = { terrain: null, coast: null };
  return { draw(state) { drawFrame(ctx, state, cache); } };
}

function drawFrame(ctx, state, cache) {
  const s = Math.min(ctx.canvas.width / HUD_W, ctx.canvas.height / HUD_H);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, HUD_W, HUD_H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if ((state.screen || 'play') === 'title') return;
  const f = state.flight || { pos: { x: 0, y: 0, z: 0 }, heading: 0, pitch: 0, roll: 0, speed: 0, verticalSpeed: 0, throttle: 0, flaps: 0, gear: 0, stalled: false };
  const world = state.world || {};
  drawScorePanel(ctx, world);
  drawTape(ctx, 12, f.speed, 'SPD M/S', 60, 5, 10);
  drawTape(ctx, HUD_W - 90, f.pos.y, 'ALT M', 300, 20, 50);
  drawStallMark(ctx, f);
  drawCompass(ctx, f);
  drawPitchLadder(ctx, f);
  drawILS(ctx, f, world);
  drawMinimap(ctx, world, f, cache);
  drawStatusPanel(ctx, f, state);
  drawCenterMessage(ctx, state, world);
  if (f.stalled && Math.floor((state.time || 0) * 3) % 2 === 0) drawText(ctx, 'STALL', 640, 96, 30, RED, 'center', 5);
}

function drawText(ctx, text, x, y, size, color, align, stroke) {
  ctx.font = 'bold ' + size + 'px monospace';
  ctx.textAlign = align || 'left';
  ctx.lineWidth = stroke || 3;
  ctx.strokeStyle = 'rgba(2,6,10,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(41,230,255,0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function formatTime(t) {
  const s = Math.max(0, Math.floor(t || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function headingDegrees(f) {
  const h = Number(f.heading) || 0;
  return ((h % 360) + 360) % 360;
}

function drawScorePanel(ctx, world) {
  panel(ctx, 12, 10, 246, 96);
  drawText(ctx, 'SKOR ' + String(Math.round(world.score || 0)).padStart(6, '0'), 24, 38, 20, INK);
  drawText(ctx, formatTime(world.time), 246, 38, 18, INK, 'right');
  drawText(ctx, 'KOMBO x' + (world.combo || 0), 24, 62, 15, (world.combo || 0) > 1 ? AMBER : INK, 'left', 2);
  drawText(ctx, 'RING ' + (world.ringsPassed || 0) + '/11', 24, 86, 15, CYAN, 'left', 2);
}

function drawTape(ctx, x, value, name, span, tick, labelStep) {
  value = Number(value) || 0;
  const w = 78;
  const y = 118;
  const h = 170;
  const px = h / span;
  const lo = value - span / 2;
  panel(ctx, x, y, w, h);
  drawText(ctx, name, x + w / 2, y - 8, 14, INK, 'center', 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  ctx.lineWidth = 2;
  for (let v = Math.ceil(lo / tick) * tick; v <= lo + span; v += tick) {
    const yy = y + h - (v - lo) * px;
    if (yy < y + 6 || yy > y + h - 6) continue;
    ctx.strokeStyle = 'rgba(242,248,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(x + w - 12, yy);
    ctx.lineTo(x + w - 3, yy);
    ctx.stroke();
    if (v % labelStep === 0) drawText(ctx, String(v), x + w - 16, yy + 5, 13, INK, 'right', 2);
  }
  ctx.restore();
  ctx.fillStyle = PANEL;
  ctx.fillRect(x + 4, y + h / 2 - 18, w - 8, 36);
  ctx.strokeStyle = CYAN;
  ctx.strokeRect(x + 4, y + h / 2 - 18, w - 8, 36);
  drawText(ctx, String(Math.round(value)), x + w / 2, y + h / 2 + 8, 22, CYAN, 'center');
}

function drawStallMark(ctx, f) {
  const yy = 288 - (28 - ((Number(f.speed) || 0) - 30)) * (170 / 60);
  if (yy < 120 || yy > 286) return;
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(15, yy);
  ctx.lineTo(87, yy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCompass(ctx, f) {
  const cx = 640;
  const y = 12;
  const w = 430;
  const h = 40;
  const hdg = headingDegrees(f);
  panel(ctx, cx - w / 2, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2 + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let a = Math.ceil((hdg - 45) / 5) * 5; a <= hdg + 45; a += 5) {
    const xx = cx + (a - hdg) * ((w - 10) / 90);
    const norm = ((a % 360) + 360) % 360;
    const big = norm % 30 === 0;
    ctx.strokeStyle = 'rgba(242,248,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xx, y + h - 4);
    ctx.lineTo(xx, y + h - (big ? 16 : 9));
    ctx.stroke();
    if (big) drawText(ctx, names[norm] || String(Math.round(norm / 10)).padStart(2, '0'), xx, y + h - 20, 13, INK, 'center', 2);
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 6, y);
  ctx.lineTo(cx + 6, y);
  ctx.lineTo(cx, y + 7);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, 'HDG ' + String(Math.round(hdg)).padStart(3, '0'), cx, y + h + 18, 15, AMBER, 'center');
}

function drawPitchLadder(ctx, f) {
  const cx = 640;
  const cy = 250;
  const px = 5.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 250, cy - 140, 500, 290);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-(f.roll || 0) * Math.PI / 180);
  ctx.translate(0, (f.pitch || 0) * px);
  ctx.strokeStyle = 'rgba(242,248,255,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-170, 0);
  ctx.lineTo(-40, 0);
  ctx.moveTo(40, 0);
  ctx.lineTo(170, 0);
  ctx.stroke();
  for (let a = -40; a <= 40; a += 10) {
    if (a === 0) continue;
    const yy = -a * px;
    const up = a > 0;
    ctx.setLineDash(up ? [] : [9, 7]);
    ctx.strokeStyle = up ? 'rgba(242,248,255,0.9)' : 'rgba(255,210,122,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-85, yy);
    ctx.lineTo(-30, yy);
    ctx.moveTo(30, yy);
    ctx.lineTo(85, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    if (Math.abs(a) % 20 === 0) drawText(ctx, String(Math.abs(a)), -92, yy + 5, 13, up ? INK : AMBER, 'right', 2);
  }
  ctx.restore();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 46, cy);
  ctx.lineTo(cx - 14, cy);
  ctx.lineTo(cx - 14, cy + 8);
  ctx.moveTo(cx + 46, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.lineTo(cx + 14, cy + 8);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawILS(ctx, f, world) {
  if (!world.runway) return;
  const ils = runwayState(f, world.runway);
  if (!ils) return;
  const dist = ils.distanceToThreshold;
  if (dist === null || dist === undefined || dist > 5200) return;
  const off = ils.centerOffset || 0;
  const dev = ils.glideDeviation || 0;
  const cx = 640;
  const top = 306;
  panel(ctx, cx - 82, top, 164, 80);
  drawText(ctx, 'ILS 09', cx - 74, top + 20, 14, GREEN, 'left', 2);
  drawText(ctx, (dist / 1000).toFixed(1) + 'KM', cx + 74, top + 20, 14, INK, 'right', 2);
  ctx.strokeStyle = 'rgba(125,255,158,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 66, top + 42);
  ctx.lineTo(cx + 66, top + 42);
  ctx.moveTo(cx, top + 26);
  ctx.lineTo(cx, top + 62);
  ctx.stroke();
  drawDiamond(ctx, cx + clamp(off / 60, -1, 1) * 60, top + 42);
  drawDiamond(ctx, cx, top + 42 + clamp(dev / 1.4, -1, 1) * 20);
  if (Array.isArray(ils.papiLights)) {
    for (let i = 0; i < 4 && i < ils.papiLights.length; i++) {
      ctx.fillStyle = ils.papiLights[i] ? '#ffffff' : RED;
      ctx.beginPath();
      ctx.arc(cx - 24 + i * 16, top + 72, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDiamond(ctx, x, y) {
  ctx.fillStyle = GREEN;
  ctx.strokeStyle = 'rgba(2,6,10,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x - 7, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawMinimap(ctx, world, f, cache) {
  const size = 170;
  const x = HUD_W - 14 - size;
  const y = HUD_H - 14 - size;
  panel(ctx, x, y, size, size);
  ctx.fillStyle = SEA;
  ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  const t = world.terrain;
  if (t && typeof t.heightAt === 'function') {
    if (cache.terrain !== t) {
      cache.terrain = t;
      cache.coast = buildCoastGrid(t);
    }
    const n = cache.coast.length;
    const cell = (size - 4) / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = cache.coast[i][j] ? SAND : SEA;
        ctx.fillRect(x + 2 + i * cell, y + 2 + j * cell, cell + 0.6, cell + 0.6);
      }
    }
  }
  const toX = (wx) => x + 2 + ((wx + 2000) / 4000) * (size - 4);
  const toY = (wz) => y + 2 + ((wz + 2000) / 4000) * (size - 4);
  const r0 = toX(1200);
  const r1 = toX(1800);
  const rz = toY(-15);
  ctx.fillStyle = INK;
  ctx.fillRect(r0, rz, r1 - r0, Math.max(3, toY(15) - rz));
  drawText(ctx, '09', (r0 + r1) / 2, rz - 4, 13, INK, 'center', 2);
  const rings = world.rings || [];
  for (let i = 0; i < rings.length; i++) {
    const px = toX(rings[i].x);
    const py = toY(rings[i].z);
    const next = i === (world.ringsPassed || 0);
    ctx.fillStyle = next ? AMBER : CYAN;
    ctx.beginPath();
    ctx.arc(px, py, next ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (next) {
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(toX(f.pos.x), toY(f.pos.z));
  ctx.rotate((f.heading || 0) * Math.PI / 180 - Math.PI / 2);
  ctx.fillStyle = AMBER;
  ctx.strokeStyle = 'rgba(2,6,10,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, 6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function buildCoastGrid(terrain) {
  const n = 40;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      row.push(terrain.heightAt(-2000 + ((i + 0.5) * 4000) / n, -2000 + ((j + 0.5) * 4000) / n) > 0.5);
    }
    rows.push(row);
  }
  return rows;
}

function drawStatusPanel(ctx, f, state) {
  const y = 470;
  drawText(ctx, 'VS ' + (f.verticalSpeed >= 0 ? '+' : '') + (f.verticalSpeed || 0).toFixed(1), 14, 356, 14, INK, 'left', 2);
  drawText(ctx, 'THR', 14, y, 14, INK, 'left', 2);
  ctx.fillStyle = 'rgba(242,248,255,0.22)';
  ctx.fillRect(52, y - 13, 110, 15);
  ctx.fillStyle = CYAN;
  ctx.fillRect(52, y - 13, 110 * clamp(f.throttle, 0, 1), 15);
  ctx.strokeStyle = 'rgba(242,248,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, y - 13, 110, 15);
  drawText(ctx, String(Math.round(clamp(f.throttle, 0, 1) * 100)).padStart(3, '0') + '%', 172, y, 14, INK, 'left', 2);
  drawText(ctx, 'GEAR ' + (f.gear > 0.5 ? 'DOWN' : 'UP'), 240, y, 14, f.gear > 0.5 ? GREEN : INK, 'left', 2);
  drawText(ctx, 'FLAPS ' + (f.flaps > 0.5 ? 'DOWN' : 'UP'), 360, y, 14, f.flaps > 0.5 ? AMBER : INK, 'left', 2);
  drawText(ctx, 'CAM ' + (state.camera === 'cockpit' ? 'COCKPIT' : 'CHASE'), 500, y, 14, INK, 'left', 2);
}

function drawCenterMessage(ctx, state, world) {
  const msg = state.message || world.message;
  if (!msg) return;
  ctx.globalAlpha = 1;
  drawText(ctx, String(msg), 640, 138, 26, AMBER, 'center');
}
