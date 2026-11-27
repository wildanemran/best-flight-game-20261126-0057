// Golden-hour sky dome: a gradient sky with a low sun, thin procedural dusk clouds
// and horizon haze, drawn as a unit sphere centred on the camera. The dome is painted
// first with depth writes off and its depth forced to the far plane, so the world
// draws over it.

const SKY_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uViewProj * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec3 d = normalize(vDir);
  vec3 sunDir = normalize(vec3(0.84, 0.19, -0.51));
  vec3 topCol = vec3(0.169, 0.227, 0.369);
  vec3 midCol = vec3(0.54, 0.34, 0.37);
  vec3 horCol = vec3(1.0, 0.604, 0.235);
  vec3 sunCol = vec3(1.0, 0.824, 0.478);

  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horCol, midCol, smoothstep(0.0, 0.24, h));
  col = mix(col, topCol, smoothstep(0.16, 0.72, h));

  // Golden-hour sun glow towards the east-south-east.
  float sunDot = max(dot(d, sunDir), 0.0);
  col += sunCol * pow(sunDot, 10.0) * 0.42;
  col += sunCol * pow(sunDot, 160.0) * 0.95;
  float disc = smoothstep(0.9986, 0.9994, sunDot);
  col = mix(col, vec3(1.0, 0.96, 0.82), disc);

  // Thin procedural dusk cloud bands.
  if (d.y > 0.025) {
    vec2 uv = d.xz / (d.y + 0.14) + vec2(uTime * 0.006, -uTime * 0.002);
    float c1 = sin(uv.x * 1.7 + sin(uv.y * 1.3)) * 0.5 + 0.5;
    float c2 = cos(uv.y * 2.4 - uv.x * 0.9) * 0.5 + 0.5;
    float cloud = smoothstep(0.58, 0.88, c1 * 0.6 + c2 * 0.4);
    float fade = smoothstep(0.025, 0.14, d.y) * (1.0 - smoothstep(0.45, 0.85, d.y));
    vec3 cloudCol = mix(vec3(0.66, 0.41, 0.39), sunCol, pow(sunDot, 3.0) * 0.85);
    col = mix(col, cloudCol, cloud * fade * 0.42);
  }

  // Horizon haze, and sea haze below the horizon line.
  float horFog = exp(-abs(d.y) * 14.0);
  col = mix(col, horCol, horFog * 0.48);
  if (d.y < 0.0) {
    col = mix(horCol * 0.88, vec3(0.114, 0.306, 0.373), clamp(-d.y * 5.0, 0.0, 1.0));
  }

  fragColor = vec4(col, 1.0);
}`;

const skyCache = new WeakMap();

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'Sky shader compile error');
  }
  return sh;
}

export function createSkyProgram(gl) {
  const prog = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, SKY_VS);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, SKY_FS);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Sky program link error');
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function buildDomeMesh(gl) {
  const segU = 24;
  const segV = 14;
  const verts = [];
  const idx = [];
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let u = 0; u <= segU; u++) {
      const th = (u / segU) * Math.PI * 2;
      verts.push(sp * Math.cos(th), cp, sp * Math.sin(th));
    }
  }
  const stride = segU + 1;
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u <= segU; u++) {
      const a = v * stride + u;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  return { vao, count: idx.length };
}

function ensureSkyState(gl, program) {
  let entry = skyCache.get(gl);
  if (!entry) {
    entry = { dome: buildDomeMesh(gl), fallbackProg: null, locs: new WeakMap() };
    skyCache.set(gl, entry);
  }
  const activeProg = program || (entry.fallbackProg ||= createSkyProgram(gl));
  let loc = entry.locs.get(activeProg);
  if (!loc) {
    loc = {
      uViewProj: gl.getUniformLocation(activeProg, 'uViewProj'),
      uTime: gl.getUniformLocation(activeProg, 'uTime'),
    };
    entry.locs.set(activeProg, loc);
  }
  return { dome: entry.dome, prog: activeProg, loc };
}

export function drawSky(gl, program, viewProj, time) {
  const { dome, prog, loc } = ensureSkyState(gl, program);
  gl.depthMask(false);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(loc.uViewProj, false, viewProj);
  if (loc.uTime) gl.uniform1f(loc.uTime, time || 0);
  gl.bindVertexArray(dome.vao);
  gl.drawElements(gl.TRIANGLES, dome.count, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
}
