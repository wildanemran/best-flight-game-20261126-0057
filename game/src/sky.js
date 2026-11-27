// Golden-hour sky dome for Caldera Meridian.
//
// A unit sphere drawn first, centred on the camera (the renderer passes a
// view-projection matrix with the translation removed), pushed to the far
// plane with depth writes off so the world draws over it. The fragment shader
// paints a vertical gradient (warm orange horizon, mauve middle, deep blue
// zenith), a low sun with a wide glow and a bright disc, thin procedural dusk
// cloud streaks that drift very slowly with time, warm haze hugging the
// horizon, and a dark blue-green sea below the horizon line.

const SKY_VERTEX = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vDir;
void main() {
  vDir = aPos;
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = vec4(clip.xy, clip.w, clip.w);
}`;

const SKY_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vDir;
uniform float uTime;
out vec4 fragColor;

// Low sun in the east-south-east, matching the world light direction.
const vec3 SUN_DIR = vec3(0.8392, 0.1898, -0.5095);

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float sunAmt = max(dot(dir, SUN_DIR), 0.0);

  // Vertical gradient: warm horizon, mauve middle, deep blue zenith.
  vec3 horizonCol = vec3(1.00, 0.58, 0.22);
  vec3 midCol = vec3(0.55, 0.30, 0.38);
  vec3 topCol = vec3(0.13, 0.18, 0.35);
  vec3 skyCol = mix(horizonCol, midCol, smoothstep(0.0, 0.32, h));
  skyCol = mix(skyCol, topCol, smoothstep(0.12, 0.55, h));

  // Below the horizon the dome is the sea: dark blue-green, warming slightly
  // right at the horizon line.
  vec3 seaCol = vec3(0.07, 0.20, 0.24);
  vec3 col = h < 0.0
    ? mix(seaCol, horizonCol, smoothstep(-0.06, 0.0, h) * 0.35)
    : skyCol;

  // Wide warm glow around the sun, strongest near the horizon.
  float glow = pow(sunAmt, 6.0);
  col += vec3(1.0, 0.55, 0.20) * glow * 0.55 * (1.0 - smoothstep(0.15, 0.70, h));
  // Bright inner glow, then the disc itself.
  col += vec3(1.0, 0.80, 0.45) * pow(sunAmt, 40.0) * 0.8;
  float disc = smoothstep(0.99880, 0.99940, sunAmt);
  col = mix(col, vec3(1.0, 0.90, 0.62), disc);

  // Thin dusk cloud streaks: sine bands in height, wobbled by azimuth so
  // they read as broken horizontal ribbons, drifting very slowly with time.
  if (h > 0.015 && h < 0.5) {
    float az = atan(dir.z, dir.x);
    float s = h * 26.0
      + 0.6 * sin(az * 2.0 + uTime * 0.010)
      + 0.35 * sin(az * 5.0 - uTime * 0.006);
    float c = smoothstep(0.5, 0.95, sin(s) * 0.5 + 0.5);
    float mask = smoothstep(0.015, 0.09, h) * (1.0 - smoothstep(0.30, 0.50, h));
    vec3 cloudCol = mix(vec3(0.85, 0.45, 0.38), vec3(1.0, 0.75, 0.55), sunAmt);
    col = mix(col, cloudCol, c * mask * 0.35);
  }

  // Warm haze hugging the horizon line.
  float haze = exp(-abs(h) * 10.0);
  col = mix(col, vec3(0.98, 0.62, 0.34), haze * 0.30);

  fragColor = vec4(col, 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`sky shader compile failed: ${log}`);
  }
  return shader;
}

export function createSkyProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, SKY_VERTEX);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, SKY_FRAGMENT);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`sky program link failed: ${log}`);
  }
  return program;
}

function buildSphereMesh(gl) {
  const lonSegments = 24;
  const latSegments = 14;
  const positions = [];
  const indices = [];
  for (let iy = 0; iy <= latSegments; iy++) {
    const phi = (iy / latSegments) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let ix = 0; ix <= lonSegments; ix++) {
      const theta = (ix / lonSegments) * Math.PI * 2;
      positions.push(sinPhi * Math.cos(theta), cosPhi, sinPhi * Math.sin(theta));
    }
  }
  const row = lonSegments + 1;
  for (let iy = 0; iy < latSegments; iy++) {
    for (let ix = 0; ix < lonSegments; ix++) {
      const a = iy * row + ix;
      const b = a + row;
      // Inward-facing triangles: the dome is viewed from the inside, so
      // the faces point at the camera and survive face culling.
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: indices.length };
}

// One mesh and set of uniform locations per program; the mesh is tied to the
// context that created it, so the program is the right cache key here.
const skyAssets = new WeakMap();

export function drawSky(gl, program, viewProj, time) {
  let assets = skyAssets.get(program);
  if (!assets) {
    assets = {
      mesh: buildSphereMesh(gl),
      uViewProj: gl.getUniformLocation(program, 'uViewProj'),
      uTime: gl.getUniformLocation(program, 'uTime'),
    };
    skyAssets.set(program, assets);
  }
  gl.useProgram(program);
  gl.uniformMatrix4fv(assets.uViewProj, false, viewProj);
  gl.uniform1f(assets.uTime, time || 0);
  // Far plane, no depth write: the world is drawn over the sky.
  gl.depthMask(false);
  gl.depthFunc(gl.LEQUAL);
  gl.bindVertexArray(assets.mesh.vao);
  gl.drawElements(gl.TRIANGLES, assets.mesh.count, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
}
