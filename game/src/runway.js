// Runway 09 and its landmarks: the strip, its markings, the four PAPI lights, the ATC
// tower, the lighthouse at the peninsula tip, and the river canyon bridge. The runway
// sits on a flattened peninsula at 15 metres; the terrain module guarantees that height.

import { RUNWAY } from './config.js';

export function buildRunway() {
  return {
    threshold: { x: RUNWAY.thresholdX, y: 12, z: RUNWAY.thresholdZ },
    end: { x: RUNWAY.thresholdX + RUNWAY.length, y: 12, z: RUNWAY.thresholdZ },
    length: RUNWAY.length,
    width: RUNWAY.width,
    heading: RUNWAY.heading,
    numbers: '09',
    // Four PAPI lights on the left of the threshold, one per glide angle.
    papi: {
      x: RUNWAY.thresholdX + 50,
      z: RUNWAY.thresholdZ - RUNWAY.width / 2 - 15,
      spacing: 8,
      angles: [2.5, 2.8, 3.2, 3.5],
    },
    atc: { x: RUNWAY.thresholdX + 200, y: 12, z: RUNWAY.thresholdZ - 150, height: 45 },
    lighthouse: { x: RUNWAY.thresholdX + RUNWAY.length + 100, y: 12, z: RUNWAY.thresholdZ, height: 35 },
    bridge: { x: 300, y: 80, z: 600, span: 100, height: 85 },
  };
}

export function runwayState(flight, runway) {
  const dx = flight.pos.x - runway.threshold.x;
  const dz = flight.pos.z - runway.threshold.z;
  const h = (runway.heading * Math.PI) / 180;

  // Along the runway (positive east, past the threshold) and across it (positive south).
  const along = dx * Math.sin(h) - dz * Math.cos(h);
  const across = dx * Math.cos(h) + dz * Math.sin(h);
  const distToThreshold = Math.sqrt(dx * dx + dz * dz);

  // Glide angle to the threshold; overhead or past it reads as steep.
  const altitude = flight.pos.y - runway.threshold.y;
  const glideAngle = along < 0
    ? (Math.atan2(altitude, -along) * 180) / Math.PI
    : 90;
  const glideDeviation = glideAngle - 3;

  // A PAPI light is white when the aircraft is above its angle, red when below.
  const papiLights = runway.papi.angles.map((angle) => glideAngle > angle);

  return {
    distToThreshold,
    centerOffset: across,
    glideDeviation,
    glideAngle,
    alongRunway: along,
    papiLights,
    onRunway: Math.abs(across) < runway.width / 2 && along >= 0 && along < runway.length,
  };
}
