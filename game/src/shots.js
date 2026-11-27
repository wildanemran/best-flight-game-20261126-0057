// The four director shots behind ?shot=1|2|3|4. Each one places the aircraft and the
// world at a fixed staged moment (a real state the rules could reach), so the frame is
// what the game really looks like and the same seed always gives the same frame.
// The plane is staged 80 metres before its ring, never on top of it, so the ring reads
// in the frame. Each shot independently shows a chase or cockpit view, recognisable
// terrain, the aircraft, lit instruments, a runway or a ring ahead, and the full HUD.

const SHOTS = {
  1: {
    pos: { x: -1081, y: 360, z: -149 },
    heading: 39, pitch: -5, roll: 30, speed: 65, throttle: 0.8, flaps: 0, gear: 0,
    camera: 'chase', ringsPassed: 1, score: 250, combo: 1, time: 8,
    message: 'RING 1 +250',
  },
  2: {
    pos: { x: 220, y: 165, z: 600 },
    heading: 91, pitch: -8, roll: 0, speed: 60, throttle: 0.7, flaps: 0, gear: 0,
    camera: 'cockpit', ringsPassed: 7, score: 1850, combo: 7, time: 55,
    message: 'RING 7 +300',
  },
  3: {
    pos: { x: 920, y: 48, z: 3 },
    heading: 90, pitch: 2, roll: -3, speed: 36, throttle: 0.5, flaps: 1, gear: 1,
    camera: 'chase', ringsPassed: 11, score: 3200, combo: 11, time: 130,
    message: 'FINAL APPROACH',
  },
  4: {
    pos: { x: 701, y: 180, z: 600 },
    heading: 98, pitch: -5, roll: -10, speed: 70, throttle: 0.9, flaps: 0, gear: 0,
    camera: 'chase', ringsPassed: 9, score: 2500, combo: 9, time: 75,
    message: 'RING 9 +300',
  },
};

export function stageShot(name, world, flight) {
  const shot = SHOTS[name] || SHOTS[1];
  flight.pos.x = shot.pos.x;
  flight.pos.y = shot.pos.y;
  flight.pos.z = shot.pos.z;
  flight.prevPos.x = shot.pos.x;
  flight.prevPos.y = shot.pos.y;
  flight.prevPos.z = shot.pos.z;
  flight.heading = shot.heading;
  flight.pitch = shot.pitch;
  flight.roll = shot.roll;
  flight.speed = shot.speed;
  flight.verticalSpeed = 0;
  flight.throttle = shot.throttle;
  flight.flaps = shot.flaps;
  flight.gear = shot.gear;
  flight.stalled = false;
  flight.onGround = false;
  world.rings.forEach((ring, index) => {
    ring.passed = index < shot.ringsPassed;
  });
  world.ringsPassed = shot.ringsPassed;
  world.combo = shot.combo;
  world.score = shot.score;
  world.time = shot.time;
  world.message = shot.message;
  return { screen: 'play', camera: shot.camera, time: shot.time, message: shot.message };
}
