// World state: the rings, the score, the combo, and the win and lose conditions.
// stepWorld watches the flight and calls the score when a ring is passed, a landing
// is made, or the flight ends. The terrain and runway are held on the world so the
// step function needs only (world, flight, dt).

import { buildRingCourse, ringPassed } from './rings.js';
import { buildRunway, runwayState } from './runway.js';
import { landingGrade, scoreRingPass, timeBonus } from './scoring.js';
import { EVENT_CRASH, EVENT_TOUCHDOWN } from './flight.js';

export const STATUS_FLYING = 'flying';
export const STATUS_LANDED = 'landed';
export const STATUS_CRASHED = 'crashed';
export const STATUS_OVER = 'over';

export function createWorld(random, terrain) {
  const world = {
    rings: buildRingCourse(),
    runway: buildRunway(),
    terrain,
    score: 0,
    combo: 0,
    ringsPassed: 0,
    lastRingPoints: 0,
    status: STATUS_FLYING,
    grade: null,
    message: '',
    time: 0,
    landed: false,
    landingData: null,
    reset() {
      world.rings = buildRingCourse();
      world.score = 0;
      world.combo = 0;
      world.ringsPassed = 0;
      world.lastRingPoints = 0;
      world.status = STATUS_FLYING;
      world.grade = null;
      world.message = '';
      world.time = 0;
      world.landed = false;
      world.landingData = null;
    },
  };
  return world;
}

export function stepWorld(world, flight, dt) {
  if (world.status !== STATUS_FLYING) return;

  // Rings: a plane crossing a ring plane inside its radius scores.
  for (let i = 0; i < world.rings.length; i += 1) {
    const ring = world.rings[i];
    if (ring.passed) continue;
    const precision = ringPassed(ring, flight.prevPos, flight.pos);
    if (precision === null) continue;
    ring.passed = true;
    world.ringsPassed += 1;
    world.combo += 1;
    const points = scoreRingPass(precision, world.combo);
    world.score += points;
    world.lastRingPoints = points;
    const quality = precision > 0.85 ? 'BULLSEYE' : precision > 0.5 ? 'BAGUS' : 'TEPAT';
    world.message = `RING ${i + 1} ${quality} +${points}`;
    if (world.ringsPassed >= world.rings.length) {
      world.message = 'SEMUA RING! MENUJU RUNWAY';
    }
  }

  // Ground contact is reported by the flight model.
  const event = flight.lastEvent || 0;
  if (event & EVENT_CRASH) {
    world.status = STATUS_CRASHED;
    const ground = world.terrain.heightAt(flight.pos.x, flight.pos.z);
    if (ground < -0.4) world.message = 'CRASH: WATER';
    else if (!flight.gear && flight.pos.y <= world.runway.threshold.y + 5) world.message = 'CRASH: GEAR UP';
    else world.message = 'CRASH: TERRAIN';
    return;
  }
  if (event & EVENT_TOUCHDOWN) {
    const rwy = runwayState(flight, world.runway);
    if (!rwy.onRunway) {
      world.status = STATUS_CRASHED;
      world.message = 'CRASH: OFF RUNWAY';
      return;
    }
    if (!flight.gear) {
      world.status = STATUS_CRASHED;
      world.grade = 'C';
      world.message = 'CRASH: GEAR UP';
      return;
    }
    const touchdown = {
      verticalSpeed: Math.abs(flight.lastImpact || 0),
      centerOffset: Math.abs(rwy.centerOffset),
      gearDown: !!flight.gear,
      stopDistance: rwy.alongRunway,
      runwayLength: world.runway.length,
    };
    const result = landingGrade(touchdown);
    world.grade = result.grade;
    world.landingData = touchdown;
    if (rwy.alongRunway > world.runway.length - 50 && flight.speed > 20) {
      world.status = STATUS_OVER;
      world.message = 'OVERRUN';
      return;
    }
    world.score += result.points;
    world.status = STATUS_LANDED;
    world.landed = true;
    const bonus = timeBonus(world.time);
    if (bonus > 0) {
      world.score += bonus;
      world.message = `LANDING ${result.grade}  TIME +${bonus}`;
    } else {
      world.message = `LANDING ${result.grade}`;
    }
    return;
  }

  world.time += dt;
}
