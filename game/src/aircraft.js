// The aircraft, built from primitives: a small propeller plane with a white body and
// red stripe, navy canopy frame, a glowing instrument panel visible through the canopy,
// moving flaps, retractable gear, and a spinning propeller. Local space: the nose
// points to negative z, the tail to positive z, up is positive y.

function createPartBuilder() {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];

  function pushTri(a, b, c, n, rgb) {
    const base = pos.length / 3;
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      nor.push(n[0], n[1], n[2]);
      col.push(rgb[0], rgb[1], rgb[2]);
    }
    idx.push(base, base + 1, base + 2);
  }

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
      const v = f.slice(1).map((p) => [p[0] + cx, p[1] + cy, p[2] + cz]);
      pushTri(v[0], v[1], v[2], n, rgb);
      pushTri(v[0], v[2], v[3], n, rgb);
    }
  }

  function cylZ(z0, z1, r0x, r0y, r1x, r1y, cy0, cy1, segs, rgb) {
    const ring0 = [];
    const ring1 = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ring0.push([ca * r0x, cy0 + sa * r0y, z0]);
      ring1.push([ca * r1x, cy1 + sa * r1y, z1]);
    }
    for (let i = 0; i < segs; i++) {
      const a = ring0[i];
      const b = ring0[i + 1];
      const c = ring1[i + 1];
      const d = ring1[i];
      const m = ((i + 0.5) / segs) * Math.PI * 2;
      const n = [Math.cos(m), Math.sin(m), 0];
      pushTri(a, b, c, n, rgb);
      pushTri(a, c, d, n, rgb);
    }
    if (r0x > 0.01) {
      const center = [0, cy0, z0];
      for (let i = 0; i < segs; i++) pushTri(center, ring0[i + 1], ring0[i], [0, 0, -1], rgb);
    }
    if (r1x > 0.01) {
      const center = [0, cy1, z1];
      for (let i = 0; i < segs; i++) pushTri(center, ring1[i], ring1[i + 1], [0, 0, 1], rgb);
    }
  }

  function upload(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bind = (loc, arr) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    };
    bind(0, pos);
    bind(1, nor);
    bind(2, col);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.length };
  }

  return { box, cylZ, upload };
}

function mulMat4(a, b) {
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

function matTranslate(x, y, z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function matRotX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function matRotZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function buildAircraftParts(gl) {
  const WHITE = [0.94, 0.95, 0.97];
  const STRIPE = [0.9, 0.28, 0.16];
  const NAVY = [0.16, 0.24, 0.36];
  const DARK = [0.14, 0.16, 0.19];
  const GLASS = [0.35, 0.78, 0.94];
  const CYAN = [0.16, 0.92, 1.0];
  const AMBER = [1.0, 0.72, 0.2];

  // Main body, wings, tail and canopy frame.
  const body = createPartBuilder();
  body.cylZ(-3.35, -2.55, 0.34, 0.32, 0.62, 0.56, 0.04, 0.08, 12, STRIPE);
  body.cylZ(-2.55, -1.35, 0.62, 0.56, 0.7, 0.6, 0.08, 0.06, 12, WHITE);
  body.cylZ(-1.35, 0.55, 0.7, 0.44, 0.64, 0.44, -0.06, -0.04, 12, WHITE);
  body.cylZ(0.55, 4.15, 0.64, 0.58, 0.16, 0.2, 0.08, 0.18, 12, WHITE);
  body.box(0, 0.34, -2.15, 0.72, 0.14, 1.35, NAVY);
  body.box(0, 0.12, 2.35, 0.52, 0.16, 3.1, STRIPE);

  // Main wings left and right.
  body.box(0, -0.14, -0.45, 10.6, 0.16, 1.48, WHITE);
  body.box(-4.65, -0.13, -0.45, 1.45, 0.18, 1.42, STRIPE);
  body.box(4.65, -0.13, -0.45, 1.45, 0.18, 1.42, STRIPE);
  body.box(0, -0.15, -1.12, 10.2, 0.14, 0.18, NAVY);

  // Horizontal tail and vertical fin.
  body.box(0, 0.24, 3.72, 3.55, 0.11, 0.86, WHITE);
  body.box(0, 0.25, 3.92, 3.45, 0.12, 0.24, STRIPE);
  body.box(0, 1.12, 3.55, 0.14, 1.72, 1.18, WHITE);
  body.box(0, 1.68, 3.68, 0.16, 0.48, 0.92, STRIPE);

  // Cockpit interior and canopy frame (visible in chase and cockpit views).
  body.box(0, 0.46, -1.32, 0.96, 0.36, 0.44, DARK);
  body.box(-0.5, 0.86, -0.95, 0.06, 0.68, 0.07, NAVY);
  body.box(0.5, 0.86, -0.95, 0.06, 0.68, 0.07, NAVY);
  body.box(0, 1.18, -0.78, 1.04, 0.06, 0.08, NAVY);
  body.box(-0.5, 1.02, -0.15, 0.06, 0.07, 1.55, NAVY);
  body.box(0.5, 1.02, -0.15, 0.06, 0.07, 1.55, NAVY);
  body.box(0, 1.18, 0.48, 0.98, 0.07, 0.1, NAVY);

  // Glowing instrument panel, seen through the canopy: a dark slab carrying six
  // small lit gauge faces and a thin amber glare strip, so it reads as real
  // instruments instead of two flat colour blocks.
  const panel = createPartBuilder();
  panel.box(0, 0.55, -1.1, 0.92, 0.3, 0.05, DARK);
  const GAUGES = [
    [-0.36, [0.92, 0.95, 0.98]],
    [-0.22, [0.16, 0.92, 1.0]],
    [-0.08, [0.92, 0.95, 0.98]],
    [0.08, [0.22, 1.0, 0.48]],
    [0.22, [0.92, 0.95, 0.98]],
    [0.36, [1.0, 0.72, 0.2]],
  ];
  for (const [gx, gc] of GAUGES) panel.box(gx, 0.6, -1.06, 0.11, 0.11, 0.04, gc);
  panel.box(0, 0.72, -1.11, 0.5, 0.04, 0.05, AMBER);
  panel.box(-0.3, 0.43, -1.06, 0.1, 0.05, 0.04, [0.22, 1.0, 0.48]);
  panel.box(0.3, 0.43, -1.06, 0.1, 0.05, 0.04, AMBER);
  panel.box(-5.32, -0.12, -0.55, 0.14, 0.12, 0.22, [1.0, 0.22, 0.22]);
  panel.box(5.32, -0.12, -0.55, 0.14, 0.12, 0.22, [0.22, 1.0, 0.42]);

  // Transparent canopy.
  const canopy = createPartBuilder();
  canopy.cylZ(-1.35, 0.55, 0.52, 0.56, 0.5, 0.54, 0.62, 0.66, 10, GLASS);

  // Flaps (hinged at the wing trailing edge, rotate down when active).
  const flaps = createPartBuilder();
  flaps.box(-2.15, 0, 0.24, 2.75, 0.09, 0.48, STRIPE);
  flaps.box(2.15, 0, 0.24, 2.75, 0.09, 0.48, STRIPE);

  // Landing gear (three wheels and struts).
  const gear = createPartBuilder();
  gear.box(0, -0.55, -2.35, 0.11, 0.88, 0.11, WHITE);
  gear.box(0, -1.02, -2.35, 0.18, 0.34, 0.34, DARK);
  gear.box(-1.55, -0.56, -0.35, 0.12, 0.92, 0.12, WHITE);
  gear.box(-1.55, -1.06, -0.35, 0.22, 0.4, 0.4, DARK);
  gear.box(1.55, -0.56, -0.35, 0.12, 0.92, 0.12, WHITE);
  gear.box(1.55, -1.06, -0.35, 0.22, 0.4, 0.4, DARK);

  // Propeller at the nose.
  const prop = createPartBuilder();
  prop.cylZ(-0.28, 0.18, 0.04, 0.04, 0.22, 0.22, 0, 0, 10, STRIPE);
  prop.box(0, 0, 0, 2.25, 0.14, 0.05, DARK);
  prop.box(0, 0, 0, 0.14, 2.25, 0.05, DARK);

  const blur = createPartBuilder();
  blur.cylZ(-0.02, 0.02, 1.12, 1.12, 1.12, 1.12, 0, 0, 16, [0.85, 0.88, 0.92]);

  return {
    body: body.upload(gl),
    panel: panel.upload(gl),
    canopy: canopy.upload(gl),
    flaps: flaps.upload(gl),
    gear: gear.upload(gl),
    prop: prop.upload(gl),
    blur: blur.upload(gl),
  };
}

export function buildAircraft(gl) {
  const parts = buildAircraftParts(gl);
  const locCache = new WeakMap();

  function getLocs(program) {
    let loc = locCache.get(program);
    if (!loc) {
      loc = {
        uModel: gl.getUniformLocation(program, 'uModel'),
        uEmissive: gl.getUniformLocation(program, 'uEmissive'),
        uAlpha: gl.getUniformLocation(program, 'uAlpha'),
      };
      locCache.set(program, loc);
    }
    return loc;
  }

  function drawPart(part, loc, model, emissive, alpha) {
    gl.uniformMatrix4fv(loc.uModel, false, model);
    if (loc.uEmissive) gl.uniform1f(loc.uEmissive, emissive);
    if (loc.uAlpha) gl.uniform1f(loc.uAlpha, alpha);
    gl.bindVertexArray(part.vao);
    gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_SHORT, 0);
  }

  return function drawAircraft(glCtx, program, modelMatrix, state) {
    const loc = getLocs(program);
    const gearVal = state && state.gear ? Number(state.gear) : 0;
    const flapsVal = state && state.flaps ? Number(state.flaps) : 0;
    const t = state && state.time ? state.time : 0;

    // 1. Main body.
    drawPart(parts.body, loc, modelMatrix, 0.0, 1.0);

    // 2. Glowing instrument panel and wingtip navigation lights.
    drawPart(parts.panel, loc, modelMatrix, 1.0, 1.0);

    // 3. Flaps drop when active.
    const flapAngle = Math.min(1, Math.max(0, flapsVal)) * 0.58;
    const flapModel = mulMat4(
      modelMatrix,
      mulMat4(matTranslate(0, -0.16, 0.28), matRotX(-flapAngle))
    );
    drawPart(parts.flaps, loc, flapModel, 0.0, 1.0);

    // 4. Landing gear when down.
    if (gearVal > 0.05) {
      const lift = (1 - Math.min(1, gearVal)) * 0.85;
      const gearModel = mulMat4(modelMatrix, matTranslate(0, lift, 0));
      drawPart(parts.gear, loc, gearModel, 0.0, 1.0);
    }

    // 5. Propeller spinning with time.
    const propModel = mulMat4(
      modelMatrix,
      mulMat4(matTranslate(0, 0.04, -3.48), matRotZ(t * 36.0))
    );
    drawPart(parts.prop, loc, propModel, 0.0, 1.0);

    // 6. Semi-transparent parts: propeller blur disc and canopy glass.
    glCtx.enable(glCtx.BLEND);
    glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);
    glCtx.depthMask(false);
    drawPart(parts.blur, loc, propModel, 0.15, 0.22);
    drawPart(parts.canopy, loc, modelMatrix, 0.12, 0.32);
    glCtx.depthMask(true);
    glCtx.disable(glCtx.BLEND);

    if (loc.uEmissive) glCtx.uniform1f(loc.uEmissive, 0.0);
    if (loc.uAlpha) glCtx.uniform1f(loc.uAlpha, 1.0);
    glCtx.bindVertexArray(null);
  };
}
