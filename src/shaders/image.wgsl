struct Uniforms {
  resolution: vec2f,
  sceneTime: f32,
  moodTime: f32,
  moodLow: vec4f,
  moodHigh: vec4f,
  controls: vec4f, // x mood intensity, y vignette, z feedback, w reserved
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var sourceTexture: texture_2d<f32>;

fn applyMood(colIn: vec3f, uv: vec2f) -> vec3f {
  let intensity = clamp(uniforms.controls.x, 0.0, 1.0);
  if (intensity <= 0.0001) {
    return colIn;
  }

  let luma = dot(colIn, vec3f(0.2126, 0.7152, 0.0722));
  let drift = 0.06 * sin(uniforms.moodTime * 0.55 + uv.x * 4.2 + uv.y * 2.1);
  let paletteT = smoothstep(0.03, 0.98, clamp(luma + drift, 0.0, 1.0));
  let palette = mix(uniforms.moodLow.rgb, uniforms.moodHigh.rgb, paletteT);

  // Keep a slice of the source chroma and luminance so the authored cloud,
  // train, and bridge separation survives strong mood settings.
  let sourceChroma = colIn - vec3f(luma);
  let moodCol = palette * (0.48 + 0.72 * luma) + sourceChroma * 0.28;
  return mix(colIn, moodCol, intensity);
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
  col *= mix(1.0, originalVignette, clamp(uniforms.controls.y, 0.0, 1.0));

  col = applyMood(col, uv);
  return vec4f(col, 1.0);
}
