# Journey Original

![Showcase](media/showcase.gif)

The default visual state keeps the reconstructed Shadertoy pipeline intact:

- **Buffer A iChannel0:** the exact source texture's sampled red channel, losslessly stored as a 1024×1024 grayscale PNG, **Linear + Repeat + VFlip ON**.
- **Buffer A iChannel1:** the previous Buffer A frame, **Linear + Clamp + VFlip OFF**, using true ping-pong render targets.
- **Buffer A feedback:** `mix(current, previous, 0.3)` by default.
- **Image iChannel0:** current Buffer A, **Linear + Clamp**, followed by the original vignette.
- Offscreen Buffer A uses `rgba16float` so temporal accumulation is not forced through an 8-bit intermediate.
- Internal rendering preserves aspect ratio while capping the two half-float feedback targets to a 2560×1440 pixel budget.

## Added controls

- Start / stop the train journey (freezes the Shadertoy scene clock without stopping the renderer).
- Travel speed from 0.10× to 2.50×.
- Authored environmental moods: Original, Ember, Blue Hour, Sakura, Monsoon, Night Rail.
- Auto-cycle moods with animated transitions.
- Mood intensity across palette and world structure.
- A Mood Lab for live structural authoring and JSON snapshot export.
- Temporal feedback amount.
- Vignette strength.
- Reset journey / feedback history.
- PNG capture.
- HUD toggle and keyboard shortcuts.

### Keyboard

- `Space`: start / stop train
- `M`: next mood
- `H`: show / hide HUD
- `R`: reset journey

## Run

```bash
npm install
npm run dev
npm run preview
```

Run the deterministic mood-state tests with:

```bash
node test/moodEngine.test.js
node test/renderBudget.test.js
node test/environmentClock.test.js
```

## License

See [MIT](LICENSE).
