struct Uniforms {
  resolution: vec2f,
  travelTime: f32,
  reservedTime: f32,
  moodLow: vec4f,
  moodHigh: vec4f,
  grade: vec4f,      // x mood intensity, y vignette, z feedback, w exposure
  atmosphere: vec4f, // x coverage, y cloud height, z cloud scale, w turbulence
  motion: vec4f,     // x wind, y smoke, z fog, w contrast
  subject: vec4f,    // x train emphasis, y bridge emphasis, z reserved, w wind phase
  sceneSky: vec4f,
  cloudShadow: vec4f,
  cloudMid: vec4f,
  cloudWarm: vec4f,
  cloudLight: vec4f,
  smokeLight: vec4f,
  smokeShadow: vec4f,
  trainDarkColor: vec4f,
  trainBodyColor: vec4f,
  locomotiveColor: vec4f,
  bridgeColor: vec4f,
  practicalLightColor: vec4f,
  fogColor: vec4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var noiseSampler: sampler;
@group(0) @binding(2) var noiseTexture: texture_2d<f32>;
@group(0) @binding(3) var feedbackSampler: sampler;
@group(0) @binding(4) var feedbackTexture: texture_2d<f32>;

fn noise(x: vec2f) -> f32 {
  let f = fract(x);
  let u = f * f * f * (f * (f * 6.0 - vec2f(15.0)) + vec2f(10.0));
  let p = floor(x);

  let a = textureSampleLevel(noiseTexture, noiseSampler, (p + vec2f(0.0, 0.0)) / 1024.0, 0.0).x;
  let b = textureSampleLevel(noiseTexture, noiseSampler, (p + vec2f(1.0, 0.0)) / 1024.0, 0.0).x;
  let c = textureSampleLevel(noiseTexture, noiseSampler, (p + vec2f(0.0, 1.0)) / 1024.0, 0.0).x;
  let d = textureSampleLevel(noiseTexture, noiseSampler, (p + vec2f(1.0, 1.0)) / 1024.0, 0.0).x;

  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

fn fbm(xIn: vec2f, detail: i32) -> f32 {
  var x = xIn;
  var a = 0.0;
  var b = 1.0;
  var t = 0.0;
  var i = 0;
  loop {
    if (i >= detail) { break; }
    let n = noise(x);
    a += b * n;
    t += b;
    b *= 0.7;
    x *= 2.0;
    i += 1;
  }
  return a / t;
}

fn fbm2(xIn: vec2f, detail: i32) -> f32 {
  var x = xIn;
  var a = 0.0;
  var b = 1.0;
  var t = 0.0;
  var i = 0;
  loop {
    if (i >= detail) { break; }
    let n = noise(x);
    a += b * n;
    t += b;
    b *= 0.9;
    x *= 2.0;
    i += 1;
  }
  return a / t;
}

fn boxMask(uv: vec2f, x1: f32, x2: f32, y1: f32, y2: f32) -> f32 {
  return select(0.0, 1.0, uv.x > x1 && uv.x < x2 && uv.y > y1 && uv.y < y2);
}

fn cloudCoordinates(uv: vec2f, time: f32, distance: f32, offset: f32) -> vec2f {
  // Scale the noise field isotropically around a stable screen-space anchor.
  // This changes cloud feature size without stretching the composed image.
  let scale = max(uniforms.atmosphere.z, 0.05);
  let anchor = vec2f(0.5, 0.5);
  return (uv - anchor) / scale + anchor + vec2f(time / distance + offset, 0.0);
}

fn cloudTone(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  if (t < 0.3333) {
    return mix(uniforms.cloudShadow.rgb, uniforms.cloudMid.rgb, t * 3.0);
  }
  if (t < 0.6667) {
    return mix(uniforms.cloudMid.rgb, uniforms.cloudWarm.rgb, (t - 0.3333) * 3.0);
  }
  return mix(uniforms.cloudWarm.rgb, uniforms.cloudLight.rgb, (t - 0.6667) * 3.0);
}

fn cloudLayer(t: f32, alpha: f32) -> vec4f {
  return vec4f(cloudTone(t), alpha);
}

fn foreground(uvIn: vec2f, t: f32) -> vec4f {
  var uv = uvIn;
  uv.y -= uniforms.atmosphere.y;
  uv.y -= 0.2;

  var midlevel = -0.1;
  var disp = 1.7;
  var dist = 1.0;
  var uv2 = cloudCoordinates(uv, t, dist, 40.0);
  var h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x * 0.7;
  if (uv.y < h + midlevel - 0.12) { return cloudLayer(0.04, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return cloudLayer(0.14, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.24, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.34, 1.0); }

  midlevel = 0.05;
  disp = 1.7;
  dist = 2.0;
  uv2 = cloudCoordinates(uv, t, dist, 38.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x * 0.7;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.7, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.86, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.96, 1.0); }

  return cloudLayer(0.96, 0.0);
}

fn background(uvIn: vec2f, t: f32) -> vec4f {
  var uv = uvIn;
  uv.y -= uniforms.atmosphere.y;
  var midlevel = 0.3;
  var disp = 0.9;
  var dist = 10.0;
  var uv2 = cloudCoordinates(uv, t, dist, 32.5);
  var h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.14) { return cloudLayer(0.24, 1.0); }
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.42, 1.0); }
  if (uv.y < h + midlevel - 0.07) { return cloudLayer(0.58, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.68, 1.0); }

  midlevel = 0.35;
  disp = 1.0;
  dist = 15.0;
  uv2 = cloudCoordinates(uv, t, dist, 30.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.86, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.96, 1.0); }

  midlevel = 0.35;
  disp = 3.5;
  dist = 20.0;
  uv2 = cloudCoordinates(uv, t, dist, 27.5);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.12) { return cloudLayer(0.04, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return cloudLayer(0.14, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.24, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.34, 1.0); }

  midlevel = 0.45;
  disp = 2.0;
  dist = 25.0;
  uv2 = cloudCoordinates(uv, t, dist, 23.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.68, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.78, 1.0); }

  midlevel = 0.5;
  disp = 2.3;
  dist = 30.0;
  uv2 = cloudCoordinates(uv, t, dist, 20.5);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.12) { return cloudLayer(0.02, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return cloudLayer(0.12, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.46, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.62, 1.0); }

  midlevel = 0.5;
  disp = 2.5;
  dist = 35.0;
  uv2 = cloudCoordinates(uv, t, dist, 18.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.52, 1.0); }
  if (uv.y < h + midlevel - 0.05) { return cloudLayer(0.64, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.73, 1.0); }

  midlevel = 0.6;
  disp = 2.0;
  dist = 40.0;
  uv2 = cloudCoordinates(uv, t, dist, 18.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.72, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.84, 1.0); }

  midlevel = 0.75;
  disp = 3.5;
  dist = 45.0;
  uv2 = cloudCoordinates(uv, t, dist, 15.5);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.20) { return cloudLayer(0.7, 1.0); }
  if (uv.y < h + midlevel - 0.15) { return cloudLayer(0.62, 1.0); }
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.58, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.78, 1.0); }

  midlevel = 0.7;
  disp = 2.7;
  dist = 50.0;
  uv2 = cloudCoordinates(uv, t, dist, 12.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return cloudLayer(0.32, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.42, 1.0); }

  midlevel = 0.8;
  disp = 2.7;
  dist = 60.0;
  uv2 = cloudCoordinates(uv, t, dist, 9.5);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.66, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.84, 1.0); }

  midlevel = 0.9;
  disp = 3.0;
  dist = 70.0;
  uv2 = cloudCoordinates(uv, t, dist, 7.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.14, 1.0); }
  if (uv.y < h + midlevel - 0.05) { return cloudLayer(0.22, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(0.34, 1.0); }

  midlevel = 1.0;
  disp = 5.0;
  dist = 100.0;
  uv2 = cloudCoordinates(uv, t, dist, 3.5);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return cloudLayer(0.9, 1.0); }
  if (uv.y < h + midlevel)        { return cloudLayer(1.0, 1.0); }

  return vec4f(uniforms.sceneSky.rgb, 1.0);
}

fn applyMoodPalette(colIn: vec3f, uv: vec2f) -> vec3f {
  let intensity = clamp(uniforms.grade.x, 0.0, 1.0);
  if (intensity <= 0.0001) {
    return colIn;
  }

  let luma = dot(colIn, vec3f(0.2126, 0.7152, 0.0722));
  let paletteVariation = 0.035 * sin(uv.x * 4.2 + uv.y * 2.1);
  let paletteT = smoothstep(0.03, 0.98, clamp(luma + paletteVariation, 0.0, 1.0));
  let palette = mix(uniforms.moodLow.rgb, uniforms.moodHigh.rgb, paletteT);
  let sourceChroma = colIn - vec3f(luma);
  let moodCol = palette * (0.48 + 0.72 * luma) + sourceChroma * 0.28;
  return mix(colIn, moodCol, intensity);
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let fragCoord = vec2f(position.x, uniforms.resolution.y - position.y);
  var uv = fragCoord / uniforms.resolution.y;
  // Each phase is accumulated by the renderer. Changing a rate affects future
  // motion instead of multiplying absolute time and visibly scrubbing the scene.
  // At neutral rates the weighted phases reproduce the original iTime * 4.
  let travelT = uniforms.travelTime * 4.0;
  let cloudT = uniforms.travelTime * 3.4 + uniforms.subject.w * 0.6;
  let bg = background(uv, cloudT);

  var fg = vec4f(0.0);
  let n = 5;
  if (uv.y < 0.5) {
    var i = 0;
    loop {
      if (i >= n) { break; }
      fg += foreground(uv, cloudT + 4.0 * f32(i) / f32(n) / 60.0) / f32(n);
      i += 1;
    }
  }

  var col = bg.rgb;
  uv.y -= 0.2;

  var uv2 = fract(uv * 9.0);
  var wagon = 1.0;
  wagon *= 1.0 - step(0.45, uv.x);
  wagon *= 1.0 - step(0.115, uv.y);
  wagon *= step(0.103, uv.y);
  wagon *= step(0.05, 1.0 - abs(uv2.x * 2.0 - 1.0));

  var join = 1.0;
  join *= 1.0 - step(0.45, uv.x);
  join *= 1.0 - step(0.11, uv.y);
  join *= step(0.107, uv.y);

  var roof = 1.0;
  roof *= 1.0 - step(0.45, uv.x);
  roof *= 1.0 - step(0.117, uv.y);
  roof *= step(0.11, uv.y);
  roof *= step(0.15, 1.0 - abs(uv2.x * 2.0 - 1.0));

  let loco = boxMask(uv, 0.45, 0.5, 0.103, 0.112);
  let chem1 = boxMask(uv, 0.49, 0.495, 0.103, 0.12);
  let chem2 = boxMask(uv, 0.488, 0.496, 0.12, 0.123);
  let locoRoof = boxMask(uv, 0.443, 0.47, 0.11, 0.117);

  var wheel = 1.0 - step(0.00004, dot(uv - vec2f(0.457, 0.106), uv - vec2f(0.457, 0.106)));
  wheel += 1.0 - step(0.00002, dot(uv - vec2f(0.487, 0.105), uv - vec2f(0.487, 0.105)));
  wheel += 1.0 - step(0.00002, dot(uv - vec2f(0.497, 0.105), uv - vec2f(0.497, 0.105)));

  if (uv.x < 0.45 && uv.y > 0.025 && uv.y < 0.2) {
    wheel += 1.0 - step(0.002, dot(uv2 - vec2f(0.2, 0.95), uv2 - vec2f(0.2, 0.95)));
    wheel += 1.0 - step(0.002, dot(uv2 - vec2f(0.8, 0.95), uv2 - vec2f(0.8, 0.95)));
  }

  let trainLift = uniforms.subject.x;
  let trainDark = uniforms.trainDarkColor.rgb * (1.0 + clamp(trainLift, 0.0, 1.0) * 0.12);
  let trainBody = uniforms.trainBodyColor.rgb * (1.0 + clamp(trainLift, 0.0, 1.0) * 0.1);
  let locomotive = uniforms.locomotiveColor.rgb * (1.0 + clamp(trainLift, 0.0, 1.0) * 0.1);
  col = mix(col, trainDark, join);
  col = mix(col, trainBody, wagon);
  col = mix(col, trainDark, roof);
  col = mix(col, locomotive, loco);
  col = mix(col, locomotive, chem1);
  col = mix(col, trainDark, locoRoof);
  col = mix(col, trainDark, chem2 + wheel);

  let headlightOrigin = vec2f(0.499, 0.113);
  let headlightHousing = boxMask(uv, 0.496, 0.501, 0.1108, 0.1152);
  let headlightInset = boxMask(uv, 0.4973, 0.5002, 0.112, 0.114);
  col = mix(col, trainDark * 0.62, headlightHousing);
  col = mix(col, mix(trainDark, trainBody, 0.42), headlightInset);

  // Use each wagon's local coordinates so its window has equal padding and
  // sits between the two wheels instead of following a global screen repeat.
  let windowLocalX = min(
    abs(uv2.x - 0.32),
    min(abs(uv2.x - 0.5), abs(uv2.x - 0.68))
  );
  let windowDistance = length(vec2f(windowLocalX / 9.0, uv.y - 0.109));
  let carriageRegion = (1.0 - step(0.44, uv.x)) * step(0.103, uv.y) * (1.0 - step(0.115, uv.y));
  let wheelOcclusion = 1.0 - clamp(wheel, 0.0, 1.0);
  let windowFrame = carriageRegion * wheelOcclusion *
    (1.0 - step(0.043, windowLocalX)) * step(0.105, uv.y) * (1.0 - step(0.113, uv.y));
  col = mix(col, trainDark * 0.58, windowFrame);
  let windowCore = windowFrame *
    (1.0 - step(0.03, windowLocalX)) * step(0.106, uv.y) * (1.0 - step(0.112, uv.y));
  let windowBloom = carriageRegion * wheelOcclusion * exp(-windowDistance * 310.0);

  let driverWindowFrame = boxMask(uv, 0.4585, 0.4675, 0.1108, 0.116);
  let driverWindowCore = boxMask(uv, 0.4602, 0.4658, 0.112, 0.1148);
  let driverWindowDistance = length(uv - vec2f(0.463, 0.1134));
  let driverWindowBloom = exp(-driverWindowDistance * 320.0) *
    boxMask(uv, 0.454, 0.472, 0.106, 0.119);
  col = mix(col, trainDark * 0.58, driverWindowFrame);

  let roofEdgeRegion = (1.0 - step(0.44, uv.x)) *
    step(0.09, uv2.x) * (1.0 - step(0.91, uv2.x));
  let roofEdgeCore = roofEdgeRegion *
    (1.0 - smoothstep(0.00035, 0.0011, abs(uv.y - 0.1162)));
  let roofEdgeBloom = roofEdgeRegion * exp(-abs(uv.y - 0.1162) * 620.0);

  let headlightDistance = length(uv - headlightOrigin);
  let headlightCore = wheelOcclusion * (1.0 - smoothstep(0.0015, 0.0032, headlightDistance));
  let headlightBloom = wheelOcclusion * exp(-headlightDistance * 150.0);

  // A low, widening cone makes the headlight read through atmospheric haze,
  // while the small circular source keeps it attached to the locomotive.
  let beamX = max(uv.x - headlightOrigin.x, 0.0);
  let beamWidth = 0.0035 + beamX * 0.16;
  let beamCenterY = headlightOrigin.y - beamX * 0.018;
  let beamShape = 1.0 - smoothstep(beamWidth * 0.58, beamWidth, abs(uv.y - beamCenterY));
  let beamStart = smoothstep(0.001, 0.012, beamX);
  let beamEnd = 1.0 - smoothstep(0.12, 0.24, beamX);
  let beamNoise = 0.76 + 0.24 * fbm2(vec2f(uv.x * 5.0 - uniforms.subject.w * 0.025, uv.y * 12.0), 4);
  let headlightBeam = beamShape * beamStart * beamEnd * beamNoise;
  let trainEmission = clamp(trainLift, 0.0, 1.0) * (
    windowCore * 1.05 + windowBloom * 0.45 +
    driverWindowCore * 1.05 + driverWindowBloom * 0.38 +
    roofEdgeCore * 0.62 + roofEdgeBloom * 0.14
  );

  var dist = 5.0;
  let smokeT = uniforms.travelTime * 3.8 + uniforms.subject.w * 0.2;
  uv2 = uv + vec2f(smokeT / dist + 3.5, 0.0);
  uv2.x -= smokeT / dist * 0.2;
  let smokeAmount = clamp(uniforms.motion.y, 0.0, 1.5);
  let h = fbm2(uv2, 8) - (0.65 - smokeAmount * 0.1);

  if (uv.x < 0.49 && smokeAmount > 0.001) {
    let x = -uv.x + 0.49;
    let y = abs(uv.y + h * 0.4 - 0.16 * sqrt(x) - 0.12) - 0.8 * x * exp(-x * 10.0);
    if (y < 0.0) { col = uniforms.smokeLight.rgb; }
    if (y < -0.02) { col = uniforms.smokeShadow.rgb; }
  }

  // The cone is atmospheric light and belongs inside the scene. The round
  // practical lamp is emitted after grading with explicit scene occlusion.
  col += uniforms.practicalLightColor.rgb * headlightBeam * clamp(trainLift, 0.0, 1.0) * 0.42;

  dist = 5.0;
  uv2 = uv + vec2f(travelT / dist + 32.5, 0.0);
  uv2.x = fract(uv2.x * 3.0);

  let bridgeLift = clamp(uniforms.subject.y, 0.0, 1.0);
  let bridgeDeckY = pow(uv2.x - 0.5, 2.0) * 0.15 + 0.12;

  var k = 1.0;
  k *= smoothstep(0.001, 0.003, abs(uv2.y - pow(uv2.x - 0.5, 2.0) * 0.15 - 0.12));
  k *= min(step(0.05, 1.0 - abs(uv2.x * 2.0 - 1.0)) + step(0.17, uv2.y), 1.0);
  k *= min(smoothstep(0.02, 0.05, 1.0 - abs(uv2.x * 2.0 - 1.0)) + step(0.177, uv2.y), 1.0);
  k *= min(step(0.1, uv2.y) + smoothstep(-0.09, -0.085, -uv2.y - 0.001 / (1.0 - abs(uv2.x * 2.0 - 1.0))), 1.0);
  k *= min(
    smoothstep(0.05, 0.2, 1.0 - abs(fract(uv2.x * 16.0) * 2.0 - 1.0)) +
    step(0.12, uv2.y - pow(uv2.x - 0.5, 2.0) * 0.15) +
    step(-0.1, -uv2.y),
    1.0
  );
  let bridgeSurface = 1.0 - clamp(k, 0.0, 1.0);
  let pillarDistance = min(uv2.x, 1.0 - uv2.x);
  let pillarVertical = (1.0 - smoothstep(0.012, 0.027, pillarDistance)) *
    smoothstep(0.102, 0.116, uv.y) * (1.0 - smoothstep(0.164, 0.178, uv.y));
  let pillarCapDistance = length(vec2f(pillarDistance / 1.4, uv.y - 0.169));
  let pillarCap = 1.0 - smoothstep(0.003, 0.007, pillarCapDistance);
  let cornerReach = 1.0 - smoothstep(0.1, 0.23, pillarDistance);
  let undersideCorner = (1.0 - smoothstep(0.001, 0.0032, abs(uv.y - (bridgeDeckY - 0.004)))) * cornerReach;
  let cornerBloom = exp(-abs(uv.y - (bridgeDeckY - 0.004)) * 190.0) * cornerReach;
  let bridgeEmission = bridgeLift * (
    pillarVertical * bridgeSurface * 0.7 +
    pillarCap * bridgeSurface * 1.05 +
    undersideCorner * bridgeSurface * 0.62 +
    cornerBloom * 0.16
  );
  let bridgeBase = uniforms.bridgeColor.rgb * (1.0 + bridgeLift * 0.3);
  col = mix(bridgeBase * smoothstep(-0.08, 0.08, uv.y), col, k);

  col = mix(col, fg.rgb, fg.a);

  let moodUv = fragCoord / uniforms.resolution;
  let fogBand = 1.0 - smoothstep(0.05, 0.42, abs(uv.y - 0.1));
  let fogAmount = clamp(uniforms.motion.z * fogBand, 0.0, 0.78);
  col = mix(col, uniforms.fogColor.rgb, fogAmount);
  col = (col - vec3f(0.5)) * uniforms.motion.w + vec3f(0.5);
  col *= uniforms.grade.w;
  col = applyMoodPalette(col, moodUv);
  // Emission is added after atmospheric grading so practical lights remain
  // luminous in dark moods. Soft analytic falloff provides bloom without a
  // separate full-resolution blur pass.
  let practicalLightColor = uniforms.practicalLightColor.rgb;
  let trainLightVisibility = clamp(k * (1.0 - fg.a), 0.0, 1.0);
  let headlightEmission = clamp(trainLift, 0.0, 1.0) *
    (headlightCore * 1.25 + headlightBloom * 0.82) * trainLightVisibility;
  col += practicalLightColor * trainEmission * trainLightVisibility;
  col += practicalLightColor * headlightEmission;
  col += practicalLightColor * bridgeEmission;

  // Shadertoy Buffer A feedback. Because WebGPU render-target textures use a
  // top-left texture origin, flip the Shadertoy-style Y coordinate back when
  // sampling the previous Buffer A frame.
  let screenUv = fragCoord / uniforms.resolution;
  let feedbackUv = vec2f(screenUv.x, 1.0 - screenUv.y);
  let previousCol = textureSampleLevel(feedbackTexture, feedbackSampler, feedbackUv, 0.0).rgb;
  col = mix(col, previousCol, clamp(uniforms.grade.z, 0.0, 0.95));

  return vec4f(col, 1.0);
}
