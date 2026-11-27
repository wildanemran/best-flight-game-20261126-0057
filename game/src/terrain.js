// Procedural volcanic archipelago: a heightfield over 4000 by 4000 metres, built once
// from a seed. Three islands (a caldera volcano north-west, a river canyon island,
// a runway peninsula east), sandy coasts, terraced cliffs, a crater bowl, and a flat
// runway plateau at 12 metres. heightAt is bilinear, so the flight model and the
// renderer agree on the ground exactly.

const GRID = 128;
const SIZE = 4000;
const HALF = SIZE * 0.5;
const STEP = SIZE / (GRID - 1);
const WATER_LEVEL = 0;
const RUNWAY_Y = 12;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function createNoise2D(random) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function hash(ix, iz) {
    return perm[(perm[ix & 255] + (iz & 255)) & 255] / 255;
  }

  function valueNoise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  return function sampleNoise(x, z) {
    let sum = 0;
    let amp = 0.55;
    let freq = 1;
    for (let o = 0; o < 4; o++) {
      sum += (valueNoise(x * freq, z * freq) * 2 - 1) * amp;
      freq *= 2.05;
      amp *= 0.48;
    }
    return sum;
  };
}

function gauss(dx, dz, rx, rz) {
  const u = dx / rx;
  const v = dz / rz;
  return Math.exp(-(u * u + v * v));
}

function computeTerrainHeight(x, z, sampleNoise, jitter) {
  const nBroad = sampleNoise(x * 0.0014 + jitter.ox, z * 0.0014 + jitter.oz);
  const nDetail = sampleNoise(x * 0.0052 - jitter.oz, z * 0.0052 + jitter.ox);
  let h = -26;

  // Island 1: caldera volcano north-west around (-400, -900), peak about 520 m.
  const cdx = x + 400;
  const cdz = z + 900;
  const cr = Math.hypot(cdx, cdz);
  const calderaBase = 555 * Math.exp(-(cr * cr) / (560 * 560));
  const rimBump = 75 * Math.exp(-Math.pow((cr - 190) / 85, 2));
  const craterCut = 275 * Math.exp(-(cr * cr) / (155 * 155));
  const calderaAngle = Math.atan2(cdz, cdx);
  const rimRidge = 22 * Math.sin(calderaAngle * 3 + jitter.phase) * Math.exp(-Math.pow((cr - 190) / 110, 2));
  const calderaIsland = calderaBase + rimBump + rimRidge - craterCut;
  const calderaShoulder = 170 * gauss(x + 860, z + 650, 320, 260);

  // Island 2: river canyon island around z = 600, bridge at x = 300.
  const canyonMass =
    310 * gauss(x - 240, z - 600, 660, 440) +
    230 * gauss(x - 160, z - 360, 460, 220) +
    245 * gauss(x - 360, z - 840, 480, 230);
  const riverCenterZ = 600 + 68 * Math.sin((x - 300) * 0.0048);
  const canyonLongMask = smoothstep(-340, -120, x) * (1 - smoothstep(760, 960, x));
  const distRiver = Math.abs(z - riverCenterZ);
  const canyonCarve = (1 - smoothstep(55, 185, distRiver)) * canyonLongMask;

  // Island 3: eastern peninsula for Runway 09 (x = 1200..1800, z = 0).
  const penin = 46 * gauss(x - 1500, z, 540, 320) + 135 * gauss(x - 1120, z + 300, 260, 220);

  // Small reef isle west-south as a silhouette at the start.
  const westIsle = 185 * gauss(x + 1040, z - 520, 250, 210);

  h += calderaIsland + calderaShoulder + canyonMass + penin + westIsle;

  // Broad and fine detail, plus terraced cliffs on mid to high slopes.
  const landMask = smoothstep(-8, 35, h);
  h += (nBroad * 52 + nDetail * 14) * landMask;
  if (h > 30 && h < 420) {
    const stepH = 58;
    const phase = (h % stepH) / stepH;
    const terrace = (smoothstep(0.18, 0.82, phase) - phase) * 14;
    h += terrace * smoothstep(30, 90, h) * (1 - smoothstep(340, 420, h));
  }

  // Carve the canyon down to the riverbed below sea level.
  if (canyonCarve > 0.001) {
    const targetRiver = -7 + nDetail * 2.5;
    h = h * (1 - canyonCarve) + targetRiver * canyonCarve;
  }

  // Fade the map edges down to the seabed.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const edgeFade = 1 - smoothstep(HALF - 260, HALF - 30, edge);
  h = h * edgeFade + -24 * (1 - edgeFade);

  // Flatten the Runway 09 peninsula to a constant RUNWAY_Y. This runs after the
  // edge fade so the runway stays flat even where the fade starts to bite.
  const rx = smoothstep(1060, 1145, x) * (1 - smoothstep(1845, 1930, x));
  const rz = 1 - smoothstep(95, 195, Math.abs(z));
  const runwayMask = rx * rz;
  if (runwayMask > 0.001) {
    h = h * (1 - runwayMask) + RUNWAY_Y * runwayMask;
  }

  return h;
}

function classifyTerrainColor(h, ny, x, z) {
  // Sand #e8c88a, vegetation #4a6b3a, rock #6b4a3a.
  let r = 0.29;
  let g = 0.42;
  let b = 0.23;

  if (h < 1.5) {
    r = 0.22;
    g = 0.34;
    b = 0.36;
  } else if (h < 14) {
    const t = smoothstep(2, 14, h);
    r = 0.91 * (1 - t) + 0.29 * t;
    g = 0.78 * (1 - t) + 0.42 * t;
    b = 0.54 * (1 - t) + 0.23 * t;
  } else {
    const hiRock = smoothstep(230, 390, h);
    const steep = smoothstep(0.84, 0.62, ny);
    const rockW = clamp(Math.max(hiRock, steep), 0, 1);
    r = 0.29 * (1 - rockW) + 0.42 * rockW;
    g = 0.42 * (1 - rockW) + 0.29 * rockW;
    b = 0.23 * (1 - rockW) + 0.23 * rockW;

    // Warm volcanic ash inside the caldera crater.
    const cr = Math.hypot(x + 400, z + 900);
    if (cr < 235) {
      const ash = (1 - smoothstep(130, 235, cr)) * 0.45;
      r = r * (1 - ash) + 0.3 * ash;
      g = g * (1 - ash) + 0.24 * ash;
      b = b * (1 - ash) + 0.22 * ash;
    }
  }
  return [r, g, b];
}

export function createTerrain(random) {
  const sampleNoise = createNoise2D(random);
  const jitter = {
    ox: random.range(1, 40),
    oz: random.range(1, 40),
    phase: random.range(0, Math.PI * 2),
  };

  const heights = new Float32Array(GRID * GRID);
  for (let iz = 0; iz < GRID; iz++) {
    const z = -HALF + iz * STEP;
    for (let ix = 0; ix < GRID; ix++) {
      const x = -HALF + ix * STEP;
      heights[iz * GRID + ix] = computeTerrainHeight(x, z, sampleNoise, jitter);
    }
  }

  function heightAt(x, z) {
    const gx = (x + HALF) / STEP;
    const gz = (z + HALF) / STEP;
    if (gx < 0 || gz < 0 || gx >= GRID - 1 || gz >= GRID - 1) return -24;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i00 = iz * GRID + ix;
    const h00 = heights[i00];
    const h10 = heights[i00 + 1];
    const h01 = heights[i00 + GRID];
    const h11 = heights[i00 + GRID + 1];
    const a = h00 + (h10 - h00) * fx;
    const b = h01 + (h11 - h01) * fx;
    return a + (b - a) * fz;
  }

  function buildMesh() {
    const vertCount = GRID * GRID;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = new Uint16Array((GRID - 1) * (GRID - 1) * 6);

    for (let iz = 0; iz < GRID; iz++) {
      const z = -HALF + iz * STEP;
      const zm = Math.max(0, iz - 1);
      const zp = Math.min(GRID - 1, iz + 1);
      for (let ix = 0; ix < GRID; ix++) {
        const x = -HALF + ix * STEP;
        const xm = Math.max(0, ix - 1);
        const xp = Math.min(GRID - 1, ix + 1);
        const idx = iz * GRID + ix;
        const h = heights[idx];

        const hx = heights[iz * GRID + xm] - heights[iz * GRID + xp];
        const hz = heights[zm * GRID + ix] - heights[zp * GRID + ix];
        const hy = 2 * STEP;
        const inv = 1 / Math.hypot(hx, hy, hz);
        const nx = hx * inv;
        const ny = hy * inv;
        const nz = hz * inv;

        const o = idx * 3;
        positions[o] = x;
        positions[o + 1] = h;
        positions[o + 2] = z;
        normals[o] = nx;
        normals[o + 1] = ny;
        normals[o + 2] = nz;

        const c = classifyTerrainColor(h, ny, x, z);
        colors[o] = c[0];
        colors[o + 1] = c[1];
        colors[o + 2] = c[2];
      }
    }

    let k = 0;
    for (let iz = 0; iz < GRID - 1; iz++) {
      for (let ix = 0; ix < GRID - 1; ix++) {
        const a = iz * GRID + ix;
        const b = a + 1;
        const c = a + GRID;
        const d = c + 1;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }

    return { positions, normals, colors, indices };
  }

  const landmarks = {
    caldera: { x: -400, y: heightAt(-400, -900), z: -900, rimY: 520 },
    bridge: { x: 300, y: 88, z: 600 },
    runway: { x: 1200, y: RUNWAY_Y, z: 0, length: 600, width: 30 },
    tower: { x: 1460, y: RUNWAY_Y, z: -58 },
    lighthouse: { x: 1895, y: Math.max(4, heightAt(1895, 0)), z: 0 },
  };

  return {
    size: SIZE,
    waterLevel: WATER_LEVEL,
    runwayElevation: RUNWAY_Y,
    landmarks,
    heightAt,
    buildMesh,
  };
}
