struct Uniforms {
  resolution: vec2f,
  travelTime: f32,
  ambientTime: f32,
  moodLow: vec4f,
  moodHigh: vec4f,
  grade: vec4f,      // x mood intensity, y vignette, z feedback, w exposure
  atmosphere: vec4f, // x coverage, y cloud height, z cloud scale, w turbulence
  motion: vec4f,     // x wind, y smoke, z fog, w contrast
  subject: vec4f,    // x train emphasis, y bridge emphasis, z ambient drift
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

fn foreground(uvIn: vec2f, t: f32) -> vec4f {
  var uv = uvIn;
  uv.x = (uv.x - 0.5) * uniforms.atmosphere.z + 0.5;
  uv.y -= uniforms.atmosphere.y;
  uv.y -= 0.2;

  var midlevel = -0.1;
  var disp = 1.7;
  var dist = 1.0;
  var uv2 = uv + vec2f(t / dist + 40.0, 0.0);
  var h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x * 0.7;
  if (uv.y < h + midlevel - 0.12) { return vec4f(0.43, 0.32, 0.31, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return vec4f(0.55, 0.42, 0.41, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.66, 0.42, 0.40, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.77, 0.48, 0.46, 1.0); }

  midlevel = 0.05;
  disp = 1.7;
  dist = 2.0;
  uv2 = uv + vec2f(t / dist + 38.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x * 0.7;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.95, 0.66, 0.48, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.98, 0.76, 0.64, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.95, 0.80, 0.77, 1.0); }

  return vec4f(0.95, 0.80, 0.77, 0.0);
}

fn background(uvIn: vec2f, t: f32) -> vec4f {
  var uv = uvIn;
  uv.x = (uv.x - 0.5) * uniforms.atmosphere.z + 0.5;
  uv.y -= uniforms.atmosphere.y;
  var midlevel = 0.3;
  var disp = 0.9;
  var dist = 10.0;
  var uv2 = uv + vec2f(t / dist + 32.5, 0.0);
  var h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.14) { return vec4f(0.48, 0.19, 0.20, 1.0); }
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.68, 0.28, 0.19, 1.0); }
  if (uv.y < h + midlevel - 0.07) { return vec4f(0.88, 0.38, 0.24, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.95, 0.45, 0.30, 1.0); }

  midlevel = 0.35;
  disp = 1.0;
  dist = 15.0;
  uv2 = uv + vec2f(t / dist + 30.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.98, 0.76, 0.64, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.95, 0.80, 0.77, 1.0); }

  midlevel = 0.35;
  disp = 3.5;
  dist = 20.0;
  uv2 = uv + vec2f(t / dist + 27.5, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.12) { return vec4f(0.43, 0.32, 0.31, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return vec4f(0.55, 0.42, 0.41, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.66, 0.42, 0.40, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.77, 0.48, 0.46, 1.0); }

  midlevel = 0.45;
  disp = 2.0;
  dist = 25.0;
  uv2 = uv + vec2f(t / dist + 23.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.98, 0.57, 0.36, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.62, 0.44, 1.0); }

  midlevel = 0.5;
  disp = 2.3;
  dist = 30.0;
  uv2 = uv + vec2f(t / dist + 20.5, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.12) { return vec4f(0.41, 0.27, 0.27, 1.0); }
  if (uv.y < h + midlevel - 0.08) { return vec4f(0.53, 0.35, 0.32, 1.0); }
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.80, 0.24, 0.17, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.99, 0.29, 0.20, 1.0); }

  midlevel = 0.5;
  disp = 2.5;
  dist = 35.0;
  uv2 = uv + vec2f(t / dist + 18.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.88, 0.38, 0.24, 1.0); }
  if (uv.y < h + midlevel - 0.05) { return vec4f(0.98, 0.42, 0.28, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.48, 0.35, 1.0); }

  midlevel = 0.6;
  disp = 2.0;
  dist = 40.0;
  uv2 = uv + vec2f(t / dist + 18.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.95, 0.66, 0.48, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.76, 0.60, 1.0); }

  midlevel = 0.75;
  disp = 3.5;
  dist = 45.0;
  uv2 = uv + vec2f(t / dist + 15.5, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.20) { return vec4f(1.00, 0.55, 0.33, 1.0); }
  if (uv.y < h + midlevel - 0.15) { return vec4f(0.98, 0.50, 0.24, 1.0); }
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.90, 0.55, 0.40, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.62, 0.44, 1.0); }

  midlevel = 0.7;
  disp = 2.7;
  dist = 50.0;
  uv2 = uv + vec2f(t / dist + 12.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.04) { return vec4f(0.73, 0.36, 0.30, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.80, 0.40, 0.34, 1.0); }

  midlevel = 0.8;
  disp = 2.7;
  dist = 60.0;
  uv2 = uv + vec2f(t / dist + 9.5, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.93, 0.58, 0.35, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.76, 0.60, 1.0); }

  midlevel = 0.9;
  disp = 3.0;
  dist = 70.0;
  uv2 = uv + vec2f(t / dist + 7.0, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.56, 0.25, 0.22, 1.0); }
  if (uv.y < h + midlevel - 0.05) { return vec4f(0.60, 0.30, 0.27, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(0.74, 0.35, 0.30, 1.0); }

  midlevel = 1.0;
  disp = 5.0;
  dist = 100.0;
  uv2 = uv + vec2f(t / dist + 3.5, 0.0);
  h = (fbm(uv2, 8) - 0.5) * disp * uniforms.atmosphere.w + uniforms.atmosphere.x;
  if (uv.y < h + midlevel - 0.10) { return vec4f(0.92, 0.85, 0.82, 1.0); }
  if (uv.y < h + midlevel)        { return vec4f(1.00, 0.94, 0.91, 1.0); }

  return vec4f(0.58, 0.70, 1.00, 1.0);
}

fn applyMoodPalette(colIn: vec3f, uv: vec2f) -> vec3f {
  let intensity = clamp(uniforms.grade.x, 0.0, 1.0);
  if (intensity <= 0.0001) {
    return colIn;
  }

  let luma = dot(colIn, vec3f(0.2126, 0.7152, 0.0722));
  let drift = 0.06 * sin(uniforms.ambientTime * 0.55 + uv.x * 4.2 + uv.y * 2.1);
  let paletteT = smoothstep(0.03, 0.98, clamp(luma + drift, 0.0, 1.0));
  let palette = mix(uniforms.moodLow.rgb, uniforms.moodHigh.rgb, paletteT);
  let sourceChroma = colIn - vec3f(luma);
  let moodCol = palette * (0.48 + 0.72 * luma) + sourceChroma * 0.28;
  return mix(colIn, moodCol, intensity);
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let fragCoord = vec2f(position.x, uniforms.resolution.y - position.y);
  var uv = fragCoord / uniforms.resolution.y;
  // At normal travel speed these sum to the original shader's iTime * 4.
  // When the train stops, the smaller ambient component keeps the world alive.
  let t = uniforms.travelTime * 3.8 + uniforms.ambientTime * 0.2 * uniforms.subject.z * uniforms.motion.x;
  let bg = background(uv, t);

  var fg = vec4f(0.0);
  let n = 5;
  if (uv.y < 0.5) {
    var i = 0;
    loop {
      if (i >= n) { break; }
      fg += foreground(uv, t + 4.0 * f32(i) / f32(n) / 60.0) / f32(n);
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
  let trainDark = mix(vec3f(0.18, 0.12, 0.15), uniforms.moodLow.rgb * 0.72, clamp(trainLift, 0.0, 1.0));
  let trainBody = mix(vec3f(0.48, 0.19, 0.20), uniforms.moodHigh.rgb * 0.72, clamp(trainLift, 0.0, 1.0));
  let locomotive = mix(vec3f(0.38, 0.19, 0.20), uniforms.moodHigh.rgb * 0.58, clamp(trainLift, 0.0, 1.0));
  col = mix(col, trainDark, join);
  col = mix(col, trainBody, wagon);
  col = mix(col, trainDark, roof);
  col = mix(col, locomotive, loco);
  col = mix(col, locomotive, chem1);
  col = mix(col, trainDark, locoRoof);
  col = mix(col, trainDark, chem2 + wheel);

  var dist = 5.0;
  uv2 = uv + vec2f(t / dist + 3.5, 0.0);
  uv2.x -= t / dist * 0.2;
  let smokeAmount = clamp(uniforms.motion.y, 0.0, 1.5);
  let h = fbm2(uv2, 8) - (0.65 - smokeAmount * 0.1);

  if (uv.x < 0.49 && smokeAmount > 0.001) {
    let x = -uv.x + 0.49;
    let y = abs(uv.y + h * 0.4 - 0.16 * sqrt(x) - 0.12) - 0.8 * x * exp(-x * 10.0);
    if (y < 0.0) { col = vec3f(1.00, 0.94, 0.91); }
    if (y < -0.02) { col = vec3f(0.92, 0.85, 0.82); }
  }

  dist = 5.0;
  uv2 = uv + vec2f(t / dist + 32.5, 0.0);
  uv2.x = fract(uv2.x * 3.0);

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
  let bridgeBase = vec3f(0.29, 0.09, 0.08) * (1.0 + uniforms.subject.y * 0.3);
  col = mix(bridgeBase * smoothstep(-0.08, 0.08, uv.y), col, k);

  col = mix(col, fg.rgb, fg.a);

  let moodUv = fragCoord / uniforms.resolution;
  let fogBand = 1.0 - smoothstep(0.05, 0.42, abs(uv.y - 0.1));
  let fogAmount = clamp(uniforms.motion.z * fogBand, 0.0, 0.78);
  let fogColor = mix(uniforms.moodLow.rgb, uniforms.moodHigh.rgb, 0.58);
  col = mix(col, fogColor, fogAmount);
  col = (col - vec3f(0.5)) * uniforms.motion.w + vec3f(0.5);
  col *= uniforms.grade.w;
  col = applyMoodPalette(col, moodUv);

  // Shadertoy Buffer A feedback. Because WebGPU render-target textures use a
  // top-left texture origin, flip the Shadertoy-style Y coordinate back when
  // sampling the previous Buffer A frame.
  let screenUv = fragCoord / uniforms.resolution;
  let feedbackUv = vec2f(screenUv.x, 1.0 - screenUv.y);
  let previousCol = textureSampleLevel(feedbackTexture, feedbackSampler, feedbackUv, 0.0).rgb;
  col = mix(col, previousCol, clamp(uniforms.grade.z, 0.0, 0.95));

  return vec4f(col, 1.0);
}
