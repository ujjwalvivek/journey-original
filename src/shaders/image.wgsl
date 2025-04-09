struct Uniforms {
  resolution: vec2f,
  travelTime: f32,
  reservedTime: f32,
  moodLow: vec4f,
  moodHigh: vec4f,
  grade: vec4f,
  atmosphere: vec4f,
  motion: vec4f,
  subject: vec4f,
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
  weatherAtmosphere: vec4f,
  weatherPrecipitation: vec4f,
  weatherDynamics: vec4f,
  weatherTimes: vec4f,
  weatherSurface: vec4f, // x light scatter, y drying rate, z rain quality
  weatherDetail: vec4f, // x desaturation, y rain depth, z rain contrast, w foreground rain
  captureRect: vec4f, // normalized x, y, width, height
  captureFrame: vec4f, // normalized x padding, y padding, footer, rotation
  captureTransition: vec4f, // progress, active, dissolve softness, backdrop
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;
@group(0) @binding(3) var captureTexture: texture_2d<f32>;
@group(0) @binding(4) var captureNoiseSampler: sampler;
@group(0) @binding(5) var captureNoiseTexture: texture_2d<f32>;

fn captureNoise(x: vec2f) -> f32 {
  let cell = floor(x);
  let fraction = fract(x);
  let blend = fraction * fraction * (3.0 - 2.0 * fraction);
  let dimensions = vec2f(textureDimensions(captureNoiseTexture));
  let a = textureSampleLevel(
    captureNoiseTexture,
    captureNoiseSampler,
    (cell + vec2f(0.0, 0.0)) / dimensions,
    0.0
  ).x;
  let b = textureSampleLevel(
    captureNoiseTexture,
    captureNoiseSampler,
    (cell + vec2f(1.0, 0.0)) / dimensions,
    0.0
  ).x;
  let c = textureSampleLevel(
    captureNoiseTexture,
    captureNoiseSampler,
    (cell + vec2f(0.0, 1.0)) / dimensions,
    0.0
  ).x;
  let d = textureSampleLevel(
    captureNoiseTexture,
    captureNoiseSampler,
    (cell + vec2f(1.0, 1.0)) / dimensions,
    0.0
  ).x;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

fn captureFbm(pointIn: vec2f) -> f32 {
  var point = pointIn;
  var amplitude = 0.55;
  var value = 0.0;
  var weight = 0.0;
  for (var octave = 0; octave < 5; octave += 1) {
    value += captureNoise(point) * amplitude;
    weight += amplitude;
    point = point * 2.03 + vec2f(17.2, 9.7);
    amplitude *= 0.53;
  }
  return value / max(weight, 0.0001);
}

fn rotatePoint(point: vec2f, angle: f32) -> vec2f {
  let cosine = cos(angle);
  let sine = sin(angle);
  return vec2f(
    cosine * point.x - sine * point.y,
    sine * point.x + cosine * point.y
  );
}

fn rectangleMask(point: vec2f, size: vec2f, feather: f32) -> f32 {
  let edgeDistance = min(
    min(point.x, size.x - point.x),
    min(point.y, size.y - point.y)
  );
  return smoothstep(0.0, feather, edgeDistance);
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  // The offscreen Buffer A target is stored top-to-bottom in WebGPU, so the
  // Image pass samples it using WebGPU's native top-left position coordinates.
  let uv = position.xy / uniforms.resolution;
  var col = textureSampleLevel(sourceTexture, sourceSampler, uv, 0.0).rgb;

  // Exact Shadertoy Image-pass vignette when vignette control is 1.0.
  let vignetteBase = max(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.0);
  let originalVignette = 0.5 + 0.5 * pow(vignetteBase, 0.2);
  col *= mix(1.0, originalVignette, clamp(uniforms.grade.y, 0.0, 1.0));

  if (uniforms.captureTransition.y > 0.5) {
    let progress = clamp(uniforms.captureTransition.x, 0.0, 1.0);
    let geometryProgress = progress * progress * (3.0 - 2.0 * progress);
    let startRect = uniforms.captureRect;
    let rect = mix(startRect, vec4f(0.0, 0.0, 1.0, 1.0), geometryProgress);
    let rectOrigin = rect.xy * uniforms.resolution;
    let rectSize = max(rect.zw * uniforms.resolution, vec2f(1.0));
    let rectCenter = rectOrigin + rectSize * 0.5;
    let rotation = uniforms.captureFrame.w * (1.0 - geometryProgress);
    let localPoint = rotatePoint(position.xy - rectCenter, -rotation) +
      rectSize * 0.5;
    let outerMask = rectangleMask(localPoint, rectSize, 1.5);

    let frameScale = 1.0 - geometryProgress;
    let innerOrigin = vec2f(
      uniforms.captureFrame.x * uniforms.resolution.x,
      uniforms.captureFrame.y * uniforms.resolution.y
    ) * frameScale;
    let footer = uniforms.captureFrame.z * uniforms.resolution.y * frameScale;
    let innerSize = max(
      rectSize - vec2f(innerOrigin.x * 2.0, innerOrigin.y + footer),
      vec2f(1.0)
    );
    let innerPoint = localPoint - innerOrigin;
    let innerMask = rectangleMask(innerPoint, innerSize, 1.5) * outerMask;
    let frameMask = max(outerMask - innerMask, 0.0);
    let captureUv = clamp(innerPoint / innerSize, vec2f(0.0), vec2f(1.0));

    let outerUv = clamp(localPoint / rectSize, vec2f(0.0), vec2f(1.0));
    let captureDimensions = vec2f(textureDimensions(captureTexture));
    let captureAspect = captureDimensions.x / max(captureDimensions.y, 1.0);
    let noisePoint = outerUv * vec2f(captureAspect * 4.2, 4.2) +
      vec2f(progress * 0.72, sin(progress * 5.0) * 0.18);
    let coarseNoise = captureFbm(noisePoint + vec2f(3.7, 11.2));
    let detailNoise = captureFbm(noisePoint * 2.4 + vec2f(19.4, 2.8));
    let liquidNoise = coarseNoise * 0.74 + detailNoise * 0.26;

    // Treat the entire print as one fluid surface. It expands with the outer
    // geometry while broad displacement travels through all of its pixels;
    // opacity then drains continuously rather than following a visible wipe.
    let dissolveProgress = smoothstep(0.04, 0.96, progress);
    let flowX = captureFbm(noisePoint * 1.7 + vec2f(7.0, 2.0));
    let flowY = captureFbm(noisePoint * 1.7 + vec2f(17.0, 13.0));
    let flowWarp = vec2f(flowX, flowY) - vec2f(0.5);
    let outwardZoom = 1.0 - 0.075 * dissolveProgress;
    let warpedUv = vec2f(0.5) + (captureUv - vec2f(0.5)) * outwardZoom;
    let warpStrength = sin(dissolveProgress * 3.14159265) * 0.065;
    let frozenColor = textureSampleLevel(
      captureTexture,
      sourceSampler,
      clamp(warpedUv + flowWarp * warpStrength, vec2f(0.0), vec2f(1.0)),
      0.0
    ).rgb;

    let opacityProgress = smoothstep(0.0, 0.65, progress);
    let baseOpacity = pow(1.0 - opacityProgress, 2.8);
    let opacityVariation = 1.0 + (liquidNoise - 0.5) * 0.22 *
      sin(dissolveProgress * 3.14159265);
    let photoOpacity = clamp(baseOpacity * opacityVariation, 0.0, 1.0);

    let backdrop = uniforms.captureTransition.w *
      (1.0 - smoothstep(0.0, 0.48, progress));
    col *= 1.0 - backdrop;
    col = mix(col, frozenColor, innerMask * photoOpacity);
    let paperColor = vec3f(0.965, 0.941, 0.902);
    let frameOpacity = pow(baseOpacity, 1.35);
    col = mix(col, paperColor, frameMask * frameOpacity);
  }
  return vec4f(col, 1.0);
}
