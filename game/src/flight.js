// Simple lift and drag flight model. Heading, pitch and roll are degrees: heading 0 faces
// north (negative z), 90 faces east (positive x). Input signs follow input.js: pitch() +1
// pulls the nose up, roll() +1 banks right, yaw() +1 turns right. The model is deterministic:
// the same inputs and terrain always give the same flight.

export const EVENT_NONE = 0;
export const EVENT_CRASH = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_LIFTOFF = 4;

export const FLIGHT_TUNING = Object.freeze({
  gravity: 9.8,
  cruiseSpeed: 60,
  maxSpeed: 95,
  stallClean: 28,
  stallFlaps: 22,
  thrustMax: 7,
  dragK: 0.00135,
  flapDrag: 2.4,
  gearDrag: 1.6,
  brakeDrag: 3.2,
  liftK: 9.8 / (60 * 60),
  flapLift: 1.35,
  aoaGain: 3.2,
  pitchRate: 42,
  rollRate: 70,
  yawRate: 16,
  pitchCenter: 0.35,
  rollCenter: 1.2,
  maxPitch: 60,
  maxRoll: 80,
  gearHeight: 1.2,
  bellyHeight: 0.35,
  crashImpact: 7.5,
  maxLandingRoll: 35,
  cliffSlope: 0.85,
  stallLiftFactor: 0.45,
  stallControlFactor: 0.4,
});

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function wrapHeading(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function slopeNear(terrain, x, z) {
  const d = 8;
  const h = terrain.heightAt(x, z);
  const dx = Math.max(
    Math.abs(terrain.heightAt(x + d, z) - h),
    Math.abs(terrain.heightAt(x - d, z) - h)
  );
  const dz = Math.max(
    Math.abs(terrain.heightAt(x, z + d) - h),
    Math.abs(terrain.heightAt(x, z - d) - h)
  );
  return Math.max(dx, dz) / d;
}

export function createFlight() {
  return {
    pos: { x: -1500, y: 400, z: 0 },
    prevPos: { x: -1500, y: 400, z: 0 },
    heading: 90,
    pitch: 0,
    roll: 0,
    speed: 60,
    verticalSpeed: 0,
    throttle: 0.7,
    flaps: 0,
    gear: 0,
    stalled: false,
    onGround: false,
    surfaceHeight: 0,
    lastImpact: 0,
    lastEvent: EVENT_NONE,
  };
}

export function stepFlight(flight, input, terrain, dt) {
  const t = FLIGHT_TUNING;

  flight.prevPos.x = flight.pos.x;
  flight.prevPos.y = flight.pos.y;
  flight.prevPos.z = flight.pos.z;

  const pitchInput = clamp(input.pitch(), -1, 1);
  const rollInput = clamp(input.roll(), -1, 1);
  const yawInput = clamp(input.yaw(), -1, 1);
  flight.throttle = clamp(input.throttle(), 0, 1);

  const stallSpeed = flight.flaps ? t.stallFlaps : t.stallClean;
  flight.stalled = !flight.onGround && flight.speed < stallSpeed;
  const control = flight.stalled ? t.stallControlFactor : 1;

  // pitch() +1 pulls the nose up, so pitch grows with positive input.
  flight.pitch = clamp(
    flight.pitch + pitchInput * t.pitchRate * dt * control - flight.pitch * t.pitchCenter * dt,
    -t.maxPitch,
    t.maxPitch
  );
  flight.roll = clamp(
    flight.roll + rollInput * t.rollRate * dt * control - flight.roll * t.rollCenter * dt,
    -t.maxRoll,
    t.maxRoll
  );

  const gamma = Math.asin(clamp(flight.verticalSpeed / Math.max(flight.speed, 20), -1, 1));
  const aoa = clamp((flight.pitch * DEG - gamma) * t.aoaGain, -0.65, 1.05);
  let lift = t.liftK * flight.speed * flight.speed * (1 + aoa) * (flight.flaps ? t.flapLift : 1);
  if (flight.stalled) lift *= t.stallLiftFactor;
  lift *= Math.cos(flight.roll * DEG);

  const drag =
    t.dragK * flight.speed * flight.speed +
    flight.flaps * t.flapDrag +
    flight.gear * t.gearDrag +
    (flight.onGround ? t.brakeDrag : 0) +
    Math.max(0, flight.verticalSpeed) * 0.08;
  const thrust = flight.throttle * t.thrustMax;
  flight.speed = clamp(flight.speed + (thrust - drag) * dt, 0, t.maxSpeed);

  const turnRate = clamp(
    (t.gravity * Math.tan(flight.roll * DEG) / Math.max(flight.speed, 20)) * RAD,
    -70,
    70
  );
  flight.heading = wrapHeading(
    flight.heading + (turnRate + yawInput * t.yawRate) * dt * control
  );

  const h = flight.heading * DEG;
  flight.pos.x += Math.sin(h) * flight.speed * dt;
  flight.pos.z -= Math.cos(h) * flight.speed * dt;

  const rawGround = terrain.heightAt(flight.pos.x, flight.pos.z);
  const clearance = flight.gear ? t.gearHeight : t.bellyHeight;
  const surface = Math.max(0, rawGround) + clearance;
  flight.surfaceHeight = Math.max(0, rawGround);

  let event = EVENT_NONE;

  if (flight.onGround) {
    if (lift > t.gravity + 0.3 && flight.speed > stallSpeed * 1.08) {
      flight.onGround = false;
      flight.verticalSpeed = 1.5;
      event |= EVENT_LIFTOFF;
    } else {
      flight.verticalSpeed = 0;
      flight.pos.y = surface;
    }
  }

  if (!flight.onGround) {
    flight.verticalSpeed += (lift - t.gravity - flight.verticalSpeed * 0.35) * dt;
    flight.pos.y += flight.verticalSpeed * dt;

    if (flight.pos.y <= surface) {
      const impact = -flight.verticalSpeed;
      flight.lastImpact = impact;
      flight.pos.y = surface;
      flight.verticalSpeed = 0;
      flight.onGround = true;

      const sea = rawGround < -0.4;
      const cliff = slopeNear(terrain, flight.pos.x, flight.pos.z) > t.cliffSlope;
      if (sea || cliff || impact > t.crashImpact || Math.abs(flight.roll) > t.maxLandingRoll) {
        event |= EVENT_CRASH;
      } else {
        event |= EVENT_TOUCHDOWN;
      }
    }
  }

  flight.lastEvent = event;
  return event;
}
