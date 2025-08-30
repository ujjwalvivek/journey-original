<!--markdownlint-disable MD013-->

# Journey: The Original Portfolio

![Showcase](media/showcase.gif)

A WebGPU and WGSL diorama built around movement, atmosphere, and directed changes in weather and light. The public default is the authored **Departure** scene.

- **Buffer A iChannel0:** the exact source texture's sampled red channel, losslessly stored as a 1024×1024 grayscale PNG, **Linear + Repeat + VFlip ON**.
- **Buffer A iChannel1:** the previous Buffer A frame, **Linear + Clamp + VFlip OFF**, using true ping-pong render targets.
- **Buffer A feedback:** `mix(current, previous, 0.3)` by default.
- **Image iChannel0:** current Buffer A, **Linear + Clamp**, followed by the original vignette.
- Offscreen Buffer A uses `rgba16float` so temporal accumulation is not forced through an 8-bit intermediate.
- Internal rendering preserves aspect ratio while capping the two half-float feedback targets to a 2560×1440 pixel budget.

## Current systems

- Start or stop the train without stopping the world: journey motion accelerates and coasts instead of switching velocity, smoke fades naturally, and rain, mist, wind, gusts, and cloud evolution keep moving on independent clocks.
- Travel speed from 0.10× to 2.50×.
- Authored scenes: Departure, Ember, Blue Hour, Sakura, Monsoon, and Night Rail, each with an explicit default physical-weather state.
- Independent weather presets: Clear, Haze, Overcast, Drizzle, Monsoon, and Clearing, plus the weather attached to the selected scene.
- Atmospheric depth through visibility, fog, horizon haze, moving low mist, atmospheric desaturation, and moisture-driven light scattering.
- Three depth bands of analytic rain with authored density, contrast, angle, streak length, depth bias, and foreground amount.
- Signed wind and a living gust field shared by clouds, rain, mist, and train smoke rather than timeline scrubbing.
- Wetness that accumulates behind rainfall and dries independently, with deck sheen, wet-edge treatment, broken window-light reflections, and broader practical-light halos in moisture.
- Staged, interruption-safe weather transitions and authored Passing Shower, Monsoon Front, and Quiet Air weather-front sequences.
- Cue a journey through Departure, Ember, Sakura, Monsoon, Blue Hour, and Night Rail with per-cue pacing and property-group transitions. The duration values below are the directed cue windows used when narration-driven mode is off.

    | Cue        | Cue window | Travel pace | Dwell |
    | ---------- | ---------- | ----------- | ----- |
    | Departure  |       34s  |       0.90× |    0s |
    | Ember      |       30s  |       1.08× |    0s |
    | Sakura     |       32s  |       0.82× |    0s |
    | Monsoon    |       38s  |       0.70× |    0s |
    | Blue Hour  |       36s  |       0.78× |    5s |
    | Night Rail |       42s  |       0.66× |    0s |

- Opt-in narration-driven mode. A scene transition settles first, the matching narration begins, and its natural completion releases the next scene.
- Mood intensity across world structure and explicit scene palettes for sky, clouds, smoke, train materials, bridge, fog, and practical lights.
- Palette transitions support RGB (the default) and an optional OKLab mode from the renderer HUD.
- An Engine Lab with separate Scene, Weather, and Sound direction, grouped live controls, and JSON snapshot export.
- Temporal feedback amount and Vignette strength.
- Reset journey and feedback history.
- Paused Polaroid-style capture review with a clean PNG download and seamless return to the journey.
- An integrated showcase recorder with a GPU-rendered opening title, Departure → Monsoon → Sakura → Departure sequencing, a closing title reprise for loop edits, and native-canvas 30 FPS export with the final Sound Engine mix.
- An opt-in Web Audio engine with:
  - authored scene profiles
  - independent Environment, Train, Music, and reserved Voice buses
  - scene-aware recorded ambience
  - dual-deck streamed scores with interruption-safe crossfades
  - reactive train, wind, and layered-rain sources
  - atmospheric filtering and restrained directional stereo
  - cooldown-safe journey/weather cues with audible-level-aware ducking
  - gentler master dynamics
  - on-demand loading
  - failure quarantine and retry
  - browser/capture lifecycle handling
  - a compact mix/debug lab
- Collapsible side-panel HUD with keyboard shortcuts and hover recovery when hidden.
- A deliberately reduced Canvas 2D platform notice when WebGPU is unavailable.

### Keyboard

- `Space`: start / stop train
- `M`: next mood
- `H`: show / hide HUD
- `R`: reset journey
- `Escape`: close an open panel or cancel an active capture/showcase

## Run

```bash
npm install
npm run dev
npm run preview

# Run the repository-owned WGSL validation suites
# Requires a Rust toolchain
npm test
```

## License

See [MIT](LICENSE).
