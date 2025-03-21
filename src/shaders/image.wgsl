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
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;

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
  return vec4f(col, 1.0);
}
