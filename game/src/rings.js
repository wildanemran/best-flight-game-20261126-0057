// The eleven glowing rings: a winding course from the open sea west, around the caldera
// rim, down the river canyon past the bridge, and into the Runway 09 approach corridor.
// Each ring's heading is computed from the course itself, so the ring plane is always
// perpendicular to the direction of travel. Heading is degrees clockwise from north:
// 0 is north (negative z), 90 is east (positive x).

import { RING } from './config.js';

const WAYPOINTS = [
  { x: -1200, y: 380, z: 0 },
  { x: -1000, y: 360, z: -250 },
  { x: -750, y: 560, z: -550 },
  { x: -500, y: 620, z: -850 },
  { x: -200, y: 600, z: -800 },
  { x: 100, y: 380, z: -400 },
  { x: -300, y: 300, z: 590 },
  { x: 300, y: 165, z: 600 },
  { x: 550, y: 155, z: 580 },
  { x: 850, y: 180, z: 620 },
  { x: 1000, y: 120, z: 300 },
];

function headingToward(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return (Math.atan2(dx, -dz) * 180) / Math.PI;
}

// Each ring faces the direction the plane is flying when it reaches the ring: the
// incoming direction, from the previous waypoint (or from the start for ring 1).
// A ring facing the outgoing direction would look edge-on to the approaching plane.
export function buildRingCourse() {
  const start = { x: -1500, y: 400, z: 0 };
  return WAYPOINTS.map((point, index) => {
    const prev = index === 0 ? start : WAYPOINTS[index - 1];
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      heading: headingToward(prev, point),
      radius: RING.radius,
      passed: false,
    };
  });
}

export function ringPassed(ring, prevPos, pos) {
  // The ring plane's normal points along the course heading.
  const rad = (ring.heading * Math.PI) / 180;
  const nx = Math.sin(rad);
  const nz = -Math.cos(rad);

  const dx = pos.x - ring.x;
  const dy = pos.y - ring.y;
  const dz = pos.z - ring.z;
  const distToPlane = dx * nx + dz * nz;

  const prevDx = prevPos.x - ring.x;
  const prevDz = prevPos.z - ring.z;
  const prevDist = prevDx * nx + prevDz * nz;

  // No sign change means the plane has not crossed the ring plane yet.
  if (distToPlane * prevDist > 0) return null;

  // Distance from the ring centre inside the plane.
  const perpX = dx - distToPlane * nx;
  const perpZ = dz - distToPlane * nz;
  const distInPlane = Math.sqrt(perpX * perpX + dy * dy + perpZ * perpZ);

  if (distInPlane > ring.radius) return null;

  // Precision: 1 is dead centre, 0 is the rim.
  return Math.max(0, 1 - distInPlane / ring.radius);
}
