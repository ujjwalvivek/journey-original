import assert from "node:assert/strict";
import test from "node:test";
import { MoodEngine } from "../src/webgpu/moodEngine.js";

test("original mood is a neutral baseline at every intensity", () => {
    const engine = new MoodEngine(0);
    const neutral = engine.update(20);
    engine.setIntensity(1);
    const full = engine.update(20);

    assert.deepEqual(full.low, neutral.low);
    assert.deepEqual(full.high, neutral.high);
    assert.equal(full.cloudCoverage, 0);
    assert.equal(full.windSpeed, 1);
    assert.equal(full.fogDensity, 0);
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

test("auto cycling advances to the next authored mood", () => {
    const engine = new MoodEngine(0);
    engine.setCycleSeconds(5);
    engine.setAutoCycle(true, 0);
    const state = engine.update(5);

    assert.equal(state.id, "ember");
});

test("authoring overrides are clamped and can be cleared", () => {
    const engine = new MoodEngine(0);
    engine.setIntensity(1);
    assert.equal(engine.setOverride("fogDensity", 99), true);
    assert.equal(engine.setOverride("notAWorldProperty", 1), false);
    assert.equal(engine.update(0).fogDensity, 0.75);

    engine.clearOverrides();
    assert.equal(engine.update(0).fogDensity, 0);
});
