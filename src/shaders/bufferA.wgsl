struct Uniforms {
  resolution: vec2f,
  travelTime: f32,
  foregroundTime: f32,
  moodLow: vec4f,
  moodHigh: vec4f,
  grade: vec4f,      // x mood intensity, y vignette, z feedback, w exposure
  atmosphere: vec4f, // x coverage, y cloud height, z cloud scale, w turbulence
  motion: vec4f,     // x wind, y smoke, z fog, w contrast
  subject: vec4f,    // x train emphasis, y bridge emphasis, z scene age, w wind phase
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
  weatherAtmosphere: vec4f, // x visibility, y horizon haze, z mist, w mist height
  weatherPrecipitation: vec4f, // x amount, y density, z speed, w streak length
  weatherDynamics: vec4f, // x rain angle, y wind direction, z gustiness, w wetness
  weatherTimes: vec4f, // x weather, y precipitation, z gust, w mist
  weatherSurface: vec4f, // x light scatter, y drying rate
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

fn easeOutBack(tIn: f32) -> f32 {
  let t = clamp(tIn, 0.0, 1.0) - 1.0;
  let overshoot = 1.70158;
  return 1.0 + (overshoot + 1.0) * t * t * t + overshoot * t * t;
}

fn easeOutCubic(tIn: f32) -> f32 {
  let t = 1.0 - clamp(tIn, 0.0, 1.0);
  return 1.0 - t * t * t;
}

fn hashRain(cell: vec2f, seed: f32) -> vec2f {
  let seededCell = cell + vec2f(seed);
  let p = vec2f(
    dot(seededCell, vec2f(127.1, 311.7)),
    dot(seededCell, vec2f(269.5, 183.3))
  );
  return fract(sin(p) * 43758.5453);
}

// Persistent drops move through staggered columns. Randomness changes only in
// the dry gap between drops, avoiding the synchronized cell reset that made
// the first rain field visibly rubber-band.
fn rainField(
  uvIn: vec2f,
  time: f32,
  columns: f32,
  rows: f32,
  density: f32,
  streakLength: f32,
  speed: f32,
  slant: f32,
  seed: f32
) -> f32 {
  let columnCoord = (uvIn.x - uvIn.y * slant) * columns;
  let column = floor(columnCoord);
  let localX = fract(columnCoord);
  let columnRandom = hashRain(vec2f(column, seed), seed + 7.3);
  let fall = uvIn.y * rows + time * speed * rows + columnRandom.y;
  let band = floor(fall);
  let along = fract(fall);
  let dropRandom = hashRain(vec2f(column, band), seed);
  let enabledDrop = 1.0 - step(clamp(density, 0.0, 0.999), dropRandom.y);
  let streakX = 0.1 + dropRandom.x * 0.8;
  let width = mix(0.048, 0.026, clamp(columns / 180.0, 0.0, 1.0));
  let line = 1.0 - smoothstep(width, width * 2.1, abs(localX - streakX));
  let lengthJitter = 0.48 + 0.72 * fract(dropRandom.x * 17.13 + dropRandom.y * 7.1);
  let length = clamp(streakLength * lengthJitter, 0.025, 0.68);
  let body = 1.0 - smoothstep(length * 0.78, length, along);
  let head = smoothstep(0.0, min(length * 0.12, 0.045), along);
  let brightness = 0.45 + 0.55 * fract(dropRandom.x * 5.7 + dropRandom.y * 13.1);
  return enabledDrop * line * body * head * brightness;
}

fn wheelMotionMask(pointIn: vec2f, radius: f32, angle: f32) -> f32 {
  let c = cos(angle);
  let s = sin(angle);
  let point = vec2f(
    pointIn.x * c - pointIn.y * s,
    pointIn.x * s + pointIn.y * c
  );
  let radial = length(point);
  let inside = 1.0 - smoothstep(radius * 0.82, radius, radial);
  let spokeDistance = min(
    abs(point.y),
    min(
      abs(dot(point, vec2f(0.8660254, 0.5))),
      abs(dot(point, vec2f(0.8660254, -0.5)))
    )
  );
  let spokes = 1.0 - smoothstep(
    radius * 0.035,
    radius * 0.105,
    spokeDistance
  );
  let spokeReach = smoothstep(radius * 0.16, radius * 0.28, radial) *
    (1.0 - smoothstep(radius * 0.55, radius * 0.68, radial));
  let hub = 1.0 - smoothstep(radius * 0.09, radius * 0.2, radial);
  return clamp((spokes * spokeReach + hub * 0.42) * inside, 0.0, 1.0);
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
  let foregroundT = uniforms.foregroundTime;
  let cloudT = uniforms.travelTime * 3.4 + uniforms.subject.w * 0.6;
  let bg = background(uv, cloudT);

  let precipitation = clamp(uniforms.weatherPrecipitation.x, 0.0, 1.0);
  let rainDensity = clamp(uniforms.weatherPrecipitation.y, 0.0, 1.0);
  let rainOccupancy = 1.0 - (1.0 - rainDensity) * (1.0 - rainDensity * 0.65);
  let downpour = smoothstep(0.58, 0.95, rainDensity);
  let rainLength = max(uniforms.weatherPrecipitation.w, 0.05);
  let windDirection = clamp(uniforms.weatherDynamics.y, -1.0, 1.0);
  let gustStrength = clamp(uniforms.weatherDynamics.z, 0.0, 1.0);
  let rainSlant = clamp(
    uniforms.weatherDynamics.x * 0.52 +
    windDirection * (0.09 + gustStrength * 0.12),
    -0.72,
    0.72
  );
  let precipitationT = uniforms.weatherTimes.y;
  let distantRainPrimary = rainField(
    uv, precipitationT, 82.0, 24.0,
    rainOccupancy * 0.82, rainLength * 0.18,
    0.14, rainSlant, 3.7
  );
  let distantRainFill = rainField(
    uv + vec2f(0.004, 0.017), precipitationT, 69.0, 29.0,
    rainOccupancy * 0.9, rainLength * 0.14,
    0.17, rainSlant, 11.2
  ) * downpour;
  let distantRain = clamp(distantRainPrimary + distantRainFill, 0.0, 1.0) *
    precipitation * 0.13 * clamp(uniforms.weatherAtmosphere.x + 0.22, 0.0, 1.0);

  var fg = vec4f(0.0);
  let n = 5;
  // The old fixed 0.5 cutoff saved FBM work, but taller/denser authored cloud
  // states could cross it and expose a flat clipped top. Expand the sampled
  // region only when weather parameters can actually raise those peaks.
  let foregroundCeiling = clamp(
    0.5 +
    max(uniforms.atmosphere.y, 0.0) +
    max(uniforms.atmosphere.x, 0.0) * 0.58 +
    max(uniforms.atmosphere.w - 1.0, 0.0) * 0.1,
    0.5,
    0.82
  );
  if (uv.y < foregroundCeiling) {
    var i = 0;
    loop {
      if (i >= n) { break; }
      fg += foreground(uv, foregroundT + 4.0 * f32(i) / f32(n) / 60.0) / f32(n);
      i += 1;
    }
  }

  let distantRainColor = mix(uniforms.fogColor.rgb, uniforms.cloudLight.rgb, 0.42);
  var col = mix(bg.rgb, distantRainColor, distantRain);
  uv.y -= 0.2;

  // The world itself performs the opening: the bridge rises with a slight
  // overshoot before settling, then the train glides in from beyond the left
  // edge and hands off to the normal journey motion.
  let sceneAge = uniforms.subject.z;
  let bridgeArrival = easeOutBack(smoothstep(0.04, 0.92, sceneAge));
  let trainArrival = easeOutCubic(smoothstep(0.82, 2.45, sceneAge));
  let trainPresence = smoothstep(0.02, 0.12, trainArrival);
  let trainUv = uv + vec2f((1.0 - trainArrival) * 0.72, 0.0);

  var uv2 = fract(trainUv * 9.0);
  var wagon = 1.0;
  wagon *= 1.0 - step(0.45, trainUv.x);
  wagon *= 1.0 - step(0.115, trainUv.y);
  wagon *= step(0.103, trainUv.y);
  wagon *= step(0.05, 1.0 - abs(uv2.x * 2.0 - 1.0));

  var join = 1.0;
  join *= 1.0 - step(0.45, trainUv.x);
  join *= 1.0 - step(0.11, trainUv.y);
  join *= step(0.107, trainUv.y);

  var roof = 1.0;
  roof *= 1.0 - step(0.45, trainUv.x);
  roof *= 1.0 - step(0.117, trainUv.y);
  roof *= step(0.11, trainUv.y);
  roof *= step(0.15, 1.0 - abs(uv2.x * 2.0 - 1.0));

  let loco = boxMask(trainUv, 0.45, 0.5, 0.103, 0.112);
  let chem1 = boxMask(trainUv, 0.49, 0.495, 0.103, 0.12);
  let chem2 = boxMask(trainUv, 0.488, 0.496, 0.12, 0.123);
  let locoRoof = boxMask(trainUv, 0.443, 0.47, 0.11, 0.117);

  var wheel = 1.0 - step(0.000023, dot(trainUv - vec2f(0.457, 0.1055), trainUv - vec2f(0.457, 0.1055)));
  wheel += 1.0 - step(0.00002, dot(trainUv - vec2f(0.487, 0.105), trainUv - vec2f(0.487, 0.105)));
  wheel += 1.0 - step(0.00002, dot(trainUv - vec2f(0.497, 0.105), trainUv - vec2f(0.497, 0.105)));

  let wheelAngle = travelT * 2.7;
  var wheelMotion = wheelMotionMask(trainUv - vec2f(0.457, 0.1055), 0.0048, wheelAngle);
  wheelMotion += wheelMotionMask(trainUv - vec2f(0.487, 0.105), 0.0045, wheelAngle);
  wheelMotion += wheelMotionMask(trainUv - vec2f(0.497, 0.105), 0.0045, wheelAngle);

  if (trainUv.x < 0.45 && trainUv.y > 0.025 && trainUv.y < 0.2) {
    wheel += 1.0 - step(0.002, dot(uv2 - vec2f(0.2, 0.95), uv2 - vec2f(0.2, 0.95)));
    wheel += 1.0 - step(0.002, dot(uv2 - vec2f(0.8, 0.95), uv2 - vec2f(0.8, 0.95)));
    wheelMotion += wheelMotionMask(uv2 - vec2f(0.2, 0.95), 0.0447, wheelAngle);
    wheelMotion += wheelMotionMask(uv2 - vec2f(0.8, 0.95), 0.0447, wheelAngle);
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
  let headlightHousing = boxMask(trainUv, 0.496, 0.501, 0.1108, 0.1152);
  let headlightInset = boxMask(trainUv, 0.4973, 0.5002, 0.112, 0.114);
  col = mix(col, trainDark * 0.62, headlightHousing);
  col = mix(col, mix(trainDark, trainBody, 0.42), headlightInset);

  // Use each wagon's local coordinates so its window has equal padding and
  // sits between the two wheels instead of following a global screen repeat.
  let windowLocalX = min(
    abs(uv2.x - 0.32),
    min(abs(uv2.x - 0.5), abs(uv2.x - 0.68))
  );
  let windowDistance = length(vec2f(windowLocalX / 9.0, trainUv.y - 0.109));
  let carriageRegion = (1.0 - step(0.44, trainUv.x)) * step(0.103, trainUv.y) * (1.0 - step(0.115, trainUv.y));
  let wheelOcclusion = 1.0 - clamp(wheel, 0.0, 1.0);
  let windowFrame = carriageRegion * wheelOcclusion *
    (1.0 - step(0.043, windowLocalX)) * step(0.105, trainUv.y) * (1.0 - step(0.113, trainUv.y));
  col = mix(col, trainDark * 0.58, windowFrame);
  let windowCore = windowFrame *
    (1.0 - step(0.03, windowLocalX)) * step(0.106, trainUv.y) * (1.0 - step(0.112, trainUv.y));
  let windowBloom = carriageRegion * wheelOcclusion * exp(-windowDistance * 310.0);

  let driverWindowFrame = boxMask(trainUv, 0.4585, 0.4675, 0.1108, 0.116);
  let driverWindowCore = boxMask(trainUv, 0.4602, 0.4658, 0.112, 0.1148);
  let driverWindowDistance = length(trainUv - vec2f(0.463, 0.1134));
  let driverWindowBloom = exp(-driverWindowDistance * 320.0) *
    boxMask(trainUv, 0.454, 0.472, 0.106, 0.119);
  col = mix(col, trainDark * 0.58, driverWindowFrame);

  // Reuse the exact transformed wagon coordinate and roof bounds. Keeping a
  // separate screen-space strip here made the sliver appear detached during
  // the train's entrance animation.
  let roofEdgeRegion = trainPresence * (1.0 - step(0.44, trainUv.x)) *
    step(0.15, uv2.x) * (1.0 - step(0.85, uv2.x));
  let roofEdgeCore = roofEdgeRegion *
    (1.0 - smoothstep(0.00018, 0.00062, abs(trainUv.y - 0.11645)));
  let roofEdgeBloom = roofEdgeRegion * exp(-abs(trainUv.y - 0.11645) * 760.0);

  let headlightDistance = length(trainUv - headlightOrigin);
  let headlightCore = wheelOcclusion * (1.0 - smoothstep(0.0015, 0.0032, headlightDistance));
  let headlightBloom = wheelOcclusion * exp(-headlightDistance * 235.0);

  // A low, widening cone makes the headlight read through atmospheric haze,
  // while the small circular source keeps it attached to the locomotive.
  let beamX = max(trainUv.x - headlightOrigin.x, 0.0);
  let beamWidth = 0.004 + beamX * 0.268;
  let beamCenterY = headlightOrigin.y - beamX * 0.018;
  let beamDistanceY = abs(trainUv.y - beamCenterY);
  let beamCoreShape = 1.0 - smoothstep(beamWidth * 0.08, beamWidth * 0.5, beamDistanceY);
  let beamShape = 1.0 - smoothstep(beamWidth * 0.24, beamWidth * 1.2, beamDistanceY);
  let beamGlowShape = 1.0 - smoothstep(beamWidth * 0.45, beamWidth * 2.2, beamDistanceY);
  let beamStart = smoothstep(0.001, 0.012, beamX);
  let beamCoreEnd = 1.0 - smoothstep(0.045, 0.105, beamX);
  let beamEnd = 1.0 - smoothstep(0.065, 0.155, beamX);
  let beamGlowEnd = 1.0 - smoothstep(0.075, 0.19, beamX);
  let beamDistanceFalloff = exp(-beamX * 7.5);
  let beamNoise = 0.76 + 0.24 * fbm2(vec2f(trainUv.x * 5.0 - uniforms.subject.w * 0.025, trainUv.y * 12.0), 4);
  let headlightBeam = beamShape * beamStart * beamEnd * beamDistanceFalloff * beamNoise;
  let headlightBeamCore = beamCoreShape * beamStart * beamCoreEnd * beamDistanceFalloff * (0.88 + beamNoise * 0.12);
  let headlightBeamGlow = beamGlowShape * beamStart * beamGlowEnd * beamDistanceFalloff * beamNoise;
  let trainEmission = trainPresence * clamp(trainLift, 0.0, 1.0) * (
    windowCore * 1.05 + windowBloom * 0.45 +
    driverWindowCore * 1.05 + driverWindowBloom * 0.38 +
    roofEdgeCore * 0.58 + roofEdgeBloom * 0.13 +
    wheelMotion * 0.62
  );

  var dist = 5.0;
  let smokeT = uniforms.travelTime * 3.8 + uniforms.subject.w * 0.2;
  uv2 = trainUv + vec2f(smokeT / dist + 3.5, 0.0);
  uv2.x -= smokeT / dist * 0.2;
  let smokeAmount = clamp(uniforms.motion.y, 0.0, 1.5);
  let smokeOpacity = smoothstep(0.0, 0.22, smokeAmount);
  let h = fbm2(uv2, 8) - (0.65 - smokeAmount * 0.1);

  if (trainUv.x < 0.49 && smokeAmount > 0.001) {
    let x = -trainUv.x + 0.49;
    let y = abs(trainUv.y + h * 0.4 - 0.16 * sqrt(x) - 0.12) - 0.8 * x * exp(-x * 10.0);
    if (y < 0.0) { col = mix(col, uniforms.smokeLight.rgb, smokeOpacity); }
    if (y < -0.02) { col = mix(col, uniforms.smokeShadow.rgb, smokeOpacity); }
  }

  // The cone is atmospheric light and belongs inside the scene. The round
  // practical lamp is emitted after grading with explicit scene occlusion.
  col += uniforms.practicalLightColor.rgb * headlightBeamGlow * trainPresence * clamp(trainLift, 0.0, 1.0) * 0.09;

  dist = 5.0;
  let bridgeUv = uv + vec2f(0.0, (1.0 - bridgeArrival) * 0.48);
  uv2 = bridgeUv + vec2f(travelT / dist + 32.5, 0.0);
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
    smoothstep(0.102, 0.116, bridgeUv.y) * (1.0 - smoothstep(0.164, 0.178, bridgeUv.y));
  let pillarCapDistance = length(vec2f(pillarDistance / 1.4, bridgeUv.y - 0.169));
  let pillarCap = 1.0 - smoothstep(0.003, 0.007, pillarCapDistance);
  let cornerReach = 1.0 - smoothstep(0.1, 0.23, pillarDistance);
  let undersideCorner = (1.0 - smoothstep(0.001, 0.0032, abs(bridgeUv.y - (bridgeDeckY - 0.004)))) * cornerReach;
  let cornerBloom = exp(-abs(bridgeUv.y - (bridgeDeckY - 0.004)) * 190.0) * cornerReach;
  let bridgeEmission = bridgeLift * (
    pillarVertical * bridgeSurface * 0.7 +
    pillarCap * bridgeSurface * 1.05 +
    undersideCorner * bridgeSurface * 0.62 +
    cornerBloom * 0.16
  );
  let bridgeBase = uniforms.bridgeColor.rgb * (1.0 + bridgeLift * 0.3);
  col = mix(bridgeBase * smoothstep(-0.08, 0.08, bridgeUv.y), col, k);

  // Physical atmosphere is resolved independently from the authored scene.
  // It sits in front of the distant world and subjects, but behind the
  // nearest cloud field so depth is preserved.
  let visibilityLoss = 1.0 - clamp(uniforms.weatherAtmosphere.x, 0.0, 1.0);
  let horizonBand = 1.0 - smoothstep(0.025, 0.38, abs(uv.y - 0.1));
  let horizonVeil = clamp(
    uniforms.weatherAtmosphere.y * horizonBand * 0.72 +
    visibilityLoss * horizonBand * 0.68,
    0.0,
    0.82
  );

  let mistHeight = mix(0.015, 0.19, clamp(uniforms.weatherAtmosphere.w, 0.0, 1.0));
  let mistWind = mix(-1.0, 1.0, clamp(uniforms.weatherDynamics.y * 0.5 + 0.5, 0.0, 1.0));
  let mistUv = vec2f(
    uv.x * 1.8 + uniforms.weatherTimes.w * 0.055 * mistWind,
    uv.y * 5.2 + uniforms.weatherTimes.x * 0.008
  );
  let mistNoise = fbm2(mistUv + vec2f(18.7, 4.3), 5);
  let mistBand = 1.0 - smoothstep(0.035, 0.24, abs(uv.y - mistHeight));
  let mistShape = smoothstep(0.38, 0.72, mistNoise) * mistBand;
  let mistVeil = clamp(
    mistShape * uniforms.weatherAtmosphere.z * (0.62 + visibilityLoss * 0.28),
    0.0,
    0.72
  );
  let atmosphericVeil = 1.0 - (1.0 - horizonVeil) * (1.0 - mistVeil);
  col = mix(col, uniforms.fogColor.rgb, atmosphericVeil);

  // Middle-distance rain crosses subjects and bridge geometry, but the
  // nearest cloud bank still occludes it. This is the layer that carries most
  // of the readable weather without flattening the scene.
  let middleRainPrimary = rainField(
    uv + vec2f(0.0, 0.013), precipitationT, 124.0, 19.0,
    rainOccupancy * 0.98, rainLength * 0.3,
    0.23, rainSlant, 19.4
  );
  let middleRainFill = rainField(
    uv + vec2f(0.007, 0.029), precipitationT, 107.0, 23.0,
    rainOccupancy * 0.94, rainLength * 0.24,
    0.29, rainSlant, 28.6
  ) * downpour;
  let middleRain = clamp(middleRainPrimary + middleRainFill, 0.0, 1.0) *
    precipitation * 0.22 * (1.0 - atmosphericVeil * 0.38);
  let rainLightColor = mix(uniforms.fogColor.rgb, uniforms.practicalLightColor.rgb, 0.18);
  col = mix(col, rainLightColor, middleRain);

  col = mix(col, fg.rgb, fg.a);

  let moodUv = fragCoord / uniforms.resolution;
  let fogBand = 1.0 - smoothstep(0.05, 0.42, abs(uv.y - 0.1));
  let fogAmount = clamp(uniforms.motion.z * fogBand, 0.0, 0.78);
  col = mix(col, uniforms.fogColor.rgb, fogAmount);

  // Fast, sparse foreground streaks establish parallax. They are composed in
  // front of the cloud bank but before grading and practical-light emission.
  let foregroundRainPrimary = rainField(
    uv + vec2f(0.0, 0.031), precipitationT, 168.0, 14.0,
    rainOccupancy * 0.76, rainLength * 0.42,
    0.38, rainSlant, 41.8
  );
  let foregroundRainFill = rainField(
    uv + vec2f(0.011, 0.043), precipitationT, 143.0, 17.0,
    rainOccupancy * 0.82, rainLength * 0.34,
    0.47, rainSlant, 53.1
  ) * downpour;
  let foregroundRain = clamp(foregroundRainPrimary + foregroundRainFill, 0.0, 1.0) *
    precipitation * 0.28;
  col = mix(col, mix(rainLightColor, uniforms.cloudLight.rgb, 0.16), foregroundRain);
  col = (col - vec3f(0.5)) * uniforms.motion.w + vec3f(0.5);
  col *= uniforms.grade.w;
  col = applyMoodPalette(col, moodUv);
  // A crisp, desaturated reflection survives palette grading and feedback.
  // Water borrows scene luminance rather than the mood hue, which keeps rain
  // legible in warm scenes without turning it into blue neon.
  let reflectedLight = dot(uniforms.cloudLight.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let waterSpecularColor = vec3f(reflectedLight * 0.82, reflectedLight * 0.9, reflectedLight);
  let rainSpecular = clamp(
    distantRain * 0.28 + middleRain * 0.72 + foregroundRain,
    0.0,
    0.42
  );
  // Emission is added after atmospheric grading so practical lights remain
  // luminous in dark moods. Soft analytic falloff provides bloom without a
  // separate full-resolution blur pass.
  let practicalLightColor = uniforms.practicalLightColor.rgb;
  let weatherLightVisibility = 1.0 - atmosphericVeil * 0.58;
  let trainLightVisibility = clamp(k * (1.0 - fg.a) * weatherLightVisibility, 0.0, 1.0);
  let headlightEmission = trainPresence * clamp(trainLift, 0.0, 1.0) *
    (headlightCore * 1.16 + headlightBloom * 0.48) * trainLightVisibility;
  let beamEmission = trainPresence * clamp(trainLift, 0.0, 1.0) *
    (headlightBeamCore * 0.34 + headlightBeam * 0.2 + headlightBeamGlow * 0.08) *
    trainLightVisibility;
  col += practicalLightColor * trainEmission * trainLightVisibility;
  col += practicalLightColor * headlightEmission;
  col += practicalLightColor * beamEmission;
  col += practicalLightColor * bridgeEmission * weatherLightVisibility;

  // Shadertoy Buffer A feedback. Because WebGPU render-target textures use a
  // top-left texture origin, flip the Shadertoy-style Y coordinate back when
  // sampling the previous Buffer A frame.
  let screenUv = fragCoord / uniforms.resolution;
  let feedbackUv = vec2f(screenUv.x, 1.0 - screenUv.y);
  let previousCol = textureSampleLevel(feedbackTexture, feedbackSampler, feedbackUv, 0.0).rgb;
  let rainFeedbackRecovery = 1.0 - precipitation * 0.74;
  col = mix(col, previousCol, clamp(uniforms.grade.z * rainFeedbackRecovery, 0.0, 0.95));
  col = mix(col, waterSpecularColor, rainSpecular * 0.34);
  col += waterSpecularColor * rainSpecular * 0.2;

  return vec4f(col, 1.0);
}
