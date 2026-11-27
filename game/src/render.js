// The WebGL2 renderer: golden-hour sky, terrain, water, runway and landmarks, glowing
// rings, and the aircraft. Two cameras: a smoothed chase camera behind the plane and a
// cockpit camera at the pilot's head. Angles arrive in degrees from the flight model
// and are converted to radians here, at the only place matrices are built.

import { createSkyProgram, drawSky } from './sky.js';
import { buildAircraft } from './aircraft.js';
import { runwayState } from './runway.js';

const WORLD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uViewProj * wp;
}`;

const WORLD_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
uniform vec3 uCamPos;
uniform float uEmissive;
uniform float uAlpha;
out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(vec3(0.84, 0.19, -0.51));
  vec3 V = normalize(uCamPos - vWorldPos);
  float ndl = max(dot(N, L), 0.0);
  vec3 hemi = mix(vec3(0.40, 0.33, 0.34), vec3(0.30, 0.40, 0.58), N.y * 0.5 + 0.5);
  vec3 sun = vec3(1.18, 0.86, 0.52) * ndl;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * max(dot(V, -L), 0.0) * 0.22;
  vec3 lit = vColor * (hemi + sun) + vec3(1.0, 0.68, 0.34) * rim;
  vec3 col = mix(lit, vColor * 1.15, uEmissive);

  float dist = length(uCamPos - vWorldPos);
  float fog = 1.0 - exp(-pow(dist * 0.00027, 1.45));
  fog *= (1.0 - uEmissive * 0.55);
  vec3 fogCol = mix(vec3(0.88, 0.55, 0.34), vec3(1.0, 0.65, 0.30), pow(max(dot(-V, L), 0.0), 3.0));
  fragColor = vec4(mix(col, fogCol, clamp(fog, 0.0, 0.92)), uAlpha);
}`;

const WATER_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vWorldPos;
void main() {
  vWorldPos = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const WATER_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
uniform vec3 uCamPos;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec3 L = normalize(vec3(0.84, 0.19, -0.51));
  vec3 V = normalize(uCamPos - vWorldPos);
  vec2 p = vWorldPos.xz;
  float w1 = sin(p.x * 0.055 + uTime * 1.3 + cos(p.y * 0.04));
  float w2 = cos(p.y * 0.072 - uTime * 1.1 + sin(p.x * 0.03));
  vec3 N = normalize(vec3(w1 * 0.045, 1.0, w2 * 0.045));

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  vec3 deep = vec3(0.114, 0.306, 0.373);
  vec3 gold = vec3(0.910, 0.576, 0.235);
  vec3 col = mix(deep, gold, clamp(fres * 1.15 + 0.08, 0.0, 0.92));

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 92.0) * 1.9 + pow(max(dot(N, H), 0.0), 16.0) * 0.32;
  col += vec3(1.0, 0.84, 0.52) * spec;

  float dist = length(uCamPos - vWorldPos);
  float fog = 1.0 - exp(-pow(dist * 0.00027, 1.45));
  vec3 fogCol = mix(vec3(0.88, 0.55, 0.34), vec3(1.0, 0.65, 0.30), pow(max(dot(-V, L), 0.0), 3.0));
  fragColor = vec4(mix(col, fogCol, clamp(fog, 0.0, 0.94)), 1.0);
}`;

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const DEG = Math.PI / 180;

export function perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zl = 1 / (Math.hypot(zx, zy, zz) || 1);
  zx *= zl; zy *= zl; zz *= zl;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = 1 / (Math.hypot(xx, xy, xz) || 1);
  xx *= xl; xy *= xl; xz *= xl;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const c4 = c * 4;
    for (let r = 0; r < 4; r++) {
      out[c4 + r] =
        a[r] * b[c4] +
        a[4 + r] * b[c4 + 1] +
        a[8 + r] * b[c4 + 2] +
        a[12 + r] * b[c4 + 3];
    }
  }
  return out;
}

// heading, pitch and roll arrive in degrees; the matrix is built in radians.
// Heading 0 faces north (-z), 90 faces east (+x, Runway 09).
function buildAircraftMatrix(pos, headingDeg, pitchDeg, rollDeg) {
  const heading = headingDeg * DEG;
  const pitch = pitchDeg * DEG;
  const roll = rollDeg * DEG;
  const ch = Math.cos(-heading);
  const sh = Math.sin(-heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(-roll);
  const sr = Math.sin(-roll);
  const ry = new Float32Array([ch, 0, -sh, 0, 0, 1, 0, 0, sh, 0, ch, 0, 0, 0, 0, 1]);
  const rx = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const rot = multiply(multiply(ry, rx), rz);
  rot[12] = pos.x;
  rot[13] = pos.y;
  rot[14] = pos.z;
  return rot;
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function compileProgram(gl, vsSrc, fsSrc) {
  const mk = (t, s) => {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram();
  const vs = mk(gl.VERTEX_SHADER, vsSrc);
  const fs = mk(gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function uploadMesh(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bind = (loc, arr) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, arr instanceof Float32Array ? arr : new Float32Array(arr), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  };
  bind(0, data.positions);
  if (data.normals) bind(1, data.normals);
  if (data.colors) bind(2, data.colors);
  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  const idx = data.indices instanceof Uint16Array ? data.indices : new Uint16Array(data.indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length };
}

function createGeoBuilder() {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  function box(cx, cy, cz, sx, sy, sz, rgb) {
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const faces = [
      [[0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      [[0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      [[1, 0, 0], [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      [[-1, 0, 0], [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      [[0, 1, 0], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      [[0, -1, 0], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
    ];
    for (const f of faces) {
      const n = f[0];
      const base = positions.length / 3;
      for (let i = 1; i <= 4; i++) {
        positions.push(f[i][0] + cx, f[i][1] + cy, f[i][2] + cz);
        normals.push(n[0], n[1], n[2]);
        colors.push(rgb[0], rgb[1], rgb[2]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  return { box, data: () => ({ positions, normals, colors, indices }) };
}

function buildTorusMesh(gl, majorR, minorR, rgb) {
  const nu = 32;
  const nv = 10;
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const r = majorR + minorR * cv;
      positions.push(r * cu, r * su, minorR * sv);
      normals.push(cv * cu, cv * su, sv);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  const st = nv + 1;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * st + j;
      const b = a + st;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return uploadMesh(gl, { positions, normals, colors, indices });
}

function buildRunwayAndLandmarks(gl, terrain) {
  const ry = terrain.runwayElevation || terrain.heightAt(1500, 0);
  const g = createGeoBuilder();
  const ASPHALT = [0.227, 0.247, 0.275];
  const WHITE = [0.95, 0.96, 0.98];
  const CONCRETE = [0.76, 0.74, 0.7];
  const RED = [0.88, 0.22, 0.16];
  const DARK = [0.16, 0.2, 0.24];

  // Runway 09 strip (x = 1200..1800, z = 0, 30 m wide) with white markings.
  g.box(1500, ry + 0.18, 0, 600, 0.36, 30, ASPHALT);
  g.box(1500, ry + 0.38, -14.2, 598, 0.06, 0.9, WHITE);
  g.box(1500, ry + 0.38, 14.2, 598, 0.06, 0.9, WHITE);
  for (let i = 0; i < 6; i++) {
    const z = -11.5 + i * 4.6;
    g.box(1220, ry + 0.39, z, 26, 0.06, 2.0, WHITE);
  }
  for (let x = 1280; x < 1785; x += 36) g.box(x, ry + 0.39, 0, 18, 0.06, 1.0, WHITE);
  g.box(1315, ry + 0.39, -7.2, 24, 0.06, 3.4, WHITE);
  g.box(1315, ry + 0.39, 7.2, 24, 0.06, 3.4, WHITE);
  // The "09" numerals at the western end, facing the arriving pilot.
  const drawBar = (x, z, sx, sz) => g.box(x, ry + 0.4, z, sx, 0.06, sz, WHITE);
  drawBar(1253, -6.5, 12, 1.4); drawBar(1253, -1.5, 12, 1.4);
  drawBar(1247.5, -4, 1.6, 6.2); drawBar(1258.5, -4, 1.6, 6.2);
  drawBar(1253, 1.5, 12, 1.4); drawBar(1253, 6.5, 12, 1.4);
  drawBar(1258.5, 4, 1.6, 6.2); drawBar(1253, 4, 1.6, 6.2); drawBar(1247.5, 6.5, 1.6, 1.4);

  // Bases of the 4 PAPI lights on the northern (left) side of the runway.
  for (let i = 0; i < 4; i++) g.box(1292, ry + 0.8, -21 - i * 4.5, 2.2, 1.4, 2.2, DARK);

  // ATC tower north of the runway (1460, ry, -58).
  g.box(1460, ry + 11, -58, 10, 22, 10, CONCRETE);
  g.box(1460, ry + 24.5, -58, 15, 6, 15, DARK);
  g.box(1460, ry + 28.5, -58, 17, 2.2, 17, WHITE);
  g.box(1460, ry + 34, -58, 0.8, 10, 0.8, RED);
  g.box(1438, ry + 4.5, -62, 26, 9, 18, CONCRETE);

  // Lighthouse at the eastern tip of the peninsula (1895, y, 0).
  const ly = Math.max(4, terrain.heightAt(1895, 0));
  for (let i = 0; i < 5; i++) {
    const w = 7.2 - i * 0.75;
    g.box(1895, ly + 3 + i * 6, 0, w, 6, w, i % 2 === 0 ? WHITE : RED);
  }
  g.box(1895, ly + 33.5, 0, 5.2, 2.2, 5.2, DARK);

  // Canyon bridge across x = 300, z = 430..770, deck at y = 88.
  g.box(300, 88, 600, 14, 3.5, 340, CONCRETE);
  g.box(293, 91, 600, 1.2, 2.6, 340, RED);
  g.box(307, 91, 600, 1.2, 2.6, 340, RED);
  for (const pz of [525, 675]) {
    g.box(292, 72, pz, 5, 160, 6, RED);
    g.box(308, 72, pz, 5, 160, 6, RED);
    g.box(300, 142, pz, 22, 5, 5, RED);
    g.box(300, 114, pz, 22, 4, 4, RED);
  }

  // Emissive lamp meshes (PAPI red/white, lighthouse and tower beacons).
  const lampRed = createGeoBuilder();
  lampRed.box(0, 0, 0, 2.0, 2.0, 2.0, [1.0, 0.165, 0.165]);
  const lampWhite = createGeoBuilder();
  lampWhite.box(0, 0, 0, 2.0, 2.0, 2.0, [1.0, 1.0, 1.0]);
  const beacon = createGeoBuilder();
  beacon.box(1895, ly + 31.5, 0, 4.4, 3.6, 4.4, [1.0, 0.85, 0.42]);
  beacon.box(1460, ry + 39.5, -58, 1.8, 1.8, 1.8, [1.0, 0.18, 0.18]);
  for (let x = 1205; x <= 1795; x += 60) {
    beacon.box(x, ry + 0.9, -16.5, 1.1, 1.1, 1.1, [1.0, 0.88, 0.55]);
    beacon.box(x, ry + 0.9, 16.5, 1.1, 1.1, 1.1, [1.0, 0.88, 0.55]);
  }

  return {
    staticMesh: uploadMesh(gl, g.data()),
    beaconMesh: uploadMesh(gl, beacon.data()),
    lampRed: uploadMesh(gl, lampRed.data()),
    lampWhite: uploadMesh(gl, lampWhite.data()),
    runwayY: ry,
  };
}

export function createRenderer(canvas, terrain) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 tidak tersedia');

  const worldProg = compileProgram(gl, WORLD_VS, WORLD_FS);
  const waterProg = compileProgram(gl, WATER_VS, WATER_FS);
  const skyProg = createSkyProgram(gl);

  const wLoc = {
    uViewProj: gl.getUniformLocation(worldProg, 'uViewProj'),
    uModel: gl.getUniformLocation(worldProg, 'uModel'),
    uCamPos: gl.getUniformLocation(worldProg, 'uCamPos'),
    uEmissive: gl.getUniformLocation(worldProg, 'uEmissive'),
    uAlpha: gl.getUniformLocation(worldProg, 'uAlpha'),
  };
  const waLoc = {
    uViewProj: gl.getUniformLocation(waterProg, 'uViewProj'),
    uCamPos: gl.getUniformLocation(waterProg, 'uCamPos'),
    uTime: gl.getUniformLocation(waterProg, 'uTime'),
  };

  const terrainMesh = uploadMesh(gl, terrain.buildMesh());
  const wy = terrain.waterLevel || 0;
  const waterMesh = uploadMesh(gl, {
    positions: [-3400, wy, -3400, 3400, wy, -3400, 3400, wy, 3400, -3400, wy, 3400],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const ringActive = buildTorusMesh(gl, 26, 2.0, [0.16, 0.9, 1.0]);
  const ringNext = buildTorusMesh(gl, 26, 1.6, [0.14, 0.62, 0.78]);
  const ringDone = buildTorusMesh(gl, 26, 1.3, [0.22, 0.72, 0.44]);
  const scenery = buildRunwayAndLandmarks(gl, terrain);
  const drawAircraft = buildAircraft(gl);

  const camSmooth = { pos: null, target: null };

  function resize() {
    const w = canvas.clientWidth || canvas.width || 1280;
    const h = canvas.clientHeight || canvas.height || 480;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(state) {
    resize();
    const flight = state.flight;
    const world = state.world || {};
    const cameraMode = state.camera || 'chase';
    const time = state.time || 0;

    const acModel = buildAircraftMatrix(flight.pos, flight.heading, flight.pitch, flight.roll);
    const aspect = canvas.width / Math.max(1, canvas.height);
    let camPos;
    let camTarget;
    let camUp;
    let proj;

    if (cameraMode === 'cockpit') {
      camPos = transformPoint(acModel, 0, 0.9, -0.22);
      camTarget = transformPoint(acModel, 0, 0.8, -30);
      camUp = [acModel[4], acModel[5], acModel[6]];
      proj = perspective((50 * Math.PI) / 180, aspect, 0.14, 4800);
      camSmooth.pos = null;
    } else {
      const desiredPos = transformPoint(acModel, 0, 4.6, 18.5);
      const desiredTarget = transformPoint(acModel, 0, 1.4, -14);
      const minY = Math.max(terrain.waterLevel + 3, terrain.heightAt(desiredPos[0], desiredPos[2]) + 3);
      if (desiredPos[1] < minY) desiredPos[1] = minY;
      if (!camSmooth.pos || Math.hypot(
        desiredPos[0] - camSmooth.pos[0],
        desiredPos[1] - camSmooth.pos[1],
        desiredPos[2] - camSmooth.pos[2]
      ) > 80) {
        camSmooth.pos = desiredPos.slice();
        camSmooth.target = desiredTarget.slice();
      } else {
        for (let i = 0; i < 3; i++) {
          camSmooth.pos[i] += (desiredPos[i] - camSmooth.pos[i]) * 0.18;
          camSmooth.target[i] += (desiredTarget[i] - camSmooth.target[i]) * 0.24;
        }
      }
      camPos = camSmooth.pos;
      camTarget = camSmooth.target;
      camUp = [acModel[4] * 0.35, 0.65 + acModel[5] * 0.35, acModel[6] * 0.35];
      proj = perspective((48 * Math.PI) / 180, aspect, 0.8, 4800);
    }

    const view = lookAt(camPos, camTarget, camUp);
    const viewProj = multiply(proj, view);
    const skyView = new Float32Array(view);
    skyView[12] = 0; skyView[13] = 0; skyView[14] = 0;
    const skyViewProj = multiply(proj, skyView);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0.88, 0.55, 0.34, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Golden-hour sky dome and sun.
    drawSky(gl, skyProg, skyViewProj, time);

    // 2. Terrain, runway, landmarks.
    gl.enable(gl.CULL_FACE);
    gl.useProgram(worldProg);
    gl.uniformMatrix4fv(wLoc.uViewProj, false, viewProj);
    gl.uniform3fv(wLoc.uCamPos, camPos);
    gl.uniform1f(wLoc.uAlpha, 1.0);

    const drawStatic = (mesh, model, emissive) => {
      gl.uniformMatrix4fv(wLoc.uModel, false, model);
      gl.uniform1f(wLoc.uEmissive, emissive);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    };

    drawStatic(terrainMesh, IDENTITY, 0.0);
    drawStatic(scenery.staticMesh, IDENTITY, 0.0);
    drawStatic(scenery.beaconMesh, IDENTITY, 1.0);

    // PAPI lights (4 points on the left side of Runway 09).
    const papiLights = world.runway ? runwayState(flight, world.runway).papiLights : [true, true, true, true];
    for (let i = 0; i < 4; i++) {
      const m = new Float32Array(IDENTITY);
      m[12] = 1292; m[13] = scenery.runwayY + 1.8; m[14] = -21 - i * 4.5;
      drawStatic(papiLights[i] ? scenery.lampWhite : scenery.lampRed, m, 1.0);
    }

    // 3. Sea surface, gradient with specular.
    gl.disable(gl.CULL_FACE);
    gl.useProgram(waterProg);
    gl.uniformMatrix4fv(waLoc.uViewProj, false, viewProj);
    gl.uniform3fv(waLoc.uCamPos, camPos);
    gl.uniform1f(waLoc.uTime, time);
    gl.bindVertexArray(waterMesh.vao);
    gl.drawElements(gl.TRIANGLES, waterMesh.count, gl.UNSIGNED_SHORT, 0);

    // 4. Glowing cyan ring targets.
    gl.enable(gl.CULL_FACE);
    gl.useProgram(worldProg);
    const rings = world.rings || [];
    const nextIndex = world.ringsPassed || 0;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const hdg = (r.heading || 0) * DEG;
      const ch = Math.cos(-hdg);
      const sh = Math.sin(-hdg);
      const rm = new Float32Array([
        ch, 0, -sh, 0,
        0, 1, 0, 0,
        sh, 0, ch, 0,
        r.x, r.y, r.z, 1,
      ]);
      const passed = r.passed || i < nextIndex;
      const mesh = passed ? ringDone : i === nextIndex ? ringActive : ringNext;
      drawStatic(mesh, rm, passed ? 0.35 : i === nextIndex ? 0.95 : 0.72);
    }

    // 5. Aircraft (opaque body, emissive panel, transparent canopy).
    drawAircraft(gl, worldProg, acModel, {
      gear: flight.gear,
      flaps: flight.flaps,
      time,
    });
  }

  return { draw, resize };
}
