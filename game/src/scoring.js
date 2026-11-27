// Scoring: ring precision with a combo multiplier, a time bonus for a fast sortie,
// and a landing grade from the touchdown itself.

export const RING_BULLSEYE = 500;
export const RING_GOOD = 250;
export const RING_EDGE = 100;
export const COMBO_STEP = 0.1;
export const BONUS_LIMIT = 240;
export const BONUS_PER_SECOND = 10;
export const BONUS_CAP = 1200;
export const LANDING_BASE = 1200;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(value) {
  const n = finite(value);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function scoreRingPass(precision, combo) {
  const p = clamp01(precision);
  const base = p > 0.85 ? RING_BULLSEYE : p > 0.5 ? RING_GOOD : RING_EDGE;
  const streak = Math.max(0, finite(combo));
  return Math.round(base * (1 + streak * COMBO_STEP));
}

export function timeBonus(seconds) {
  const s = Math.max(0, finite(seconds));
  if (s >= BONUS_LIMIT) return 0;
  return Math.min(BONUS_CAP, Math.round((BONUS_LIMIT - s) * BONUS_PER_SECOND));
}

export function landingGrade(touchdown) {
  const data = touchdown || {};
  const verticalSpeed = Math.abs(finite(data.verticalSpeed));
  const gearDown = !!data.gearDown;
  const centerOffset = Math.abs(finite(data.centerOffset));
  const stopDistance = Math.max(0, finite(data.stopDistance));
  const runwayLength = Math.max(1, finite(data.runwayLength) || 600);
  const remaining = runwayLength - stopDistance;
  const notes = [];
  let points = LANDING_BASE;

  if (verticalSpeed <= 1.2) {
    points += 400;
    notes.push('TOUCHDOWN LEMBUT');
  } else if (verticalSpeed <= 2.5) {
    points += 250;
    notes.push('TOUCHDOWN HALUS');
  } else if (verticalSpeed <= 4.5) {
    points += 80;
    notes.push('TOUCHDOWN KERAS');
  } else {
    points -= 250;
    notes.push('TOUCHDOWN KASAR');
  }

  if (gearDown) {
    points += 200;
    notes.push('GEAR TURUN');
  } else {
    points -= 600;
    notes.push('GEAR TIDAK TURUN');
  }

  if (centerOffset <= 2) {
    points += 300;
    notes.push('GARIS TENGAH');
  } else if (centerOffset <= 7) {
    points += 140;
    notes.push('DEKAT GARIS TENGAH');
  } else if (centerOffset <= 13) {
    points -= 80;
    notes.push('OFF CENTER');
  } else {
    points -= 250;
    notes.push('KELUAR GARIS TENGAH');
  }

  if (remaining >= 150) {
    points += 200;
    notes.push('BERHENTI AMAN');
  } else if (remaining >= 60) {
    points += 80;
    notes.push('MARGIN RUNWAY TIPIS');
  } else if (remaining >= 0) {
    points -= 150;
    notes.push('HAMPIR OVERRUN');
  } else {
    points -= 700;
    notes.push('OVERRUN');
  }

  let grade = 'C';
  if (points >= 2050 && gearDown && verticalSpeed <= 2.5 && centerOffset <= 7 && remaining >= 60) {
    grade = 'S';
  } else if (points >= 1650 && gearDown && remaining >= 60) {
    grade = 'A';
  } else if (points >= 1250) {
    grade = 'B';
  }

  return { grade, points: Math.max(0, Math.round(points)), notes };
}
