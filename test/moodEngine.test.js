import assert from "node:assert/strict";
import test from "node:test";
import {
    AUTHORING_COLORS,
    MOODS,
    MoodEngine,
    SCENE_DEFAULT_WEATHER,
} from "../src/webgpu/moodEngine.js";

test("every authored scene resolves a complete RGB scene palette", () => {
    for (const mood of MOODS) {
        for (const { key } of AUTHORING_COLORS) {
            const color = key === "low" || key === "high"
                ? mood[key]
                : mood.colors[key];
            assert.equal(color.length, 3, `${mood.id}.${key}`);
            assert.equal(color.every((channel) => channel >= 0 && channel <= 1), true);
        }
    }
});

test("every authored scene explicitly selects its default physical weather", () => {
    for (const scene of MOODS) {
        assert.equal(
            scene.defaultWeatherId,
            SCENE_DEFAULT_WEATHER[scene.id],
            scene.id,
        );
        assert.equal(typeof scene.defaultWeatherId, "string");
    }
    assert.equal(
        MOODS.find(({ id }) => id === "night-rail").defaultWeatherId,
        "haze",
    );
});

test("departure is authored while zero intensity reveals the hidden shader base", () => {
    const engine = new MoodEngine(0);
    const departure = engine.update(20);
    engine.setIntensity(0);
    const neutral = engine.update(20);

    assert.equal(departure.id, "departure");
    assert.equal(departure.cloudCoverage, -0.025);
    assert.deepEqual(departure.skyColor, [0.53, 0.61, 0.76]);
    assert.equal(neutral.cloudCoverage, 0);
    assert.deepEqual(neutral.skyColor, [0.58, 0.7, 1]);
    assert.equal(MOODS.some(({ id }) => id === "shader-base"), false);
});

test("mood intensity blends both palette and world structure", () => {
    const engine = new MoodEngine(0);
    engine.setMood("monsoon", 0);
    engine.setIntensity(0.5);
    const state = engine.update(20);

    assert.deepEqual(state.low, [0.0975, 0.09, 0.095]);
    assert.equal(state.cloudCoverage, 0.1);
    assert.equal(state.windSpeed, 1.31);
    assert.equal(state.fogDensity, 0.24);
});

test("palette interpolation is RGB by default and can resolve through OKLab", () => {
    const rgbEngine = new MoodEngine(0);
    rgbEngine.setMood("monsoon", 0);
    const rgb = rgbEngine.update(4);

    const oklabEngine = new MoodEngine(0);
    assert.equal(oklabEngine.setPaletteInterpolation("oklab"), "oklab");
    oklabEngine.setMood("monsoon", 0);
    const oklab = oklabEngine.update(4);

    assert.equal(rgb.paletteInterpolation, "rgb");
    assert.equal(oklab.paletteInterpolation, "oklab");
    assert.notDeepEqual(oklab.low, rgb.low);
    assert.equal(oklab.cloudCoverage, rgb.cloudCoverage);
    assert.equal(oklabEngine.setPaletteInterpolation("invalid"), "rgb");
});

test("transition groups resolve on independent schedules", () => {
    const engine = new MoodEngine(0);
    engine.setMood("monsoon", 0);
    engine.setIntensity(1);
    const state = engine.update(6.5);

    assert.equal(state.windSpeed, 1.62);
    assert.deepEqual(state.low, [0.035, 0.1, 0.12]);
    assert.ok(state.cloudCoverage > 0 && state.cloudCoverage < 0.2);
    assert.ok(state.fogDensity > 0 && state.fogDensity < 0.48);
});

test("mood transition progress exposes when the authored state has settled", () => {
    const engine = new MoodEngine(0);
    engine.setMood("monsoon", 0);

    assert.equal(engine.getTransitionProgress(0), 0);
    assert.ok(engine.getTransitionProgress(4) > 0);
    assert.ok(engine.getTransitionProgress(4) < 1);
    assert.equal(engine.getTransitionProgress(12), 1);
});

test("auto cycling advances to the next authored mood", () => {
    const engine = new MoodEngine(0);
    engine.setCycleSeconds(5);
    engine.setAutoCycle(true, 0);
    const state = engine.update(5);

    assert.equal(state.id, "ember");
});

test("presentation pauses delay transitions and automatic cycling", () => {
    const engine = new MoodEngine(0);
    engine.setMood("monsoon", 0);
    engine.setAutoCycle(true, 0);
    const beforePause = engine.update(2);

    engine.delayTimeline(8);
    const afterPause = engine.update(10);

    assert.deepEqual(afterPause, beforePause);
    assert.equal(afterPause.id, "monsoon");
});

test("authoring overrides are clamped and can be cleared", () => {
    const engine = new MoodEngine(0);
    engine.setIntensity(1);
    assert.equal(engine.setOverride("fogDensity", 99), true);
    assert.equal(engine.setOverride("notAWorldProperty", 1), false);
    assert.equal(engine.update(0).fogDensity, 0.75);
    assert.equal(engine.setOverride("practicalLightColor", [2, 0.4, -1]), true);
    assert.deepEqual(engine.update(0).practicalLightColor, [1, 0.4, 0]);

    engine.clearOverrides();
    assert.equal(engine.update(0).fogDensity, 0.08);
    assert.deepEqual(engine.update(0).practicalLightColor, [1, 0.55, 0.2]);
});
